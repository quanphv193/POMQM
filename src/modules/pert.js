import { pert } from '../../lib/pert.js';
import { MORE } from './pert-more.js';
import { InputError } from '../core/errors.js';
import { toNum, isBlank } from './common.js';

// Milwaukee Paper Manufacturing (Heizer & Render)
const SAMPLE = [['A', '', 1, 2, 3], ['B', '', 2, 3, 4], ['C', 'A', 1, 2, 3], ['D', 'A, B', 2, 4, 6], ['E', 'C', 1, 4, 7], ['F', 'C', 1, 2, 9], ['G', 'D, E', 3, 4, 11], ['H', 'F, G', 1, 2, 3]];

const PERT_BASE = {
	id: 'pert',
	name: 'Quản lý dự án (PERT/CPM)',
	group: 'Dự án',
	keywords: 'pert cpm critical path duong gang du an project gantt',
	models: [
		{ id: 'three', name: 'PERT – 3 ước lượng thời gian (a, m, b)', params: [{ id: 'target', label: 'Thời hạn mục tiêu (để tính xác suất, tuỳ chọn)', type: 'num', default: '', optional: true }] },
		{ id: 'one', name: 'CPM – 1 thời gian', params: [] },
	],
	dims: [{ id: 'acts', label: 'Số hoạt động', default: 8, min: 1, max: 300 }],
	inputTable(dims, model, sample) {
		const three = model.id === 'three';
		const rows = sample ? SAMPLE.map((r) => (three ? r : [r[0], r[1], (r[2] + 4 * r[3] + r[4]) / 6])) : Array.from({ length: dims.acts }, (_, i) => [String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : ''), '', ...(three ? ['', '', ''] : [''])]);
		return {
			title: 'Dự án – dữ liệu', hint: 'Tiền nhiệm ghi mã hoạt động, cách nhau bởi dấu phẩy. Để trống nếu hoạt động bắt đầu ngay.',
			columns: [{ label: 'Mã', fmt: 'text' }, { label: 'Tiền nhiệm', fmt: 'text' }, ...(three ? [{ label: 'Lạc quan (a)', fmt: 'num' }, { label: 'Thường gặp (m)', fmt: 'num' }, { label: 'Bi quan (b)', fmt: 'num' }] : [{ label: 'Thời gian', fmt: 'num' }])],
			rows, firstInputCol: 2,
		};
	},
	parse({ rows }, model) {
		const three = model.id === 'three';
		const acts = [];
		rows.forEach((r, i) => {
			if (r.every(isBlank)) return;
			if (isBlank(r[0])) throw new InputError('Hoạt động thiếu mã.', i, 0);
			const id = String(r[0]).trim();
			const a = toNum(r[2], i, 2, `Thời gian của ${id}`);
			const m = three ? toNum(r[3], i, 3, `Thời gian m của ${id}`) : a;
			const b = three ? toNum(r[4], i, 4, `Thời gian b của ${id}`) : a;
			if (!(a <= m && m <= b)) throw new InputError(`Hoạt động ${id}: cần a ≤ m ≤ b.`, i, 2);
			acts.push({ id, pre: String(r[1] ?? '').split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean), a, m, b, _row: i });
		});
		if (!acts.length) throw new InputError('Chưa có hoạt động nào.');
		const ids = new Set(acts.map((x) => x.id));
		for (const x of acts) for (const p of x.pre) if (!ids.has(p)) throw new InputError(`Hoạt động ${x.id} có tiền nhiệm “${p}” không có trong bảng.`, x._row, 1);
		return { acts };
	},
	solve(input, model, p) {
		const t = p.target === '' || p.target === undefined || p.target === null ? undefined : Number(p.target);
		return pert(input.acts, t);
	},
	summary(res, model, p) {
		const out = [{ label: 'Thời gian dự án', value: res.duration, fmt: 'num', strong: true }, { label: 'Đường găng', value: res.path.join(' → ') }];
		if (model.id === 'three') out.push({ label: 'Độ lệch chuẩn', value: res.sd, fmt: 'num' });
		if (res.prob !== undefined) out.push({ label: `P(xong trước ${p.target})`, value: res.prob, fmt: 'pct' });
		return out;
	},
	report(input, res, model, p) {
		const three = model.id === 'three';
		const idx = new Map(res.rows.map((x, i) => [x.id, i]));
		const succ = new Map(res.rows.map((x) => [x.id, []]));
		res.rows.forEach((x) => x.pre.forEach((q) => succ.get(q).push(x.id)));
		const cell = (R, id, key) => R.cell('act', idx.get(id), key);
		const rows = res.rows.map((x, i) => ({
			highlight: x.critical,
			cells: {
				id: x.id, pre: x.pre.join(', '),
				...(three ? { a: x.a, m: x.m, b: x.b,
					te: { f: (R) => `=(${R.cell('act', i, 'a')}+4*${R.cell('act', i, 'm')}+${R.cell('act', i, 'b')})/6`, v: x.te },
					var: { f: (R) => `=((${R.cell('act', i, 'b')}-${R.cell('act', i, 'a')})/6)^2`, v: x.var } } : { te: x.te }),
				es: { f: (R) => (x.pre.length ? `=MAX(${x.pre.map((q) => cell(R, q, 'ef')).join(',')})` : '=0'), v: x.es },
				ef: { f: (R) => `=${R.cell('act', i, 'es')}+${R.cell('act', i, 'te')}`, v: x.ef },
				lf: { f: (R) => (succ.get(x.id).length ? `=MIN(${succ.get(x.id).map((s) => cell(R, s, 'ls')).join(',')})` : `=${R.kv('res', 'dur')}`), v: x.lf },
				ls: { f: (R) => `=${R.cell('act', i, 'lf')}-${R.cell('act', i, 'te')}`, v: x.ls },
				slack: { f: (R) => `=${R.cell('act', i, 'ls')}-${R.cell('act', i, 'es')}`, v: x.slack },
				crit: { f: (R) => `=IF(ABS(${R.cell('act', i, 'slack')})<1E-9,"Có","")` },
			},
		}));
		const cols = [
			{ key: 'id', label: 'Mã', fmt: 'text', role: 'label' }, { key: 'pre', label: 'Tiền nhiệm', fmt: 'text', role: 'label' },
			...(three ? [{ key: 'a', label: 'a', fmt: 'num', role: 'input' }, { key: 'm', label: 'm', fmt: 'num', role: 'input' }, { key: 'b', label: 'b', fmt: 'num', role: 'input' },
				{ key: 'te', label: 'Thời gian kỳ vọng', fmt: 'num' }, { key: 'var', label: 'Phương sai', fmt: 'num' }] : [{ key: 'te', label: 'Thời gian', fmt: 'num', role: 'input' }]),
			{ key: 'es', label: 'ES', fmt: 'num' }, { key: 'ef', label: 'EF', fmt: 'num' }, { key: 'ls', label: 'LS', fmt: 'num' }, { key: 'lf', label: 'LF', fmt: 'num' },
			{ key: 'slack', label: 'Thời gian dự trữ', fmt: 'num' }, { key: 'crit', label: 'Găng?', fmt: 'text' },
		];
		const items = [
			{ key: 'dur', label: 'Thời gian hoàn thành dự án', value: { f: (R) => `=MAX(${R.col('act', 'ef')})`, v: res.duration }, fmt: 'num' },
			{ key: 'path', label: 'Đường găng', value: res.path.join(' → '), role: 'label' },
		];
		if (three) {
			items.push(
				{ key: 'var', label: 'Phương sai đường găng', value: { f: (R) => `=SUM(${res.path.map((id) => cell(R, id, 'var')).join(',')})`, v: res.variance }, fmt: 'num' },
				{ key: 'sd', label: 'Độ lệch chuẩn', value: { f: (R) => `=SQRT(${R.kv('res', 'var')})`, v: res.sd }, fmt: 'num' },
				{ key: 'T', label: 'Thời hạn mục tiêu (nhập để tính)', value: p.target === '' || p.target === undefined ? '' : Number(p.target), fmt: 'num', role: 'input' },
				{ key: 'prob', label: 'Xác suất hoàn thành trước thời hạn', value: { f: (R) => `=IF(${R.kv('res', 'T')}="","",IFERROR(NORM.S.DIST((${R.kv('res', 'T')}-${R.kv('res', 'dur')})/${R.kv('res', 'sd')},TRUE),IF(${R.kv('res', 'T')}>=${R.kv('res', 'dur')},1,0)))`, v: res.prob }, fmt: 'pct' },
			);
		}
		return {
			title: three ? 'PERT – kết quả' : 'CPM – kết quả',
			subtitle: 'Dòng tô vàng là hoạt động găng. ES/EF/LS/LF là công thức theo tiền nhiệm.',
			blocks: [
				{ type: 'table', id: 'act', title: 'Lịch hoạt động', columns: cols, rows },
				{ type: 'kv', id: 'res', title: 'Tổng hợp', items },
				{ type: 'chart', kind: 'gantt', title: 'Biểu đồ Gantt (lịch sớm)', table: 'act', x: 'id', series: [{ name: 'Bắt đầu sớm', key: 'es' }, { name: 'Thời gian', key: 'te' }] },
			],
		};
	},
};

export default {
	id: 'pert',
	name: 'Quản lý dự án (PERT/CPM)',
	group: 'Dự án',
	keywords: PERT_BASE.keywords + ' aoa crashing rut ngan ngan sach budget phuong sai do lech chuan',
	models: [
		{ ...PERT_BASE.models[0], kind: 'base', table: 'three', dims: PERT_BASE.dims, params: [{ ...PERT_BASE.models[0].params[0], default: 16 }] },
		{ ...PERT_BASE.models[1], kind: 'base', table: 'one', dims: PERT_BASE.dims },
		...MORE.models,
	],
	inputTable(d, m, sample) { return m.kind === 'base' ? PERT_BASE.inputTable(d, m, sample) : MORE[m.kind].inputTable(d, m, sample); },
	parse(t, m, p) { return m.kind === 'base' ? PERT_BASE.parse(t, m, p) : MORE[m.kind].parse(t, m, p); },
	solve(i, m, p) { return m.kind === 'base' ? PERT_BASE.solve(i, m, p) : MORE[m.kind].solve(i, m, p); },
	summary(r, m, p) { return m.kind === 'base' ? PERT_BASE.summary(r, m, p) : MORE[m.kind].summary(r, m, p); },
	report(i, r, m, p) { return m.kind === 'base' ? PERT_BASE.report(i, r, m, p) : MORE[m.kind].report(i, r, m, p); },
};
