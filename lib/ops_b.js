// ---------------- Networks ----------------
export function mst(edges) {
	const nodes = [...new Set(edges.flatMap((e) => [e.a, e.b]))];
	const parent = new Map(nodes.map((n) => [n, n]));
	const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
	const order = edges.map((e, i) => ({ ...e, i })).sort((p, q) => p.w - q.w || p.i - q.i);
	const chosen = [];
	for (const e of order) { const ra = find(e.a), rb = find(e.b); if (ra !== rb) { parent.set(ra, rb); chosen.push(e); } }
	if (chosen.length !== nodes.length - 1) throw new Error('Mạng không liên thông: không có cây khung bao phủ mọi nút.');
	return { chosen, total: chosen.reduce((s, e) => s + e.w, 0), nodes, steps: order.map((e) => ({ ...e, taken: chosen.some((c) => c.i === e.i) })) };
}
export function shortestPath(edges, s, t, directed = false) {
	const nodes = [...new Set(edges.flatMap((e) => [e.a, e.b]))];
	if (!nodes.includes(s) || !nodes.includes(t)) throw new Error('Nút nguồn hoặc nút đích không có trong mạng.');
	if (edges.some((e) => e.w < 0)) throw new Error('Khoảng cách không được âm.');
	const adj = new Map(nodes.map((n) => [n, []]));
	for (const e of edges) { adj.get(e.a).push({ to: e.b, w: e.w }); if (!directed) adj.get(e.b).push({ to: e.a, w: e.w }); }
	const dist = new Map(nodes.map((n) => [n, Infinity])), prev = new Map(), done = new Set();
	dist.set(s, 0);
	while (done.size < nodes.length) {
		let u = null; for (const n of nodes) if (!done.has(n) && (u === null || dist.get(n) < dist.get(u))) u = n;
		if (u === null || dist.get(u) === Infinity) break;
		done.add(u);
		for (const { to, w } of adj.get(u)) if (dist.get(u) + w < dist.get(to)) { dist.set(to, dist.get(u) + w); prev.set(to, u); }
	}
	if (dist.get(t) === Infinity) throw new Error(`Không có đường đi từ ${s} đến ${t}.`);
	const path = [t]; while (path[0] !== s) path.unshift(prev.get(path[0]));
	return { distance: dist.get(t), path, dist: Object.fromEntries(dist) };
}
export function maxFlow(edges, s, t) {
	const nodes = [...new Set(edges.flatMap((e) => [e.a, e.b]))];
	if (!nodes.includes(s) || !nodes.includes(t) || s === t) throw new Error('Nút nguồn và nút đích phải khác nhau và có trong mạng.');
	const cap = new Map(), key = (a, b) => `${a}\u0001${b}`;
	for (const e of edges) { cap.set(key(e.a, e.b), (cap.get(key(e.a, e.b)) || 0) + e.w); if (!cap.has(key(e.b, e.a))) cap.set(key(e.b, e.a), 0); }
	const orig = new Map(cap), neigh = new Map(nodes.map((n) => [n, new Set()]));
	for (const e of edges) { neigh.get(e.a).add(e.b); neigh.get(e.b).add(e.a); }
	let total = 0;
	for (;;) {
		const par = new Map([[s, null]]), q = [s];
		while (q.length && !par.has(t)) { const u = q.shift(); for (const v of neigh.get(u)) if (!par.has(v) && cap.get(key(u, v)) > 1e-12) { par.set(v, u); q.push(v); } }
		if (!par.has(t)) break;
		let b = Infinity; for (let v = t; v !== s; v = par.get(v)) b = Math.min(b, cap.get(key(par.get(v), v)));
		for (let v = t; v !== s; v = par.get(v)) { const u = par.get(v); cap.set(key(u, v), cap.get(key(u, v)) - b); cap.set(key(v, u), cap.get(key(v, u)) + b); }
		total += b;
	}
	const flows = edges.map((e) => { const net = orig.get(key(e.a, e.b)) - cap.get(key(e.a, e.b)); return Math.max(0, Math.min(e.w, net)); });
	return { total, flows };
}

// ---------------- Lot sizing ----------------
// cost model: setup S per order, holding H per unit of ending inventory per period
export function lotCost(d, orders, S, H) {
	let inv = 0, setup = 0, hold = 0;
	const rows = d.map((dem, t) => {
		inv += orders[t] - dem;
		if (inv < -1e-9) throw new Error(`Kế hoạch đặt hàng không đủ cho kỳ ${t + 1}.`);
		const sc = orders[t] > 0 ? S : 0, hc = inv * H;
		setup += sc; hold += hc;
		return { t: t + 1, demand: dem, order: orders[t], end: inv, setup: sc, hold: hc };
	});
	return { rows, setup, hold, total: setup + hold };
}
export function lotSizing(method, d, S, H) {
	const n = d.length, orders = new Array(n).fill(0), avg = d.reduce((a, b) => a + b, 0) / n;
	if (method === 'l4l') d.forEach((x, t) => { orders[t] = x; });
	else if (method === 'eoq') {
		const Q = Math.sqrt(2 * avg * S / H); let inv = 0;
		for (let t = 0; t < n; t++) { const need = d[t] - inv; if (need > 1e-9) orders[t] = Math.ceil(need / Q - 1e-9) * Q; inv += orders[t] - d[t]; }
	} else if (method === 'poq') {
		const P = Math.max(1, Math.round(Math.sqrt(2 * avg * S / H) / avg));
		for (let t = 0; t < n; t += P) orders[t] = d.slice(t, t + P).reduce((a, b) => a + b, 0);
	} else if (method === 'sm') {
		let t = 0;
		while (t < n) {
			let best = Infinity, T = 1, hold = 0;
			for (let k = 1; t + k <= n; k++) { hold += H * (k - 1) * d[t + k - 1]; const avgc = (S + hold) / k; if (avgc <= best + 1e-12) { best = avgc; T = k; } else break; }
			orders[t] = d.slice(t, t + T).reduce((a, b) => a + b, 0); t += T;
		}
	} else if (method === 'ww') {
		const f = new Array(n + 1).fill(Infinity), from = new Array(n + 1).fill(0); f[0] = 0;
		for (let j = 1; j <= n; j++) for (let i = 1; i <= j; i++) {
			let hold = 0; for (let k = i; k <= j; k++) hold += H * (k - i) * d[k - 1];
			const c = f[i - 1] + S + hold; if (c < f[j] - 1e-12) { f[j] = c; from[j] = i; }
		}
		for (let j = n; j > 0; j = from[j] - 1) orders[from[j] - 1] = d.slice(from[j] - 1, j).reduce((a, b) => a + b, 0);
	} else throw new Error('Phương pháp không hợp lệ.');
	return { orders, ...lotCost(d, orders, S, H) };
}

// ---------------- Job-shop scheduling ----------------
export function sequence(jobs, rule) {
	const idx = jobs.map((_, i) => i);
	const by = (f, desc = false) => idx.sort((a, b) => (desc ? f(b) - f(a) : f(a) - f(b)) || a - b);
	let order;
	if (rule === 'fcfs') order = idx;
	else if (rule === 'spt') order = by((i) => jobs[i].p);
	else if (rule === 'lpt') order = by((i) => jobs[i].p, true);
	else if (rule === 'edd') order = by((i) => jobs[i].due);
	else if (rule === 'slack') order = by((i) => jobs[i].due - jobs[i].p);
	else if (rule === 'cr') order = by((i) => jobs[i].due / jobs[i].p);
	else if (rule === 'moore') {
		const edd = jobs.map((_, i) => i).sort((a, b) => jobs[a].due - jobs[b].due || a - b), on = [], late = [];
		let t = 0;
		for (const i of edd) { on.push(i); t += jobs[i].p; if (t > jobs[i].due + 1e-12) { let big = on[0]; for (const j of on) if (jobs[j].p > jobs[big].p) big = j; on.splice(on.indexOf(big), 1); late.push(big); t -= jobs[big].p; } }
		order = [...on, ...late];
	} else throw new Error('Quy tắc không hợp lệ.');
	return order;
}
export function evaluate(jobs, order) {
	let t = 0;
	const rows = order.map((i) => { t += jobs[i].p; const late = t - jobs[i].due; return { i, start: t - jobs[i].p, end: t, flow: t, late, tardy: Math.max(0, late) }; });
	const n = rows.length;
	return { rows, makespan: t, avgFlow: rows.reduce((s, r) => s + r.flow, 0) / n, avgLate: rows.reduce((s, r) => s + r.tardy, 0) / n, nTardy: rows.filter((r) => r.late > 1e-12).length, maxLate: Math.max(...rows.map((r) => r.tardy)) };
}
export function johnson(jobs) {
	const first = jobs.map((_, i) => i).filter((i) => jobs[i].a <= jobs[i].b).sort((x, y) => jobs[x].a - jobs[y].a || x - y);
	const last = jobs.map((_, i) => i).filter((i) => jobs[i].a > jobs[i].b).sort((x, y) => jobs[y].b - jobs[x].b || x - y);
	return [...first, ...last];
}
export function flowShop(jobs, order) {
	let t1 = 0, t2 = 0, idle2 = 0;
	const rows = order.map((i) => { const s1 = t1; t1 += jobs[i].a; const s2 = Math.max(t1, t2); idle2 += s2 - t2; t2 = s2 + jobs[i].b; return { i, s1, e1: t1, s2, e2: t2 }; });
	return { rows, makespan: t2, idle2 };
}

// ---------------- Line balancing ----------------
export function lineBalance(tasks, cycle, rule) {
	const idx = new Map(tasks.map((t, i) => [t.id, i])), n = tasks.length;
	if (tasks.some((t) => t.time > cycle + 1e-12)) throw new Error('Có công việc dài hơn thời gian chu kỳ; không thể phân công.');
	const succ = tasks.map(() => []);
	tasks.forEach((t, i) => t.pre.forEach((p) => { if (!idx.has(p)) throw new Error(`Công việc ${t.id} có tiền nhiệm “${p}” không có trong bảng.`); succ[idx.get(p)].push(i); }));
	const allSucc = (i, seen = new Set()) => { for (const j of succ[i]) if (!seen.has(j)) { seen.add(j); allSucc(j, seen); } return seen; };
	const following = tasks.map((_, i) => allSucc(i));
	const rpw = tasks.map((t, i) => t.time + [...following[i]].reduce((s, j) => s + tasks[j].time, 0));
	const key = { lot: (i) => -tasks[i].time, mft: (i) => -following[i].size, rpw: (i) => -rpw[i], sot: (i) => tasks[i].time, lft: (i) => following[i].size }[rule];
	if (!key) throw new Error('Quy tắc không hợp lệ.');
	const done = new Array(n).fill(false), station = new Array(n).fill(0), stations = [];
	let left = n;
	while (left) {
		let rem = cycle; const members = [];
		for (;;) {
			const el = tasks.map((_, i) => i).filter((i) => !done[i] && tasks[i].pre.every((p) => done[idx.get(p)]) && tasks[i].time <= rem + 1e-12).sort((a, b) => key(a) - key(b) || a - b);
			if (!el.length) break;
			const i = el[0]; done[i] = true; station[i] = stations.length + 1; members.push(i); rem -= tasks[i].time; left--;
		}
		if (!members.length) throw new Error('Không thể tiếp tục phân công (kiểm tra vòng lặp tiền nhiệm).');
		stations.push({ members, used: cycle - rem, idle: rem });
	}
	const total = tasks.reduce((s, t) => s + t.time, 0);
	return { stations, station, rpw, following: following.map((f) => f.size), total, minStations: Math.ceil(total / cycle - 1e-9), efficiency: total / (stations.length * cycle), idle: stations.length * cycle - total };
}

// ---------------- Layout ----------------
const layoutCost = (flow, dist, loc) => flow.reduce((s, row, i) => s + row.reduce((t, f, j) => t + f * dist[loc[i]][loc[j]], 0), 0);
export function layoutEnumerate(flow, dist) {
	const n = flow.length; if (n > 8) throw new Error('Liệt kê toàn bộ chỉ dùng cho tối đa 8 phòng ban; hãy dùng phương pháp đổi chỗ từng cặp.');
	let best = null, count = 0;
	const perm = (a, k) => { if (k === n) { count++; const c = layoutCost(flow, dist, a); if (!best || c < best.cost - 1e-12) best = { cost: c, loc: a.slice() }; return; } for (let i = k; i < n; i++) { [a[k], a[i]] = [a[i], a[k]]; perm(a, k + 1); [a[k], a[i]] = [a[i], a[k]]; } };
	perm(Array.from({ length: n }, (_, i) => i), 0);
	return { ...best, evaluated: count, initial: layoutCost(flow, dist, Array.from({ length: n }, (_, i) => i)) };
}
export function layoutPairwise(flow, dist) {
	const n = flow.length; let loc = Array.from({ length: n }, (_, i) => i), cost = layoutCost(flow, dist, loc);
	const initial = cost, steps = [];
	for (let it = 0; it < 200; it++) {
		let bestSwap = null;
		for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const t = loc.slice(); [t[i], t[j]] = [t[j], t[i]]; const c = layoutCost(flow, dist, t); if (c < cost - 1e-12 && (!bestSwap || c < bestSwap.c)) bestSwap = { i, j, c, t }; }
		if (!bestSwap) break;
		loc = bestSwap.t; cost = bestSwap.c; steps.push({ i: bestSwap.i, j: bestSwap.j, cost });
	}
	return { loc, cost, initial, steps };
}
