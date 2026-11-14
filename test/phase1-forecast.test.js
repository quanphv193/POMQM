import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutReport } from '../src/core/layout.js';
import { MODULES } from '../src/modules/index.js';
import { trendES, regression, decompose, seasonalIndices } from '../lib/forecast2.js';

const close = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
const tableOf = (spec) => ({ table: 't', sheet: 's', header: spec.columns.map((c) => c.label), rows: spec.rows.map((r) => spec.columns.map((_, i) => r[i] ?? '')) });
export function runModel(modId, modelId, params = {}) {
	const mod = MODULES[modId];
	const model = mod.models.find((m) => m.id === modelId);
	const p = { ...Object.fromEntries(model.params.map((x) => [x.id, x.default])), ...params };
	const spec = mod.inputTable(Object.fromEntries((model.dims || mod.dims || []).map((d) => [d.id, d.default])), model, true);
	const input = mod.parse(tableOf(spec), model, p);
	const res = mod.solve(input, model, p);
	res._names = res._names ?? input.names;
	const lay = layoutReport(mod.report(input, res, model, p), 2);
	const summary = mod.summary(res, model, p);
	const formulas = lay.ops.flatMap((o) => (o.values || []).flat()).filter((v) => typeof v === 'string' && v.startsWith('='));
	for (const f of formulas) assert.ok(!/undefined|NaN|null/.test(f), `${modelId}: bad formula ${f}`);
	for (const s of summary) assert.ok(s.value !== undefined, `${modelId}: summary ${s.label}`);
	return { res, lay, summary, formulas, spec };
}

test('trend-adjusted ES matches Heizer (Midwestern Manufacturing)', () => {
	const r = trendES([12, 17, 20, 19, 24, 21, 31, 28, 36], 0.2, 0.4, 11, 2);
	close(r.F[1], 12.8); close(r.T[1], 1.92); close(r.FIT[1], 14.72); close(r.FIT[2], 17.2784, 1e-4);
	const m = runModel('forecast', 'trendES');
	assert.ok(m.formulas.some((f) => f.includes('*(') && f.includes('+(1-')));
});

test('simple regression matches Heizer (Nodel Construction)', () => {
	const r = regression([[1], [3], [4], [2], [1], [7]], [2, 3, 2.5, 2, 2, 3.5]);
	close(r.b[0], 1.75); close(r.b[1], 0.25); close(r.se, 0.306, 1e-3); close(r.r, 0.901, 1e-3);
	const m = runModel('forecast', 'linreg', { xNext: 6 });
	close(m.res.pred, 3.25);
	assert.ok(m.formulas.some((f) => f.startsWith('=INTERCEPT(')) && m.formulas.some((f) => f.startsWith('=STEYX(')));
	assert.equal(m.lay.charts[0].kind, 'scatter');
});

test('multiple regression: least-squares residuals are orthogonal to every regressor', () => {
	const m = runModel('forecast', 'multreg', { xNew: '1900; 35' });
	const X = [[95000, 1926, 30], [119000, 2069, 40], [124800, 1720, 30], [135000, 1396, 15], [142000, 1706, 32], [145000, 1847, 38], [159000, 1950, 27], [165000, 2323, 30], [182000, 2285, 26], [183000, 3752, 35], [200000, 2300, 18], [211000, 2525, 17], [215000, 3800, 40], [219000, 1740, 12]];
	const resid = X.map((r, i) => r[0] - m.res.fitted[i]);
	close(resid.reduce((a, b) => a + b, 0), 0, 1e-4);
	for (const j of [1, 2]) close(resid.reduce((a, e, i) => a + e * X[i][j], 0), 0, 1e-2);
	// same sign and size as the textbook model (Ŷ ≈ 146,631 + 43.8·X1 − 2,899·X2)
	assert.ok(m.res.b[1] > 40 && m.res.b[1] < 48 && m.res.b[2] < -2500 && m.res.b[2] > -3300);
	close(m.res.pred, m.res.b[0] + m.res.b[1] * 1900 + m.res.b[2] * 35);
	assert.ok(m.formulas.some((f) => f.includes('MMULT(')));
});

test('multiplicative decomposition: indices average to 1 and forecast continues the pattern', () => {
	const y = [108, 125, 150, 141, 116, 134, 159, 152, 123, 142, 168, 165];
	const d = decompose(y, 4, 'mult', 4);
	close(d.SI.reduce((a, b) => a + b, 0), 4);
	close(d.cma[2], (0.5 * 108 + 125 + 150 + 141 + 0.5 * 116) / 4);
	assert.ok(d.SI[2] > 1 && d.SI[0] < 1);
	assert.ok(d.future[2].forecast > d.future[0].forecast);
	assert.ok(d.mape < 0.03);
	const m = runModel('forecast', 'decompMult');
	assert.ok(m.formulas.some((f) => f.startsWith('=(0.5*')) && m.formulas.some((f) => f.includes('AVERAGEIF(')));
});

test('additive decomposition: seasonal effects sum to 0', () => {
	const d = decompose([108, 125, 150, 141, 116, 134, 159, 152, 123, 142, 168, 165], 4, 'add', 4);
	close(d.SI.reduce((a, b) => a + b, 0), 0);
	runModel('forecast', 'decompAdd');
});

test('seasonal indices (average method)', () => {
	const s = seasonalIndices([10, 20, 30, 40, 14, 24, 34, 44], 4, 200);
	close(s.overall, 27); close(s.SI[0], 12 / 27); close(s.forecast[3], 50 * 42 / 27);
	runModel('forecast', 'seasonal');
	assert.throws(() => seasonalIndices([1, 2, 3, 4, 5], 4));
});

test('projector and error analysis', () => {
	const p = runModel('forecast', 'projector', { coef: '146631; 43,82; -2899' });
	close(p.res.pred[0], 146631 + 43.82 * 2000 - 2899 * 20, 1e-6);
	const e = runModel('forecast', 'errors');
	close(e.res.mad, (10 + 8 + 3 + 9 + 3 + 8) / 6);
});
