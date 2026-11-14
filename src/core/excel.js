/* global Excel, Office */
// Everything that touches the workbook goes through here.
import { layoutReport } from './layout.js';
import { numFmt } from './format.js';
import { InputError } from './errors.js';

const C = {
	accent: '#1D6B48', header: '#1D6B48', headerFg: '#FFFFFF',
	input: '#FFF6DD', result: '#E8F4EE', highlight: '#FCE8B2', line: '#C9D6CF', muted: '#5B6862', title: '#17201C',
};
const TABLE_PREFIX = 'omqm_';

// Never delete or overwrite a sheet: pick the first free name "Base", "Base (2)", ...
export async function uniqueSheetName(ctx, base) {
	const ws = ctx.workbook.worksheets; ws.load('items/name'); await ctx.sync();
	const taken = new Set(ws.items.map((w) => w.name.toLowerCase()));
	const clean = base.replace(/[\[\]:*?/\\]/g, '-').slice(0, 26);
	if (!taken.has(clean.toLowerCase())) return clean;
	for (let i = 2; ; i++) { const n = `${clean} (${i})`; if (!taken.has(n.toLowerCase())) return n; }
}

// Creates a styled Excel Table for data entry on a new sheet and selects its first data cell.
export async function createInputTable(moduleId, sheetBase, spec, decimals) {
	return Excel.run(async (ctx) => {
		const name = await uniqueSheetName(ctx, sheetBase);
		const ws = ctx.workbook.worksheets.add(name);
		const w = spec.columns.length, h = spec.rows.length;
		ws.getRange('A1').values = [[spec.title]];
		ws.getRange('A1').format.font.set({ bold: true, size: 14, color: C.title });
		ws.getRange('A2').values = [[spec.hint]];
		ws.getRange('A2').format.font.set({ italic: true, color: C.muted });
		const top = 3;
		const full = ws.getRangeByIndexes(top, 0, h + 1, w);
		full.values = [spec.columns.map((c) => c.label), ...spec.rows.map((r) => spec.columns.map((_, i) => (r[i] ?? '')))];
		const table = ws.tables.add(full, true);
		table.name = `${TABLE_PREFIX}${moduleId}_${Date.now().toString(36)}`;
		table.style = 'TableStyleLight1';
		table.showBandedRows = false;
		const body = ws.getRangeByIndexes(top + 1, 0, h, w);
		body.format.fill.color = C.input;
		spec.columns.forEach((c, i) => {
			const colR = ws.getRangeByIndexes(top + 1, i, h, 1);
			colR.numberFormat = Array.from({ length: h }, () => [numFmt(c.fmt, decimals)]);
			for (const [ri, f] of Object.entries(spec.rowFormats || {})) if (+ri < h) colR.getCell(+ri, 0).numberFormat = [[numFmt(f, decimals)]];
			if (c.list) { try { colR.dataValidation.rule = { list: { inCellDropDown: true, source: c.list.join(',') } }; } catch { /* optional */ } }
			if (c.label === '' || c.fmt === 'text') colR.format.font.bold = !!c.bold;
		});
		const head = ws.getRangeByIndexes(top, 0, 1, w);
		head.format.fill.color = C.header; head.format.font.set({ bold: true, color: C.headerFg });
		table.showFilterButton = false;
		spec.columns.forEach((c, i) => {
			const len = Math.max(String(c.label).length, ...spec.rows.map((r) => String(r[i] ?? '').length), 8);
			ws.getRangeByIndexes(0, i, 1, 1).getEntireColumn().format.columnWidth = Math.round(Math.min(len, 32) * 6.5 + 18);
		});
		ws.freezePanes.freezeRows(top + 1);
		ws.activate();
		ws.getRangeByIndexes(top + 1, spec.firstInputCol ?? 1, 1, 1).select();
		await ctx.sync();
		rememberTable(moduleId, table.name);
		return { sheet: name, table: table.name };
	});
}

function rememberTable(moduleId, tableName) {
	try {
		const s = Office.context.document.settings;
		s.set('omqm.table.' + moduleId, tableName);
		s.saveAsync();
	} catch { /* not critical */ }
}

// Finds the input table for a module: one on the active sheet first, else the last one created in this workbook.
export async function readInputTable(moduleId) {
	return Excel.run(async (ctx) => {
		const sheet = ctx.workbook.worksheets.getActiveWorksheet();
		sheet.tables.load('items/name');
		await ctx.sync();
		let t = sheet.tables.items.find((x) => x.name.startsWith(`${TABLE_PREFIX}${moduleId}_`));
		let tableName = t?.name;
		if (!tableName) {
			let saved = null;
			try { saved = Office.context.document.settings.get('omqm.table.' + moduleId); } catch { /* ignore */ }
			if (saved) {
				const maybe = ctx.workbook.tables.getItemOrNullObject(saved); await ctx.sync();
				if (!maybe.isNullObject) tableName = saved;
			}
		}
		if (!tableName) throw new InputError('Chưa có bảng nhập cho module này. Bấm “Tạo bảng nhập” trước, rồi điền số liệu vào ô màu vàng.');
		const table = ctx.workbook.tables.getItem(tableName);
		const head = table.getHeaderRowRange(); head.load('values');
		const body = table.getDataBodyRange(); body.load('values,address');
		const ws = table.worksheet; ws.load('name');
		await ctx.sync();
		return { table: tableName, sheet: ws.name, header: head.values[0], rows: body.values };
	});
}

// Selects the offending input cell so the user sees where to fix.
export async function selectInputCell(tableName, row, col) {
	if (row === null || row === undefined) return;
	try {
		await Excel.run(async (ctx) => {
			const table = ctx.workbook.tables.getItem(tableName);
			table.worksheet.activate();
			const body = table.getDataBodyRange();
			body.getCell(row, col ?? 0).select();
			await ctx.sync();
		});
	} catch { /* table gone or cell out of range */ }
}

export async function writeReport(sheetBase, spec, decimals) {
	const lay = layoutReport(spec, decimals);
	const warnings = [];
	const sheet = await Excel.run(async (ctx) => {
		const name = await uniqueSheetName(ctx, sheetBase);
		const ws = ctx.workbook.worksheets.add(name);
		for (const op of lay.ops) {
			if (op.style === 'border') {
				const rg = ws.getRangeByIndexes(op.r, op.c, op.h, op.w);
				for (const e of ['EdgeTop', 'EdgeBottom', 'EdgeLeft', 'EdgeRight', 'InsideVertical', 'InsideHorizontal']) {
					const b = rg.format.borders.getItem(e); b.style = 'Continuous'; b.color = C.line;
				}
				continue;
			}
			const h = op.values.length, w = op.values[0].length;
			const rg = ws.getRangeByIndexes(op.r, op.c, h, w);
			if (op.formats) rg.numberFormat = op.formats;
			rg.formulas = op.values;
			styleRange(ws, rg, op);
		}
		lay.widths.forEach((w, c) => { ws.getRangeByIndexes(0, c, 1, 1).getEntireColumn().format.columnWidth = Math.round(w * 6.5 + 14); });
		ws.activate();
		await ctx.sync();
		for (const ch of lay.charts) {
			try { if (ch.kind === 'tree') await addTree(ctx, ws, ch); else { addChart(ws, ch); await ctx.sync(); } } catch (e) { warnings.push('Không vẽ được biểu đồ: ' + (e.message || e)); }
		}
		ws.getRange('A1').select();
		await ctx.sync();
		return name;
	});
	return { sheet, warnings };
}

function styleRange(ws, rg, op) {
	const f = rg.format;
	switch (op.style) {
		// Labels clear any fill: Excel's "extend data range formats" can copy a highlighted row's fill onto them.
		case 'title': f.fill.clear(); f.font.set({ bold: true, size: 14, color: C.title }); break;
		case 'sub': f.fill.clear(); f.font.set({ italic: true, color: C.muted }); break;
		case 'block': f.fill.clear(); f.font.set({ bold: true, color: C.accent }); break;
		case 'label': f.fill.clear(); f.font.bold = true; break;
		case 'header': f.fill.color = C.header; f.font.set({ bold: true, color: C.headerFg }); f.horizontalAlignment = 'Center'; f.wrapText = true; break;
		case 'input': f.fill.color = C.input; break;
		case 'result': f.fill.color = C.result; break;
		case 'body':
			op.roles.forEach((role, i) => {
				const cell = rg.getCell(0, i);
				if (op.highlight) { cell.format.fill.color = C.highlight; cell.format.font.bold = true; }
				else if (role === 'input') cell.format.fill.color = C.input;
				else if (role === 'result') cell.format.fill.color = C.result;
			});
			break;
	}
}

// Decision tree drawn as native shapes (squares = decisions, circles = chance nodes, lines = branches).
async function addTree(ctx, ws, ch) {
	const CW = 150, RH = 40, R = 9;
	const tl = ws.getRangeByIndexes(ch.anchorRow, ch.anchorCol, 1, 1); tl.load('left,top');
	await ctx.sync();
	// every step is synced on its own so a failure names the call that caused it
	const step = async (what, fn) => { try { const r = fn(); await ctx.sync(); return r; } catch (e) { throw new Error(`${what}: ${(e && e.message) || e}`); } };
	const L0 = tl.left + 20, T0 = tl.top + 30, T = ch.tree;
	const pos = new Map(T.nodes.map((n) => [n.id, { x: L0 + n.x * CW, y: T0 + n.y * RH, n }]));
	await step('tiêu đề', () => { const t = ws.shapes.addTextBox(ch.title); t.left = tl.left; t.top = tl.top; t.width = 260; t.height = 22; return t; });
	for (const e of T.edges) {
		const a = pos.get(e.from), b = pos.get(e.to);
		await step('đường nhánh', () => { const ln = ws.shapes.addLine(a.x + R, a.y, b.x - R, b.y); ln.lineFormat.color = e.best ? '#1D6B48' : e.onPath ? '#5B6862' : '#9AA8A1'; ln.lineFormat.weight = e.best ? 3 : 1; return ln; }); // note: Excel rejects fractional line weights such as 2.5
		const txt = [e.name, e.prob !== null && e.prob !== undefined ? `p=${e.prob}` : '', e.value ? String(e.value) : ''].filter(Boolean).join(' · ') || ' ';
		const tb = await step('nhãn nhánh', () => { const t = ws.shapes.addTextBox(txt); t.left = a.x + R + 4; t.top = b.y - 16; t.width = CW - R * 2 - 8; t.height = 16; t.textFrame.textRange.font.size = 8; return t; });
		await step('nhãn trong suốt', () => { tb.lineFormat.visible = false; tb.fill.clear(); }).catch(() => {}); // cosmetic only
	}
	for (const n of T.nodes) {
		const { x, y } = pos.get(n.id), size = n.type === 'end' ? 7 : R * 2;
		await step('nút', () => { const sh = ws.shapes.addGeometricShape(n.type === 'chance' ? Excel.GeometricShapeType.ellipse : Excel.GeometricShapeType.rectangle); sh.left = x - size / 2; sh.top = y - size / 2; sh.width = size; sh.height = size; sh.fill.setSolidColor(n.type === 'decision' ? '#1D6B48' : n.type === 'chance' ? '#FFF6DD' : '#5B6862'); return sh; });
		if (n.type !== 'end') {
			const lb = await step('nhãn nút', () => { const t = ws.shapes.addTextBox(String(Math.round(n.ev * 100) / 100)); t.left = x - 30; t.top = y - R - 17; t.width = 60; t.height = 16; t.textFrame.textRange.font.size = 9; t.textFrame.textRange.font.bold = true; return t; });
			await step('nhãn nút trong suốt', () => { lb.lineFormat.visible = false; lb.fill.clear(); }).catch(() => {}); // cosmetic only
		}
	}
}

function addChart(ws, ch) {
	if (ch.kind === 'line') {
		const chart = ws.charts.add('Line', ws.getRange(ch.series[0].values), 'Columns');
		chart.title.text = ch.title;
		chart.series.getItemAt(0).name = ch.series[0].name;
		chart.series.getItemAt(0).setXAxisValues(ws.getRange(ch.x));
		for (const s of ch.series.slice(1)) {
			const ser = chart.series.add(s.name);
			ser.setValues(ws.getRange(s.values));
			ser.setXAxisValues(ws.getRange(ch.x));
		}
		chart.legend.position = 'Bottom';
		place(ws, chart, ch);
	} else if (ch.kind === 'scatter') {
		const first = ch.series[0];
		const chart = ws.charts.add('XYScatterLines', ws.getRange(first.values), 'Columns');
		chart.title.text = ch.title;
		chart.series.getItemAt(0).delete();
		for (const s of ch.series) {
			const ser = chart.series.add(s.name);
			ser.setXAxisValues(ws.getRange(s.x));
			ser.setValues(ws.getRange(s.values));
			if (!s.lines) ser.format.line.lineStyle = 'None';
			ser.markerStyle = s.markers ? 'Circle' : 'None';
		}
		if (ch.xTitle) { chart.axes.valueAxis.title.text = ch.yTitle || ''; chart.axes.categoryAxis.title.text = ch.xTitle; }
		chart.legend.position = 'Bottom';
		place(ws, chart, ch);
	} else if (ch.kind === 'column') {
		const chart = ws.charts.add('ColumnClustered', ws.getRange(ch.series[0].values), 'Columns');
		chart.title.text = ch.title;
		chart.series.getItemAt(0).name = ch.series[0].name;
		chart.series.getItemAt(0).setXAxisValues(ws.getRange(ch.x));
		for (const s of ch.series.slice(1)) { const ser = chart.series.add(s.name); ser.setValues(ws.getRange(s.values)); ser.setXAxisValues(ws.getRange(ch.x)); }
		chart.legend.position = 'Bottom';
		place(ws, chart, ch);
	} else if (ch.kind === 'gantt') {
		const chart = ws.charts.add('BarStacked', ws.getRange(ch.series[0].values), 'Columns');
		chart.title.text = ch.title;
		const s0 = chart.series.getItemAt(0);
		s0.name = ch.series[0].name; s0.setXAxisValues(ws.getRange(ch.x)); s0.format.fill.clear();
		const s1 = chart.series.add(ch.series[1].name);
		s1.setValues(ws.getRange(ch.series[1].values)); s1.setXAxisValues(ws.getRange(ch.x));
		s1.format.fill.setSolidColor(C.accent);
		chart.axes.categoryAxis.reversePlotOrder = true;
		chart.legend.visible = false;
		place(ws, chart, ch);
	}
}
function place(ws, chart, ch) {
	const tl = ws.getRangeByIndexes(ch.anchorRow, ch.anchorCol, 1, 1);
	const br = ws.getRangeByIndexes(ch.anchorRow + 16, ch.anchorCol + 7, 1, 1);
	chart.setPosition(tl, br);
}

export async function activateSheet(name) {
	await Excel.run(async (ctx) => { ctx.workbook.worksheets.getItem(name).activate(); await ctx.sync(); });
}

// Describes the input table that "Giải" would use, for the status line in the pane.
export async function peekInputTable(moduleId) {
	try {
		const t = await readInputTable(moduleId);
		return { sheet: t.sheet, rows: t.rows.length };
	} catch { return null; }
}
