import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutReport } from '../src/core/layout.js';
import { numFmt, fmtValue, colLetter } from '../src/core/format.js';
import { MODULES, CATALOG } from '../src/modules/index.js';
import { parseWeights } from '../src/modules/forecast.js';
import { InputError } from '../src/core/errors.js';

const close = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
// Build what readInputTable would return from the module's own input-table spec.
const tableOf = (spec) => ({ table: 't', sheet: 's', header: spec.columns.map((c) => c.label), rows: spec.rows.map((r) => spec.columns.map((_, i) => r[i] ?? '')) });
const run = (modId, modelId, params = {}, dims) => {
	const mod = MODULES[modId];
	const model = mod.models.find((m) => m.id === modelId);
	const p = { ...Object.fromEntries(model.params.map((x) => [x.id, x.default])), ...params };
	const spec = mod.inputTable(dims || Object.fromEntries((model.dims || mod.dims || []).map((d) => [d.id, d.default])), model, !dims);
	const input = mod.parse(tableOf(spec), model, p);
	const res = mod.solve(input, model, p);
	res._names = res._names ?? input.names;
	const rep = mod.report(input, res, model, p);
	const lay = layoutReport(rep, 2);
	const summary = mod.summary(res, model, p);
	return { input, res, rep, lay, summary, spec };
};
const formulas = (lay) => lay.ops.flatMap((o) => (o.values || []).flat()).filter((v) => typeof v === 'string' && v.startsWith('='));

test('format helpers', () => {
	assert.equal(colLetter(0), 'A'); assert.equal(colLetter(25), 'Z'); assert.equal(colLetter(26), 'AA');
	assert.equal(numFmt('num', 2), '#,##0.00'); assert.equal(numFmt('pct', 2), '0.0%'); assert.equal(numFmt('num', 0), '#,##0');
	assert.equal(fmtValue(0.337, 'pct', 2), '33,7 %');
	assert.equal(fmtValue(4100, 'num', 2), '4.100');
});

test('layout resolves refs between blocks', () => {
	const lay = layoutReport({ title: 'T', blocks: [
		{ type: 'kv', id: 'p', title: 'P', items: [{ key: 'a', label: 'a', value: 2 }] },
		{ type: 'table', id: 't', columns: [{ key: 'x', label: 'x' }, { key: 'y', label: 'y' }], rows: [
			{ cells: { x: 1, y: { f: (R) => `=${R.cell('t', 0, 'x')}*${R.kv('p', 'a')}` } } },
			{ cells: { x: 3, y: { f: (R) => `=SUM(${R.col('t', 'x')})` } } }] },
	] });
	// title row 0, blank, kv title row 2, kv item row 3, blank, table header row 5, rows 6-7
	assert.deepEqual(formulas(lay), ['=A7*$B$4', '=SUM(A7:A8)']);
});

test('forecast MA writes AVERAGE formulas and JS values match', () => {
	const { res, lay, rep } = run('forecast', 'ma', { n: 3 });
	const f = formulas(lay);
	assert.ok(f.includes('=AVERAGE(C10:C12)'), f.slice(0, 5).join(' | ')); // first forecast (period 4) averages periods 1-3
	close(res.next, 16);
	assert.equal(rep.blocks.find((b) => b.id === 'main').rows.length, 13);
});

test('forecast all models produce valid formulas', () => {
	for (const m of ['naive', 'ma', 'wma', 'es', 'trend']) {
		const { lay, summary } = run('forecast', m);
		assert.ok(formulas(lay).length > 20, m);
		assert.ok(formulas(lay).every((x) => !x.includes('undefined') && !x.includes('NaN')), m);
		assert.ok(Number.isFinite(summary[0].value), m);
	}
});

test('weighted MA uses a vertical array constant (matches the vertical data range in Excel)', () => {
	const f = formulas(run('forecast', 'wma').lay);
	assert.ok(f.some((x) => /^=SUMPRODUCT\(C\d+:C\d+,\{1;2;3\}\)\/6$/.test(x)), f.slice(0, 3).join(' | '));
});

test('forecast ES references alpha cell', () => {
	const { lay } = run('forecast', 'es', { alpha: 0.5 });
	assert.ok(formulas(lay).some((x) => /\+\$B\$\d+\*\(/.test(x)));
});

test('weights parsing', () => {
	assert.deepEqual(parseWeights('1, 2, 3'), [1, 2, 3]);
	assert.deepEqual(parseWeights('0,2; 0,3; 0,5'), [0.2, 0.3, 0.5]);
	assert.deepEqual(parseWeights('1 2 3'), [1, 2, 3]);
	assert.throws(() => parseWeights('a,b'), InputError);
});

test('lp sample (Flair Furniture) = 4100 at T=30, C=40', () => {
	const { res, lay } = run('lp', 'lp', { sense: 'max' });
	close(res.objective, 4100); close(res.x[0], 30); close(res.x[1], 40);
	close(res.shadow[0], 15); close(res.shadow[1], 5);
	assert.ok(formulas(lay).some((x) => x.startsWith('=MMULT(')));
});

test('lp input errors point at the cell', () => {
	const mod = MODULES.lp, model = mod.models[0];
	const spec = mod.inputTable({}, model, true);
	const t = tableOf(spec); t.rows[1][3] = '<>';
	assert.throws(() => mod.parse(t, model, {}), (e) => e instanceof InputError && e.row === 1 && e.col === 3);
	const t2 = tableOf(spec); t2.rows[2][1] = 'abc';
	assert.throws(() => mod.parse(t2, model, {}), (e) => e.row === 2 && e.col === 1);
});

test('decision sample (Thompson Lumber) EMV and EVPI', () => {
	const { res, lay, summary } = run('decision', 'table');
	assert.deepEqual(res.emv.values, [10000, 40000, 0]);
	close(res.emv.evwpi, 100000); close(res.emv.evpi, 60000);
	assert.equal(summary[0].value, 'Nhà máy nhỏ');
	assert.ok(formulas(lay).some((x) => x.startsWith('=INDEX(')));
	assert.ok(formulas(lay).some((x) => x.startsWith('=SUMPRODUCT(')));
});

test('decision probabilities must sum to 1', () => {
	const mod = MODULES.decision, model = mod.models[0];
	const t = tableOf(mod.inputTable({}, model, true)); t.rows[3][2] = 0.4;
	assert.throws(() => mod.parse(t, model, {}), (e) => e instanceof InputError && e.row === 3);
});

test('decision without probabilities skips EMV', () => {
	const mod = MODULES.decision, model = mod.models[0];
	const t = tableOf(mod.inputTable({}, model, true)); t.rows[3] = ['Xác suất', '', ''];
	const input = mod.parse(t, model, {});
	assert.equal(input.probs, null);
	const res = mod.solve(input, model, { alpha: 0.5, sense: 'profit' }); res._names = res._names ?? input.names;
	layoutReport(mod.report(input, res, model, { alpha: 0.5, sense: 'profit' }));
});

test('pert sample (Milwaukee Paper) = 15 weeks, path A-C-E-G-H', () => {
	const { res, lay } = run('pert', 'three', { target: 16 });
	close(res.duration, 15);
	assert.deepEqual(res.path, ['A', 'C', 'E', 'G', 'H']);
	close(res.variance, 3.111111, 1e-5);
	close(res.prob, 0.71462, 1e-4); // exact; Heizer rounds z to 0.57 and gets 0.7157
	assert.ok(formulas(lay).some((x) => x.startsWith('=MAX(') && x.includes(',')));
	assert.equal(lay.charts[0].kind, 'gantt');
});

test('pert one-time model and bad predecessor', () => {
	const { res } = run('pert', 'one');
	close(res.duration, 15);
	const mod = MODULES.pert, model = mod.models[0];
	const t = tableOf(mod.inputTable({}, model, true)); t.rows[2][1] = 'Z';
	assert.throws(() => mod.parse(t, model, {}), (e) => e.row === 2 && e.col === 1);
});

test('blank input tables give a clear error', () => {
	for (const id of Object.keys(MODULES)) for (const model of MODULES[id].models) {
		const mod = MODULES[id];
		const spec = mod.inputTable(Object.fromEntries((model.dims || mod.dims || []).map((d) => [d.id, d.default])), model, false);
		assert.throws(() => mod.parse(tableOf(spec), model, Object.fromEntries(model.params.map((x) => [x.id, x.default]))), InputError, id + '.' + model.id);
	}
});

test('catalogue covers 29 modules', () => {
	assert.ok(CATALOG.flatMap((g) => g.items).length >= 29);
	for (const it of CATALOG.flatMap((g) => g.items)) if (it.id) assert.ok(MODULES[it.id]);
});
