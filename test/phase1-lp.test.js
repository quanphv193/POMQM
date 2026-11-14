import test from 'node:test';
import assert from 'node:assert/strict';
import { solveLP } from '../lib/lp.js';
import { cornerPoints } from '../lib/lpgraph.js';
import { runModel } from './phase1-forecast.test.js';

const close = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
const WYNDOR = { sense: 'max', c: [3, 5], constraints: [{ a: [1, 0], op: '<=', b: 4 }, { a: [0, 2], op: '<=', b: 12 }, { a: [3, 2], op: '<=', b: 18 }] };

test('ranging matches Hillier & Lieberman (Wyndor Glass)', () => {
	const r = solveLP(WYNDOR);
	close(r.costRange[0].lower, 0); close(r.costRange[0].upper, 7.5);
	close(r.costRange[1].lower, 2); assert.equal(r.costRange[1].upper, Infinity);
	close(r.rhsRange[0].lower, 2); assert.equal(r.rhsRange[0].upper, Infinity);
	close(r.rhsRange[1].lower, 6); close(r.rhsRange[1].upper, 18);
	close(r.rhsRange[2].lower, 12); close(r.rhsRange[2].upper, 24);
});

test('ranging for a min problem with >= constraints', () => {
	const r = solveLP({ sense: 'min', c: [2, 3], constraints: [{ a: [1, 1], op: '>=', b: 4 }, { a: [1, 3], op: '>=', b: 6 }] });
	close(r.objective, 9);
	close(r.costRange[0].lower, 1); close(r.costRange[0].upper, 3);
	close(r.costRange[1].lower, 2); close(r.costRange[1].upper, 6);
	close(r.rhsRange[0].lower, 2); close(r.rhsRange[0].upper, 6);
});

test('nonbasic variable: reduced cost and upper limit', () => {
	// max 2x + y, x + y <= 4, x <= 3 -> x=3, y=1 ; add z with c=1 that costs 3 units of row 1
	const r = solveLP({ sense: 'max', c: [2, 1, 1], constraints: [{ a: [1, 1, 3], op: '<=', b: 4 }, { a: [1, 0, 0], op: '<=', b: 3 }] });
	assert.equal(r.x[2], 0);
	close(r.costRange[2].reduced, 2); close(r.costRange[2].upper, 3); assert.equal(r.costRange[2].lower, -Infinity);
});

test('textbook pivoting: Wyndor takes 2 pivots (x2 enters first)', () => {
	const r = solveLP(WYNDOR, { trace: true });
	assert.equal(r.trace.length, 3);
	assert.equal(r.colNames[r.trace[0].enter], 'x2');
	assert.equal(r.trace[2].enter, -1);
});

test('corner points of Wyndor', () => {
	const cp = cornerPoints([3, 5], WYNDOR.constraints);
	assert.equal(cp.length, 5);
	assert.ok(cp.some((p) => p.x === 2 && p.y === 6 && p.z === 36));
});

test('LP report with ranging, graph and iterations', () => {
	const m = runModel('lp', 'lp', { sense: 'max', ranging: true, graph: true, iters: true });
	close(m.res.objective, 4100);
	assert.ok(m.lay.charts.some((c) => c.kind === 'scatter'));
	assert.ok(m.lay.ops.some((o) => o.values?.[0]?.[0] === 'Zj − Cj'));
});
