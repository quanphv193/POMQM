// PERT / CPM. activities: [{id, pre:[ids], a, m, b}] (a=m=b for deterministic CPM),
// or [{id, pre, te, var}] when the mean and variance are given directly.
export function pert(activities, target) {
	const byId = new Map();
	for (const x of activities) {
		if (byId.has(x.id)) throw new Error('Trùng mã hoạt động: ' + x.id);
		byId.set(x.id, x);
	}
	for (const x of activities) {
		for (const p of x.pre) if (!byId.has(p)) throw new Error(`Hoạt động ${x.id} có tiền nhiệm không tồn tại: ${p}`);
		if (x.te === undefined && !(x.a <= x.m && x.m <= x.b)) throw new Error(`Hoạt động ${x.id}: cần a ≤ m ≤ b.`);
		if (x.te !== undefined && (x.te < 0 || x.var < 0)) throw new Error(`Hoạt động ${x.id}: thời gian và phương sai không được âm.`);
	}
	// topological order (Kahn)
	const indeg = new Map(activities.map((x) => [x.id, x.pre.length]));
	const succ = new Map(activities.map((x) => [x.id, []]));
	activities.forEach((x) => x.pre.forEach((p) => succ.get(p).push(x.id)));
	const order = [], q = activities.filter((x) => !x.pre.length).map((x) => x.id);
	while (q.length) {
		const id = q.shift(); order.push(id);
		for (const s of succ.get(id)) { indeg.set(s, indeg.get(s) - 1); if (indeg.get(s) === 0) q.push(s); }
	}
	if (order.length !== activities.length) throw new Error('Mạng có vòng lặp (chu trình) giữa các hoạt động.');

	const r = new Map();
	for (const id of order) {
		const x = byId.get(id);
		const te = x.te !== undefined ? x.te : (x.a + 4 * x.m + x.b) / 6;
		const v = x.te !== undefined ? x.var : ((x.b - x.a) / 6) ** 2;
		const es = x.pre.length ? Math.max(...x.pre.map((p) => r.get(p).ef)) : 0;
		r.set(id, { id, pre: x.pre, a: x.a, m: x.m, b: x.b, te, var: v, es, ef: es + te });
	}
	const duration = Math.max(...[...r.values()].map((v) => v.ef));
	for (const id of [...order].reverse()) {
		const v = r.get(id);
		v.lf = succ.get(id).length ? Math.min(...succ.get(id).map((s) => r.get(s).ls)) : duration;
		v.ls = v.lf - v.te;
		v.slack = v.ls - v.es;
		v.critical = Math.abs(v.slack) < 1e-9;
	}
	const rows = order.map((id) => r.get(id));
	// every critical path: chains of critical activities where each starts exactly when the previous ends
	const paths = [];
	const extend = (id, acc) => {
		if (paths.length >= 50) return;
		const v = r.get(id);
		const next = succ.get(id).map((s) => r.get(s)).filter((s) => s.critical && Math.abs(s.es - v.ef) < 1e-9);
		if (!next.length) { if (Math.abs(v.ef - duration) < 1e-9) paths.push([...acc, id]); return; }
		for (const s of next) extend(s.id, [...acc, id]);
	};
	for (const v of rows) if (v.critical && !v.pre.length) extend(v.id, []);
	const pathVar = (pth) => pth.reduce((s, id) => s + r.get(id).var, 0);
	// with several critical paths, use the one with the largest variance (most conservative)
	const path = paths.reduce((best, pth) => (!best || pathVar(pth) > pathVar(best) + 1e-12 ? pth : best), null) || [];
	const variance = pathVar(path);
	const sd = Math.sqrt(variance);
	const out = { rows, duration, path, paths, variance, sd, succ };
	if (target !== undefined && target !== null && !Number.isNaN(target)) {
		out.prob = sd === 0 ? (target >= duration ? 1 : 0) : normCdf((target - duration) / sd);
	}
	return out;
}
export function normCdf(z) {
	// Abramowitz-Stegun erf approximation (|error| < 1.5e-7)
	const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
	const poly = ((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592;
	const erf = 1 - poly * t * Math.exp(-(z * z) / 2);
	return 0.5 * (1 + (z >= 0 ? erf : -erf));
}

// Activity-on-arrow input -> activity-on-node predecessors (an activity precedes another when its end node is the other's start node).
export function fromArrows(acts) {
	const byEnd = new Map();
	for (const x of acts) { if (!byEnd.has(x.end)) byEnd.set(x.end, []); byEnd.get(x.end).push(x.id); }
	return acts.map((x) => ({ ...x, pre: byEnd.get(x.start) || [] }));
}

// Cost per period under the early-start and late-start schedules, spreading each activity's cost evenly over its duration.
export function budget(rows, costs) {
	const T = Math.ceil(Math.max(...rows.map((v) => v.ef)) - 1e-9);
	const spread = (start, te, cost, k) => (te > 0 ? Math.max(0, Math.min(k, start + te) - Math.max(k - 1, start)) * cost / te : (start >= k - 1 && start < k ? cost : 0));
	const periods = Array.from({ length: T }, (_, i) => {
		const k = i + 1;
		const es = rows.reduce((s, v, j) => s + spread(v.es, v.te, costs[j], k), 0);
		const ls = rows.reduce((s, v, j) => s + spread(v.ls, v.te, costs[j], k), 0);
		return { k, es, ls };
	});
	let ce = 0, cl = 0;
	for (const p of periods) { ce += p.es; cl += p.ls; p.esCum = ce; p.lsCum = cl; }
	return { periods, total: costs.reduce((a, b) => a + b, 0) };
}
