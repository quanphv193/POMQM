import { normInv, Phi } from './stats.js';

export function eoq({ D, S, H, days = 250 }) {
	if (D <= 0 || S < 0 || H <= 0) throw new Error('Nhu cầu và chi phí lưu kho phải dương.');
	const Q = Math.sqrt(2 * D * S / H), N = D / Q;
	return { Q, N, T: days / N, ordering: N * S, holding: Q / 2 * H, total: N * S + Q / 2 * H };
}
export function epq({ D, S, H, p, d }) {
	if (p <= d) throw new Error('Tốc độ sản xuất phải lớn hơn tốc độ tiêu thụ.');
	const f = 1 - d / p, Q = Math.sqrt(2 * D * S / (H * f)), Imax = Q * f;
	return { Q, Imax, N: D / Q, ordering: D / Q * S, holding: Imax / 2 * H, total: D / Q * S + Imax / 2 * H, runTime: Q / p };
}
export function eoqShortage({ D, S, H, B }) {
	const Q = Math.sqrt(2 * D * S / H * (H + B) / B), Smax = Q * B / (H + B), back = Q - Smax;
	const holding = Smax * Smax / (2 * Q) * H, shortage = back * back / (2 * Q) * B, ordering = D / Q * S;
	return { Q, Smax, back, N: D / Q, ordering, holding, shortage, total: ordering + holding + shortage };
}
// tiers: [{ min, price }] sorted by min; holding = I * price unless H is given as a fixed amount.
export function quantityDiscount({ D, S, I, H, tiers }) {
	const t = [...tiers].sort((a, b) => a.min - b.min);
	const rows = t.map((tr, i) => {
		const max = i + 1 < t.length ? t[i + 1].min - 1 : Infinity;
		const h = H !== undefined && H !== null ? H : I * tr.price;
		const qStar = Math.sqrt(2 * D * S / h);
		const feasible = qStar <= max;
		const Q = qStar < tr.min ? tr.min : feasible ? qStar : null;
		const total = Q === null ? null : D / Q * S + Q / 2 * h + D * tr.price;
		return { ...tr, max, h, qStar, Q, total };
	});
	const valid = rows.filter((r) => r.total !== null);
	const best = valid.reduce((b, r) => (!b || r.total < b.total ? r : b), null);
	return { rows, best, bestIndex: rows.indexOf(best) };
}
export function abc(items, cutA = 0.8, cutB = 0.95) {
	const rows = items.map((it) => ({ ...it, vol: it.demand * it.cost })).sort((a, b) => b.vol - a.vol);
	const tot = rows.reduce((s, r) => s + r.vol, 0);
	let cum = 0;
	rows.forEach((r) => { const before = cum; cum += r.vol; r.share = r.vol / tot; r.cum = cum / tot; r.cls = before / tot < cutA - 1e-12 ? 'A' : before / tot < cutB - 1e-12 ? 'B' : 'C'; });
	return { rows, total: tot };
}
export function reorderNormal({ mu, sigma, service }) {
	const z = normInv(service), ss = z * sigma;
	return { z, safety: ss, rop: mu + ss };
}
// discrete lead-time demand: choose the reorder point with the lowest expected annual cost
export function reorderDiscrete({ demand, probs, carry, stockout, orders }) {
	const s = probs.reduce((a, b) => a + b, 0);
	if (Math.abs(s - 1) > 1e-6) throw new Error(`Tổng xác suất phải bằng 1 (đang là ${+s.toFixed(6)}).`);
	const mean = demand.reduce((a, d, i) => a + d * probs[i], 0);
	const rows = demand.map((rop) => {
		const safety = rop - mean;
		const exp = demand.reduce((a, d, i) => a + probs[i] * Math.max(d - rop, 0), 0);
		const carryCost = Math.max(safety, 0) * carry, stockCost = exp * stockout * orders;
		return { rop, safety, expShort: exp, carryCost, stockCost, total: carryCost + stockCost, serviceLevel: demand.reduce((a, d, i) => a + (d <= rop ? probs[i] : 0), 0) };
	});
	const best = rows.reduce((b, r) => (!b || r.total < b.total ? r : b), null);
	return { rows, best, bestIndex: rows.indexOf(best), mean };
}
export const kanban = ({ D, L, S, C }) => ({ N: D * L * (1 + S) / C });
void Phi;
