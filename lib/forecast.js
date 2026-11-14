// Forecasting methods. All pure functions, no Excel dependency.
export function forecast(y, method, opts = {}) {
	const n = y.length;
	if (n < 2) throw new Error('Cần ít nhất 2 giá trị.');
	const f = new Array(n).fill(null);
	let next;
	if (method === 'avg') {
		let sum = 0;
		for (let t = 1; t < n; t++) { sum += y[t - 1]; f[t] = sum / t; }
		next = (sum + y[n - 1]) / n;
	} else if (method === 'naive') {
		for (let t = 1; t < n; t++) f[t] = y[t - 1];
		next = y[n - 1];
	} else if (method === 'ma') {
		const k = opts.n ?? 3;
		if (k < 1 || k >= n) throw new Error('Số kỳ trung bình phải từ 1 đến ' + (n - 1));
		for (let t = k; t < n; t++) f[t] = avg(y.slice(t - k, t));
		next = avg(y.slice(n - k));
	} else if (method === 'wma') {
		const w = opts.weights;
		if (!w || !w.length) throw new Error('Cần nhập trọng số.');
		const k = w.length;
		if (k >= n) throw new Error('Số trọng số phải nhỏ hơn số dữ liệu.');
		const sw = w.reduce((a, b) => a + b, 0);
		if (!sw) throw new Error('Tổng trọng số bằng 0.');
		const wa = (arr) => arr.reduce((s, v, i) => s + v * w[i], 0) / sw;
		for (let t = k; t < n; t++) f[t] = wa(y.slice(t - k, t));
		next = wa(y.slice(n - k));
	} else if (method === 'es') {
		const a = opts.alpha ?? 0.3;
		if (a <= 0 || a > 1) throw new Error('Alpha phải trong (0, 1].');
		// F2 = Y1 (no forecast for period 1, so it is left out of the error measures)
		f[1] = y[0];
		for (let t = 2; t < n; t++) f[t] = f[t - 1] + a * (y[t - 1] - f[t - 1]);
		next = f[n - 1] + a * (y[n - 1] - f[n - 1]);
	} else if (method === 'trend') {
		const tx = y.map((_, i) => i + 1);
		const mx = avg(tx), my = avg(y);
		let sxy = 0, sxx = 0;
		for (let i = 0; i < n; i++) {
			sxy += (tx[i] - mx) * (y[i] - my);
			sxx += (tx[i] - mx) ** 2;
		}
		const b = sxy / sxx, a0 = my - b * mx;
		for (let t = 0; t < n; t++) f[t] = a0 + b * tx[t];
		next = a0 + b * (n + 1);
		opts._coef = { intercept: a0, slope: b };
	} else throw new Error('Phương pháp không hợp lệ: ' + method);

	const rows = y.map((actual, i) => {
		const fc = f[i];
		if (fc === null) return { t: i + 1, actual, forecast: null, err: null, abs: null, sq: null, pct: null };
		const err = actual - fc;
		return { t: i + 1, actual, forecast: fc, err, abs: Math.abs(err), sq: err * err, pct: actual !== 0 ? Math.abs(err) / Math.abs(actual) : null };
	});
	const used = rows.filter((r) => r.err !== null);
	const mad = avg(used.map((r) => r.abs));
	const mse = avg(used.map((r) => r.sq));
	const pcts = used.filter((r) => r.pct !== null);
	return { rows, next, mad, mse, rmse: Math.sqrt(mse), mape: pcts.length ? avg(pcts.map((r) => r.pct)) : null, coef: opts._coef ?? null };
}
const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
