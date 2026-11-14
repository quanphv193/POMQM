import { solveLP } from './lp.js';
import { invert } from './linalg.js';

// ---- Finance ----
export const npv = (rate, flows) => flows.reduce((s, cf, t) => s + cf / (1 + rate) ** t, 0);
export function irr(flows) {
	if (!(flows.some((v) => v < 0) && flows.some((v) => v > 0))) throw new Error('Dòng tiền cần có cả khoản âm (đầu tư) và khoản dương (thu hồi).');
	let lo = -0.9999, hi = 10;
	let flo = npv(lo, flows), fhi = npv(hi, flows);
	if (flo * fhi > 0) throw new Error('Không tìm được IRR trong khoảng −99,99% đến 1000%.');
	for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2, fm = npv(mid, flows); if (flo * fm <= 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; } }
	return (lo + hi) / 2;
}

// ---- Zero-sum game (row player maximises) ----
export function solveGame(A) {
	const m = A.length, n = A[0].length;
	const rowMin = A.map((r) => Math.min(...r)), colMax = A[0].map((_, j) => Math.max(...A.map((r) => r[j])));
	const maximin = Math.max(...rowMin), minimax = Math.min(...colMax);
	const saddle = Math.abs(maximin - minimax) < 1e-12;
	const shift = Math.min(0, ...A.flat()) < 1 ? 1 - Math.min(...A.flat()) : 0;
	const B = A.map((r) => r.map((v) => v + shift));
	// row player: min sum x s.t. B^T x >= 1  -> value = 1/sum x
	const rowLP = solveLP({ sense: 'min', c: new Array(m).fill(1), constraints: Array.from({ length: n }, (_, j) => ({ a: B.map((r) => r[j]), op: '>=', b: 1 })) });
	// column player: max sum y s.t. B y <= 1
	const colLP = solveLP({ sense: 'max', c: new Array(n).fill(1), constraints: B.map((r) => ({ a: r.slice(), op: '<=', b: 1 })) });
	const v = 1 / rowLP.objective;
	return { rowMin, colMax, maximin, minimax, saddle, value: v - shift, rowStrategy: rowLP.x.map((x) => x * v), colStrategy: colLP.x.map((y) => y * v),
		saddleCells: saddle ? A.flatMap((r, i) => r.map((x, j) => (x === maximin && rowMin[i] === maximin && colMax[j] === maximin ? [i, j] : null)).filter(Boolean)) : [] };
}

// ---- Markov chains ----
export function markov(P, p0, steps) {
	const n = P.length;
	for (const r of P) { const s = r.reduce((a, b) => a + b, 0); if (Math.abs(s - 1) > 1e-6) throw new Error(`Mỗi hàng của ma trận chuyển phải có tổng bằng 1 (đang là ${+s.toFixed(6)}).`); }
	const path = [p0];
	for (let k = 1; k <= steps; k++) { const prev = path[k - 1]; path.push(P[0].map((_, j) => prev.reduce((s, v, i) => s + v * P[i][j], 0))); }
	const absorbing = P.map((r, i) => Math.abs(r[i] - 1) < 1e-12);
	const out = { path, absorbing };
	if (!absorbing.some(Boolean)) {
		// steady state: solve pi (P - I) = 0 with sum pi = 1
		const A = P[0].map((_, j) => P.map((r, i) => (i === j ? r[j] - 1 : r[j])));
		A[n - 1] = new Array(n).fill(1);
		const bvec = new Array(n).fill(0); bvec[n - 1] = 1;
		const inv = invert(A);
		out.steady = inv.map((r) => r.reduce((s, v, i) => s + v * bvec[i], 0));
	} else {
		const tr = P.map((_, i) => i).filter((i) => !absorbing[i]), ab = P.map((_, i) => i).filter((i) => absorbing[i]);
		if (tr.length) {
			const Q = tr.map((i) => tr.map((j) => P[i][j])), R = tr.map((i) => ab.map((j) => P[i][j]));
			const IQ = Q.map((r, i) => r.map((v, j) => (i === j ? 1 : 0) - v));
			const N = invert(IQ);
			out.transient = tr; out.absorbingStates = ab; out.N = N;
			out.B = N.map((r) => ab.map((_, k) => r.reduce((s, v, i) => s + v * R[i][k], 0)));
			out.steps = N.map((r) => r.reduce((a, b) => a + b, 0));
		}
	}
	return out;
}

// ---- Learning curve ----
export const learningExponent = (rate) => Math.log(rate) / Math.log(2);
export function learningTimes(t1, rate, upTo) {
	const b = learningExponent(rate);
	let cum = 0;
	return Array.from({ length: upTo }, (_, i) => { const n = i + 1, t = t1 * n ** b; cum += t; return { n, unit: t, cum, avg: cum / n }; });
}
export const rateFromTimes = (tA, nA, tB, nB) => 2 ** (Math.log(tB / tA) / Math.log(nB / nA));

// ---- Reliability ----
export const rSeries = (r) => r.reduce((a, b) => a * b, 1);
export const rParallel = (r) => 1 - r.reduce((a, b) => a * (1 - b), 1);
export function backupsNeeded(r, target, max = 200) {
	if (!(r > 0 && r < 1) || !(target > r && target < 1)) throw new Error('Cần 0 < r < mục tiêu < 1.');
	for (let n = 1; n <= max; n++) if (1 - (1 - r) ** n >= target - 1e-12) return n;
	throw new Error('Cần hơn 200 linh kiện song song.');
}

// ---- Work measurement ----
export const sampleSizeMean = (z, s, accuracy, mean) => Math.ceil(((z * s) / (accuracy * mean)) ** 2 - 1e-9);
export const sampleSizeProp = (z, p, e) => Math.ceil(z * z * p * (1 - p) / (e * e) - 1e-9);
