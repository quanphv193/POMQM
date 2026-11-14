import test from 'node:test';
import assert from 'node:assert/strict';
import { solveIP } from '../lib/ip.js';
import { solveGoal } from '../lib/goal.js';
import { runModel } from './phase1-forecast.test.js';

const close = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);

test('integer program (Harrison Electric): IP 35 at (5, 0), LP relaxation 35.25', () => {
	const m = runModel('ip', 'ip', { sense: 'max' });
	assert.deepEqual(m.res.x, [5, 0]); close(m.res.objective, 35); close(m.res.relaxation.objective, 35.25);
	assert.ok(m.res.nodes.length > 1);
});

test('mixed integer and binary', () => {
	// max 3x + 2y + 4z ; x + y + 2z <= 4.5 ; x int, y cont, z binary
	const r = solveIP({ sense: 'max', c: [3, 2, 4], constraints: [{ a: [1, 1, 2], op: '<=', b: 4.5 }], types: ['int', 'cont', 'bin'] });
	close(r.objective, 13); assert.equal(r.x[0], 4); close(r.x[1], 0.5); assert.equal(r.x[2], 0);
	const inf = solveIP({ sense: 'max', c: [1], constraints: [{ a: [2], op: '=', b: 3 }], types: ['int'] });
	assert.equal(inf.status, 'infeasible');
});

test('goal programming: priorities are met in order', () => {
	const r = solveGoal({ n: 2, hard: [{ a: [6, 5], op: '<=', b: 30 }], goals: [
		{ a: [7, 6], b: 30, under: { p: 1, w: 1 } },
		{ a: [2, 3], b: 12, under: { p: 2, w: 1 }, over: { p: 2, w: 1 } },
		{ a: [0, 1], b: 7, under: { p: 3, w: 1 } },
	] });
	close(r.achieved[0].value, 0); close(r.achieved[1].value, 0); close(r.achieved[2].value, 13 / 3, 1e-6);
	close(r.x[0], 2, 1e-6); close(r.x[1], 8 / 3, 1e-6);
	const m = runModel('goal', 'goal');
	close(m.res.x[1], 8 / 3, 1e-6);
});
