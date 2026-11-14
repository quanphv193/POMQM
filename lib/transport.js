import { solveLP } from './lp.js';

// cost: m×n, supply, demand. Returns balanced data with dummy row/col of zero cost when needed.
export function balance(cost, supply, demand) {
	const S = supply.reduce((a, b) => a + b, 0), D = demand.reduce((a, b) => a + b, 0);
	let c = cost.map((r) => r.slice()), s = supply.slice(), d = demand.slice(), dummy = null;
	if (S > D + 1e-9) { c = c.map((r) => [...r, 0]); d.push(S - D); dummy = 'col'; }
	else if (D > S + 1e-9) { c.push(new Array(d.length).fill(0)); s.push(D - S); dummy = 'row'; }
	return { cost: c, supply: s, demand: d, dummy, totalSupply: S, totalDemand: D };
}
const total = (x, c) => x.reduce((a, row, i) => a + row.reduce((b, v, j) => b + v * c[i][j], 0), 0);

export function northwest(cost, supply, demand) {
	const m = supply.length, n = demand.length, s = supply.slice(), d = demand.slice();
	const x = Array.from({ length: m }, () => new Array(n).fill(0));
	let i = 0, j = 0;
	while (i < m && j < n) { const q = Math.min(s[i], d[j]); x[i][j] = q; s[i] -= q; d[j] -= q; if (s[i] <= 1e-9 && i < m - 1) i++; else if (d[j] <= 1e-9) j++; else i++; }
	return { x, cost: total(x, cost) };
}
export function minCost(cost, supply, demand) {
	const m = supply.length, n = demand.length, s = supply.slice(), d = demand.slice();
	const x = Array.from({ length: m }, () => new Array(n).fill(0));
	const cells = [];
	for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) cells.push([i, j]);
	cells.sort((a, b) => cost[a[0]][a[1]] - cost[b[0]][b[1]] || a[0] - b[0] || a[1] - b[1]);
	for (const [i, j] of cells) { const q = Math.min(s[i], d[j]); if (q > 0) { x[i][j] = q; s[i] -= q; d[j] -= q; } }
	return { x, cost: total(x, cost) };
}
export function vogel(cost, supply, demand) {
	const m = supply.length, n = demand.length, s = supply.slice(), d = demand.slice();
	const x = Array.from({ length: m }, () => new Array(n).fill(0));
	const rowDone = new Array(m).fill(false), colDone = new Array(n).fill(false);
	const steps = [];
	const pen = (vals) => { const v = vals.slice().sort((a, b) => a - b); return v.length > 1 ? v[1] - v[0] : v[0] ?? 0; };
	for (let it = 0; it < m + n; it++) {
		let best = null;
		for (let i = 0; i < m; i++) if (!rowDone[i]) { const vals = []; for (let j = 0; j < n; j++) if (!colDone[j]) vals.push(cost[i][j]); if (vals.length) { const p = pen(vals); if (!best || p > best.p) best = { kind: 'r', idx: i, p }; } }
		for (let j = 0; j < n; j++) if (!colDone[j]) { const vals = []; for (let i = 0; i < m; i++) if (!rowDone[i]) vals.push(cost[i][j]); if (vals.length) { const p = pen(vals); if (!best || p > best.p) best = { kind: 'c', idx: j, p }; } }
		if (!best) break;
		let bi = -1, bj = -1, bc = Infinity;
		if (best.kind === 'r') { bi = best.idx; for (let j = 0; j < n; j++) if (!colDone[j] && cost[bi][j] < bc) { bc = cost[bi][j]; bj = j; } }
		else { bj = best.idx; for (let i = 0; i < m; i++) if (!rowDone[i] && cost[i][bj] < bc) { bc = cost[i][bj]; bi = i; } }
		const q = Math.min(s[bi], d[bj]);
		x[bi][bj] += q; s[bi] -= q; d[bj] -= q;
		steps.push({ penalty: best.p, row: bi, col: bj, qty: q });
		if (s[bi] <= 1e-9) rowDone[bi] = true; else if (d[bj] <= 1e-9) colDone[bj] = true;
		if (d[bj] <= 1e-9) colDone[bj] = true;
		if (rowDone.every(Boolean) || colDone.every(Boolean)) break;
	}
	return { x, cost: total(x, cost), steps };
}
// Optimal solution by LP (min or max), with row/column duals for MODI-style reporting.
export function optimalTransport(cost, supply, demand, sense = 'min') {
	const m = supply.length, n = demand.length;
	const nv = m * n, a0 = () => new Array(nv).fill(0);
	const cons = [];
	for (let i = 0; i < m; i++) { const a = a0(); for (let j = 0; j < n; j++) a[i * n + j] = 1; cons.push({ a, op: '=', b: supply[i] }); }
	for (let j = 0; j < n; j++) { const a = a0(); for (let i = 0; i < m; i++) a[i * n + j] = 1; cons.push({ a, op: '=', b: demand[j] }); }
	const r = solveLP({ sense, c: cost.flat(), constraints: cons });
	if (r.status !== 'optimal') throw new Error('Không tìm được phương án vận chuyển khả thi.');
	const x = Array.from({ length: m }, (_, i) => Array.from({ length: n }, (_, j) => r.x[i * n + j]));
	return { x, cost: r.objective, duals: r.shadow };
}
