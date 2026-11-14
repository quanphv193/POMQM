import { binomCdf, binomPmf, normCdf, Phi } from './stats.js';

export const CHART_CONST = { // n: [A2, D3, D4]
	2: [1.880, 0, 3.267], 3: [1.023, 0, 2.574], 4: [0.729, 0, 2.282], 5: [0.577, 0, 2.114], 6: [0.483, 0, 2.004],
	7: [0.419, 0.076, 1.924], 8: [0.373, 0.136, 1.864], 9: [0.337, 0.184, 1.816], 10: [0.308, 0.223, 1.777],
};
export function pChart(defects, n, z = 3) {
	const k = defects.length, pbar = defects.reduce((a, b) => a + b, 0) / (k * n), sd = Math.sqrt(pbar * (1 - pbar) / n);
	const ucl = Math.min(1, pbar + z * sd), lcl = Math.max(0, pbar - z * sd);
	const rows = defects.map((d, i) => ({ k: i + 1, p: d / n, out: d / n > ucl + 1e-12 || d / n < lcl - 1e-12 }));
	return { pbar, sd, ucl, lcl, rows };
}
export function cChart(counts, z = 3) {
	const cbar = counts.reduce((a, b) => a + b, 0) / counts.length, sd = Math.sqrt(cbar);
	const ucl = cbar + z * sd, lcl = Math.max(0, cbar - z * sd);
	return { cbar, sd, ucl, lcl, rows: counts.map((c, i) => ({ k: i + 1, c, out: c > ucl + 1e-12 || c < lcl - 1e-12 })) };
}
export function xbarR(samples) {
	const n = samples[0].length;
	if (!CHART_CONST[n]) throw new Error('Cỡ mẫu mỗi nhóm phải từ 2 đến 10.');
	if (samples.some((s) => s.length !== n)) throw new Error('Mọi nhóm mẫu phải có cùng cỡ mẫu.');
	const [A2, D3, D4] = CHART_CONST[n];
	const means = samples.map((s) => s.reduce((a, b) => a + b, 0) / n), ranges = samples.map((s) => Math.max(...s) - Math.min(...s));
	const xx = means.reduce((a, b) => a + b, 0) / means.length, rbar = ranges.reduce((a, b) => a + b, 0) / ranges.length;
	const lim = { xbar: { cl: xx, ucl: xx + A2 * rbar, lcl: xx - A2 * rbar }, r: { cl: rbar, ucl: D4 * rbar, lcl: D3 * rbar } };
	return { n, A2, D3, D4, means, ranges, xx, rbar, ...lim,
		rows: means.map((m, i) => ({ k: i + 1, mean: m, range: ranges[i], outX: m > lim.xbar.ucl + 1e-12 || m < lim.xbar.lcl - 1e-12, outR: ranges[i] > lim.r.ucl + 1e-12 || ranges[i] < lim.r.lcl - 1e-12 })) };
}
export function capability({ usl, lsl, mean, sd }) {
	const cp = (usl - lsl) / (6 * sd), cpu = (usl - mean) / (3 * sd), cpl = (mean - lsl) / (3 * sd);
	const below = Phi((lsl - mean) / sd), above = 1 - Phi((usl - mean) / sd);
	return { cp, cpu, cpl, cpk: Math.min(cpu, cpl), ppmOut: (below + above) * 1e6 };
}
// Attribute single sampling plan (n, c): binomial acceptance probability at defect fraction p.
export const pAccept = (n, c, p) => binomCdf(n, c, p);
export function samplingPlan({ n, c, aql, ltpd }) {
	return { alpha: 1 - pAccept(n, c, aql), beta: pAccept(n, c, ltpd), paAql: pAccept(n, c, aql), paLtpd: pAccept(n, c, ltpd) };
}
export function ocCurve(n, c, pMax, steps = 20) {
	return Array.from({ length: steps + 1 }, (_, i) => { const p = pMax * i / steps, pa = pAccept(n, c, p); return { p, pa, aoq: p * pa }; });
}
void binomPmf; void normCdf;
