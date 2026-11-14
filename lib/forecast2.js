// More forecasting models. Pure functions.
import { invert, transpose, matmul } from './linalg.js';
import { tTwoSided, tCrit, fRightTail } from './stats.js';

const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;

// Error measures over pairs that have both actual and forecast.
export function errorStats(actual, fc) {
	const rows = actual.map((a, i) => {
		const f = fc[i];
		if (f === null || f === undefined || a === null || a === undefined) return { err: null };
		const err = a - f;
		return { err, abs: Math.abs(err), sq: err * err, pct: a !== 0 ? Math.abs(err) / Math.abs(a) : null };
	});
	const used = rows.filter((r) => r.err !== null);
	if (!used.length) return { rows, mad: null, mse: null, rmse: null, mape: null, bias: null, ts: null };
	const mad = avg(used.map((r) => r.abs)), mse = avg(used.map((r) => r.sq));
	const pcts = used.filter((r) => r.pct !== null);
	const sumErr = used.reduce((s, r) => s + r.err, 0);
	return { rows, mad, mse, rmse: Math.sqrt(mse), mape: pcts.length ? avg(pcts.map((r) => r.pct)) : null, bias: sumErr / used.length, ts: mad ? sumErr / mad : null };
}

// Trend-adjusted exponential smoothing (Heizer & Render): F, T, FIT = F + T.
// F1, T1 given (defaults: F1 = Y1, T1 = 0). FIT_t is the forecast for period t.
export function trendES(y, alpha, beta, F1, T1) {
	if (!(alpha > 0 && alpha <= 1) || !(beta >= 0 && beta <= 1)) throw new Error('α phải trong (0, 1], β trong [0, 1].');
	const n = y.length;
	const F = [F1 ?? y[0]], T = [T1 ?? 0];
	for (let t = 1; t <= n; t++) {
		F[t] = alpha * y[t - 1] + (1 - alpha) * (F[t - 1] + T[t - 1]);
		T[t] = beta * (F[t] - F[t - 1]) + (1 - beta) * T[t - 1];
	}
	const FIT = F.map((f, i) => f + T[i]);
	// Period 1 counts in the errors only when F1 was given (otherwise FIT1 is just Y1).
	const start = F1 === undefined || F1 === null ? 1 : 0;
	const fc = y.map((_, i) => (i >= start ? FIT[i] : null));
	return { F, T, FIT, fc, next: FIT[n], start, ...errorStats(y, fc) };
}

// Ordinary least squares y = b0 + b1 x1 + ... ; X is n×k (no intercept column).
export function regression(X, y) {
	const n = y.length, k = X[0].length;
	if (n <= k + 1) throw new Error(`Cần nhiều hơn ${k + 1} quan sát cho ${k} biến độc lập.`);
	const A = X.map((r) => [1, ...r]);
	const At = transpose(A);
	const inv = invert(matmul(At, A));
	const b = matmul(inv, matmul(At, y.map((v) => [v]))).map((r) => r[0]);
	const fitted = A.map((r) => r.reduce((s, v, j) => s + v * b[j], 0));
	const my = avg(y);
	const sse = y.reduce((s, v, i) => s + (v - fitted[i]) ** 2, 0);
	const sst = y.reduce((s, v) => s + (v - my) ** 2, 0);
	const df = n - k - 1;
	const se = Math.sqrt(sse / df);
	const seb = inv.map((r, j) => Math.sqrt(se * se * r[j]));
	const r2 = sst ? 1 - sse / sst : 1;
	const ssr = sst - sse, msr = ssr / k, mse = sse / df, Fstat = mse > 0 ? msr / mse : Infinity;
	const t = b.map((v, j) => (seb[j] ? v / seb[j] : null));
	return { b, fitted, sse, sst, ssr, msr, mse, F: Fstat, sigF: fRightTail(Fstat, k, df), r2, adjR2: 1 - (1 - r2) * (n - 1) / df, se, seb, t, p: t.map((v) => (v === null ? null : tTwoSided(v, df))), r: k === 1 ? Math.sign(b[1]) * Math.sqrt(r2) : null, df, k, n, inv, xbar: Array.from({ length: k }, (_, j) => avg(X.map((r) => r[j]))), ybar: my };
}

// Seasonal index of each period in a cycle of length s (series starts at season 1).
const seasonOf = (i, s) => i % s;

// Centered moving average of length s (classic decomposition).
export function centeredMA(y, s) {
	const n = y.length;
	const cma = new Array(n).fill(null);
	const h = Math.floor(s / 2);
	for (let t = h; t < n - h; t++) {
		if (s % 2) cma[t] = avg(y.slice(t - h, t + h + 1));
		else {
			let sum = 0.5 * y[t - h] + 0.5 * y[t + h];
			for (let j = t - h + 1; j < t + h; j++) sum += y[j];
			cma[t] = sum / s;
		}
	}
	return cma;
}

// Classic decomposition: multiplicative (Y = T·S) or additive (Y = T + S); ahead = periods to forecast.
export function decompose(y, s, kind = 'mult', ahead = s) {
	const n = y.length;
	if (s < 2) throw new Error('Số mùa trong một chu kỳ phải ≥ 2.');
	if (n < 2 * s) throw new Error(`Cần ít nhất ${2 * s} kỳ (2 chu kỳ) để phân rã.`);
	const mult = kind === 'mult';
	const cma = centeredMA(y, s);
	const ratio = y.map((v, i) => (cma[i] === null ? null : mult ? v / cma[i] : v - cma[i]));
	const raw = Array.from({ length: s }, (_, k) => avg(ratio.filter((r, i) => r !== null && seasonOf(i, s) === k)));
	const adj = mult ? s / raw.reduce((a, b) => a + b, 0) : -avg(raw);
	const SI = raw.map((v) => (mult ? v * adj : v + adj));
	const des = y.map((v, i) => (mult ? v / SI[seasonOf(i, s)] : v - SI[seasonOf(i, s)]));
	const t = y.map((_, i) => i + 1);
	const reg = regression(t.map((x) => [x]), des);
	const [a, b] = reg.b;
	const fit = (i) => { const tr = a + b * (i + 1); return mult ? tr * SI[seasonOf(i, s)] : tr + SI[seasonOf(i, s)]; };
	const fitted = y.map((_, i) => fit(i));
	const future = Array.from({ length: ahead }, (_, j) => ({ t: n + j + 1, season: seasonOf(n + j, s) + 1, trend: a + b * (n + j + 1), forecast: fit(n + j) }));
	return { cma, ratio, raw, SI, des, a, b, fitted, future, ...errorStats(y, fitted) };
}

// Simple seasonal indices (Heizer): index_k = average of season k / overall average.
// forecast for next cycle = (expected cycle total / s) × index_k.
export function seasonalIndices(y, s, nextTotal) {
	if (y.length < s) throw new Error(`Cần ít nhất ${s} kỳ.`);
	const cycles = Math.floor(y.length / s);
	if (y.length % s) throw new Error(`Số kỳ (${y.length}) phải là bội số của số mùa (${s}).`);
	const seasonAvg = Array.from({ length: s }, (_, k) => avg(y.filter((_, i) => seasonOf(i, s) === k)));
	const overall = avg(y);
	const SI = seasonAvg.map((v) => v / overall);
	const total = nextTotal === undefined || nextTotal === null || nextTotal === '' ? (y.reduce((a, b) => a + b, 0) / cycles) : Number(nextTotal);
	return { seasonAvg, overall, SI, total, forecast: SI.map((v) => (total / s) * v), cycles };
}

// Confidence intervals of the coefficients at confidence level conf (e.g. 0.95)
export function coefCI(reg, conf) { const c = tCrit(1 - conf, reg.df); return reg.b.map((v, j) => ({ lo: v - c * reg.seb[j], hi: v + c * reg.seb[j] })); }
// Interval for the mean response and for an individual observation at x0 (array of the k regressor values)
export function predictInterval(reg, x0, conf) {
	const a = [1, ...x0], b = reg.b.reduce((s, v, j) => s + v * a[j], 0);
	let h = 0; for (let i = 0; i < a.length; i++) for (let j = 0; j < a.length; j++) h += a[i] * reg.inv[i][j] * a[j];
	const c = tCrit(1 - conf, reg.df), seFit = reg.se * Math.sqrt(h), sePred = reg.se * Math.sqrt(1 + h);
	return { yhat: b, seFit, sePred, tcrit: c, meanLo: b - c * seFit, meanHi: b + c * seFit, predLo: b - c * sePred, predHi: b + c * sePred };
}

// Single exponential smoothing on the deseasonalised series (course section 2.3.1.5):
// seasonal index = season average / overall average, deseasonalise, smooth, then re-apply the index.
export function sesSeasonal(y, s, alpha) {
	if (!(alpha > 0 && alpha <= 1)) throw new Error('α phải trong (0, 1].');
	const n = y.length, si = seasonalIndices(y, s, null), SI = si.SI;
	const ds = y.map((v, t) => v / SI[t % s]);
	const F = [null, ds[0]];
	for (let t = 2; t <= n; t++) F[t] = F[t - 1] + alpha * (ds[t - 1] - F[t - 1]);
	const fitted = y.map((_, t) => (t === 0 ? null : F[t] * SI[t % s]));
	return { SI, seasonAvg: si.seasonAvg, overall: si.overall, ds, F, fitted, next: F[n] * SI[n % s], nextDeseason: F[n], ...errorStats(y, fitted) };
}
