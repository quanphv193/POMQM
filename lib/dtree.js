// Decision trees given as a branch list; rollback by expected value.
// branch: { from, to, name, prob (null on decision branches), value (payoff/cost on the branch) }
export function rollback(branches, sense = 'profit') {
	const better = sense === 'cost' ? (a, b) => a < b : (a, b) => a > b;
	const out = new Map(), parents = new Map();
	for (const b of branches) {
		if (!out.has(b.from)) out.set(b.from, []);
		out.get(b.from).push(b);
		if (parents.has(b.to)) throw new Error(`Nút ${b.to} có hai nhánh đi vào; cây quyết định chỉ cho mỗi nút một nhánh vào.`);
		parents.set(b.to, b.from);
	}
	const nodesSet = new Set(branches.flatMap((b) => [b.from, b.to]));
	const roots = [...nodesSet].filter((n) => !parents.has(n));
	if (roots.length !== 1) throw new Error(roots.length ? `Cây phải có đúng một nút gốc (đang có: ${roots.join(', ')}).` : 'Cây có vòng lặp.');
	const root = roots[0];
	const type = new Map();
	for (const n of nodesSet) {
		const bs = out.get(n) || [];
		if (!bs.length) { type.set(n, 'end'); continue; }
		const withP = bs.filter((b) => b.prob !== null && b.prob !== undefined);
		if (withP.length && withP.length !== bs.length) throw new Error(`Nút ${n}: hoặc mọi nhánh đều có xác suất (nút ngẫu nhiên), hoặc không nhánh nào có (nút quyết định).`);
		if (withP.length) {
			const s = withP.reduce((a, b) => a + b.prob, 0);
			if (Math.abs(s - 1) > 1e-6) throw new Error(`Xác suất các nhánh ra khỏi nút ${n} phải có tổng bằng 1 (đang là ${+s.toFixed(6)}).`);
			type.set(n, 'chance');
		} else type.set(n, 'decision');
	}
	const ev = new Map(), best = new Map(), order = [], depth = new Map([[root, 0]]);
	const visit = (n, seen = new Set()) => {
		if (seen.has(n)) throw new Error('Cây có vòng lặp.');
		seen.add(n);
		order.push(n);
		for (const b of out.get(n) || []) { depth.set(b.to, depth.get(n) + 1); visit(b.to, seen); }
		const bs = out.get(n) || [];
		const t = type.get(n);
		if (t === 'end') ev.set(n, 0);
		else if (t === 'chance') ev.set(n, bs.reduce((s, b) => s + b.prob * (b.value + ev.get(b.to)), 0));
		else {
			let bb = null;
			for (const b of bs) { const v = b.value + ev.get(b.to); if (!bb || better(v, bb.v)) bb = { b, v }; }
			ev.set(n, bb.v); best.set(n, bb.b);
		}
	};
	visit(root);
	// branches on the optimal policy: follow best decisions from the root through all chance outcomes
	const onPath = new Set();
	const walk = (n) => {
		const t = type.get(n);
		if (t === 'decision') { const b = best.get(n); onPath.add(b); walk(b.to); }
		else if (t === 'chance') for (const b of out.get(n)) { onPath.add(b); walk(b.to); }
	};
	walk(root);
	return { root, order, type, ev, best, out, depth, onPath, value: ev.get(root) };
}

// Single-period (newsvendor) payoff table over discrete demand.
export function singlePeriod({ demand, probs, price, cost, salvage = 0, shortage = 0 }) {
	const s = probs.reduce((a, b) => a + b, 0);
	if (Math.abs(s - 1) > 1e-6) throw new Error(`Tổng xác suất phải bằng 1 (đang là ${+s.toFixed(6)}).`);
	const pay = (q, d) => price * Math.min(q, d) - cost * q + salvage * Math.max(q - d, 0) - shortage * Math.max(d - q, 0);
	const table = demand.map((q) => demand.map((d) => pay(q, d)));
	const emv = table.map((row) => row.reduce((a, v, j) => a + v * probs[j], 0));
	const bi = emv.indexOf(Math.max(...emv));
	const evwpi = demand.reduce((a, d, j) => a + probs[j] * pay(d, d), 0);
	const cu = price - cost + shortage, co = cost - salvage;
	return { table, emv, best: bi, evwpi, evpi: evwpi - emv[bi], criticalRatio: cu / (cu + co) };
}
