import test from 'node:test';
import assert from 'node:assert/strict';
import { rollback, singlePeriod } from '../lib/dtree.js';
import { runModel } from './phase1-forecast.test.js';

const close = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);

test('decision tree with survey (Thompson Lumber): EMV 49,200, conduct the survey', () => {
	const m = runModel('decision', 'tree', { sense: 'profit' });
	close(m.res.value, 49200);
	assert.equal(m.res.best.get('1').name, 'Khảo sát thị trường');
	close(m.res.ev.get('4'), 106400); close(m.res.ev.get('5'), 2400); close(m.res.ev.get('3'), 40000);
	assert.equal(m.res.best.get('5').name, 'Nhà máy nhỏ');
	assert.ok(m.formulas.some((f) => f.startsWith('=SUMPRODUCT(')) && m.formulas.some((f) => f.startsWith('=MAX(')));
});

test('decision tree errors', () => {
	assert.throws(() => rollback([{ from: 'A', to: 'B', prob: 0.5, value: 1 }, { from: 'A', to: 'C', prob: 0.4, value: 2 }]), /tổng bằng 1/);
	assert.throws(() => rollback([{ from: 'A', to: 'B', prob: null, value: 1 }, { from: 'C', to: 'D', prob: null, value: 1 }]), /một nút gốc/);
	const c = rollback([{ from: 'A', to: 'B', prob: null, value: 5 }, { from: 'A', to: 'C', prob: null, value: 3 }], 'cost');
	assert.equal(c.value, 3);
});

test('single-period table matches a direct calculation', () => {
	const d = [100, 110, 120, 130, 140], p = [0.1, 0.2, 0.3, 0.25, 0.15];
	const r = singlePeriod({ demand: d, probs: p, price: 10, cost: 6, salvage: 2 });
	const emv = (q) => d.reduce((s, x, j) => s + p[j] * (10 * Math.min(q, x) - 6 * q + 2 * Math.max(q - x, 0)), 0);
	d.forEach((q, i) => close(r.emv[i], emv(q)));
	assert.equal(r.best, r.emv.indexOf(Math.max(...r.emv)));
	close(r.criticalRatio, 0.5);
	const m = runModel('decision', 'single');
	assert.equal(m.res._q, d[r.best]);
});
