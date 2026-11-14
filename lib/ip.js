// Integer / mixed-integer / binary programming by LP branch and bound (depth first).
import { solveLP } from './lp.js';

const TOL = 1e-6;

// types[j]: 'int' | 'bin' | 'cont'
export function solveIP({ sense, c, constraints, types }, { maxNodes = 5000 } = {}) {
	const n = c.length;
	const base = constraints.slice();
	types.forEach((t, j) => { if (t === 'bin') base.push({ a: c.map((_, k) => (k === j ? 1 : 0)), op: '<=', b: 1, name: `x${j + 1} ≤ 1` }); });
	const better = (a, b) => (sense === 'min' ? a < b - TOL : a > b + TOL);
	let best = null;
	const nodes = [];
	const stack = [{ id: 1, parent: null, extra: [], label: 'Bài toán gốc (nới lỏng LP)' }];
	let nextId = 2;
	let relaxation = null;
	while (stack.length) {
		if (nodes.length >= maxNodes) throw new Error(`Nhánh cận vượt quá ${maxNodes} nút; hãy thu hẹp bài toán.`);
		const node = stack.pop();
		const r = solveLP({ sense, c, constraints: [...base, ...node.extra] });
		const rec = { id: node.id, parent: node.parent, label: node.label, status: r.status, z: r.objective ?? null, x: r.x ?? null, note: '' };
		nodes.push(rec);
		if (node.id === 1) relaxation = r;
		if (r.status === 'infeasible') { rec.note = 'Vô nghiệm – dừng nhánh'; continue; }
		if (r.status === 'unbounded') { rec.note = 'Không giới nội'; if (node.id === 1) return { status: 'unbounded', nodes }; continue; }
		if (best && !better(r.objective, best.objective)) { rec.note = 'Cận không tốt hơn nghiệm nguyên hiện có – cắt nhánh'; continue; }
		// most fractional integer variable
		let j = -1, frac = 0;
		r.x.forEach((v, k) => {
			if (types[k] === 'cont') return;
			const f = Math.abs(v - Math.round(v));
			if (f > TOL && f > frac - 1e-12) { if (f > frac) { frac = f; j = k; } }
		});
		if (j < 0) {
			rec.note = best ? 'Nghiệm nguyên tốt hơn – cập nhật' : 'Nghiệm nguyên đầu tiên';
			best = { ...r, x: r.x.map((v, k) => (types[k] === 'cont' ? v : Math.round(v))) };
			rec.incumbent = true;
			continue;
		}
		const v = r.x[j];
		const lo = Math.floor(v), hi = Math.ceil(v);
		rec.note = `Phân nhánh trên x${j + 1} = ${+v.toFixed(4)}`;
		const unit = c.map((_, k) => (k === j ? 1 : 0));
		// push "≥" first so the "≤" branch is explored first (depth first)
		stack.push({ id: nextId + 1, parent: node.id, extra: [...node.extra, { a: unit, op: '>=', b: hi }], label: `x${j + 1} ≥ ${hi}` });
		stack.push({ id: nextId, parent: node.id, extra: [...node.extra, { a: unit, op: '<=', b: lo }], label: `x${j + 1} ≤ ${lo}` });
		nextId += 2;
	}
	if (!best) return { status: 'infeasible', nodes, relaxation };
	const x = best.x;
	const lhs = constraints.map((k) => k.a.reduce((s, a, j) => s + a * x[j], 0));
	return { status: 'optimal', x, objective: c.reduce((s, v, j) => s + v * x[j], 0), lhs, nodes, relaxation };
}
