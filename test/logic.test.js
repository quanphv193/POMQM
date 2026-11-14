import test from 'node:test';
import assert from 'node:assert/strict';
import { forecast } from '../lib/forecast.js';
import { solveLP } from '../lib/lp.js';
import { decide } from '../lib/decision.js';
import { pert, normCdf } from '../lib/pert.js';

const close = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);

test('forecast: moving average n=3', () => {
	const r = forecast([10, 12, 13, 16, 19, 23, 26, 30, 28, 18, 16, 14], 'ma', { n: 3 });
	close(r.rows[3].forecast, 35 / 3);
	close(r.next, (18 + 16 + 14) / 3);
	assert.equal(r.rows[2].forecast, null);
});
test('forecast: exp smoothing alpha .5', () => {
	const r = forecast([100, 110, 120], 'es', { alpha: 0.5 });
	close(r.rows[1].forecast, 100); close(r.rows[2].forecast, 105); close(r.next, 112.5); assert.equal(r.rows[0].forecast, null);
});
test('forecast: linear trend exact fit', () => {
	const r = forecast([2, 4, 6, 8], 'trend');
	close(r.next, 10); close(r.mad, 0); close(r.coef.slope, 2);
});
test('forecast: weighted MA', () => {
	const r = forecast([10, 20, 30, 40], 'wma', { weights: [1, 2, 3] });
	close(r.rows[3].forecast, (10 + 40 + 90) / 6);
});
test('forecast: errors', () => {
	assert.throws(() => forecast([1], 'naive'));
	assert.throws(() => forecast([1, 2, 3], 'ma', { n: 5 }));
});

test('lp: classic max (Wyndor)', () => {
	const r = solveLP({ sense: 'max', c: [3, 5], constraints: [
		{ a: [1, 0], op: '<=', b: 4 }, { a: [0, 2], op: '<=', b: 12 }, { a: [3, 2], op: '<=', b: 18 }] });
	assert.equal(r.status, 'optimal');
	close(r.objective, 36); close(r.x[0], 2); close(r.x[1], 6);
	close(r.shadow[0], 0); close(r.shadow[1], 1.5); close(r.shadow[2], 1);
	close(r.slack[0], 2);
});
test('lp: min with >= (diet)', () => {
	const r = solveLP({ sense: 'min', c: [2, 3], constraints: [
		{ a: [1, 1], op: '>=', b: 4 }, { a: [1, 3], op: '>=', b: 6 }] });
	assert.equal(r.status, 'optimal'); close(r.objective, 9);
	close(r.shadow[0], 1.5); close(r.shadow[1], 0.5);
});
test('lp: equality constraint', () => {
	const r = solveLP({ sense: 'max', c: [1, 1], constraints: [{ a: [1, 1], op: '=', b: 5 }, { a: [1, 0], op: '<=', b: 3 }] });
	assert.equal(r.status, 'optimal'); close(r.objective, 5);
});
test('lp: infeasible and unbounded', () => {
	assert.equal(solveLP({ sense: 'max', c: [1], constraints: [{ a: [1], op: '<=', b: 1 }, { a: [1], op: '>=', b: 3 }] }).status, 'infeasible');
	assert.equal(solveLP({ sense: 'max', c: [1, 1], constraints: [{ a: [1, -1], op: '<=', b: 1 }] }).status, 'unbounded');
});
test('lp: negative rhs normalised', () => {
	const r = solveLP({ sense: 'min', c: [1], constraints: [{ a: [-1], op: '<=', b: -2 }] }); // x >= 2
	assert.equal(r.status, 'optimal'); close(r.objective, 2);
});

test('decision: payoff table', () => {
	const r = decide({ payoff: [[200, -180], [100, -20], [0, 0]], probs: [0.4, 0.6], alpha: 0.5 });
	assert.equal(r.criteria[0].best, 0); assert.equal(r.criteria[1].best, 2);
	close(r.emv.values[0], -28); close(r.emv.values[1], 28); assert.equal(r.emv.best, 1);
	close(r.emv.evwpi, 80); close(r.emv.evpi, 52);
	assert.equal(r.criteria[4].best, 1);
});
test('decision: probs must sum to 1', () => {
	assert.throws(() => decide({ payoff: [[1, 2]], probs: [0.5, 0.2] }));
});

test('pert: simple network', () => {
	const r = pert([
		{ id: 'A', pre: [], a: 2, m: 2, b: 2 }, { id: 'B', pre: ['A'], a: 3, m: 3, b: 3 },
		{ id: 'C', pre: ['A'], a: 1, m: 1, b: 1 }, { id: 'D', pre: ['B', 'C'], a: 2, m: 2, b: 2 }]);
	close(r.duration, 7); assert.deepEqual(r.path, ['A', 'B', 'D']);
	close(r.rows.find((x) => x.id === 'C').slack, 2);
});
test('pert: probability', () => {
	const r = pert([{ id: 'A', pre: [], a: 4, m: 6, b: 14 }], 10);
	close(r.duration, 7); close(r.variance, (10 / 6) ** 2); assert.ok(r.prob > 0.9 && r.prob < 1);
	close(normCdf(0), 0.5); close(normCdf(1.96), 0.975, 1e-3);
});
test('pert: cycle and bad ref', () => {
	assert.throws(() => pert([{ id: 'A', pre: ['B'], a: 1, m: 1, b: 1 }, { id: 'B', pre: ['A'], a: 1, m: 1, b: 1 }]), /vòng/);
	assert.throws(() => pert([{ id: 'A', pre: ['Z'], a: 1, m: 1, b: 1 }]), /không tồn tại/);
});
