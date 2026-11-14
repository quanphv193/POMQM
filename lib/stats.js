// Distribution helpers.
import { normCdf } from './pert.js';
export { normCdf };

// Inverse standard normal CDF (Acklam's algorithm + one Halley refinement step; |error| < 1e-12).
export function normInv(p) {
	if (!(p > 0 && p < 1)) throw new Error('Xác suất phải nằm trong khoảng (0, 1).');
	const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
	const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
	const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
	const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
	let x;
	if (p < 0.02425) { const q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
	else if (p > 1 - 0.02425) { const q = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
	else { const q = p - 0.5, r = q * q; x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
	const e = Phi(x) - p, u = e * Math.sqrt(2 * Math.PI) * Math.exp(x * x / 2);
	return x - u / (1 + x * u / 2);
}
// Better-than-1e-7 normal CDF via series for the central region, used for display values.
export function Phi(z) {
	if (z < -8) return 0; if (z > 8) return 1;
	let sum = z, term = z;
	for (let n = 1; n < 200; n++) { term *= z * z / (2 * n + 1); sum += term; if (Math.abs(term) < 1e-17 * Math.abs(sum)) break; }
	return 0.5 + sum * Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
}

const lgam = (n) => { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; };
export const binomPmf = (n, k, p) => (k < 0 || k > n ? 0 : p <= 0 ? (k === 0 ? 1 : 0) : p >= 1 ? (k === n ? 1 : 0) : Math.exp(lgam(n) - lgam(k) - lgam(n - k) + k * Math.log(p) + (n - k) * Math.log(1 - p)));
export const binomCdf = (n, k, p) => { let s = 0; for (let i = 0; i <= Math.floor(k); i++) s += binomPmf(n, i, p); return Math.min(1, s); };
export const poissonPmf = (k, lam) => (k < 0 ? 0 : Math.exp(-lam + k * Math.log(lam || 1e-300) - lgam(k)));
export const poissonCdf = (k, lam) => { let s = 0; for (let i = 0; i <= Math.floor(k); i++) s += poissonPmf(i, lam); return Math.min(1, s); };

export function describe(x) {
	const n = x.length, s = [...x].sort((a, b) => a - b);
	const mean = x.reduce((a, b) => a + b, 0) / n;
	const ss = x.reduce((a, v) => a + (v - mean) ** 2, 0);
	const q = (p) => { const i = (n - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
	return { n, mean, sum: x.reduce((a, b) => a + b, 0), min: s[0], max: s[n - 1], range: s[n - 1] - s[0], median: q(0.5), q1: q(0.25), q3: q(0.75),
		varS: n > 1 ? ss / (n - 1) : null, sdS: n > 1 ? Math.sqrt(ss / (n - 1)) : null, varP: ss / n, sdP: Math.sqrt(ss / n) };
}

// ---- t and F distributions via the regularised incomplete beta function ----
const lgamma = (x) => { // Lanczos approximation
	const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
	let y = x, tmp = x + 5.5; tmp -= (x + 0.5) * Math.log(tmp);
	let ser = 1.000000000190015; for (const cj of c) ser += cj / ++y;
	return -tmp + Math.log(2.5066282746310005 * ser / x);
};
function betacf(a, b, x) {
	const FPMIN = 1e-300; let c = 1, d = 1 - (a + b) * x / (a + 1); if (Math.abs(d) < FPMIN) d = FPMIN; d = 1 / d; let h = d;
	for (let m = 1; m <= 300; m++) {
		const m2 = 2 * m; let aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
		d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; h *= d * c;
		aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
		d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d;
		const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-15) break;
	}
	return h;
}
export function incBeta(x, a, b) {
	if (x <= 0) return 0; if (x >= 1) return 1;
	const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
	return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
}
// two-sided p-value of a t statistic
export const tTwoSided = (t, df) => incBeta(df / (df + t * t), df / 2, 0.5);
// critical value t such that P(|T| > t) = alpha
export function tCrit(alpha, df) {
	let lo = 0, hi = 1e3;
	for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; tTwoSided(m, df) > alpha ? lo = m : hi = m; }
	return (lo + hi) / 2;
}
// right-tail probability of an F statistic
export const fRightTail = (F, d1, d2) => (F <= 0 ? 1 : incBeta(d2 / (d2 + d1 * F), d2 / 2, d1 / 2));
