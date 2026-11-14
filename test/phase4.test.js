import test from 'node:test';
import assert from 'node:assert/strict';
import { forecast } from '../lib/forecast.js';
import { sesSeasonal } from '../lib/forecast2.js';
import { runModel } from './phase1-forecast.test.js';
import { MODULES } from '../src/modules/index.js';

const close = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);

test('simple average forecast uses every earlier period', () => {
	const r = forecast([10, 20, 30, 60], 'avg'); assert.equal(r.rows[0].forecast, null); close(r.rows[1].forecast, 10); close(r.rows[2].forecast, 15); close(r.rows[3].forecast, 20); close(r.next, 30);
	const m = runModel('forecast', 'avg'); assert.ok(m.formulas.some((f) => /^=AVERAGE\(C\d+:C\d+\)$/.test(f)));
});

test('exponential smoothing on the deseasonalised series', () => {
	const r = sesSeasonal([10, 20, 10, 20, 10, 20, 10, 20], 2, 0.3);
	close(r.SI[0], 10 / 15); close(r.ds[0], 15); close(r.next, 10); close(r.mad, 0, 1e-9);
	assert.throws(() => sesSeasonal([1, 2, 3, 4, 5], 2, 0.3));
	const m = runModel('forecast', 'sesSeasonal', { s: 4, alpha: 0.3 });
	assert.ok(m.res.next > 0 && Number.isFinite(m.res.mad)); close(m.res.SI.reduce((a, b) => a + b, 0), 4, 1e-9);
});

test('Bayes posterior probabilities (Thompson Lumber survey: P(fav)=0.45, P(good|fav)=0.778, P(good|unfav)=0.273)', () => {
	const m = runModel('decision', 'bayes');
	close(m.res.marg[0], 0.45); close(m.res.marg[1], 0.55); close(m.res.post[0][0], 0.35 / 0.45); close(m.res.post[0][1], 0.15 / 0.55);
	for (let j = 0; j < 2; j++) close(m.res.post[0][j] + m.res.post[1][j], 1);
	assert.ok(m.formulas.some((f) => /^=SUM\(/.test(f)));
	const mod = MODULES.decision, model = mod.models.find((x) => x.id === 'bayes');
	assert.throws(() => mod.parse({ header: ['S', 'p', 'a', 'b'], rows: [['x', 0.6, 0.5, 0.5], ['y', 0.6, 0.5, 0.5]] }, model, {}), /tiên nghiệm/);
	assert.throws(() => mod.parse({ header: ['S', 'p', 'a', 'b'], rows: [['x', 0.5, 0.5, 0.4], ['y', 0.5, 0.5, 0.5]] }, model, {}), /cộng bằng 1/);
});

test('frequency table to probabilities', () => {
	const m = runModel('decision', 'freq');
	close(m.res.tot, 200); close(m.res.pRow[0], 150 / 200); close(m.res.pCol[0], 148 / 200);
	assert.ok(m.formulas.some((f) => f.includes('/')));
});
