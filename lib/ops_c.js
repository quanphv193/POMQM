import { solveLP } from './lp.js';

// ---------------- Aggregate planning ----------------
// periods: [{ d, capR, capO, capS }], costs: { r, o, s, h, b }, init inventory i0
export function aggregateLP(periods, c, i0 = 0) {
	const T = periods.length, nv = 5 * T;
	const R = (t) => t, O = (t) => T + t, S = (t) => 2 * T + t, I = (t) => 3 * T + t, Bk = (t) => 4 * T + t;
	const z = () => new Array(nv).fill(0);
	const cost = z();
	for (let t = 0; t < T; t++) { cost[R(t)] = c.r; cost[O(t)] = c.o; cost[S(t)] = c.s; cost[I(t)] = c.h; cost[Bk(t)] = c.b; }
	const cons = [];
	periods.forEach((p, t) => {
		for (const [f, cap] of [[R, p.capR], [O, p.capO], [S, p.capS]]) { const a = z(); a[f(t)] = 1; cons.push({ a, op: '<=', b: cap }); }
		const a = z(); a[I(t)] = 1; a[Bk(t)] = -1; a[R(t)] = -1; a[O(t)] = -1; a[S(t)] = -1;
		if (t > 0) { a[I(t - 1)] = -1; a[Bk(t - 1)] = 1; }
		cons.push({ a, op: '=', b: (t === 0 ? i0 : 0) - p.d });
	});
	const last = z(); last[Bk(T - 1)] = 1; cons.push({ a: last, op: '=', b: 0 });
	const r = solveLP({ sense: 'min', c: cost, constraints: cons });
	if (r.status !== 'optimal') throw new Error('Không có kế hoạch khả thi: tổng năng lực (thường, tăng ca, thuê ngoài) không đủ đáp ứng nhu cầu.');
	return { cost: r.objective, rows: periods.map((p, t) => ({ d: p.d, R: r.x[R(t)], O: r.x[O(t)], S: r.x[S(t)], I: r.x[I(t)], B: r.x[Bk(t)] })) };
}
export function evaluatePlan(periods, plan, c, i0 = 0) {
	let pos = i0, total = 0;
	const rows = periods.map((p, t) => { const q = plan[t]; pos += q.R + q.O + q.S - p.d; const I = Math.max(pos, 0), B = Math.max(-pos, 0); total += q.R * c.r + q.O * c.o + q.S * c.s + I * c.h + B * c.b; return { d: p.d, ...q, I, B }; });
	return { cost: total, rows };
}
// chase: restore a zero inventory position each period using the cheapest capacity first
export function chasePlan(periods, c, i0 = 0) {
	let pos = i0;
	const tiers = [['R', 'capR', c.r], ['O', 'capO', c.o], ['S', 'capS', c.s]].sort((a, b) => a[2] - b[2]);
	const plan = periods.map((p) => { let need = Math.max(0, p.d - pos); const q = { R: 0, O: 0, S: 0 }; for (const [k, cap] of tiers) { const x = Math.min(need, p[cap]); q[k] = x; need -= x; } pos += q.R + q.O + q.S - p.d; return q; });
	return evaluatePlan(periods, plan, c, i0);
}
// level: constant regular-time output equal to the average net requirement (limited by capacity)
export function levelPlan(periods, c, i0 = 0) {
	const avg = Math.max(0, (periods.reduce((s, p) => s + p.d, 0) - i0) / periods.length);
	return evaluatePlan(periods, periods.map((p) => ({ R: Math.min(avg, p.capR), O: 0, S: 0 })), c, i0);
}

// ---------------- MRP ----------------
// items: [{ id, parent|null, qty, lead, onHand, lot }], mps: end-item gross requirements per period (array per end item id)
export function mrp(items, mps, T) {
	const byId = new Map(items.map((it) => [it.id, it]));
	if (byId.size !== items.length) throw new Error('Mã vật tư bị trùng.');
	for (const it of items) if (it.parent && !byId.has(it.parent)) throw new Error(`Vật tư ${it.id} có cha “${it.parent}” không có trong bảng.`);
	const children = new Map(items.map((it) => [it.id, []]));
	items.forEach((it) => { if (it.parent) children.get(it.parent).push(it.id); });
	// order: parents before children (cycle check)
	const order = [], seen = new Set(), visiting = new Set();
	const visit = (id) => { if (seen.has(id)) return; if (visiting.has(id)) throw new Error('BOM có vòng lặp.'); visiting.add(id); if (byId.get(id).parent) visit(byId.get(id).parent); visiting.delete(id); seen.add(id); order.push(id); };
	items.forEach((it) => visit(it.id));
	// an item shared by several parents is not representable here: one parent per row; repeated ids are rejected above
	const res = new Map();
	for (const id of order) {
		const it = byId.get(id);
		const gross = new Array(T).fill(0);
		if (!it.parent) (mps[id] || []).forEach((v, t) => { gross[t] = v || 0; });
		else { const pr = res.get(it.parent); pr.release.forEach((v, t) => { gross[t] += v * it.qty; }); gross.forEach((_, t) => { gross[t] += pr.pastDue ? 0 : 0; }); }
		let proj = it.onHand; const net = new Array(T).fill(0), receipt = new Array(T).fill(0), release = new Array(T).fill(0), projected = new Array(T).fill(0);
		let pastDue = 0;
		for (let t = 0; t < T; t++) {
			const need = gross[t] - proj;
			if (need > 1e-9) { net[t] = need; const q = it.lot > 0 ? Math.ceil(need / it.lot - 1e-9) * it.lot : need; receipt[t] = q; proj += q; }
			proj -= gross[t]; projected[t] = proj;
		}
		for (let t = 0; t < T; t++) if (receipt[t] > 0) { const rt = t - it.lead; if (rt >= 0) release[rt] += receipt[t]; else pastDue += receipt[t]; }
		res.set(id, { id, gross, net, receipt, release, projected, pastDue });
	}
	return { rows: order.map((id) => res.get(id)), order };
}

// ---------------- Monte Carlo ----------------
export function rng(seed) { let a = (seed >>> 0) || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function simulate(values, probs, n, seed) {
	const s = probs.reduce((a, b) => a + b, 0);
	if (Math.abs(s - 1) > 1e-6) throw new Error(`Tổng xác suất phải bằng 1 (đang là ${+s.toFixed(6)}).`);
	const lower = []; let cum = 0; probs.forEach((p) => { lower.push(cum); cum += p; });
	const next = rng(seed), rs = [], sims = [];
	for (let i = 0; i < n; i++) { const r = Math.round(next() * 1e6) / 1e6; rs.push(r); let k = 0; while (k + 1 < lower.length && r >= lower[k + 1]) k++; sims.push(values[k]); }
	const mean = sims.reduce((a, b) => a + b, 0) / n, expected = values.reduce((a, v, i) => a + v * probs[i], 0);
	return { lower, rs, sims, mean, expected, freq: values.map((v) => sims.filter((x) => x === v).length / n) };
}
