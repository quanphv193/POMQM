import test from 'node:test';
import assert from 'node:assert/strict';
import { pert, budget } from '../lib/pert.js';
import { crashCurve } from '../lib/crash.js';
import { runModel } from './phase1-forecast.test.js';

const close = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);

test('AOA network gives the same answer as the AON version (Milwaukee Paper)', () => {
	const m = runModel('pert', 'aoa', { target: 16 });
	close(m.res.duration, 15);
	assert.deepEqual(m.res.path, ['A', 'C', 'E', 'G', 'H']);
	close(m.res.prob, 0.71462, 1e-4);
	const d = m.res.rows.find((x) => x.id === 'D');
	assert.deepEqual([...d.pre].sort(), ['B', 'Giả']);
});

test('mean + SD and mean + variance inputs match the three-estimate result', () => {
	const sd = runModel('pert', 'meansd', { target: 16 });
	const v = runModel('pert', 'meanvar', { target: 16 });
	close(sd.res.variance, 28 / 9, 1e-9); close(v.res.variance, 28 / 9, 1e-9);
	close(sd.res.prob, v.res.prob);
	assert.ok(sd.formulas.some((f) => /\^2$/.test(f)));
});

test('all critical paths are listed', () => {
	const r = pert([{ id: 'A', pre: [], a: 2, m: 2, b: 2 }, { id: 'B', pre: [], a: 2, m: 2, b: 2 }, { id: 'C', pre: ['A', 'B'], a: 1, m: 1, b: 1 }]);
	assert.equal(r.paths.length, 2);
});

test('crashing curve (Heizer & Render): 14 weeks cost 750, 13 weeks cost 2,250', () => {
	const m = runModel('pert', 'crash', { target: 13 });
	const at = (T) => m.res.curve.find((c) => c.T === T).cost;
	close(at(15), 0); close(at(14), 750); close(at(13), 2250);
	assert.equal(m.res.chosen.T, 13);
	close(m.res.chosen.y.reduce((s, y, i) => s + y * m.res.slope[i], 0), 2250);
	assert.throws(() => crashCurve([{ id: 'A', pre: [], normal: 2, crash: 3, normalCost: 1, crashCost: 2 }]));
});

test('budget by early and late start (General Foundry): week 1 = 21,000 / 11,000, total 308,000', () => {
	const m = runModel('pert', 'budget');
	const P = m.res.budget.periods;
	close(P[0].es, 21000); close(P[0].ls, 11000); close(P[2].es, 23000);
	close(P[P.length - 1].esCum, 308000); close(P[P.length - 1].lsCum, 308000);
	const b = budget([{ es: 0, ls: 1, te: 0, ef: 0 }, { es: 0, ls: 0, te: 2, ef: 2 }], [5, 10]);
	close(b.periods[0].es, 10); close(b.total, 15);
});
