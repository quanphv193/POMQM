// Preemptive (lexicographic) goal programming solved as a sequence of LPs.
import { solveLP } from './lp.js';

// hard: [{a, op, b}], goals: [{a, b, under: {p, w} | null, over: {p, w} | null}]
export function solveGoal({ n, hard, goals }) {
	const G = goals.length;
	const nv = n + 2 * G; // x, then (d-_i, d+_i) per goal
	const dm = (i) => n + 2 * i, dp = (i) => n + 2 * i + 1;
	const row = (a) => { const r = new Array(nv).fill(0); a.forEach((v, j) => (r[j] = v)); return r; };
	const cons = [
		...hard.map((k) => ({ a: row(k.a), op: k.op, b: k.b })),
		...goals.map((g, i) => { const r = row(g.a); r[dm(i)] = 1; r[dp(i)] = -1; return { a: r, op: '=', b: g.b }; }),
	];
	const levels = [...new Set(goals.flatMap((g) => [g.under?.p, g.over?.p]).filter((p) => p !== undefined && p !== null))].sort((a, b) => a - b);
	if (!levels.length) throw new Error('Chưa có mục tiêu nào được gán mức ưu tiên.');
	const achieved = [];
	let last = null;
	for (const p of levels) {
		const c = new Array(nv).fill(0);
		goals.forEach((g, i) => {
			if (g.under && g.under.p === p) c[dm(i)] += g.under.w ?? 1;
			if (g.over && g.over.p === p) c[dp(i)] += g.over.w ?? 1;
		});
		const r = solveLP({ sense: 'min', c, constraints: cons });
		if (r.status !== 'optimal') return { status: r.status === 'infeasible' ? 'infeasible' : 'unbounded', levels, achieved };
		achieved.push({ p, value: cl(r.objective) });
		cons.push({ a: c, op: '<=', b: r.objective + 1e-9 * (1 + Math.abs(r.objective)) });
		last = r;
	}
	const x = last.x.slice(0, n).map(cl);
	return {
		status: 'optimal', levels, achieved, x,
		goals: goals.map((g, i) => ({ value: cl(g.a.reduce((s, v, j) => s + v * x[j], 0)), under: cl(last.x[dm(i)]), over: cl(last.x[dp(i)]) })),
		hard: hard.map((k) => cl(k.a.reduce((s, v, j) => s + v * x[j], 0))),
	};
}
const cl = (v) => (Math.abs(v) < 1e-7 ? 0 : Math.round(v * 1e7) / 1e7);
