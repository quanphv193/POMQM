// Linear programming: two-phase simplex. Entering variable = most negative reduced cost (as in textbooks),
// falling back to Bland's rule after repeated degenerate pivots so it cannot cycle. Variables are >= 0.
const EPS = 1e-9;

// opts.trace: record every tableau (for the iterations sheet).
export function solveLP({ sense, c, constraints }, opts = {}) {
	const nv = c.length, m = constraints.length;
	if (!nv || !m) throw new Error('Cần ít nhất 1 biến và 1 ràng buộc.');
	const sign = sense === 'min' ? -1 : 1;
	const cost = c.map((v) => v * sign);

	// normalise rows so that b >= 0
	const rows = constraints.map((k) => {
		let a = k.a.slice(), b = k.b, op = k.op, flipped = false;
		if (b < 0) {
			a = a.map((v) => -v); b = -b; flipped = true;
			op = op === '<=' ? '>=' : op === '>=' ? '<=' : '=';
		}
		return { a, b, op, flipped };
	});
	let nSlack = 0, nArt = 0;
	rows.forEach((r) => { if (r.op !== '=') nSlack++; if (r.op !== '<=') nArt++; });
	const N = nv + nSlack + nArt;
	const T = [], basis = [], dualCol = [];
	let si = nv, ai = nv + nSlack;
	const artCols = [];
	rows.forEach((r, i) => {
		const row = new Array(N + 1).fill(0);
		r.a.forEach((v, j) => (row[j] = v));
		row[N] = r.b;
		if (r.op === '<=') { row[si] = 1; basis.push(si); dualCol.push({ col: si, mul: 1 }); si++; }
		else if (r.op === '>=') { row[si] = -1; dualCol.push({ col: si, mul: -1 }); si++; row[ai] = 1; basis.push(ai); artCols.push(ai); ai++; }
		else { row[ai] = 1; basis.push(ai); artCols.push(ai); dualCol.push({ col: ai, mul: 1 }); ai++; }
		T.push(row);
	});

	const isArt = (j) => j >= nv + nSlack;
	const colNames = [];
	for (let j = 0; j < nv; j++) colNames.push(opts.names?.[j] ?? `x${j + 1}`);
	{ let k = 0, a = 0; rows.forEach((r, i) => { if (r.op !== '=') { colNames[nv + k++] = `S${i + 1}`; } }); rows.forEach((r, i) => { if (r.op !== '<=') colNames[nv + nSlack + a++] = `A${i + 1}`; }); }
	const trace = opts.trace ? [] : null;
	const snap = (phase, obj, e, r) => trace && trace.length < 60 && trace.push({ phase, basis: basis.slice(), T: T.map((row) => row.slice()), obj: obj.slice(), enter: e, leave: r });
	if (artCols.length) {
		const c1 = new Array(N).fill(0);
		artCols.forEach((j) => (c1[j] = -1));
		const obj = buildObj(T, basis, c1, N);
		const st = iterate(T, basis, obj, N, () => true, (e, r) => snap(1, obj, e, r));
		snap(1, obj, -1, -1);
		if (st === 'unbounded') throw new Error('Lỗi nội bộ giai đoạn 1.');
		if (obj[N] < -1e-7) return { status: 'infeasible', trace, colNames };
		// drive artificials out of the basis
		for (let i = 0; i < m; i++) {
			if (isArt(basis[i])) {
				let j = -1;
				for (let k = 0; k < nv + nSlack; k++) if (Math.abs(T[i][k]) > 1e-7) { j = k; break; }
				if (j >= 0) pivot(T, obj, basis, i, j, N);
			}
		}
	}
	const c2 = new Array(N).fill(0);
	cost.forEach((v, j) => (c2[j] = v));
	const obj = buildObj(T, basis, c2, N);
	const st = iterate(T, basis, obj, N, (j) => !isArt(j), (e, r) => snap(2, obj, e, r));
	snap(2, obj, -1, -1);
	if (st === 'unbounded') return { status: 'unbounded', trace, colNames };

	const x = new Array(nv).fill(0);
	basis.forEach((bj, i) => { if (bj < nv) x[bj] = T[i][N]; });
	const objective = c.reduce((s, v, j) => s + v * x[j], 0);
	const lhs = constraints.map((k) => k.a.reduce((s, v, j) => s + v * x[j], 0));
	const slack = constraints.map((k, i) => (k.op === '<=' ? k.b - lhs[i] : k.op === '>=' ? lhs[i] - k.b : 0));
	const shadow = rows.map((r, i) => {
		const { col, mul } = dualCol[i];
		let y = mul * obj[col];           // dz/db' of normalised max problem
		if (r.flipped) y = -y;            // back to original b
		return clean(y * sign);
	});

	// ---- sensitivity (ranging) on the optimal tableau, done in max form then mapped back ----
	const nonbasic = [];
	for (let j = 0; j < N; j++) if (!isArt(j) && !basis.includes(j)) nonbasic.push(j);
	const costRange = c.map((cj, j) => {
		const cm = cj * sign;
		let lo = -Infinity, hi = Infinity;
		const r = basis.indexOf(j);
		if (r < 0) hi = cm + obj[j];
		else {
			for (const k of nonbasic) {
				const a = T[r][k], d = obj[k];
				if (a > EPS) lo = Math.max(lo, cm - d / a);
				else if (a < -EPS) hi = Math.min(hi, cm + d / -a);
			}
		}
		const range = sign === 1 ? [lo, hi] : [-hi, -lo];
		return { basic: r >= 0, reduced: r >= 0 ? 0 : clean(obj[j]), lower: cleanInf(range[0]), upper: cleanInf(range[1]) };
	});
	const rhsRange = rows.map((row, i) => {
		const { col, mul } = dualCol[i];
		let lo = -Infinity, hi = Infinity;
		for (let rr = 0; rr < m; rr++) {
			const g = mul * T[rr][col], xb = T[rr][N];
			if (g > EPS) lo = Math.max(lo, -xb / g);
			else if (g < -EPS) hi = Math.min(hi, xb / -g);
		}
		const b0 = constraints[i].b;
		const range = row.flipped ? [b0 - hi, b0 - lo] : [b0 + lo, b0 + hi];
		return { lower: cleanInf(range[0]), upper: cleanInf(range[1]) };
	});
	return { status: 'optimal', x: x.map(clean), objective: clean(objective), lhs: lhs.map(clean), slack: slack.map(clean), shadow, costRange, rhsRange, trace, colNames, sign };
}
const cleanInf = (v) => (Number.isFinite(v) ? clean(v) : v);

const clean = (v) => (Math.abs(v) < 1e-9 ? 0 : Math.round(v * 1e9) / 1e9);

function buildObj(T, basis, cost, N) {
	const obj = new Array(N + 1).fill(0);
	for (let j = 0; j < N; j++) obj[j] = -cost[j];
	T.forEach((row, i) => { const cb = cost[basis[i]]; if (cb) for (let j = 0; j <= N; j++) obj[j] += cb * row[j]; });
	return obj;
}
function iterate(T, basis, obj, N, allowed, onPivot) {
	let degenerate = 0;
	for (let it = 0; it < 10000; it++) {
		let e = -1;
		if (degenerate < 50) {
			let best = -EPS;
			for (let j = 0; j < N; j++) if (allowed(j) && obj[j] < best) { best = obj[j]; e = j; }
		} else {
			for (let j = 0; j < N; j++) if (allowed(j) && obj[j] < -EPS) { e = j; break; }
		}
		if (e < 0) return 'optimal';
		let r = -1, best = Infinity;
		for (let i = 0; i < T.length; i++) {
			if (T[i][e] > EPS) {
				const ratio = T[i][N] / T[i][e];
				if (ratio < best - 1e-12 || (Math.abs(ratio - best) <= 1e-12 && basis[i] < basis[r])) { best = ratio; r = i; }
			}
		}
		if (r < 0) return 'unbounded';
		if (onPivot) onPivot(e, r);
		degenerate = best < 1e-12 ? degenerate + 1 : 0;
		pivot(T, obj, basis, r, e, N);
	}
	throw new Error('Simplex vượt quá số vòng lặp.');
}
function pivot(T, obj, basis, r, e, N) {
	const p = T[r][e];
	for (let j = 0; j <= N; j++) T[r][j] /= p;
	for (let i = 0; i < T.length; i++) {
		if (i !== r && T[i][e]) { const f = T[i][e]; for (let j = 0; j <= N; j++) T[i][j] -= f * T[r][j]; }
	}
	const f = obj[e];
	if (f) for (let j = 0; j <= N; j++) obj[j] -= f * T[r][j];
	basis[r] = e;
}
