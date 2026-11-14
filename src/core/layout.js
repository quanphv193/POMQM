// Turns a declarative report spec into positioned cell writes, so formulas can reference
// each other by name. Pure: no Office.js here, which keeps it unit-testable.
//
// spec = { title, subtitle, blocks: [
//   { type: 'kv', id, title, items: [{ key, label, value, fmt, role }] },
//   { type: 'table', id, title, columns: [{ key, label, fmt, role }], rows: [{ cells: { key: value }, highlight }] },
//   { type: 'note', text },
//   { type: 'chart', kind: 'line'|'gantt', title, table, x, series: [key] } ] }
// A value is a number, a string, null, or { f: string | (R) => string, v } where v is the JS-computed value.
import { addr, numFmt } from './format.js';

export function layoutReport(spec, decimals = 2) {
	const pos = {}; // id -> { r, c, kind, keys/cols }
	let r = 0;
	const ops = [];
	const charts = [];
	let maxCol = 1;

	if (spec.title) { ops.push({ r, c: 0, values: [[spec.title]], style: 'title' }); r++; }
	if (spec.subtitle) { ops.push({ r, c: 0, values: [[spec.subtitle]], style: 'sub' }); r++; }
	r++;

	// pass 1: positions
	const placed = [];
	for (const b of spec.blocks) {
		if (b.type === 'chart' || b.type === 'tree') { placed.push({ b, r: null }); continue; }
		const start = r;
		if (b.type === 'kv') {
			if (b.title) r++;
			pos[b.id] = { r, c: 0, kind: 'kv', keys: Object.fromEntries(b.items.map((it, i) => [it.key, r + i])) };
			r += b.items.length;
			maxCol = Math.max(maxCol, 2);
		} else if (b.type === 'table') {
			if (b.title) r++;
			const cols = Object.fromEntries(b.columns.map((col, i) => [col.key, i]));
			pos[b.id] = { r: r + 1, c: 0, kind: 'table', cols, n: b.rows.length };
			r += 1 + b.rows.length;
			maxCol = Math.max(maxCol, b.columns.length);
		} else if (b.type === 'note') {
			r += 1;
		}
		placed.push({ b, r: start });
		r++; // blank row between blocks
	}

	const R = {
		kv(id, key) { const p = need(id); if (!(key in p.keys)) throw new Error(`kv ${id}.${key}?`); return '$B$' + (p.keys[key] + 1); },
		cell(id, row, key) { const p = need(id); return addr(p.r + row, col(p, key)); },
		col(id, key, from = 0, to = null) { const p = need(id); const c = col(p, key); const end = to === null ? p.n - 1 : to; return addr(p.r + from, c) + ':' + addr(p.r + end, c); },
		row(id, row, fromKey, toKey) { const p = need(id); return addr(p.r + row, col(p, fromKey)) + ':' + addr(p.r + row, col(p, toKey)); },
	};
	function need(id) { if (!pos[id]) throw new Error('Không có khối ' + id); return pos[id]; }
	function col(p, key) { if (!(key in p.cols)) throw new Error('Không có cột ' + key); return p.cols[key]; }
	// the JS-computed value of a formula cell, so a test can compare it with what Excel calculates
	const expectOf = (v) => (v && typeof v === 'object' && 'f' in v && typeof v.v === 'number' && Number.isFinite(v.v) ? v.v : null);
	const resolve = (v) => {
		if (v && typeof v === 'object' && 'f' in v) return typeof v.f === 'function' ? v.f(R) : v.f;
		return v === undefined || v === null ? '' : v;
	};

	// pass 2: cell writes
	for (const { b, r: start } of placed) {
		if (b.type === 'tree') { charts.push({ kind: 'tree', title: b.title, tree: b.layout, anchorRow: 3 + charts.length * 20, anchorCol: maxCol + 1 }); continue; }
		if (b.type === 'chart') {
			const anchorRow = 3 + charts.length * 20;
			if (b.kind === 'scatter') {
				// each series: { name, table, x, y, from, to } — its own rows of a table
				charts.push({ kind: 'scatter', title: b.title, xTitle: b.xTitle, yTitle: b.yTitle, anchorRow, anchorCol: maxCol + 1,
					series: b.series.map((s) => ({ name: s.name, lines: s.lines !== false, markers: !!s.markers,
						x: R.col(s.table, s.x, s.from ?? 0, s.to ?? null), values: R.col(s.table, s.y, s.from ?? 0, s.to ?? null) })) });
				continue;
			}
			const p = need(b.table);
			const xr = R.col(b.table, b.x, b.from ?? 0, b.to ?? null);
			charts.push({
				kind: b.kind, title: b.title, anchorRow, anchorCol: maxCol + 1,
				x: xr, series: b.series.map((s) => ({ name: s.name, values: R.col(b.table, s.key, b.from ?? 0, b.to ?? null) })),
				n: p.n,
			});
			continue;
		}
		let rr = start;
		if (b.title) { ops.push({ r: rr, c: 0, values: [[b.title]], style: 'block' }); rr++; }
		if (b.type === 'note') { ops.push({ r: rr, c: 0, values: [[b.text]], style: 'sub' }); continue; }
		if (b.type === 'kv') {
			b.items.forEach((it, i) => {
				ops.push({ r: rr + i, c: 0, values: [[it.label]], style: 'label' });
				ops.push({ r: rr + i, c: 1, values: [[resolve(it.value)]], formats: [[numFmt(it.fmt, decimals)]], style: it.role || 'result', expect: [[expectOf(it.value)]] });
			});
			continue;
		}
		// table
		ops.push({ r: rr, c: 0, values: [b.columns.map((c) => c.label)], style: 'header' });
		b.rows.forEach((row, i) => {
			const vals = b.columns.map((c) => resolve(row.cells[c.key]));
			const fmts = b.columns.map((c) => numFmt(c.fmt, decimals));
			ops.push({ r: rr + 1 + i, c: 0, values: [vals], formats: [fmts], expect: [b.columns.map((c) => expectOf(row.cells[c.key]))], style: 'body', roles: b.columns.map((c) => (row.role && c.role !== 'label' ? row.role : c.role || 'result')), highlight: !!row.highlight });
		});
		ops.push({ r: rr, c: 0, h: 1 + b.rows.length, w: b.columns.length, style: 'border' });
	}
	// column widths in characters, from the cells we write (titles and notes excluded; headers wrap)
	const widths = Array(maxCol).fill(6);
	for (const op of ops) {
		if (!op.values || op.style === 'title' || op.style === 'sub' || op.style === 'block') continue;
		op.values[0].forEach((v, i) => {
			const c = op.c + i;
			if (c >= widths.length) return;
			let len = typeof v === 'string' && !v.startsWith('=') ? v.length : 11;
			if (op.style === 'header') len = Math.min(len, 14);
			widths[c] = Math.max(widths[c], Math.min(len, 40));
		});
	}
	return { ops, charts, rows: r, cols: maxCol, widths };
}
