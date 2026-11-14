// Corner points and drawing data for a 2-variable LP.
const TOL = 1e-7;

export function cornerPoints(c, constraints) {
	const lines = constraints.map((k) => ({ a: k.a[0], b: k.a[1], r: k.b }));
	lines.push({ a: 1, b: 0, r: 0 }, { a: 0, b: 1, r: 0 });
	const feasible = (x, y) => x >= -TOL && y >= -TOL && constraints.every((k) => {
		const v = k.a[0] * x + k.a[1] * y;
		return k.op === '<=' ? v <= k.b + TOL * (1 + Math.abs(k.b)) : k.op === '>=' ? v >= k.b - TOL * (1 + Math.abs(k.b)) : Math.abs(v - k.b) <= TOL * (1 + Math.abs(k.b));
	});
	const pts = [];
	for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
		const L1 = lines[i], L2 = lines[j];
		const det = L1.a * L2.b - L2.a * L1.b;
		if (Math.abs(det) < 1e-12) continue;
		const x = (L1.r * L2.b - L2.r * L1.b) / det, y = (L1.a * L2.r - L2.a * L1.r) / det;
		if (!feasible(x, y)) continue;
		const X = clean(x), Y = clean(y);
		if (!pts.some((p) => Math.abs(p.x - X) < 1e-6 && Math.abs(p.y - Y) < 1e-6)) pts.push({ x: X, y: Y, z: clean(c[0] * X + c[1] * Y) });
	}
	// order around the centroid so the polygon closes cleanly
	const cx = pts.reduce((s, p) => s + p.x, 0) / (pts.length || 1), cy = pts.reduce((s, p) => s + p.y, 0) / (pts.length || 1);
	pts.sort((p, q) => Math.atan2(p.y - cy, p.x - cx) - Math.atan2(q.y - cy, q.x - cx));
	return pts;
}

// Two end points of each constraint line inside the box [0, X] × [0, Y].
export function constraintSegments(constraints, X, Y) {
	return constraints.map((k) => {
		const [a, b] = k.a, r = k.b;
		const cand = [];
		if (Math.abs(b) > 1e-12) { cand.push([0, r / b], [X, (r - a * X) / b]); }
		if (Math.abs(a) > 1e-12) { cand.push([r / a, 0], [(r - b * Y) / a, Y]); }
		const inside = cand.filter(([x, y]) => x >= -1e-9 && x <= X + 1e-9 && y >= -1e-9 && y <= Y + 1e-9);
		const uniq = [];
		for (const p of inside) if (!uniq.some((q) => Math.abs(q[0] - p[0]) < 1e-9 && Math.abs(q[1] - p[1]) < 1e-9)) uniq.push(p);
		return uniq.length >= 2 ? [uniq[0], uniq[uniq.length - 1]].map(([x, y]) => [clean(x), clean(y)]) : null;
	});
}
export function plotBox(constraints, corners) {
	const vals = [];
	for (const k of constraints) {
		if (Math.abs(k.a[0]) > 1e-12 && k.b / k.a[0] > 0) vals.push(['x', k.b / k.a[0]]);
		if (Math.abs(k.a[1]) > 1e-12 && k.b / k.a[1] > 0) vals.push(['y', k.b / k.a[1]]);
	}
	for (const p of corners) vals.push(['x', p.x], ['y', p.y]);
	const mx = Math.max(1, ...vals.filter((v) => v[0] === 'x').map((v) => v[1]));
	const my = Math.max(1, ...vals.filter((v) => v[0] === 'y').map((v) => v[1]));
	return [niceCeil(mx * 1.1), niceCeil(my * 1.1)];
}
const niceCeil = (v) => { const p = 10 ** Math.floor(Math.log10(v)); return Math.ceil(v / p * 2) / 2 * p; };
const clean = (v) => (Math.abs(v) < 1e-9 ? 0 : Math.round(v * 1e9) / 1e9);
