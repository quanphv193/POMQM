// Hungarian algorithm (Kuhn–Munkres), O(n^3). Rectangular and max problems are padded / negated.
export function assign(cost, sense = 'min') {
	const m = cost.length, n = cost[0].length, N = Math.max(m, n);
	const big = Math.max(...cost.flat().map(Math.abs)) + 1;
	const a = Array.from({ length: N + 1 }, (_, i) => Array.from({ length: N + 1 }, (_, j) => (i > 0 && j > 0 && i <= m && j <= n ? (sense === 'max' ? big - cost[i - 1][j - 1] : cost[i - 1][j - 1]) : (sense === 'max' ? big : 0))));
	const u = new Array(N + 1).fill(0), v = new Array(N + 1).fill(0), p = new Array(N + 1).fill(0), way = new Array(N + 1).fill(0);
	for (let i = 1; i <= N; i++) {
		p[0] = i; let j0 = 0;
		const minv = new Array(N + 1).fill(Infinity), used = new Array(N + 1).fill(false);
		do {
			used[j0] = true;
			const i0 = p[j0]; let delta = Infinity, j1 = 0;
			for (let j = 1; j <= N; j++) if (!used[j]) {
				const cur = a[i0][j] - u[i0] - v[j];
				if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
				if (minv[j] < delta) { delta = minv[j]; j1 = j; }
			}
			for (let j = 0; j <= N; j++) { if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta; }
			j0 = j1;
		} while (p[j0] !== 0);
		do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
	}
	const pairs = [];
	for (let j = 1; j <= N; j++) { const i = p[j]; if (i >= 1 && i <= m && j <= n) pairs.push([i - 1, j - 1]); }
	pairs.sort((x, y) => x[0] - y[0]);
	return { pairs, cost: pairs.reduce((s, [i, j]) => s + cost[i][j], 0), unassignedRows: Array.from({ length: m }, (_, i) => i).filter((i) => !pairs.some((q) => q[0] === i)), unassignedCols: Array.from({ length: n }, (_, j) => j).filter((j) => !pairs.some((q) => q[1] === j)) };
}
