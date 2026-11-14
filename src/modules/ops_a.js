import * as A from '../../lib/ops_a.js';
import { normInv } from '../../lib/stats.js';
import { scalarModel } from './param.js';
import { InputError } from '../core/errors.js';
import { toNum, isBlank } from './common.js';

const blank = (n, w) => Array.from({ length: n }, () => Array(w).fill(''));
const rowsOf = (rows) => rows.map((r, i) => ({ r, i })).filter(({ r }) => r.some((v) => !isBlank(v)));
const mk = (mod, IMPL, extra = {}) => ({
	...mod,
	inputTable: (d, m, s) => IMPL[m.id].inputTable(d, m, s), parse: (t, m, p) => IMPL[m.id].parse(t, m, p),
	solve: (i, m, p) => IMPL[m.id].solve(i, m, p), summary: (r, m, p) => IMPL[m.id].summary(r, m, p), report: (i, r, m, p) => IMPL[m.id].report(i, r, m, p), ...extra,
});

// =================== Investment ===================
const flowsTable = (id) => ({
	inputTable: (d, m, sample) => ({
		title: id === 'npv' ? 'Giá trị hiện tại ròng – dữ liệu' : 'Tỷ suất hoàn vốn nội bộ – dữ liệu', sheet: id === 'npv' ? 'NPV' : 'IRR', hint: 'Kỳ 0 là khoản đầu tư ban đầu (âm); các kỳ sau là dòng tiền thu về.',
		columns: [{ label: 'Kỳ', fmt: 'int' }, { label: 'Dòng tiền', fmt: 'money' }],
		rows: sample ? [-1000, 300, 400, 500, 600].map((v, t) => [t, v]) : Array.from({ length: d.rows }, (_, t) => [t, '']), firstInputCol: 1,
	}),
	parse({ rows }) {
		const data = rowsOf(rows);
		if (data.length < 2) throw new InputError('Cần ít nhất 2 kỳ.');
		return { flows: data.map(({ r, i }) => toNum(r[1], i, 1, `Dòng tiền kỳ ${i}`)) };
	},
	solve(inp, m, p) {
		try { return id === 'npv' ? { npv: A.npv(Number(p.rate), inp.flows), rate: Number(p.rate) } : { irr: A.irr(inp.flows) }; } catch (e) { throw new InputError(e.message); }
	},
	summary: (res) => (res.npv !== undefined ? [{ label: 'NPV', value: res.npv, fmt: 'money', strong: true }, { label: res.npv >= 0 ? 'Kết luận' : 'Kết luận', value: res.npv >= 0 ? 'Nên đầu tư (NPV ≥ 0)' : 'Không nên đầu tư (NPV < 0)' }] : [{ label: 'IRR', value: res.irr, fmt: 'pct', strong: true }]),
	report(inp, res, m, p) {
		const N = inp.flows.length;
		const rate = (R) => (id === 'npv' ? R.kv('p', 'rate') : R.kv('r', 'irr'));
		const blocks = [];
		if (id === 'npv') blocks.push({ type: 'kv', id: 'p', title: 'Tham số', items: [{ key: 'rate', label: 'Lãi suất chiết khấu', value: res.rate, fmt: 'pct', role: 'input' }] });
		blocks.push({ type: 'table', id: 't', title: 'Dòng tiền', columns: [{ key: 'k', label: 'Kỳ', fmt: 'int', role: 'label' }, { key: 'cf', label: 'Dòng tiền', fmt: 'money', role: 'input' }, { key: 'df', label: 'Hệ số chiết khấu', fmt: 'prob' }, { key: 'pv', label: 'Giá trị hiện tại', fmt: 'money' }],
			rows: inp.flows.map((cf, t) => ({ cells: { k: t, cf, df: { f: (R) => `=1/(1+${rate(R)})^${R.cell('t', t, 'k')}`, v: id === 'npv' ? 1 / (1 + res.rate) ** t : 1 / (1 + res.irr) ** t }, pv: { f: (R) => `=${R.cell('t', t, 'cf')}*${R.cell('t', t, 'df')}`, v: id === 'npv' ? cf / (1 + res.rate) ** t : cf / (1 + res.irr) ** t } } })) });
		if (id === 'npv') blocks.push({ type: 'kv', id: 'r', title: 'Kết quả', items: [{ key: 'npv', label: 'NPV', value: { f: (R) => `=SUM(${R.col('t', 'pv')})`, v: res.npv }, fmt: 'money' }, { key: 'chk', label: 'Kiểm tra bằng hàm NPV của Excel', value: { f: (R) => `=${R.cell('t', 0, 'cf')}+NPV(${R.kv('p', 'rate')},${R.col('t', 'cf', 1, N - 1)})`, v: res.npv }, fmt: 'money' }] });
		else blocks.push({ type: 'kv', id: 'r', title: 'Kết quả', items: [{ key: 'irr', label: 'IRR', value: { f: (R) => `=IRR(${R.col('t', 'cf')},0.1)`, v: res.irr }, fmt: 'pct' }, { key: 'npv0', label: 'NPV tại IRR (phải ≈ 0)', value: { f: (R) => `=SUM(${R.col('t', 'pv')})`, v: 0 }, fmt: 'num' }] });
		return { title: id === 'npv' ? 'Giá trị hiện tại ròng – kết quả' : 'Tỷ suất hoàn vốn nội bộ – kết quả', subtitle: id === 'npv' ? 'NPV = Σ dòng tiền / (1 + lãi suất)^kỳ.' : 'IRR là lãi suất làm NPV bằng 0.', blocks };
	},
});
const flowM = { npv: flowsTable('npv'), irr: flowsTable('irr') };
export const invest = mk({
	id: 'invest', name: 'Đầu tư (NPV, IRR)', group: 'Tài chính', keywords: 'npv irr net present value internal rate of return dau tu gia tri hien tai ty suat hoan von',
	models: [
		{ id: 'npv', name: 'Giá trị hiện tại ròng (NPV)', table: 'flows', dims: [{ id: 'rows', label: 'Số kỳ (gồm kỳ 0)', default: 6, min: 2, max: 100 }], params: [{ id: 'rate', label: 'Lãi suất chiết khấu', type: 'num', default: 0.1, step: 0.01 }] },
		{ id: 'irr', name: 'Tỷ suất hoàn vốn nội bộ (IRR)', table: 'flows', dims: [{ id: 'rows', label: 'Số kỳ (gồm kỳ 0)', default: 6, min: 2, max: 100 }], params: [] },
	],
}, flowM);

// =================== Game theory ===================
const game = {
	inputTable: (d, m, sample) => ({
		title: 'Trò chơi tổng bằng 0 – dữ liệu', sheet: 'Trò chơi', hint: 'Ma trận lợi ích cho người chơi hàng (hàng chọn chiến lược theo dòng, người chơi cột chọn theo cột). Người chơi hàng muốn lớn nhất.',
		columns: [{ label: 'Hàng \\ Cột', fmt: 'text' }, ...(sample ? ['B1', 'B2', 'B3'] : Array.from({ length: d.cols }, (_, j) => `B${j + 1}`)).map((l) => ({ label: l, fmt: 'num' }))],
		rows: sample ? [['A1', 4, 2, 5], ['A2', 1, 3, 2], ['A3', 3, 1, 4]] : Array.from({ length: d.rows }, (_, i) => [`A${i + 1}`, ...Array(d.cols).fill('')]), firstInputCol: 1,
	}),
	parse({ header, rows }) {
		const data = rowsOf(rows);
		if (!data.length) throw new InputError('Chưa có dữ liệu.');
		const cols = header.slice(1).map((h, j) => (isBlank(h) ? `B${j + 1}` : String(h)));
		return { rowsN: data.map(({ r, i }) => (isBlank(r[0]) ? `A${i + 1}` : String(r[0]))), cols, A: data.map(({ r, i }) => cols.map((_, j) => toNum(r[1 + j], i, 1 + j, `Ô (${r[0] || i + 1}, ${cols[j]})`))) };
	},
	solve: (inp) => A.solveGame(inp.A),
	summary: (res) => [{ label: res.saddle ? 'Có điểm yên ngựa' : 'Chiến lược hỗn hợp', value: res.saddle ? 'Chiến lược thuần' : 'Cần chiến lược hỗn hợp', strong: true }, { label: 'Giá trị trò chơi', value: res.value, fmt: 'num' }],
	report(inp, res) {
		const m = inp.A.length, n = inp.cols.length, ck = inp.cols.map((_, j) => 'c' + j);
		return {
			title: 'Trò chơi tổng bằng 0 – kết quả', subtitle: 'Maximin của người chơi hàng và minimax của người chơi cột; nếu bằng nhau là có điểm yên ngựa, ngược lại giải chiến lược hỗn hợp bằng quy hoạch tuyến tính.',
			blocks: [
				{ type: 'table', id: 'a', title: 'Ma trận lợi ích', columns: [{ key: 'n', label: 'Hàng \\ Cột', fmt: 'text', role: 'label' }, ...inp.cols.map((c, j) => ({ key: ck[j], label: c, fmt: 'num', role: 'input' })), { key: 'min', label: 'Nhỏ nhất theo hàng', fmt: 'num' }, { key: 'p', label: 'Xác suất chọn (hàng)', fmt: 'pct' }],
					rows: [...inp.rowsN.map((nm, i) => ({ cells: { n: nm, ...Object.fromEntries(inp.A[i].map((v, j) => [ck[j], v])), min: { f: (R) => `=MIN(${R.row('a', i, ck[0], ck[n - 1])})`, v: res.rowMin[i] }, p: res.rowStrategy[i] } })),
						{ cells: { n: 'Lớn nhất theo cột', ...Object.fromEntries(res.colMax.map((v, j) => [ck[j], { f: (R) => `=MAX(${R.col('a', ck[j], 0, m - 1)})`, v }])), min: '', p: '' } },
						{ cells: { n: 'Xác suất chọn (cột)', ...Object.fromEntries(res.colStrategy.map((v, j) => [ck[j], v])), min: '', p: '' } }] },
				{ type: 'kv', id: 'r', title: 'Kết quả', items: [
					{ key: 'mm', label: 'Maximin (hàng)', value: { f: (R) => `=MAX(${R.col('a', 'min', 0, m - 1)})`, v: res.maximin }, fmt: 'num' },
					{ key: 'mx', label: 'Minimax (cột)', value: { f: (R) => `=MIN(${R.row('a', m, ck[0], ck[n - 1])})`, v: res.minimax }, fmt: 'num' },
					{ key: 'sd', label: 'Điểm yên ngựa?', value: { f: (R) => `=IF(ABS(${R.kv('r', 'mm')}-${R.kv('r', 'mx')})<0.000000001,"Có","Không")` }, role: 'label' },
					{ key: 'v', label: 'Giá trị trò chơi', value: res.value, fmt: 'num' },
				] },
			],
		};
	},
};
export const gameModule = mk({ id: 'game', name: 'Lý thuyết trò chơi', group: 'Ra quyết định', keywords: 'game theory zero sum saddle mixed strategy tro choi chien luoc yen ngua',
	models: [{ id: 'game', name: 'Trò chơi tổng bằng 0 (điểm yên ngựa, chiến lược hỗn hợp)', table: 'game', dims: [{ id: 'rows', label: 'Số chiến lược hàng', default: 3, min: 2, max: 20 }, { id: 'cols', label: 'Số chiến lược cột', default: 3, min: 2, max: 20 }], params: [] }] }, { game });

// =================== Markov ===================
const markovM = {
	inputTable(d, m, sample) {
		const n = sample ? 3 : d.n, names = Array.from({ length: n }, (_, j) => `S${j + 1}`);
		return { title: 'Chuỗi Markov – dữ liệu', sheet: 'Markov', hint: 'Ô (i, j) là xác suất chuyển từ trạng thái i sang j; mỗi hàng có tổng bằng 1. Cột cuối là phân phối ban đầu.',
			columns: [{ label: 'Từ \\ Đến', fmt: 'text' }, ...names.map((l) => ({ label: l, fmt: 'num' })), { label: 'Ban đầu', fmt: 'num' }],
			rows: sample ? [['S1', 0.8, 0.1, 0.1, 1], ['S2', 0.2, 0.7, 0.1, 0], ['S3', 0.3, 0.2, 0.5, 0]] : names.map((nm) => [nm, ...Array(n).fill(''), '']), firstInputCol: 1 };
	},
	parse({ header, rows }) {
		const n = header.length - 2;
		const data = rowsOf(rows);
		if (n < 2 || data.length !== n) throw new InputError('Ma trận chuyển phải vuông (số hàng bằng số cột trạng thái).');
		return { names: data.map(({ r, i }) => (isBlank(r[0]) ? `S${i + 1}` : String(r[0]))), P: data.map(({ r, i }) => Array.from({ length: n }, (_, j) => toNum(r[1 + j], i, 1 + j, `Xác suất (${r[0] || i + 1}, ${j + 1})`))),
			p0: data.map(({ r, i }) => (isBlank(r[1 + n]) ? 0 : toNum(r[1 + n], i, 1 + n, 'Phân phối ban đầu'))) };
	},
	solve(inp, m, p) {
		const s = inp.p0.reduce((a, b) => a + b, 0);
		if (Math.abs(s - 1) > 1e-6) throw new InputError(`Phân phối ban đầu phải có tổng bằng 1 (đang là ${+s.toFixed(6)}).`, 0, inp.names.length + 1);
		try { return A.markov(inp.P, inp.p0, Math.round(Number(p.steps))); } catch (e) { throw new InputError(e.message); }
	},
	summary: (res, m, p) => [{ label: `Sau ${p.steps} bước`, value: res.path[res.path.length - 1].map((v) => (v * 100).toFixed(1) + '%').join(' / '), strong: true },
		...(res.steady ? [{ label: 'Trạng thái dừng', value: res.steady.map((v) => (v * 100).toFixed(1) + '%').join(' / ') }] : [{ label: 'Có trạng thái hấp thụ', value: 'Xem ma trận cơ bản N' }])],
	report(inp, res, m, p) {
		const n = inp.names.length, sk = inp.names.map((_, j) => 's' + j);
		const blocks = [
			{ type: 'table', id: 'P', title: 'Ma trận chuyển', columns: [{ key: 'n', label: 'Từ \\ Đến', fmt: 'text', role: 'label' }, ...inp.names.map((nm, j) => ({ key: sk[j], label: nm, fmt: 'prob', role: 'input' })), { key: 'sum', label: 'Tổng hàng', fmt: 'prob' }],
				rows: inp.names.map((nm, i) => ({ cells: { n: nm, ...Object.fromEntries(inp.P[i].map((v, j) => [sk[j], v])), sum: { f: (R) => `=SUM(${R.row('P', i, sk[0], sk[n - 1])})`, v: 1 } } })) },
			{ type: 'table', id: 'path', title: 'Phân phối sau từng bước', columns: [{ key: 'k', label: 'Bước', fmt: 'int', role: 'label' }, ...inp.names.map((nm, j) => ({ key: sk[j], label: nm, fmt: 'prob' }))],
				rows: res.path.map((pv, k) => ({ highlight: k === res.path.length - 1, cells: { k, ...Object.fromEntries(pv.map((v, j) => [sk[j], k === 0 ? v : { f: (R) => `=MMULT(${R.row('path', k - 1, sk[0], sk[n - 1])},${R.col('P', sk[j])})`, v }])) } })) },
		];
		if (res.steady) blocks.push({ type: 'table', id: 'ss', title: 'Trạng thái dừng (dài hạn)', columns: [{ key: 'n', label: 'Trạng thái', fmt: 'text', role: 'label' }, { key: 'p', label: 'Xác suất dài hạn', fmt: 'pct' }], rows: inp.names.map((nm, i) => ({ cells: { n: nm, p: res.steady[i] } })) });
		else if (res.N) {
			const tr = res.transient.map((i) => inp.names[i]), ab = res.absorbingStates.map((i) => inp.names[i]);
			blocks.push({ type: 'table', id: 'Nm', title: 'Ma trận cơ bản N = (I − Q)⁻¹ và số bước trung bình', columns: [{ key: 'n', label: 'Trạng thái chuyển tiếp', fmt: 'text', role: 'label' }, ...tr.map((t, j) => ({ key: 'n' + j, label: t, fmt: 'num' })), { key: 'st', label: 'Số bước đến khi hấp thụ', fmt: 'num' }],
				rows: tr.map((t, i) => ({ cells: { n: t, ...Object.fromEntries(res.N[i].map((v, j) => ['n' + j, v])), st: res.steps[i] } })) },
				{ type: 'table', id: 'Bm', title: 'Xác suất bị hấp thụ vào từng trạng thái (B = N·R)', columns: [{ key: 'n', label: 'Từ', fmt: 'text', role: 'label' }, ...ab.map((t, j) => ({ key: 'b' + j, label: t, fmt: 'pct' }))], rows: tr.map((t, i) => ({ cells: { n: t, ...Object.fromEntries(res.B[i].map((v, j) => ['b' + j, v])) } })) });
		}
		return { title: 'Chuỗi Markov – kết quả', subtitle: 'Mỗi dòng của bảng bước là phân phối trước nhân với ma trận chuyển.', blocks };
	},
};
export const markovModule = mk({ id: 'markov', name: 'Chuỗi Markov', group: 'Ra quyết định', keywords: 'markov chain steady state absorbing transition matrix xich markov trang thai dung hap thu',
	models: [{ id: 'markov', name: 'Chuỗi Markov (n bước, trạng thái dừng, hấp thụ)', table: 'markov', dims: [{ id: 'n', label: 'Số trạng thái', default: 3, min: 2, max: 15 }], params: [{ id: 'steps', label: 'Số bước cần tính', type: 'int', default: 4, min: 1, max: 100 }] }] }, { markov: markovM });

// =================== Productivity ===================
const prod = {
	inputTable: (d, m, sample) => ({
		title: 'Năng suất – dữ liệu', sheet: 'Năng suất', hint: 'Mỗi dòng là một kỳ: sản lượng và các yếu tố đầu vào. Đổi tên cột đầu vào ở dòng tiêu đề.',
		columns: [{ label: 'Kỳ', fmt: 'text' }, { label: 'Sản lượng', fmt: 'num' }, ...(sample ? ['Lao động (giờ)', 'Nguyên liệu', 'Năng lượng'] : Array.from({ length: d.inputs }, (_, j) => `Đầu vào ${j + 1}`)).map((l) => ({ label: l, fmt: 'num' }))],
		rows: sample ? [['Kỳ 1', 1000, 500, 300, 100], ['Kỳ 2', 1150, 520, 330, 105], ['Kỳ 3', 1300, 540, 350, 110]] : Array.from({ length: d.rows }, (_, i) => [`Kỳ ${i + 1}`, ...Array(d.inputs + 1).fill('')]), firstInputCol: 1,
	}),
	parse({ header, rows }) {
		const data = rowsOf(rows);
		if (data.length < 1) throw new InputError('Chưa có dữ liệu.');
		const ins = header.slice(2).map((h, j) => (isBlank(h) ? `Đầu vào ${j + 1}` : String(h)));
		return { ins, periods: data.map(({ r, i }) => (isBlank(r[0]) ? `Kỳ ${i + 1}` : String(r[0]))), out: data.map(({ r, i }) => toNum(r[1], i, 1, `Sản lượng dòng ${i + 1}`)), inp: data.map(({ r, i }) => ins.map((_, j) => toNum(r[2 + j], i, 2 + j, `${ins[j]} dòng ${i + 1}`))) };
	},
	solve(inp) {
		if (inp.inp.some((r) => r.some((v) => v <= 0))) throw new InputError('Các yếu tố đầu vào phải lớn hơn 0.');
		const ratio = inp.out.map((o, i) => inp.inp[i].map((x) => o / x)), total = inp.out.map((o, i) => o / inp.inp[i].reduce((a, b) => a + b, 0));
		return { ratio, total };
	},
	summary: (res, m, p) => [{ label: 'Năng suất tổng hợp kỳ cuối', value: res.total[res.total.length - 1], fmt: 'num', strong: true }, ...(res.total.length > 1 ? [{ label: 'Thay đổi so với kỳ đầu', value: res.total[res.total.length - 1] / res.total[0] - 1, fmt: 'pct' }] : [])],
	report(inp, res) {
		const n = inp.ins.length, ik = inp.ins.map((_, j) => 'i' + j);
		return {
			title: 'Năng suất – kết quả', subtitle: 'Năng suất từng yếu tố = sản lượng / đầu vào; năng suất tổng hợp = sản lượng / tổng đầu vào (cùng đơn vị).',
			blocks: [{ type: 'table', id: 't', title: 'Bảng năng suất', columns: [{ key: 'p', label: 'Kỳ', fmt: 'text', role: 'label' }, { key: 'o', label: 'Sản lượng', fmt: 'num', role: 'input' }, ...inp.ins.map((nm, j) => ({ key: ik[j], label: nm, fmt: 'num', role: 'input' })),
				...inp.ins.map((nm, j) => ({ key: 'r' + j, label: `NS / ${nm}`, fmt: 'num' })), { key: 'tot', label: 'NS tổng hợp', fmt: 'num' }, { key: 'chg', label: 'Thay đổi so với kỳ đầu', fmt: 'pct' }],
				rows: inp.periods.map((p, i) => ({ cells: { p, o: inp.out[i], ...Object.fromEntries(inp.inp[i].map((v, j) => [ik[j], v])), ...Object.fromEntries(inp.ins.map((_, j) => ['r' + j, { f: (R) => `=${R.cell('t', i, 'o')}/${R.cell('t', i, ik[j])}`, v: res.ratio[i][j] }])),
					tot: { f: (R) => `=${R.cell('t', i, 'o')}/SUM(${R.row('t', i, ik[0], ik[n - 1])})`, v: res.total[i] }, chg: { f: (R) => `=${R.cell('t', i, 'tot')}/${R.cell('t', 0, 'tot')}-1`, v: res.total[i] / res.total[0] - 1 } } })) },
				...(inp.periods.length > 1 ? [{ type: 'chart', kind: 'line', title: 'Năng suất tổng hợp', table: 't', x: 'p', series: [{ name: 'NS tổng hợp', key: 'tot' }] }] : [])],
		};
	},
};
export const productivity = mk({ id: 'productivity', name: 'Năng suất', group: 'Tồn kho & vận hành', keywords: 'productivity multifactor nang suat dau vao san luong',
	models: [{ id: 'prod', name: 'Năng suất theo yếu tố và tổng hợp', table: 'prod', dims: [{ id: 'rows', label: 'Số kỳ', default: 3, min: 1, max: 60 }, { id: 'inputs', label: 'Số yếu tố đầu vào', default: 3, min: 1, max: 10 }], params: [] }] }, { prod });

// =================== Reliability ===================
const relList = (kind) => ({
	inputTable: (d, m, sample) => ({
		title: kind === 'series' ? 'Độ tin cậy hệ thống nối tiếp – dữ liệu' : 'Độ tin cậy hệ thống song song – dữ liệu', sheet: kind === 'series' ? 'Nối tiếp' : 'Song song', hint: 'Mỗi dòng là một linh kiện và độ tin cậy của nó (0–1).',
		columns: [{ label: 'Linh kiện', fmt: 'text' }, { label: 'Độ tin cậy', fmt: 'num' }],
		rows: sample ? [['Bộ nguồn', 0.95], ['Mạch điều khiển', 0.9], ['Cảm biến', 0.99]] : Array.from({ length: d.rows }, (_, i) => [`LK ${i + 1}`, '']), firstInputCol: 1,
	}),
	parse({ rows }) {
		const data = rowsOf(rows);
		if (data.length < 2) throw new InputError('Cần ít nhất 2 linh kiện.');
		return { names: data.map(({ r, i }) => (isBlank(r[0]) ? `LK ${i + 1}` : String(r[0]))), r: data.map(({ r, i }) => { const v = toNum(r[1], i, 1, `Độ tin cậy dòng ${i + 1}`); if (v < 0 || v > 1) throw new InputError('Độ tin cậy phải trong khoảng 0–1.', i, 1); return v; }) };
	},
	solve: (inp) => ({ R: kind === 'series' ? A.rSeries(inp.r) : A.rParallel(inp.r) }),
	summary: (res) => [{ label: 'Độ tin cậy hệ thống', value: res.R, fmt: 'prob', strong: true }],
	report(inp, res) {
		const N = inp.r.length;
		return { title: kind === 'series' ? 'Hệ thống nối tiếp – kết quả' : 'Hệ thống song song – kết quả', subtitle: kind === 'series' ? 'R = Π rᵢ: hệ thống hỏng nếu một linh kiện hỏng.' : 'R = 1 − Π (1 − rᵢ): hệ thống chỉ hỏng khi mọi linh kiện hỏng.',
			blocks: [{ type: 'table', id: 't', title: 'Linh kiện', columns: [{ key: 'n', label: 'Linh kiện', fmt: 'text', role: 'label' }, { key: 'r', label: 'Độ tin cậy', fmt: 'prob', role: 'input' }], rows: inp.names.map((nm, i) => ({ cells: { n: nm, r: inp.r[i] } })) },
				{ type: 'kv', id: 'k', title: 'Kết quả', items: [{ key: 'R', label: 'Độ tin cậy hệ thống', value: { f: (R) => (kind === 'series' ? `=PRODUCT(${R.col('t', 'r')})` : `=1-${Array.from({ length: N }, (_, i) => `(1-${R.cell('t', i, 'r')})`).join('*')}`), v: res.R }, fmt: 'prob' }] }] };
	},
});
const backups = scalarModel({
	title: 'Số linh kiện dự phòng – dữ liệu', sheet: 'Dự phòng', hint: 'Các linh kiện giống nhau mắc song song cho đến khi đạt độ tin cậy mục tiêu.',
	items: [{ key: 'r', label: 'Độ tin cậy mỗi linh kiện', default: 0.9, min: 0.0001, max: 0.9999 }, { key: 'target', label: 'Độ tin cậy mục tiêu của hệ thống', default: 0.999, min: 0.0001, max: 0.999999 }],
	compute: (v) => { const n = A.backupsNeeded(v.r, v.target); return { n, backups: n - 1, R: 1 - (1 - v.r) ** n }; },
	outputs: [{ key: 'n', label: 'Số linh kiện song song cần dùng', strong: true, fmt: 'int', f: (I) => `=ROUNDUP(ROUND(LN(1-${I('target')})/LN(1-${I('r')}),9),0)` }, { key: 'backups', label: 'Số linh kiện dự phòng', fmt: 'int', f: (I, O) => `=${O('n')}-1` },
		{ key: 'R', label: 'Độ tin cậy đạt được', fmt: 'prob', f: (I, O) => `=1-(1-${I('r')})^${O('n')}` }],
});
export const reliability = mk({ id: 'reliability', name: 'Độ tin cậy', group: 'Chất lượng', keywords: 'reliability series parallel backup standby do tin cay noi tiep song song du phong',
	models: [{ id: 'series', name: 'Hệ thống nối tiếp', table: 'series', dims: [{ id: 'rows', label: 'Số linh kiện', default: 3, min: 2, max: 50 }], params: [] }, { id: 'parallel', name: 'Hệ thống song song', table: 'parallel', dims: [{ id: 'rows', label: 'Số linh kiện', default: 3, min: 2, max: 50 }], params: [] }, { id: 'backups', name: 'Số linh kiện dự phòng cần thiết', table: 'backups', params: [] }] },
	{ series: relList('series'), parallel: relList('parallel'), backups });

// =================== Learning curve ===================
const learnTimes = {
	inputTable: (d, m, sample) => ({ title: 'Đường cong học tập – dữ liệu', sheet: 'Học tập', hint: 'Thời gian đơn vị thứ n = T₁ × n^b với b = ln(tỷ lệ học) / ln 2.',
		columns: [{ label: 'Tham số', fmt: 'text' }, { label: 'Giá trị', fmt: 'num' }], rows: [['Thời gian đơn vị đầu tiên T₁', sample ? 100 : ''], ['Tỷ lệ học tập (ví dụ 0,8 = 80%)', sample ? 0.8 : ''], ['Số đơn vị cần tính', sample ? 16 : '']], firstInputCol: 1 }),
	parse({ rows }) {
		const t1 = toNum(rows[0]?.[1], 0, 1, 'T₁'), rate = toNum(rows[1]?.[1], 1, 1, 'Tỷ lệ học tập'), n = toNum(rows[2]?.[1], 2, 1, 'Số đơn vị');
		if (!(t1 > 0)) throw new InputError('T₁ phải lớn hơn 0.', 0, 1);
		if (!(rate > 0 && rate < 1)) throw new InputError('Tỷ lệ học tập phải trong khoảng (0, 1).', 1, 1);
		if (!(n >= 1 && n <= 500)) throw new InputError('Số đơn vị phải từ 1 đến 500.', 2, 1);
		return { t1, rate, n: Math.round(n) };
	},
	solve: (inp) => ({ b: A.learningExponent(inp.rate), rows: A.learningTimes(inp.t1, inp.rate, inp.n) }),
	summary: (res) => { const l = res.rows[res.rows.length - 1]; return [{ label: `Thời gian đơn vị thứ ${l.n}`, value: l.unit, fmt: 'num', strong: true }, { label: 'Tổng thời gian tích luỹ', value: l.cum, fmt: 'num' }, { label: 'Thời gian trung bình', value: l.avg, fmt: 'num' }]; },
	report(inp, res) {
		const N = res.rows.length;
		return { title: 'Đường cong học tập – kết quả', subtitle: 'Mỗi lần số đơn vị tích luỹ tăng gấp đôi, thời gian đơn vị giảm còn đúng tỷ lệ học tập.',
			blocks: [{ type: 'kv', id: 'p', title: 'Tham số', items: [{ key: 't1', label: 'T₁', value: inp.t1, fmt: 'num', role: 'input' }, { key: 'rate', label: 'Tỷ lệ học tập', value: inp.rate, fmt: 'pct', role: 'input' }, { key: 'b', label: 'Số mũ b', value: { f: (R) => `=LN(${R.kv('p', 'rate')})/LN(2)`, v: res.b }, fmt: 'prob' }] },
				{ type: 'table', id: 't', title: 'Thời gian theo từng đơn vị', columns: [{ key: 'n', label: 'Đơn vị thứ', fmt: 'int', role: 'label' }, { key: 'u', label: 'Thời gian đơn vị', fmt: 'num' }, { key: 'c', label: 'Tổng tích luỹ', fmt: 'num' }, { key: 'a', label: 'Trung bình tích luỹ', fmt: 'num' }],
					rows: res.rows.map((r, i) => ({ highlight: i === N - 1, cells: { n: r.n, u: { f: (R) => `=${R.kv('p', 't1')}*${R.cell('t', i, 'n')}^${R.kv('p', 'b')}`, v: r.unit }, c: { f: (R) => (i ? `=${R.cell('t', i - 1, 'c')}+${R.cell('t', i, 'u')}` : `=${R.cell('t', 0, 'u')}`), v: r.cum }, a: { f: (R) => `=${R.cell('t', i, 'c')}/${R.cell('t', i, 'n')}`, v: r.avg } } })) },
				{ type: 'chart', kind: 'line', title: 'Thời gian đơn vị', table: 't', x: 'n', series: [{ name: 'Thời gian đơn vị', key: 'u' }, { name: 'Trung bình tích luỹ', key: 'a' }] }] };
	},
};
const learnRate = scalarModel({
	title: 'Tìm tỷ lệ học tập từ hai quan sát – dữ liệu', sheet: 'Tỷ lệ học tập', hint: 'Cho thời gian ở hai mức sản lượng, tìm tỷ lệ học tập.',
	items: [{ key: 'nA', label: 'Đơn vị thứ (quan sát 1)', default: 1, positive: true }, { key: 'tA', label: 'Thời gian đơn vị (quan sát 1)', default: 100, positive: true }, { key: 'nB', label: 'Đơn vị thứ (quan sát 2)', default: 4, positive: true }, { key: 'tB', label: 'Thời gian đơn vị (quan sát 2)', default: 64, positive: true }],
	validate: (v) => (v.nA === v.nB ? { message: 'Hai quan sát phải ở hai mức sản lượng khác nhau.', row: 2 } : null),
	compute: (v) => ({ rate: A.rateFromTimes(v.tA, v.nA, v.tB, v.nB), b: Math.log(v.tB / v.tA) / Math.log(v.nB / v.nA) }),
	outputs: [{ key: 'b', label: 'Số mũ b', fmt: 'prob', f: (I) => `=LN(${I('tB')}/${I('tA')})/LN(${I('nB')}/${I('nA')})` }, { key: 'rate', label: 'Tỷ lệ học tập', fmt: 'pct', strong: true, f: (I, O) => `=2^${O('b')}` }],
});
export const learning = mk({ id: 'learning', name: 'Đường cong học tập', group: 'Tồn kho & vận hành', keywords: 'learning curve experience duong cong hoc tap kinh nghiem',
	models: [{ id: 'times', name: 'Tính thời gian từ tỷ lệ học tập', table: 'times', params: [] }, { id: 'rate', name: 'Tìm tỷ lệ học tập từ thời gian', table: 'rate', params: [] }] }, { times: learnTimes, rate: learnRate });

// =================== Work measurement ===================
const timeStudy = {
	inputTable(d, m, sample) {
		const k = sample ? 5 : d.obs;
		return { title: 'Nghiên cứu thời gian – dữ liệu', sheet: 'Nghiên cứu thời gian', hint: 'Mỗi dòng là một yếu tố công việc: các lần quan sát, hệ số đánh giá tốc độ (1 = bình thường). Dung sai nhập ở ô tham số.',
			columns: [{ label: 'Yếu tố', fmt: 'text' }, ...Array.from({ length: k }, (_, j) => ({ label: `Lần ${j + 1}`, fmt: 'num' })), { label: 'Hệ số đánh giá', fmt: 'num' }],
			rows: sample ? [['Lấy phôi', 0.46, 0.48, 0.45, 0.47, 0.49, 1.1], ['Gia công', 1.52, 1.5, 1.55, 1.49, 1.51, 0.95], ['Kiểm tra', 0.31, 0.3, 0.33, 0.32, 0.29, 1.0]] : Array.from({ length: d.elements }, (_, i) => [`Yếu tố ${i + 1}`, ...Array(k).fill(''), 1]), firstInputCol: 1 };
	},
	parse({ header, rows }) {
		const k = header.length - 2;
		if (k < 2) throw new InputError('Cần ít nhất 2 lần quan sát.');
		const data = rowsOf(rows);
		if (!data.length) throw new InputError('Chưa có yếu tố nào.');
		return { names: data.map(({ r, i }) => (isBlank(r[0]) ? `Yếu tố ${i + 1}` : String(r[0]))), obs: data.map(({ r, i }) => Array.from({ length: k }, (_, j) => toNum(r[1 + j], i, 1 + j, `Lần ${j + 1} của ${r[0] || i + 1}`))), rating: data.map(({ r, i }) => (isBlank(r[1 + k]) ? 1 : toNum(r[1 + k], i, 1 + k, 'Hệ số đánh giá'))) };
	},
	solve(inp, m, p) {
		const al = Number(p.allowance);
		if (!(al >= 0 && al < 1)) throw new InputError('Dung sai phải trong khoảng [0, 1).');
		const avg = inp.obs.map((o) => o.reduce((a, b) => a + b, 0) / o.length), normal = avg.map((a, i) => a * inp.rating[i]);
		const tn = normal.reduce((a, b) => a + b, 0);
		return { avg, normal, total: tn, standard: tn / (1 - al), allowance: al };
	},
	summary: (res) => [{ label: 'Thời gian chuẩn', value: res.standard, fmt: 'num', strong: true }, { label: 'Thời gian bình thường', value: res.total, fmt: 'num' }],
	report(inp, res, m, p) {
		const k = inp.obs[0].length, ok = inp.obs[0].map((_, j) => 'o' + j), N = inp.names.length;
		return { title: 'Nghiên cứu thời gian – kết quả', subtitle: 'Thời gian bình thường = trung bình × hệ số đánh giá; thời gian chuẩn = tổng thời gian bình thường / (1 − dung sai).',
			blocks: [{ type: 'kv', id: 'p', title: 'Tham số', items: [{ key: 'al', label: 'Dung sai (nghỉ ngơi, cá nhân, trễ)', value: res.allowance, fmt: 'pct', role: 'input' }] },
				{ type: 'table', id: 't', title: 'Các yếu tố', columns: [{ key: 'n', label: 'Yếu tố', fmt: 'text', role: 'label' }, ...ok.map((c, j) => ({ key: c, label: `Lần ${j + 1}`, fmt: 'num', role: 'input' })), { key: 'rt', label: 'Hệ số đánh giá', fmt: 'num', role: 'input' }, { key: 'avg', label: 'Trung bình', fmt: 'num' }, { key: 'nt', label: 'Thời gian bình thường', fmt: 'num' }],
					rows: inp.names.map((nm, i) => ({ cells: { n: nm, ...Object.fromEntries(inp.obs[i].map((v, j) => [ok[j], v])), rt: inp.rating[i], avg: { f: (R) => `=AVERAGE(${R.row('t', i, ok[0], ok[k - 1])})`, v: res.avg[i] }, nt: { f: (R) => `=${R.cell('t', i, 'avg')}*${R.cell('t', i, 'rt')}`, v: res.normal[i] } } })) },
				{ type: 'kv', id: 'r', title: 'Kết quả', items: [{ key: 'tn', label: 'Tổng thời gian bình thường', value: { f: (R) => `=SUM(${R.col('t', 'nt', 0, N - 1)})`, v: res.total }, fmt: 'num' }, { key: 'st', label: 'Thời gian chuẩn', value: { f: (R) => `=${R.kv('r', 'tn')}/(1-${R.kv('p', 'al')})`, v: res.standard }, fmt: 'num' }] }] };
	},
};
const sampleSize = scalarModel({
	title: 'Cỡ mẫu quan sát – dữ liệu', sheet: 'Cỡ mẫu', hint: 'Số lần quan sát cần để ước lượng thời gian trung bình với độ chính xác cho trước. n = (z·s / (a·x̄))².',
	items: [{ key: 'conf', label: 'Độ tin cậy (ví dụ 0,95)', default: 0.95, min: 0.5, max: 0.9999 }, { key: 'acc', label: 'Độ chính xác mong muốn (ví dụ 0,05 = 5%)', default: 0.05, positive: true }, { key: 'mean', label: 'Thời gian trung bình sơ bộ x̄', default: 1.2, positive: true }, { key: 's', label: 'Độ lệch chuẩn sơ bộ s', default: 0.25, positive: true }],
	compute: (v) => { const z = normInv(1 - (1 - v.conf) / 2); return { z, n: A.sampleSizeMean(z, v.s, v.acc, v.mean) }; },
	outputs: [{ key: 'z', label: 'Hệ số z', f: (I) => `=NORM.S.INV(1-(1-${I('conf')})/2)` }, { key: 'n', label: 'Số lần quan sát cần thiết', strong: true, fmt: 'int', f: (I, O) => `=ROUNDUP(ROUND((${O('z')}*${I('s')}/(${I('acc')}*${I('mean')}))^2,9),0)` }],
});
const workSampling = scalarModel({
	title: 'Lấy mẫu công việc – dữ liệu', sheet: 'Lấy mẫu công việc', hint: 'Số quan sát để ước lượng tỷ lệ thời gian một hoạt động chiếm. n = z²·p(1−p) / e².',
	items: [{ key: 'conf', label: 'Độ tin cậy (ví dụ 0,95)', default: 0.95, min: 0.5, max: 0.9999 }, { key: 'p', label: 'Tỷ lệ ước tính p (0–1)', default: 0.3, min: 0.0001, max: 0.9999 }, { key: 'e', label: 'Sai số cho phép e (ví dụ 0,02)', default: 0.02, positive: true }],
	compute: (v) => { const z = normInv(1 - (1 - v.conf) / 2); return { z, n: A.sampleSizeProp(z, v.p, v.e) }; },
	outputs: [{ key: 'z', label: 'Hệ số z', f: (I) => `=NORM.S.INV(1-(1-${I('conf')})/2)` }, { key: 'n', label: 'Số quan sát cần thiết', strong: true, fmt: 'int', f: (I, O) => `=ROUNDUP(ROUND(${O('z')}^2*${I('p')}*(1-${I('p')})/${I('e')}^2,9),0)` }],
});
export const worktime = mk({ id: 'worktime', name: 'Đo lường công việc', group: 'Tồn kho & vận hành', keywords: 'work measurement time study standard time work sampling do luong cong viec thoi gian chuan lay mau',
	models: [{ id: 'study', name: 'Nghiên cứu thời gian (thời gian chuẩn)', table: 'study', dims: [{ id: 'elements', label: 'Số yếu tố', default: 3, min: 1, max: 30 }, { id: 'obs', label: 'Số lần quan sát', default: 5, min: 2, max: 30 }], params: [{ id: 'allowance', label: 'Dung sai', type: 'num', default: 0.15, min: 0, max: 0.99, step: 0.01 }] },
		{ id: 'size', name: 'Cỡ mẫu quan sát', table: 'size', params: [] }, { id: 'sampling', name: 'Lấy mẫu công việc', table: 'sampling', params: [] }] }, { study: timeStudy, size: sampleSize, sampling: workSampling });
