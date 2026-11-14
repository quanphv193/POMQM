/* global Excel */
// Development self-test, run inside Excel: every model, textbook sample in, report out,
// then every formula cell Excel calculated is compared with the value JavaScript computed.
import { MODULES } from './modules/index.js';
import { createInputTable, readInputTable, writeReport } from './core/excel.js';
import { layoutReport } from './core/layout.js';

const log = (m) => fetch('/__log?' + encodeURIComponent(m)).catch(() => {});

// Only ever runs in a brand-new workbook (one empty sheet), so a real file is never touched.
async function isBlankWorkbook() {
	return Excel.run(async (ctx) => {
		const ws = ctx.workbook.worksheets; ws.load('items/name');
		await ctx.sync();
		// a workbook counts as blank when every sheet is empty or was produced by an earlier self-test run ("T …" / "R …")
		for (const sh of ws.items) {
			if (/^[TR] /.test(sh.name)) continue;
			const vals = sh.getRange('A1:Z200'); vals.load('values');
			await ctx.sync();
			if (!vals.values.every((r) => r.every((v) => v === '' || v === null))) return false;
		}
		return true;
	});
}

async function probeShapes() {
	const tries = {
		'addLine plain': (ws) => ws.shapes.addLine(100, 100, 200, 150),
		'addLine straight': (ws) => ws.shapes.addLine(100, 100, 200, 150, 'Straight'),
		'addLine + color': (ws) => { const l = ws.shapes.addLine(100, 100, 200, 150); l.lineFormat.color = '#1D6B48'; return l; },
		'addLine + weight': (ws) => { const l = ws.shapes.addLine(100, 100, 200, 150); l.lineFormat.weight = 2; return l; },
		'addLine rounded coords': (ws) => ws.shapes.addLine(Math.round(100.4), Math.round(100.6), Math.round(200.2), Math.round(150.9)),
		'addLine upward': (ws) => ws.shapes.addLine(100, 150, 200, 100),
		'weight 2.5': (ws) => { const l = ws.shapes.addLine(100, 100, 200, 150); l.lineFormat.weight = 2.5; return l; },
		'weight 1': (ws) => { const l = ws.shapes.addLine(100, 100, 200, 150); l.lineFormat.weight = 1; return l; },
		'color gray': (ws) => { const l = ws.shapes.addLine(100, 100, 200, 150); l.lineFormat.color = '#9AA8A1'; return l; },
		'float coords': (ws) => ws.shapes.addLine(112.3456789, 130.987654, 241.123456, 170.5555555),
		'big coords': (ws) => ws.shapes.addLine(1100.5, 1330.25, 1241.75, 1470.5),
		'color+weight both': (ws) => { const l = ws.shapes.addLine(100, 100, 200, 150); l.lineFormat.color = '#1D6B48'; l.lineFormat.weight = 2.5; return l; },
		'addLine zero height': (ws) => ws.shapes.addLine(100, 100, 200, 100),
		'textbox + font': (ws) => { const t = ws.shapes.addTextBox('abc'); t.textFrame.textRange.font.size = 8; return t; },
		'ellipse + fill': (ws) => { const g = ws.shapes.addGeometricShape(Excel.GeometricShapeType.ellipse); g.fill.setSolidColor('#FFF6DD'); return g; },
	};
	for (const [name, fn] of Object.entries(tries)) {
		try { await Excel.run(async (ctx) => { const ws = ctx.workbook.worksheets.getActiveWorksheet(); fn(ws); await ctx.sync(); }); log('probe PASS ' + name); }
		catch (e) { log('probe FAIL ' + name + ': ' + (e && e.message)); }
	}
}

export async function runSelfTest(filter = []) {
	if (filter.includes('shapes-probe')) { await probeShapes(); log('=== done: probe'); return { pass: 0, fail: 0 }; }
	log('self-test loaded');
	let blank = false;
	try { blank = await isBlankWorkbook(); } catch (e) { log('blank check failed: ' + (e && e.message)); }
	if (!blank) { log('SKIP: workbook is not blank'); return { pass: 0, fail: 0, skipped: true }; }
	log(`=== self-test ${new Date().toISOString()}`);
	let pass = 0, fail = 0;
	for (const mod of Object.values(MODULES)) {
		for (const model of mod.models) {
			const name = `${mod.id}.${model.id}`;
			if (filter.length && !filter.some((f) => name.includes(f))) continue;
			try {
				const dims = Object.fromEntries((model.dims || mod.dims || []).map((d) => [d.id, d.default]));
				const p = Object.fromEntries(model.params.map((x) => [x.id, x.default]));
				const key = `${mod.id}_${model.table || 'main'}`;
				const inSpec = mod.inputTable(dims, model, true);
				await createInputTable(key, 'T ' + model.id, inSpec, 2);
				const table = await readInputTable(key);
				const input = mod.parse(table, model, p);
				const res = mod.solve(input, model, p);
				res._names = res._names ?? input.names;
				const spec = mod.report(input, res, model, p);
				const out = await writeReport('R ' + model.id, spec, 2);
				const lay = layoutReport(spec, 2);
				const check = await compare(out.sheet, lay);
				const ok = !check.errors.length && !check.mismatch.length && !out.warnings.length && check.charts === lay.charts.length && check.shapesOk;
				ok ? pass++ : fail++;
				log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${check.formulas} formulas checked, charts ${check.charts}/${lay.charts.length}` +
					(check.errors.length ? ` | Excel errors: ${check.errors.slice(0, 5).join('; ')}` : '') +
					(check.mismatch.length ? ` | mismatches: ${check.mismatch.slice(0, 5).join('; ')}` : '') +
					(out.warnings.length ? ` | warnings: ${out.warnings.join('; ')}` : ''));
			} catch (e) {
				fail++;
				log(`FAIL ${name}: exception ${e && e.message}`);
			}
		}
	}
	log(`=== done: ${pass} pass, ${fail} fail`);
	return { pass, fail };
}

async function compare(sheetName, lay) {
	return Excel.run(async (ctx) => {
		const ws = ctx.workbook.worksheets.getItem(sheetName);
		const used = ws.getRangeByIndexes(0, 0, lay.rows + 2, Math.max(lay.cols, 1) + 1);
		used.load('values');
		ws.charts.load('items');
		ws.shapes.load('items');
		await ctx.sync();
		const V = used.values;
		const errors = [], mismatch = [];
		let formulas = 0;
		for (const op of lay.ops) {
			if (!op.values) continue;
			op.values.forEach((row, i) => row.forEach((f, j) => {
				const v = V[op.r + i]?.[op.c + j];
				if (typeof v === 'string' && /^#(VALUE|REF|NAME|DIV\/0|N\/A|NUM|NULL|SPILL|CALC)/.test(v)) errors.push(`${addr(op.r + i, op.c + j)}=${v} (${String(f).slice(0, 60)})`);
				if (typeof f === 'string' && f.startsWith('=')) {
					formulas++;
					const e = op.expect?.[i]?.[j];
					if (typeof e === 'number' && !(typeof v === 'number' && Math.abs(v - e) <= 1e-6 * Math.max(1, Math.abs(e)))) mismatch.push(`${addr(op.r + i, op.c + j)} Excel=${v} JS=${e}`);
				}
			}));
		}
		const trees = lay.charts.filter((c) => c.kind === 'tree'), need = trees.reduce((a, t) => a + t.tree.nodes.length + t.tree.edges.length, 0);
		return { errors, mismatch, formulas, charts: ws.charts.items.length + trees.length, shapesOk: !trees.length || ws.shapes.items.length - ws.charts.items.length >= need };
	});
}
const addr = (r, c) => String.fromCharCode(65 + c) + (r + 1);
