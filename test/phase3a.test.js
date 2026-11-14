import test from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../lib/ops_a.js';
import { runModel } from './phase1-forecast.test.js';

const close = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);

test('NPV and IRR', () => {
	let m = runModel('invest', 'npv', { rate: 0.1 }); close(m.res.npv, -1000 + 300 / 1.1 + 400 / 1.21 + 500 / 1.331 + 600 / 1.4641, 1e-9);
	assert.ok(m.formulas.some((f) => f.startsWith('=-') || f.includes('NPV(')));
	m = runModel('invest', 'irr'); close(A.npv(m.res.irr, [-1000, 300, 400, 500, 600]), 0, 1e-6);
	assert.throws(() => A.irr([100, 200]));
});

test('game theory: mixed strategy (value 2.5) and saddle point', () => {
	const g = A.solveGame([[4, 2], [1, 3]]); close(g.value, 2.5); close(g.rowStrategy[0], 0.5); close(g.colStrategy[0], 0.25); assert.equal(g.saddle, false);
	const s = A.solveGame([[3, 5], [2, 4]]); assert.equal(s.saddle, true); close(s.value, 3); assert.deepEqual(s.saddleCells, [[0, 0]]);
	const neg = A.solveGame([[-3, -1], [-2, -4]]); close(neg.value, -2.5); // (ad-bc)/(a+d-b-c) = 10/-4
	const m = runModel('game', 'game'); close(m.res.rowStrategy.reduce((a, b) => a + b, 0), 1); close(m.res.colStrategy.reduce((a, b) => a + b, 0), 1);
	// the value equals what each pure column gives against the optimal row mix, at best
	const A3 = [[4, 2, 5], [1, 3, 2], [3, 1, 4]];
	for (let j = 0; j < 3; j++) assert.ok(A3.reduce((s2, r, i) => s2 + r[j] * m.res.rowStrategy[i], 0) >= m.res.value - 1e-9);
});

test('Markov: steady state and absorption', () => {
	const k = A.markov([[0.9, 0.1], [0.2, 0.8]], [1, 0], 2);
	close(k.steady[0], 2 / 3); close(k.path[2][0], 0.9 * 0.9 + 0.1 * 0.2 + 0 * 0, 1e-12 + 0.0);
	const a = A.markov([[1, 0, 0], [0.5, 0, 0.5], [0, 0, 1]], [0, 1, 0], 1); close(a.B[0][0], 0.5); close(a.steps[0], 1);
	assert.throws(() => A.markov([[0.5, 0.4], [0.2, 0.8]], [1, 0], 1));
	const m = runModel('markov', 'markov', { steps: 4 }); close(m.res.steady.reduce((x, y) => x + y, 0), 1);
	assert.ok(m.formulas.some((f) => f.startsWith('=MMULT(')));
});

test('learning curve, reliability, work measurement', () => {
	const t = A.learningTimes(100, 0.8, 8); close(t[1].unit, 80); close(t[3].unit, 64); close(t[7].unit, 51.2); close(A.rateFromTimes(100, 1, 64, 4), 0.8);
	close(runModel('learning', 'times').res.rows[15].unit, 100 * 0.8 ** 4, 1e-9); close(runModel('learning', 'rate').res.rate, 0.8);
	close(A.rSeries([0.95, 0.9, 0.99]), 0.84645, 1e-9); close(A.rParallel([0.9, 0.8]), 0.98); assert.equal(A.backupsNeeded(0.9, 0.999), 3);
	close(runModel('reliability', 'series').res.R, 0.84645, 1e-9); close(runModel('reliability', 'parallel').res.R, 1 - 0.05 * 0.1 * 0.01, 1e-12); assert.equal(runModel('reliability', 'backups').res.n, 3);
	close(runModel('worktime', 'size').res.z, 1.959964, 1e-5); assert.equal(runModel('worktime', 'sampling').res.n, 2017);
	const ts = runModel('worktime', 'study', { allowance: 0.15 }); close(ts.res.standard, ts.res.total / 0.85);
	close(ts.res.avg[0], (0.46 + 0.48 + 0.45 + 0.47 + 0.49) / 5);
});

test('productivity', () => {
	const m = runModel('productivity', 'prod'); close(m.res.ratio[0][0], 2); close(m.res.total[0], 1000 / 900);
});
