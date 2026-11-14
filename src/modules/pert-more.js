// PERT/CPM variants: activity-on-arrow, mean/SD or mean/variance given, crashing, cost budgeting.
import { pert, fromArrows, budget } from '../../lib/pert.js';
import { crashCurve } from '../../lib/crash.js';
import { InputError } from '../core/errors.js';
import { toNum, isBlank } from './common.js';

const TARGET = { id: 'target', label: 'Thời hạn mục tiêu (để tính xác suất, tuỳ chọn)', type: 'num', default: 16, optional: true };
const DIMS = [{ id: 'acts', label: 'Số hoạt động', default: 8, min: 1, max: 300 }];
const blank = (v) => v === '' || v === undefined || v === null;
const splitPre = (v) => String(v ?? '').split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
const actId = (i) => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : '');

// Milwaukee Paper Manufacturing (Heizer & Render)
const MIL = [['A', '', 1, 2, 3], ['B', '', 2, 3, 4], ['C', 'A', 1, 2, 3], ['D', 'A, B', 2, 4, 6], ['E', 'C', 1, 4, 7], ['F', 'C', 1, 2, 9], ['G', 'D, E', 3, 4, 11], ['H', 'F, G', 1, 2, 3]];
// Same project drawn as activity-on-arrow, with a dummy so that D follows both A and B.
const MIL_AOA = [['A', 1, 2, 1, 2, 3], ['B', 1, 3, 2, 3, 4], ['Giả', 2, 3, 0, 0, 0], ['C', 2, 4, 1, 2, 3], ['D', 3, 5, 2, 4, 6], ['E', 4, 5, 1, 4, 7], ['F', 4, 6, 1, 2, 9], ['G', 5, 6, 3, 4, 11], ['H', 6, 7, 1, 2, 3]];
// Heizer & Render crashing data (normal/crash time, normal/crash cost)
const CRASH = [['A', '', 2, 1, 22000, 22750], ['B', '', 3, 1, 30000, 34000], ['C', 'A', 2, 1, 26000, 27000], ['D', 'A, B', 4, 3, 48000, 49000], ['E', 'C', 4, 2, 56000, 58000], ['F', 'C', 3, 2, 30000, 30500], ['G', 'D, E', 5, 2, 80000, 84500], ['H', 'F, G', 2, 1, 15000, 19000]];
// General Foundry (Render, Stair & Hanna) — time and total cost per activity
const FOUNDRY = [['A', '', 2, 22000], ['B', '', 3, 30000], ['C', 'A', 2, 26000], ['D', 'A, B', 4, 48000], ['E', 'C', 4, 56000], ['F', 'C', 3, 30000], ['G', 'D, E', 5, 80000], ['H', 'F, G', 2, 16000]];

function checkPre(acts) {
	const ids = new Set(acts.map((x) => x.id));
	for (const x of acts) for (const p of x.pre) if (!ids.has(p)) throw new InputError(`Hoạt động ${x.id} có tiền nhiệm “${p}” không có trong bảng.`, x._row, 1);
}
function runPert(acts, target) {
	try { return pert(acts, target); } catch (e) { throw new InputError(e.message); }
}

// Schedule table with ES/EF/LS/LF formulas. inputCols: extra input columns; te/v: cells for duration and variance.
function schedule(res, inputCols, inputCells, te, v, { title, subtitle, target, gantt = true, extra = [] }) {
	const idx = new Map(res.rows.map((x, i) => [x.id, i]));
	const cell = (R, id, key) => R.cell('act', idx.get(id), key);
	const rows = res.rows.map((x, i) => ({ highlight: x.critical, cells: {
		id: x.id, pre: x.pre.join(', '), ...inputCells(x, i),
		te: te(x, i), ...(v ? { var: v(x, i) } : {}),
		es: { f: (R) => (x.pre.length ? `=MAX(${x.pre.map((q) => cell(R, q, 'ef')).join(',')})` : '=0'), v: x.es },
		ef: { f: (R) => `=${R.cell('act', i, 'es')}+${R.cell('act', i, 'te')}`, v: x.ef },
		lf: { f: (R) => (res.succ.get(x.id).length ? `=MIN(${res.succ.get(x.id).map((s) => cell(R, s, 'ls')).join(',')})` : `=${R.kv('res', 'dur')}`), v: x.lf },
		ls: { f: (R) => `=${R.cell('act', i, 'lf')}-${R.cell('act', i, 'te')}`, v: x.ls },
		slack: { f: (R) => `=${R.cell('act', i, 'ls')}-${R.cell('act', i, 'es')}`, v: x.slack },
		crit: { f: (R) => `=IF(ABS(${R.cell('act', i, 'slack')})<1E-9,"Có","")` },
	} }));
	const cols = [
		{ key: 'id', label: 'Mã', fmt: 'text', role: 'label' }, { key: 'pre', label: 'Tiền nhiệm', fmt: 'text', role: 'label' }, ...inputCols,
		{ key: 'te', label: 'Thời gian kỳ vọng', fmt: 'num', role: inputCols.some((c) => c.key === 'te') ? 'input' : 'result' },
		...(v ? [{ key: 'var', label: 'Phương sai', fmt: 'num' }] : []),
		{ key: 'es', label: 'ES', fmt: 'num' }, { key: 'ef', label: 'EF', fmt: 'num' }, { key: 'ls', label: 'LS', fmt: 'num' }, { key: 'lf', label: 'LF', fmt: 'num' },
		{ key: 'slack', label: 'Thời gian dự trữ', fmt: 'num' }, { key: 'crit', label: 'Găng?', fmt: 'text' },
	].filter((c, i, a) => a.findIndex((d) => d.key === c.key) === i);
	const items = [
		{ key: 'dur', label: 'Thời gian hoàn thành dự án', value: { f: (R) => `=MAX(${R.col('act', 'ef')})`, v: res.duration }, fmt: 'num' },
		{ key: 'path', label: res.paths.length > 1 ? `Đường găng (${res.paths.length} đường, dùng đường có phương sai lớn nhất)` : 'Đường găng', value: res.path.join(' → '), role: 'label' },
	];
	if (v) items.push(
		{ key: 'var', label: 'Phương sai đường găng', value: { f: (R) => `=SUM(${res.path.map((id) => cell(R, id, 'var')).join(',')})`, v: res.variance }, fmt: 'num' },
		{ key: 'sd', label: 'Độ lệch chuẩn', value: { f: (R) => `=SQRT(${R.kv('res', 'var')})`, v: res.sd }, fmt: 'num' },
		{ key: 'T', label: 'Thời hạn mục tiêu (nhập để tính)', value: blank(target) ? '' : Number(target), fmt: 'num', role: 'input' },
		{ key: 'prob', label: 'Xác suất hoàn thành trước thời hạn', value: { f: (R) => `=IF(${R.kv('res', 'T')}="","",IFERROR(NORM.S.DIST((${R.kv('res', 'T')}-${R.kv('res', 'dur')})/${R.kv('res', 'sd')},TRUE),IF(${R.kv('res', 'T')}>=${R.kv('res', 'dur')},1,0)))`, v: res.prob }, fmt: 'pct' },
	);
	const blocks = [
		{ type: 'table', id: 'act', title: 'Lịch hoạt động', columns: cols, rows },
		{ type: 'kv', id: 'res', title: 'Tổng hợp', items },
	];
	if (res.paths.length > 1) blocks.push({ type: 'table', id: 'paths', title: 'Các đường găng', columns: [{ key: 'k', label: '#', fmt: 'int', role: 'label' }, { key: 'p', label: 'Đường', fmt: 'text', role: 'label' }, { key: 'v', label: 'Phương sai', fmt: 'num' }],
		rows: res.paths.map((pth, k) => ({ cells: { k: k + 1, p: pth.join(' → '), v: pth.reduce((s, id) => s + res.rows[idx.get(id)].var, 0) } })) });
	blocks.push(...extra);
	if (gantt) blocks.push({ type: 'chart', kind: 'gantt', title: 'Biểu đồ Gantt (lịch sớm)', table: 'act', x: 'id', series: [{ name: 'Bắt đầu sớm', key: 'es' }, { name: 'Thời gian', key: 'te' }] });
	return { title, subtitle, blocks };
}
const pertSummary = (res, p, withVar) => {
	const out = [{ label: 'Thời gian dự án', value: res.duration, fmt: 'num', strong: true }, { label: 'Đường găng', value: res.path.join(' → ') }];
	if (res.paths.length > 1) out.push({ label: 'Số đường găng', value: res.paths.length, fmt: 'int' });
	if (withVar) out.push({ label: 'Độ lệch chuẩn', value: res.sd, fmt: 'num' });
	if (res.prob !== undefined) out.push({ label: `P(xong trước ${p.target})`, value: res.prob, fmt: 'pct' });
	return out;
};
const tgt = (p) => (blank(p.target) ? undefined : Number(p.target));

export const MORE = {
	models: [
		{ id: 'aoa', kind: 'aoa', table: 'aoa', name: 'PERT – mạng AOA (nút đầu, nút cuối)', params: [TARGET], dims: DIMS,
			hint: 'Mỗi hoạt động là một mũi tên từ nút đầu đến nút cuối. Hoạt động giả có thời gian 0.' },
		{ id: 'meansd', kind: 'given', table: 'meansd', name: 'PERT – cho thời gian trung bình và độ lệch chuẩn', params: [TARGET], dims: DIMS },
		{ id: 'meanvar', kind: 'given', table: 'meanvar', name: 'PERT – cho thời gian trung bình và phương sai', params: [TARGET], dims: DIMS },
		{ id: 'crash', kind: 'crash', table: 'crash', name: 'Rút ngắn dự án (crashing)', dims: DIMS,
			hint: 'Tìm cách rút ngắn với chi phí thấp nhất cho từng thời hạn, bằng quy hoạch tuyến tính.',
			params: [{ id: 'target', label: 'Thời hạn muốn đạt (trống = ngắn nhất có thể)', type: 'num', default: 13, optional: true }] },
		{ id: 'budget', kind: 'budget', table: 'budget', name: 'Ngân sách dự án theo lịch sớm / muộn', dims: DIMS, params: [],
			hint: 'Chi phí mỗi hoạt động được rải đều theo thời gian thực hiện.' },
	],

	aoa: {
		inputTable: (d, m, sample) => ({
			title: 'Dự án (AOA) – dữ liệu', sheet: 'Dự án AOA', hint: 'Nút đầu và nút cuối là số hoặc tên nút. Thêm hoạt động giả (thời gian 0) khi cần.',
			columns: [{ label: 'Hoạt động', fmt: 'text' }, { label: 'Nút đầu', fmt: 'text' }, { label: 'Nút cuối', fmt: 'text' }, { label: 'Lạc quan (a)', fmt: 'num' }, { label: 'Thường gặp (m)', fmt: 'num' }, { label: 'Bi quan (b)', fmt: 'num' }],
			rows: sample ? MIL_AOA : Array.from({ length: d.acts }, (_, i) => [actId(i), '', '', '', '', '']), firstInputCol: 1,
		}),
		parse({ rows }) {
			const acts = [];
			rows.forEach((r, i) => {
				if (r.every(isBlank)) return;
				const id = isBlank(r[0]) ? `HĐ${i + 1}` : String(r[0]).trim();
				if (isBlank(r[1]) || isBlank(r[2])) throw new InputError(`Hoạt động ${id} thiếu nút đầu hoặc nút cuối.`, i, isBlank(r[1]) ? 1 : 2);
				const a = toNum(r[3], i, 3, `a của ${id}`), mm = toNum(r[4], i, 4, `m của ${id}`), b = toNum(r[5], i, 5, `b của ${id}`);
				if (!(a <= mm && mm <= b)) throw new InputError(`Hoạt động ${id}: cần a ≤ m ≤ b.`, i, 3);
				acts.push({ id, start: String(r[1]).trim(), end: String(r[2]).trim(), a, m: mm, b, _row: i });
			});
			if (!acts.length) throw new InputError('Chưa có hoạt động nào.');
			if (new Set(acts.map((x) => x.id)).size !== acts.length) throw new InputError('Mã hoạt động bị trùng; đặt tên khác cho các hoạt động giả (ví dụ Giả1, Giả2).');
			return { acts: fromArrows(acts) };
		},
		solve: (inp, m, p) => { const r = runPert(inp.acts, tgt(p)); r._nodes = new Map(inp.acts.map((x) => [x.id, [x.start, x.end]])); return r; },
		summary: (res, m, p) => pertSummary(res, p, true),
		report(inp, res, m, p) {
			return schedule(res,
				[{ key: 'n1', label: 'Nút đầu', fmt: 'text', role: 'label' }, { key: 'n2', label: 'Nút cuối', fmt: 'text', role: 'label' }, { key: 'a', label: 'a', fmt: 'num', role: 'input' }, { key: 'm', label: 'm', fmt: 'num', role: 'input' }, { key: 'b', label: 'b', fmt: 'num', role: 'input' }],
				(x) => ({ n1: res._nodes.get(x.id)[0], n2: res._nodes.get(x.id)[1], a: x.a, m: x.m, b: x.b }),
				(x, i) => ({ f: (R) => `=(${R.cell('act', i, 'a')}+4*${R.cell('act', i, 'm')}+${R.cell('act', i, 'b')})/6`, v: x.te }),
				(x, i) => ({ f: (R) => `=((${R.cell('act', i, 'b')}-${R.cell('act', i, 'a')})/6)^2`, v: x.var }),
				{ title: 'PERT (mạng AOA) – kết quả', subtitle: 'Tiền nhiệm suy ra từ nút: hoạt động kết thúc tại nút đầu của hoạt động khác là tiền nhiệm của nó.', target: p.target });
		},
	},

	given: {
		inputTable(d, m, sample) {
			const sd = m.id === 'meansd';
			const rows = sample ? MIL.map((r) => [r[0], r[1], (r[2] + 4 * r[3] + r[4]) / 6, sd ? (r[4] - r[2]) / 6 : ((r[4] - r[2]) / 6) ** 2]) : Array.from({ length: d.acts }, (_, i) => [actId(i), '', '', '']);
			return {
				title: `Dự án – thời gian trung bình và ${sd ? 'độ lệch chuẩn' : 'phương sai'}`, sheet: 'Dự án',
				hint: 'Tiền nhiệm ghi mã hoạt động, cách nhau bởi dấu phẩy.',
				columns: [{ label: 'Mã', fmt: 'text' }, { label: 'Tiền nhiệm', fmt: 'text' }, { label: 'Thời gian trung bình', fmt: 'num' }, { label: sd ? 'Độ lệch chuẩn' : 'Phương sai', fmt: 'num' }],
				rows, firstInputCol: 2,
			};
		},
		parse({ rows }, m) {
			const sd = m.id === 'meansd';
			const acts = [];
			rows.forEach((r, i) => {
				if (r.every(isBlank)) return;
				if (isBlank(r[0])) throw new InputError('Hoạt động thiếu mã.', i, 0);
				const id = String(r[0]).trim();
				const te = toNum(r[2], i, 2, `Thời gian của ${id}`), s = toNum(r[3], i, 3, `${sd ? 'Độ lệch chuẩn' : 'Phương sai'} của ${id}`);
				if (te < 0 || s < 0) throw new InputError(`Hoạt động ${id}: giá trị không được âm.`, i, te < 0 ? 2 : 3);
				acts.push({ id, pre: splitPre(r[1]), te, var: sd ? s * s : s, sd: sd ? s : Math.sqrt(s), _row: i });
			});
			if (!acts.length) throw new InputError('Chưa có hoạt động nào.');
			checkPre(acts);
			return { acts };
		},
		solve: (inp, m, p) => runPert(inp.acts, tgt(p)),
		summary: (res, m, p) => pertSummary(res, p, true),
		report(inp, res, m, p) {
			const sd = m.id === 'meansd';
			const byId = new Map(inp.acts.map((x) => [x.id, x]));
			return schedule(res,
				[{ key: 'te', label: 'Thời gian trung bình', fmt: 'num', role: 'input' }, ...(sd ? [{ key: 'sd', label: 'Độ lệch chuẩn', fmt: 'num', role: 'input' }] : [])],
				(x) => (sd ? { sd: byId.get(x.id).sd } : {}),
				(x) => x.te,
				(x, i) => (sd ? { f: (R) => `=${R.cell('act', i, 'sd')}^2`, v: x.var } : x.var),
				{ title: 'PERT – kết quả', subtitle: `Thời gian trung bình và ${sd ? 'độ lệch chuẩn' : 'phương sai'} nhập trực tiếp.`, target: p.target });
		},
	},

	crash: {
		inputTable: (d, m, sample) => ({
			title: 'Rút ngắn dự án – dữ liệu', sheet: 'Rút ngắn dự án', hint: 'Thời gian rút ngắn là thời gian ngắn nhất có thể; chi phí rút ngắn là tổng chi phí khi làm trong thời gian đó.',
			columns: [{ label: 'Mã', fmt: 'text' }, { label: 'Tiền nhiệm', fmt: 'text' }, { label: 'Thời gian bình thường', fmt: 'num' }, { label: 'Thời gian rút ngắn', fmt: 'num' }, { label: 'Chi phí bình thường', fmt: 'money' }, { label: 'Chi phí rút ngắn', fmt: 'money' }],
			rows: sample ? CRASH : Array.from({ length: d.acts }, (_, i) => [actId(i), '', '', '', '', '']), firstInputCol: 2,
		}),
		parse({ rows }) {
			const acts = [];
			rows.forEach((r, i) => {
				if (r.every(isBlank)) return;
				if (isBlank(r[0])) throw new InputError('Hoạt động thiếu mã.', i, 0);
				const id = String(r[0]).trim();
				const x = { id, pre: splitPre(r[1]), normal: toNum(r[2], i, 2, `Thời gian bình thường của ${id}`), crash: toNum(r[3], i, 3, `Thời gian rút ngắn của ${id}`),
					normalCost: toNum(r[4], i, 4, `Chi phí bình thường của ${id}`), crashCost: toNum(r[5], i, 5, `Chi phí rút ngắn của ${id}`), _row: i };
				if (x.crash > x.normal) throw new InputError(`Hoạt động ${id}: thời gian rút ngắn phải ≤ thời gian bình thường.`, i, 3);
				if (x.crashCost < x.normalCost) throw new InputError(`Hoạt động ${id}: chi phí rút ngắn phải ≥ chi phí bình thường.`, i, 5);
				acts.push(x);
			});
			if (!acts.length) throw new InputError('Chưa có hoạt động nào.');
			checkPre(acts);
			return { acts };
		},
		solve(inp, m, p) {
			try { return crashCurve(inp.acts, p.target); } catch (e) { throw new InputError(e.message); }
		},
		summary: (res) => [
			{ label: `Rút xuống ${res.chosen.T}`, value: res.chosen.cost, fmt: 'money', strong: true },
			{ label: 'Thời gian bình thường', value: res.normalDuration, fmt: 'num' },
			{ label: 'Ngắn nhất có thể', value: res.crashDuration, fmt: 'num' },
			...(res.targetClamped ? [{ label: 'Lưu ý', value: 'Thời hạn đã được đưa về khoảng khả thi' }] : []),
		],
		report(inp, res) {
			const ch = res.chosen;
			return {
				title: 'Rút ngắn dự án – kết quả', subtitle: 'Chi phí rút ngắn mỗi đơn vị thời gian = (chi phí rút ngắn − chi phí bình thường) / (thời gian bình thường − thời gian rút ngắn).',
				blocks: [
					{ type: 'table', id: 'act', title: `Kế hoạch rút ngắn xuống ${ch.T}`, columns: [
						{ key: 'id', label: 'Mã', fmt: 'text', role: 'label' }, { key: 'pre', label: 'Tiền nhiệm', fmt: 'text', role: 'label' },
						{ key: 'n', label: 'Bình thường', fmt: 'num', role: 'input' }, { key: 'c', label: 'Rút ngắn', fmt: 'num', role: 'input' },
						{ key: 'nc', label: 'Chi phí bình thường', fmt: 'money', role: 'input' }, { key: 'cc', label: 'Chi phí rút ngắn', fmt: 'money', role: 'input' },
						{ key: 'max', label: 'Rút tối đa', fmt: 'num' }, { key: 'slope', label: 'Chi phí / đơn vị', fmt: 'money' },
						{ key: 'y', label: 'Rút thực tế', fmt: 'num' }, { key: 't', label: 'Thời gian mới', fmt: 'num' }, { key: 'k', label: 'Chi phí rút', fmt: 'money' },
					], rows: inp.acts.map((x, i) => ({ highlight: ch.y[i] > 1e-9, cells: {
						id: x.id, pre: x.pre.join(', '), n: x.normal, c: x.crash, nc: x.normalCost, cc: x.crashCost,
						max: { f: (R) => `=${R.cell('act', i, 'n')}-${R.cell('act', i, 'c')}`, v: res.maxCut[i] },
						slope: { f: (R) => `=IF(${R.cell('act', i, 'max')}=0,0,(${R.cell('act', i, 'cc')}-${R.cell('act', i, 'nc')})/${R.cell('act', i, 'max')})`, v: res.slope[i] },
						y: ch.y[i],
						t: { f: (R) => `=${R.cell('act', i, 'n')}-${R.cell('act', i, 'y')}` },
						k: { f: (R) => `=${R.cell('act', i, 'y')}*${R.cell('act', i, 'slope')}`, v: ch.y[i] * res.slope[i] },
					} })) },
					{ type: 'kv', id: 'sum', title: 'Tổng hợp', items: [
						{ key: 'T', label: 'Thời hạn đạt được', value: ch.T, fmt: 'num' },
						{ key: 'k', label: 'Chi phí rút ngắn', value: { f: (R) => `=SUM(${R.col('act', 'k')})`, v: ch.cost }, fmt: 'money' },
						{ key: 'n', label: 'Chi phí bình thường của dự án', value: { f: (R) => `=SUM(${R.col('act', 'nc')})`, v: res.normalCost }, fmt: 'money' },
						{ key: 'tot', label: 'Tổng chi phí dự án', value: { f: (R) => `=${R.kv('sum', 'k')}+${R.kv('sum', 'n')}`, v: ch.cost + res.normalCost }, fmt: 'money' },
					] },
					{ type: 'table', id: 'curve', title: 'Chi phí theo từng thời hạn', columns: [
						{ key: 'T', label: 'Thời hạn', fmt: 'num', role: 'label' }, { key: 'k', label: 'Chi phí rút ngắn', fmt: 'money' }, { key: 'tot', label: 'Tổng chi phí', fmt: 'money' },
					], rows: res.curve.map((c, j) => ({ highlight: c.T === ch.T, cells: { T: c.T, k: c.cost, tot: { f: (R) => `=${R.cell('curve', j, 'k')}+${R.kv('sum', 'n')}`, v: c.cost + res.normalCost } } })) },
					{ type: 'chart', kind: 'line', title: 'Chi phí rút ngắn theo thời hạn', table: 'curve', x: 'T', series: [{ name: 'Chi phí rút ngắn', key: 'k' }] },
				],
			};
		},
	},

	budget: {
		inputTable: (d, m, sample) => ({
			title: 'Ngân sách dự án – dữ liệu', sheet: 'Ngân sách dự án', hint: 'Chi phí là tổng chi phí của cả hoạt động.',
			columns: [{ label: 'Mã', fmt: 'text' }, { label: 'Tiền nhiệm', fmt: 'text' }, { label: 'Thời gian', fmt: 'num' }, { label: 'Tổng chi phí', fmt: 'money' }],
			rows: sample ? FOUNDRY : Array.from({ length: d.acts }, (_, i) => [actId(i), '', '', '']), firstInputCol: 2,
		}),
		parse({ rows }) {
			const acts = [];
			rows.forEach((r, i) => {
				if (r.every(isBlank)) return;
				if (isBlank(r[0])) throw new InputError('Hoạt động thiếu mã.', i, 0);
				const id = String(r[0]).trim();
				const t = toNum(r[2], i, 2, `Thời gian của ${id}`);
				acts.push({ id, pre: splitPre(r[1]), a: t, m: t, b: t, cost: toNum(r[3], i, 3, `Chi phí của ${id}`), _row: i });
			});
			if (!acts.length) throw new InputError('Chưa có hoạt động nào.');
			checkPre(acts);
			return { acts };
		},
		solve(inp) {
			const res = runPert(inp.acts);
			const costById = new Map(inp.acts.map((x) => [x.id, x.cost]));
			res._costs = res.rows.map((x) => costById.get(x.id));
			res.budget = budget(res.rows, res._costs);
			return res;
		},
		summary: (res) => [{ label: 'Tổng ngân sách', value: res.budget.total, fmt: 'money', strong: true }, { label: 'Thời gian dự án', value: res.duration, fmt: 'num' },
			{ label: 'Kỳ 1 – lịch sớm', value: res.budget.periods[0]?.es, fmt: 'money' }, { label: 'Kỳ 1 – lịch muộn', value: res.budget.periods[0]?.ls, fmt: 'money' }],
		report(inp, res) {
			const P = res.budget.periods;
			const base = schedule(res,
				[{ key: 'te', label: 'Thời gian', fmt: 'num', role: 'input' }, { key: 'cost', label: 'Tổng chi phí', fmt: 'money', role: 'input' }, { key: 'rate', label: 'Chi phí / kỳ', fmt: 'money' }],
				(x, i) => ({ cost: res._costs[i], rate: { f: (R) => `=IF(${R.cell('act', i, 'te')}=0,0,${R.cell('act', i, 'cost')}/${R.cell('act', i, 'te')})` } }),
				(x) => x.te, null,
				{ title: 'Ngân sách dự án – kết quả', subtitle: 'Ngân sách mỗi kỳ khi mọi hoạt động bắt đầu sớm nhất (ES) và muộn nhất (LS).', gantt: false });
			base.blocks.push(
				{ type: 'table', id: 'bud', title: 'Ngân sách theo kỳ', columns: [
					{ key: 'k', label: 'Kỳ', fmt: 'int', role: 'label' }, { key: 'es', label: 'Lịch sớm', fmt: 'money' }, { key: 'esc', label: 'Lũy kế (sớm)', fmt: 'money' },
					{ key: 'ls', label: 'Lịch muộn', fmt: 'money' }, { key: 'lsc', label: 'Lũy kế (muộn)', fmt: 'money' },
				], rows: P.map((q, j) => ({ cells: { k: q.k, es: q.es, ls: q.ls,
					esc: { f: (R) => (j ? `=${R.cell('bud', j - 1, 'esc')}+${R.cell('bud', j, 'es')}` : `=${R.cell('bud', 0, 'es')}`), v: q.esCum },
					lsc: { f: (R) => (j ? `=${R.cell('bud', j - 1, 'lsc')}+${R.cell('bud', j, 'ls')}` : `=${R.cell('bud', 0, 'ls')}`), v: q.lsCum },
				} })) },
				{ type: 'chart', kind: 'line', title: 'Ngân sách lũy kế', table: 'bud', x: 'k', series: [{ name: 'Lịch sớm', key: 'esc' }, { name: 'Lịch muộn', key: 'lsc' }] },
			);
			return base;
		},
	},
};
