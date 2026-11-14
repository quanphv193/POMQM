import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../lib/ops_c.js';
import { MODULES, CATALOG } from '../src/modules/index.js';
import { runModel } from './phase1-forecast.test.js';

const close = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);

test('aggregate planning: LP is no worse than chase or level, plans are feasible', () => {
	const m = runModel('aggregate', 'agg');
	close(m.res.opt.cost, 49300, 1e-3);
	assert.ok(m.res.opt.cost <= m.res.chase.cost + 1e-6 && m.res.opt.cost <= m.res.level.cost + 1e-6);
	let pos = 0;
	m.res.opt.rows.forEach((r) => { pos += r.R + r.O + r.S - r.d; close(r.I - r.B, pos, 1e-6); assert.ok(r.R <= 1500 + 1e-9 && r.O <= 300 + 1e-9 && r.S <= 200 + 1e-9); });
	close(m.res.opt.rows[3].B, 0, 1e-9);
	assert.throws(() => C.aggregateLP([{ d: 1000, capR: 100, capO: 0, capS: 0 }, { d: 10, capR: 10, capO: 0, capS: 0 }], { r: 1, o: 1, s: 1, h: 1, b: 1 }), /khả thi/);
	// hand check: demand 100/100, regular 100 at cost 10 -> 2000
	close(C.aggregateLP([{ d: 100, capR: 100, capO: 0, capS: 0 }, { d: 100, capR: 100, capO: 0, capS: 0 }], { r: 10, o: 99, s: 99, h: 1, b: 1 }).cost, 2000, 1e-6);
	assert.ok(m.formulas.some((f) => f.startsWith('=SUM(')));
});

test('MRP: netting, lot sizing, lead-time offsetting and BOM explosion', () => {
	const r = C.mrp([{ id: 'A', parent: null, qty: 1, lead: 1, onHand: 10, lot: 0 }, { id: 'B', parent: 'A', qty: 2, lead: 1, onHand: 5, lot: 0 }], { A: [0, 0, 50, 0, 0] }, 5);
	assert.deepEqual(r.rows[0].net, [0, 0, 40, 0, 0]); assert.deepEqual(r.rows[0].release, [0, 40, 0, 0, 0]);
	assert.deepEqual(r.rows[1].gross, [0, 80, 0, 0, 0]); assert.deepEqual(r.rows[1].release, [75, 0, 0, 0, 0]);
	const lot = C.mrp([{ id: 'A', parent: null, qty: 1, lead: 0, onHand: 0, lot: 40 }], { A: [30, 30, 30] }, 3);
	assert.deepEqual(lot.rows[0].receipt, [40, 40, 40]); assert.deepEqual(lot.rows[0].projected, [10, 20, 30]); // each period is short, so a full lot of 40 arrives each time
	assert.throws(() => C.mrp([{ id: 'A', parent: 'Z', qty: 1, lead: 0, onHand: 0, lot: 0 }], {}, 3), /không có trong bảng/);
	assert.throws(() => C.mrp([{ id: 'A', parent: 'B', qty: 1, lead: 0, onHand: 0, lot: 0 }, { id: 'B', parent: 'A', qty: 1, lead: 0, onHand: 0, lot: 0 }], {}, 3), /vòng/);
	const late = C.mrp([{ id: 'A', parent: null, qty: 1, lead: 3, onHand: 0, lot: 0 }], { A: [10, 0, 0] }, 3); assert.equal(late.rows[0].pastDue, 10);
	const m = runModel('mrp', 'mrp'); assert.equal(m.res.rows.length, 4); assert.ok(m.res.rows.every((x) => x.projected.every((v) => v >= -1e-9)));
	const byId = Object.fromEntries(m.res.rows.map((x) => [x.id, x]));
	// every component receipt is covered by its parent's releases (x qty)
	m.res.rows[1].gross.forEach((g, t) => close(g, byId.A.release[t] * 2, 1e-9));
});

test('simulation: reproducible with a seed, converges to the expected value, formulas look values up', () => {
	const a = C.simulate([0, 1, 2], [0.2, 0.5, 0.3], 5000, 7), b = C.simulate([0, 1, 2], [0.2, 0.5, 0.3], 5000, 7);
	assert.deepEqual(a.sims, b.sims); close(a.mean, a.expected, 0.05); close(a.freq.reduce((x, y) => x + y, 0), 1, 1e-9);
	assert.notDeepEqual(a.sims.slice(0, 20), C.simulate([0, 1, 2], [0.2, 0.5, 0.3], 5000, 8).sims.slice(0, 20));
	assert.throws(() => C.simulate([0, 1], [0.5, 0.2], 10, 1));
	const m = runModel('simulation', 'mc'); assert.equal(m.res.sims.length, 100);
	assert.ok(m.formulas.filter((f) => f.startsWith('=LOOKUP(')).length === 100);
});

test('every catalogue entry is implemented', () => {
	const items = CATALOG.flatMap((g) => g.items);
	assert.ok(items.length >= 29);
	assert.deepEqual(items.filter((it) => !it.id), []);
	for (const it of items) assert.ok(MODULES[it.id], it.id);
});

import { rollback } from '../lib/dtree.js';
import { treeLayout } from '../lib/treelayout.js';
import { treeSvg } from '../src/core/treesvg.js';
import { layoutReport } from '../src/core/layout.js';
import { inMenu, EDITION } from '../src/modules/index.js';

test('decision tree layout, SVG and report block', () => {
	const mod = MODULES.decision, model = mod.models.find((m) => m.id === 'tree');
	const spec = mod.inputTable({ rows: 8 }, model, true);
	const inp = mod.parse({ header: spec.columns.map((c) => c.label), rows: spec.rows.map((r) => spec.columns.map((_, i) => r[i] ?? '')) }, model, {});
	const res = mod.solve(inp, model, { sense: 'profit' });
	const T = treeLayout(res, inp.branches);
	assert.equal(T.nodes.length, 26); assert.equal(T.edges.length, 25);
	const node = Object.fromEntries(T.nodes.map((n) => [n.id, n]));
	assert.equal(node['1'].x, 0); assert.ok(node['9'].x > node['6'].x);
	const leaves = T.nodes.filter((n) => n.type === 'end').map((n) => n.y).sort((a, b) => a - b);
	assert.deepEqual(leaves, leaves.map((_, i) => i)); // consecutive rows, no overlaps
	close(node['6'].y, (node['9'].y + node['10'].y) / 2);
	assert.equal(T.edges.filter((e) => e.best).length, 3); // chosen branch at nodes 1, 4 and 5; node 3 is on the discarded no-survey branch
	const svg = treeSvg(T); assert.ok(svg.startsWith('<svg')); assert.equal((svg.match(/<path /g) || []).length, 25);
	assert.ok(layoutReport(mod.report(inp, res, model, { sense: 'profit' }), 2).charts.some((c) => c.kind === 'tree'));
	assert.ok(mod.preview(inp, res, model, {}).startsWith('<svg'));
	assert.equal(mod.preview(inp, res, mod.models[0], {}), null);
});

test('POM / QM menu filter', () => {
	assert.equal(inMenu('game', 'pom'), false); assert.equal(inMenu('inventory', 'qm'), false); assert.equal(inMenu('lp', 'pom'), true); assert.equal(inMenu('lp', 'qm'), true);
	for (const id of Object.keys(MODULES)) assert.ok(inMenu(id, 'all'));
	assert.ok(Object.keys(EDITION).every((id) => MODULES[id]));
});
