import * as Q from '../../lib/queue.js';
import { scalarModel } from './param.js';

const RATE = [
	{ key: 'l', label: 'Tốc độ đến λ (khách / đơn vị thời gian)', default: 2, positive: true },
	{ key: 'm', label: 'Tốc độ phục vụ μ mỗi quầy (khách / đơn vị thời gian)', default: 3, positive: true },
];
const COST = [
	{ key: 'cw', label: 'Chi phí chờ mỗi khách mỗi đơn vị thời gian (tuỳ chọn)', default: 10, min: 0, optional: true },
	{ key: 'cs', label: 'Chi phí mỗi quầy mỗi đơn vị thời gian (tuỳ chọn)', default: 6, min: 0, optional: true },
];
const withCost = (items) => [...items, ...COST];

// Standard outputs shared by all models. Formulas are given where closed forms exist.
const std = (extra = {}) => [
	{ key: 'rho', label: 'Mức sử dụng quầy ρ', fmt: 'pct' },
	{ key: 'P0', label: 'Xác suất hệ thống rỗng P₀', fmt: 'pct' },
	{ key: 'L', label: 'Số khách trung bình trong hệ thống L', strong: true },
	{ key: 'Lq', label: 'Số khách trung bình trong hàng đợi Lq' },
	{ key: 'W', label: 'Thời gian trung bình trong hệ thống W', strong: true },
	{ key: 'Wq', label: 'Thời gian chờ trung bình Wq' },
	...Object.entries(extra).map(([key, o]) => ({ key, ...o })),
	{ key: 'totalCost', label: 'Tổng chi phí mỗi đơn vị thời gian', fmt: 'num' },
];
const costOut = (res, v, s) => {
	if (v.cw === null || v.cs === null || v.cw === undefined) return {};
	return { totalCost: v.cw * res.L + v.cs * s };
};

function make(id, title, sheet, hint, items, compute, extraOuts, closed) {
	return scalarModel({
		title, sheet, hint, items: withCost(items),
		compute: (v, p) => { const r = compute(v); return { ...r, ...costOut(r, v, v.s ?? 1) }; },
		outputs: std(extraOuts).map((o) => {
			const base = closed && closed[o.key] ? { ...o, f: closed[o.key] } : o;
			if (o.key === 'totalCost') return { ...base, f: (I, O) => `=${I('cw')}*${O('L')}+${I('cs')}*${items.some((i) => i.key === 's') ? I('s') : '1'}` };
			return base;
		}),
		tables: null,
	});
}

const mm1f = {
	rho: (I) => `=${I('l')}/${I('m')}`, P0: (I) => `=1-${I('l')}/${I('m')}`,
	L: (I) => `=${I('l')}/(${I('m')}-${I('l')})`, Lq: (I) => `=${I('l')}^2/(${I('m')}*(${I('m')}-${I('l')}))`,
	W: (I) => `=1/(${I('m')}-${I('l')})`, Wq: (I) => `=${I('l')}/(${I('m')}*(${I('m')}-${I('l')}))`,
};
const lineFrom = (nameL, nameLq) => ({ W: (I, O) => `=${O('L')}/${I('l')}`, Wq: (I, O) => `=${O('Lq')}/${I('l')}`, ...(nameL || {}), ...(nameLq || {}) });

const MODELS = {
	mm1: make('mm1', 'Hàng đợi M/M/1 – dữ liệu', 'M-M-1', 'Đến theo Poisson, phục vụ theo phân phối mũ, 1 quầy.', RATE, (v) => Q.mm1(v.l, v.m), {}, mm1f),
	md1: make('md1', 'Hàng đợi M/D/1 – dữ liệu', 'M-D-1', 'Đến theo Poisson, thời gian phục vụ cố định, 1 quầy.', RATE, (v) => Q.md1(v.l, v.m), {},
		{ rho: mm1f.rho, P0: mm1f.P0, Lq: (I) => `=${I('l')}^2/(2*${I('m')}*(${I('m')}-${I('l')}))`, ...lineFrom({ L: (I, O) => `=${O('Lq')}+${I('l')}/${I('m')}`, W: (I, O) => `=${O('Wq')}+1/${I('m')}` }), Wq: (I, O) => `=${O('Lq')}/${I('l')}` }),
	mg1: make('mg1', 'Hàng đợi M/G/1 – dữ liệu', 'M-G-1', 'Thời gian phục vụ có phân phối tổng quát; nhập độ lệch chuẩn σ của thời gian phục vụ.',
		[...RATE, { key: 'sd', label: 'Độ lệch chuẩn thời gian phục vụ σ', default: 0.2, min: 0 }], (v) => Q.mg1(v.l, v.m, v.sd), {},
		{ rho: mm1f.rho, P0: mm1f.P0, Lq: (I) => `=(${I('l')}^2*${I('sd')}^2+(${I('l')}/${I('m')})^2)/(2*(1-${I('l')}/${I('m')}))`, L: (I, O) => `=${O('Lq')}+${I('l')}/${I('m')}`, Wq: (I, O) => `=${O('Lq')}/${I('l')}`, W: (I, O) => `=${O('Wq')}+1/${I('m')}` }),
	mek1: make('mek1', 'Hàng đợi M/Ek/1 – dữ liệu', 'M-Ek-1', 'Thời gian phục vụ theo phân phối Erlang-k, 1 quầy.',
		[...RATE, { key: 'k', label: 'Tham số hình dạng Erlang k', default: 2, min: 1 }], (v) => Q.mek1(v.l, v.m, v.k), {},
		{ rho: mm1f.rho, P0: mm1f.P0, Lq: (I) => `=(1+${I('k')})/(2*${I('k')})*${I('l')}^2/(${I('m')}*(${I('m')}-${I('l')}))`, L: (I, O) => `=${O('Lq')}+${I('l')}/${I('m')}`, Wq: (I, O) => `=${O('Lq')}/${I('l')}`, W: (I, O) => `=${O('Wq')}+1/${I('m')}` }),
	mms: make('mms', 'Hàng đợi M/M/s – dữ liệu', 'M-M-s', 'Đến theo Poisson, phục vụ theo phân phối mũ, s quầy giống nhau.',
		[...RATE, { key: 's', label: 'Số quầy phục vụ s', default: 2, min: 1 }], (v) => Q.mms(v.l, v.m, Math.round(v.s)), { Pw: { label: 'Xác suất khách phải chờ' } },
		{ rho: (I) => `=${I('l')}/(${I('s')}*${I('m')})`, W: (I, O) => `=${O('L')}/${I('l')}`, Wq: (I, O) => `=${O('Lq')}/${I('l')}` }),
	mm1k: make('mm1k', 'Hàng đợi M/M/1 – hệ thống hữu hạn', 'M-M-1-K', 'Hệ thống chứa tối đa K khách (kể cả người đang được phục vụ); khách đến khi đầy sẽ bị từ chối.',
		[...RATE, { key: 'K', label: 'Sức chứa tối đa của hệ thống K', default: 5, min: 1 }], (v) => Q.finiteQueue(v.l, v.m, 1, Math.round(v.K)), { Pblock: { label: 'Xác suất bị từ chối', fmt: 'pct' }, lamEff: { label: 'Tốc độ đến hiệu dụng' } }, {}),
	mmsk: make('mmsk', 'Hàng đợi M/M/s – hệ thống hữu hạn', 'M-M-s-K', 'Như M/M/s nhưng hệ thống chứa tối đa K khách.',
		[...RATE, { key: 's', label: 'Số quầy phục vụ s', default: 2, min: 1 }, { key: 'K', label: 'Sức chứa tối đa của hệ thống K', default: 6, min: 1 }], (v) => Q.finiteQueue(v.l, v.m, Math.round(v.s), Math.round(v.K)),
		{ Pblock: { label: 'Xác suất bị từ chối', fmt: 'pct' }, lamEff: { label: 'Tốc độ đến hiệu dụng' } }, {}),
	mm1n: make('mm1n', 'Hàng đợi M/M/1 – nguồn khách hữu hạn', 'M-M-1-N', 'Có N khách hàng tiềm năng; mỗi người rảnh đến với tốc độ λ.',
		[{ key: 'l', label: 'Tốc độ đến λ của mỗi khách rảnh', default: 0.1, positive: true }, RATE[1], { key: 'N', label: 'Số khách hàng tiềm năng N', default: 5, min: 1 }], (v) => Q.finitePop(v.l, v.m, 1, Math.round(v.N)), { lamEff: { label: 'Tốc độ đến hiệu dụng' } }, {}),
	mmsn: make('mmsn', 'Hàng đợi M/M/s – nguồn khách hữu hạn', 'M-M-s-N', 'Như trên nhưng có s quầy.',
		[{ key: 'l', label: 'Tốc độ đến λ của mỗi khách rảnh', default: 0.1, positive: true }, RATE[1], { key: 's', label: 'Số quầy phục vụ s', default: 2, min: 1 }, { key: 'N', label: 'Số khách hàng tiềm năng N', default: 5, min: 1 }],
		(v) => Q.finitePop(v.l, v.m, Math.round(v.s), Math.round(v.N)), { lamEff: { label: 'Tốc độ đến hiệu dụng' } }, {}),
};
// finite models: waiting time uses the effective arrival rate, so drop the plain L/λ formulas
for (const id of ['mm1k', 'mmsk', 'mm1n', 'mmsn']) MODELS[id].report = ((orig) => (inp, res, m, p) => { const r = orig(inp, res, m, p); r.subtitle = 'Tính theo phương trình cân bằng của quá trình sinh–tử; các ô là giá trị tính sẵn, bấm Giải lại sau khi sửa dữ liệu.'; return r; })(MODELS[id].report);

const SPEC = [
	['mm1', 'M/M/1 – 1 quầy, phục vụ theo phân phối mũ', 'Một quầy'], ['md1', 'M/D/1 – 1 quầy, thời gian phục vụ cố định', 'Một quầy'],
	['mg1', 'M/G/1 – 1 quầy, phục vụ phân phối tổng quát', 'Một quầy'], ['mek1', 'M/Ek/1 – 1 quầy, phục vụ Erlang-k', 'Một quầy'],
	['mms', 'M/M/s – nhiều quầy', 'Nhiều quầy'],
	['mm1k', 'M/M/1 – hệ thống hữu hạn', 'Hữu hạn'], ['mmsk', 'M/M/s – hệ thống hữu hạn', 'Hữu hạn'],
	['mm1n', 'M/M/1 – nguồn khách hữu hạn', 'Hữu hạn'], ['mmsn', 'M/M/s – nguồn khách hữu hạn', 'Hữu hạn'],
];

export default {
	id: 'queue',
	name: 'Hàng đợi',
	group: 'Tồn kho & vận hành',
	keywords: 'waiting lines queue mm1 mms md1 mg1 erlang finite population hang doi cho phuc vu',
	models: SPEC.map(([id, name, group]) => ({ id, name, group, table: id, params: [] })),
	inputTable: (d, m, s) => MODELS[m.id].inputTable(d, m, s),
	parse: (t, m, p) => MODELS[m.id].parse(t, m, p),
	solve: (i, m, p) => MODELS[m.id].solve(i, m, p),
	summary: (r, m, p) => MODELS[m.id].summary(r, m, p),
	report: (i, r, m, p) => MODELS[m.id].report(i, r, m, p),
};
