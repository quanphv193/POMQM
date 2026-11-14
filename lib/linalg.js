// Small dense linear algebra for regression.
export function invert(A) {
	const n = A.length;
	const M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
	for (let c = 0; c < n; c++) {
		let p = c;
		for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
		if (Math.abs(M[p][c]) < 1e-12) throw new Error('Ma trận suy biến (các biến X phụ thuộc tuyến tính hoặc quá ít dữ liệu).');
		[M[c], M[p]] = [M[p], M[c]];
		const d = M[c][c];
		for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
		for (let r = 0; r < n; r++) if (r !== c && M[r][c]) { const f = M[r][c]; for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; }
	}
	return M.map((r) => r.slice(n));
}
export const transpose = (A) => A[0].map((_, j) => A.map((r) => r[j]));
export const matmul = (A, B) => A.map((r) => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));
