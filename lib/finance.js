// Time value of money and project appraisal. Rates are per period unless a name says "annual".
export const effective = (nominal, m) => (1 + nominal / m) ** m - 1;
export const nominalOf = (eff, m) => m * ((1 + eff) ** (1 / m) - 1);
export const fvSum = (pv, r, n) => pv * (1 + r) ** n;
export const pvSum = (fv, r, n) => fv / (1 + r) ** n;
export const rateOfSum = (pv, fv, n) => (fv / pv) ** (1 / n) - 1;
export const nperOfSum = (pv, fv, r) => Math.log(fv / pv) / Math.log(1 + r);
// annuity factors (type 0 = payments at period end, 1 = at period start)
export const pvFactor = (r, n, type = 0) => (r === 0 ? n : (1 - (1 + r) ** -n) / r) * (1 + r * type);
export const fvFactor = (r, n, type = 0) => (r === 0 ? n : ((1 + r) ** n - 1) / r) * (1 + r * type);
export const pmtFromPV = (pv, r, n, type = 0) => pv / pvFactor(r, n, type);
export const pmtFromFV = (fv, r, n, type = 0) => fv / fvFactor(r, n, type);

// Solve for the rate per period: pv + pmt*pvFactor(r) = fv/(1+r)^n  (pmt and pv both positive = loan received, instalments paid)
export function rateOfAnnuity(n, pmt, pv, fv = 0, type = 0) {
	if (!(n > 0 && pmt > 0 && pv > 0)) throw new Error('Cần số kỳ, khoản trả và số tiền vay đều lớn hơn 0.');
	if (pmt * n + fv < pv - 1e-9) throw new Error('Tổng số tiền trả nhỏ hơn số tiền vay nhận được: lãi suất sẽ âm. Kiểm tra lại số liệu.');
	const f = (r) => pv - pmt * pvFactor(r, n, type) - fv / (1 + r) ** n;
	let lo = -0.99, hi = 10;
	if (f(lo) * f(hi) > 0) throw new Error('Không tìm được lãi suất: tổng các khoản trả có thể nhỏ hơn số tiền vay (lãi suất âm) hoặc quá lớn.');
	for (let i = 0; i < 300; i++) { const m = (lo + hi) / 2; (f(lo) * f(m) <= 0) ? hi = m : lo = m; }
	return (lo + hi) / 2;
}

export function amortize(principal, r, n, type = 0) {
	const pmt = pmtFromPV(principal, r, n, type);
	let bal = principal, totalInt = 0;
	const rows = [];
	for (let k = 1; k <= n; k++) {
		const open = bal;
		const interest = (type === 1 ? open - pmt : open) * r;
		const closing = (type === 1 ? open - pmt : open - pmt) + interest;
		rows.push({ k, open, pay: pmt, interest, principal: type === 1 ? pmt : pmt - interest, close: Math.abs(closing) < 1e-7 ? 0 : closing });
		bal = closing; totalInt += interest;
	}
	return { pmt, rows, totalPaid: pmt * n, totalInterest: totalInt };
}

// ---- project appraisal ----
export const npvOf = (rate, flows) => flows.reduce((s, cf, t) => s + cf / (1 + rate) ** t, 0);
export function irrOf(flows) {
	if (!(flows.some((v) => v < 0) && flows.some((v) => v > 0))) return null;
	let lo = -0.9999, hi = 100, flo = npvOf(lo, flows), fhi = npvOf(hi, flows);
	if (flo * fhi > 0) return null;
	for (let i = 0; i < 300; i++) { const m = (lo + hi) / 2, fm = npvOf(m, flows); if (flo * fm <= 0) { hi = m; fhi = fm; } else { lo = m; flo = fm; } }
	return (lo + hi) / 2;
}
// payback in periods with linear interpolation inside the period; null if never recovered
export function payback(flows, rate = 0) {
	let cum = 0;
	for (let t = 0; t < flows.length; t++) {
		const cf = flows[t] / (1 + rate) ** t, prev = cum;
		cum += cf;
		if (cum >= -1e-12 && t > 0) return t - 1 + (cf > 0 ? -prev / cf : 0);
		if (cum >= -1e-12 && t === 0) return 0;
	}
	return null;
}
export const profile = (flows, rates) => rates.map((r) => npvOf(r, flows));
export function crossover(a, b) { // rate where both projects have the same NPV
	const d = (r) => npvOf(r, a) - npvOf(r, b);
	let lo = -0.5, hi = 5;
	if (d(lo) * d(hi) > 0) return null;
	for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; (d(lo) * d(m) <= 0) ? hi = m : lo = m; }
	return (lo + hi) / 2;
}

// ---- equipment: equivalent annual annuity ----
export function equipment(o, r) {
	const af = pvFactor(r, o.life, 0);
	const npv = -o.price + (o.rev - o.cost) * af + o.salvage / (1 + r) ** o.life;
	return { npv, eaa: npv / af, af };
}
// ---- buy vs lease ----
export function lease({ price, annual, salvage, r, n }) {
	const af = pvFactor(r, n, 0), pvCost = price + annual * af - salvage / (1 + r) ** n;
	return { pvCost, rentEnd: pvCost / af, rentStart: pvCost / (af * (1 + r)) };
}
// ---- project with depreciation and tax ----
export function taxProject(p) {
	const dep = (p.invest - p.salvage) / p.life;
	const rows = [];
	let rev = p.rev1;
	for (let t = 1; t <= p.life; t++) {
		const vc = rev * p.vcRatio, ebit = rev - vc - p.fixed - dep, tax = ebit * p.tax;
		const last = t === p.life;
		const salvageCf = last ? p.salvage - (p.taxSalvage ? p.salvage * p.tax : 0) : 0;
		const wc = last ? p.wc : 0;
		const cf = ebit - tax + dep + salvageCf + wc;
		rows.push({ t, rev, vc, fixed: p.fixed, dep, ebit, tax, cf, salvageCf, wc });
		rev *= 1 + p.growth;
	}
	const flows = [-p.invest, ...rows.map((r) => r.cf)];
	const out = { dep, rows, flows, irr: irrOf(flows) };
	out.npv1 = npvOf(p.rate1, flows);
	if (p.rate2 !== null && p.rate2 !== undefined) { out.npv2 = npvOf(p.rate2, flows); out.irrInterp = p.rate1 + (p.rate2 - p.rate1) * out.npv1 / (out.npv1 - out.npv2); }
	out.payback = payback(flows, 0);
	return out;
}
