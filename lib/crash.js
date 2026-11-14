// Project crashing as a linear program: minimise crash cost so the project finishes by T.
// acts: [{id, pre, normal, crash, normalCost, crashCost}]
import { solveLP } from './lp.js';
import { pert } from './pert.js';

export function crashCurve(acts, target) {
	const n = acts.length;
	const idx = new Map(acts.map((x, i) => [x.id, i]));
	for (const x of acts) {
		if (x.crash > x.normal) throw new Error(`Hoạt động ${x.id}: thời gian rút ngắn phải ≤ thời gian bình thường.`);
		if (x.crashCost < x.normalCost) throw new Error(`Hoạt động ${x.id}: chi phí rút ngắn phải ≥ chi phí bình thường.`);
	}
	const slope = acts.map((x) => (x.normal > x.crash ? (x.crashCost - x.normalCost) / (x.normal - x.crash) : 0));
	const maxCut = acts.map((x) => x.normal - x.crash);
	const normalRun = pert(acts.map((x) => ({ id: x.id, pre: x.pre, a: x.normal, m: x.normal, b: x.normal })));
	const crashRun = pert(acts.map((x) => ({ id: x.id, pre: x.pre, a: x.crash, m: x.crash, b: x.crash })));
	const normalCost = acts.reduce((s, x) => s + x.normalCost, 0);
	// variables: y_0..y_{n-1} (crash amounts), S_0..S_{n-1} (start times)
	const solveFor = (T) => {
		const z = () => new Array(2 * n).fill(0);
		const cons = [];
		acts.forEach((x, j) => {
			for (const p of x.pre) { const i = idx.get(p); const a = z(); a[n + j] = 1; a[n + i] = -1; a[i] = 1; cons.push({ a, op: '>=', b: x.pre.length ? acts[i].normal : 0 }); }
			const a = z(); a[n + j] = 1; a[j] = -1; cons.push({ a, op: '<=', b: T - x.normal });
			const u = z(); u[j] = 1; cons.push({ a: u, op: '<=', b: maxCut[j] });
		});
		const c = [...slope, ...new Array(n).fill(0)];
		const r = solveLP({ sense: 'min', c, constraints: cons });
		if (r.status !== 'optimal') return null;
		return { T, cost: r.objective, y: r.x.slice(0, n).map((v) => Math.round(v * 1e6) / 1e6) };
	};
	const curve = [];
	const start = Math.ceil(normalRun.duration - 1e-9), end = Math.ceil(crashRun.duration - 1e-9);
	for (let T = start; T >= end; T--) { const s = solveFor(T); if (s) curve.push(s); }
	const chosenT = target === undefined || target === null || target === '' ? end : Math.max(end, Math.min(start, Math.round(Number(target))));
	const chosen = curve.find((c) => c.T === chosenT) || curve[curve.length - 1];
	return { slope, maxCut, normalDuration: normalRun.duration, crashDuration: crashRun.duration, normalCost, curve, chosen, targetClamped: target !== '' && target !== undefined && target !== null && Number(target) !== chosenT };
}
