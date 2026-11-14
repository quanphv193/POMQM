import * as C from '../../lib/ops_c.js';
import { InputError } from '../core/errors.js';
import { toNum, isBlank } from './common.js';

const rowsOf = (rows) => rows.map((r, i) => ({ r, i })).filter(({ r }) => r.some((v) => !isBlank(v)));
const mk = (mod, IMPL) => ({ ...mod, inputTable: (d, m, s) => IMPL[m.id].inputTable(d, m, s), parse: (t, m, p) => IMPL[m.id].parse(t, m, p), solve: (i, m, p) => IMPL[m.id].solve(i, m, p), summary: (r, m, p) => IMPL[m.id].summary(r, m, p), report: (i, r, m, p) => IMPL[m.id].report(i, r, m, p) });
const num = (id, label, def, extra = {}) => ({ id, label, type: 'num', default: def, ...extra });

// =================== Aggregate planning ===================
const agg = {
	inputTable: (d, m, sample) => ({ title: 'Hoạch định tổng hợp – dữ liệu', sheet: 'Hoạch định tổng hợp', hint: 'Mỗi dòng là một kỳ: nhu cầu và năng lực tối đa của sản xuất thường, tăng ca, thuê ngoài. Các chi phí đơn vị nhập ở ô tham số.',
		columns: [{ label: 'Kỳ', fmt: 'text' }, { label: 'Nhu cầu', fmt: 'num' }, { label: 'Năng lực thường', fmt: 'num' }, { label: 'Năng lực tăng ca', fmt: 'num' }, { label: 'Năng lực thuê ngoài', fmt: 'num' }],
		rows: sample ? [['Kỳ 1', 1200, 1500, 300, 200], ['Kỳ 2', 1500, 1500, 300, 200], ['Kỳ 3', 1900, 1500, 300, 200], ['Kỳ 4', 1400, 1500, 300, 200]] : Array.from({ length: d.rows }, (_, i) => [`Kỳ ${i + 1}`, '', '', '', '']), firstInputCol: 1 }),
	parse({ rows }) {
		const data = rowsOf(rows);
		if (data.length < 2) throw new InputError('Cần ít nhất 2 kỳ.');
		return { names: data.map(({ r, i }) => (isBlank(r[0]) ? `Kỳ ${i + 1}` : String(r[0]))), periods: data.map(({ r, i }) => { const g = (j, w) => { const v = isBlank(r[j]) && j > 1 ? 0 : toNum(r[j], i, j, `${w} dòng ${i + 1}`); if (v < 0) throw new InputError(`${w} không được âm.`, i, j); return v; }; return { d: g(1, 'Nhu cầu'), capR: g(2, 'Năng lực thường'), capO: g(3, 'Năng lực tăng ca'), capS: g(4, 'Năng lực thuê ngoài') }; }) };
	},
	solve(inp, m, p) {
		const c = { r: +p.r, o: +p.o, s: +p.s, h: +p.h, b: +p.b }, i0 = +p.i0 || 0;
		try { const opt = C.aggregateLP(inp.periods, c, i0); return { opt, chase: C.chasePlan(inp.periods, c, i0), level: C.levelPlan(inp.periods, c, i0), c, i0 }; } catch (e) { throw new InputError(e.message); }
	},
	summary: (res) => [{ label: 'Chi phí tối thiểu (LP)', value: res.opt.cost, fmt: 'money', strong: true }, { label: 'Chiến lược đuổi theo nhu cầu', value: res.chase.cost, fmt: 'money' }, { label: 'Chiến lược sản xuất đều', value: res.level.cost, fmt: 'money' }],
	report(inp, res) {
		const K = (R, k) => R.kv('p', k);
		return { title: 'Hoạch định tổng hợp – kết quả', subtitle: 'Kế hoạch tối ưu giải bằng quy hoạch tuyến tính: cân bằng tồn kho/thiếu hàng theo từng kỳ, thiếu hàng được giao bù ở kỳ sau và phải bằng 0 ở kỳ cuối.',
			blocks: [{ type: 'kv', id: 'p', title: 'Chi phí đơn vị', items: [{ key: 'r', label: 'Sản xuất thường', value: res.c.r, fmt: 'num', role: 'input' }, { key: 'o', label: 'Tăng ca', value: res.c.o, fmt: 'num', role: 'input' }, { key: 's', label: 'Thuê ngoài', value: res.c.s, fmt: 'num', role: 'input' }, { key: 'h', label: 'Lưu kho (mỗi đơn vị mỗi kỳ)', value: res.c.h, fmt: 'num', role: 'input' }, { key: 'b', label: 'Thiếu hàng (mỗi đơn vị mỗi kỳ)', value: res.c.b, fmt: 'num', role: 'input' }, { key: 'i0', label: 'Tồn kho đầu kỳ', value: res.i0, fmt: 'num', role: 'input' }] },
				{ type: 'table', id: 'plan', title: 'Kế hoạch tối ưu', columns: [{ key: 'n', label: 'Kỳ', fmt: 'text', role: 'label' }, { key: 'd', label: 'Nhu cầu', fmt: 'num', role: 'input' }, { key: 'R', label: 'Thường', fmt: 'num' }, { key: 'O', label: 'Tăng ca', fmt: 'num' }, { key: 'S', label: 'Thuê ngoài', fmt: 'num' }, { key: 'I', label: 'Tồn kho cuối', fmt: 'num' }, { key: 'B', label: 'Thiếu hàng cuối', fmt: 'num' }, { key: 'chk', label: 'Kiểm tra cân bằng (=0)', fmt: 'num' }, { key: 'c', label: 'Chi phí kỳ', fmt: 'money' }],
					rows: res.opt.rows.map((r, t) => ({ cells: { n: inp.names[t], d: r.d, R: r.R, O: r.O, S: r.S, I: r.I, B: r.B,
						chk: { f: (R) => `=(${R.cell('plan', t, 'I')}-${R.cell('plan', t, 'B')})-(${t ? `${R.cell('plan', t - 1, 'I')}-${R.cell('plan', t - 1, 'B')}` : K(R, 'i0')}+${R.cell('plan', t, 'R')}+${R.cell('plan', t, 'O')}+${R.cell('plan', t, 'S')}-${R.cell('plan', t, 'd')})`, v: 0 },
						c: { f: (R) => `=${R.cell('plan', t, 'R')}*${K(R, 'r')}+${R.cell('plan', t, 'O')}*${K(R, 'o')}+${R.cell('plan', t, 'S')}*${K(R, 's')}+${R.cell('plan', t, 'I')}*${K(R, 'h')}+${R.cell('plan', t, 'B')}*${K(R, 'b')}`, v: r.R * res.c.r + r.O * res.c.o + r.S * res.c.s + r.I * res.c.h + r.B * res.c.b } } })) },
				{ type: 'kv', id: 't', items: [{ key: 'tot', label: 'Tổng chi phí tối thiểu', value: { f: (R) => `=SUM(${R.col('plan', 'c')})`, v: res.opt.cost }, fmt: 'money' }] },
				{ type: 'table', id: 'cmp', title: 'So sánh các chiến lược (giá trị tính sẵn)', columns: [{ key: 'm', label: 'Chiến lược', fmt: 'text', role: 'label' }, { key: 'c', label: 'Tổng chi phí', fmt: 'money' }, { key: 'x', label: 'Chênh so với tối ưu', fmt: 'money' }],
					rows: [['Tối ưu (LP)', res.opt.cost], ['Đuổi theo nhu cầu (dùng năng lực rẻ nhất trước)', res.chase.cost], ['Sản xuất đều (thường, bằng nhu cầu trung bình)', res.level.cost]].map(([m, c]) => ({ highlight: c <= res.opt.cost + 1e-6, cells: { m, c, x: c - res.opt.cost } })) },
				{ type: 'chart', kind: 'line', title: 'Nhu cầu và sản lượng', table: 'plan', x: 'n', series: [{ name: 'Nhu cầu', key: 'd' }, { name: 'Sản xuất thường', key: 'R' }] }]};
	},
};
export const aggregate = mk({ id: 'aggregate', name: 'Hoạch định tổng hợp', group: 'Hoạch định & dự báo', keywords: 'aggregate planning production planning overtime subcontract inventory backorder hoach dinh tong hop san xuat tang ca thue ngoai',
	models: [{ id: 'agg', name: 'Hoạch định tổng hợp (tối ưu LP, đuổi theo, sản xuất đều)', table: 'agg', dims: [{ id: 'rows', label: 'Số kỳ', default: 4, min: 2, max: 36 }], params: [num('r', 'Chi phí sản xuất thường / đơn vị', 8, { min: 0 }), num('o', 'Chi phí tăng ca / đơn vị', 11, { min: 0 }), num('s', 'Chi phí thuê ngoài / đơn vị', 14, { min: 0 }), num('h', 'Chi phí lưu kho / đơn vị / kỳ', 3, { min: 0 }), num('b', 'Chi phí thiếu hàng / đơn vị / kỳ', 4, { min: 0 }), num('i0', 'Tồn kho đầu kỳ', 0, { min: 0 })] }] }, { agg });

// =================== MRP ===================
const mrpM = {
	inputTable(d, m, sample) {
		const T = sample ? 8 : d.periods;
		const cols = [{ label: 'Vật tư', fmt: 'text' }, { label: 'Cha', fmt: 'text' }, { label: 'SL trên 1 cha', fmt: 'num' }, { label: 'Thời gian chờ', fmt: 'int' }, { label: 'Tồn kho', fmt: 'num' }, { label: 'Cỡ lô (0 = theo nhu cầu)', fmt: 'num' }, ...Array.from({ length: T }, (_, t) => ({ label: `Kỳ ${t + 1}`, fmt: 'num' }))];
		const rows = sample ? [['A', '', 1, 1, 10, 0, 0, 0, 0, 0, 50, 0, 0, 60], ['B', 'A', 2, 2, 15, 0, '', '', '', '', '', '', '', ''], ['C', 'A', 1, 1, 0, 40, '', '', '', '', '', '', '', ''], ['D', 'B', 3, 1, 20, 0, '', '', '', '', '', '', '', '']]
			: Array.from({ length: d.items }, (_, i) => [String.fromCharCode(65 + i), '', 1, 1, 0, 0, ...Array(T).fill('')]);
		return { title: 'MRP – dữ liệu', sheet: 'MRP', hint: 'Mỗi dòng là một vật tư. Vật tư cuối (cột “Cha” để trống) nhập lịch sản xuất chính MPS ở các cột kỳ. Mỗi vật tư có đúng một cha.', columns: cols, rows, firstInputCol: 1 };
	},
	parse({ header, rows }) {
		const T = header.length - 6;
		if (T < 2) throw new InputError('Cần ít nhất 2 cột kỳ.');
		const data = rowsOf(rows);
		if (!data.length) throw new InputError('Chưa có vật tư nào.');
		const items = [], mps = {};
		data.forEach(({ r, i }) => {
			if (isBlank(r[0])) throw new InputError('Vật tư thiếu mã.', i, 0);
			const id = String(r[0]).trim(), parent = isBlank(r[1]) ? null : String(r[1]).trim();
			const it = { id, parent, qty: isBlank(r[2]) ? 1 : toNum(r[2], i, 2, `SL của ${id}`), lead: isBlank(r[3]) ? 0 : toNum(r[3], i, 3, `Thời gian chờ của ${id}`), onHand: isBlank(r[4]) ? 0 : toNum(r[4], i, 4, `Tồn kho của ${id}`), lot: isBlank(r[5]) ? 0 : toNum(r[5], i, 5, `Cỡ lô của ${id}`), _row: i };
			if (it.lead < 0 || !Number.isInteger(it.lead)) throw new InputError(`Thời gian chờ của ${id} phải là số nguyên không âm.`, i, 3);
			items.push(it);
			if (!parent) mps[id] = Array.from({ length: T }, (_, t) => (isBlank(r[6 + t]) ? 0 : toNum(r[6 + t], i, 6 + t, `MPS ${id} kỳ ${t + 1}`)));
		});
		if (!Object.keys(mps).length) throw new InputError('Cần ít nhất một vật tư cuối (cột “Cha” để trống).');
		if (Object.values(mps).every((a) => a.every((v) => v === 0))) throw new InputError('Chưa nhập lịch sản xuất chính (MPS) cho vật tư cuối.', items.findIndex((it) => !it.parent), 6);
		return { items, mps, T };
	},
	solve(inp) { try { return C.mrp(inp.items, inp.mps, inp.T); } catch (e) { throw new InputError(e.message); } },
	summary: (res) => [{ label: 'Số vật tư', value: res.rows.length, fmt: 'int', strong: true }, { label: 'Số lệnh đặt/sản xuất', value: res.rows.reduce((s, r) => s + r.release.filter((v) => v > 0).length, 0), fmt: 'int' },
		...(res.rows.some((r) => r.pastDue > 0) ? [{ label: 'Cảnh báo', value: 'Có lệnh đáng lẽ phải phát từ trước kỳ 1' }] : [])],
	report(inp, res) {
		const T = inp.T, pk = Array.from({ length: T }, (_, t) => 'p' + t), byId = new Map(inp.items.map((it) => [it.id, it]));
		return { title: 'MRP – kết quả', subtitle: 'Nhu cầu ròng = tổng nhu cầu − tồn kho dự kiến; nhận hàng theo cỡ lô; lệnh được phát sớm hơn thời gian chờ. Giá trị tính sẵn: sửa dữ liệu rồi bấm Giải lại.',
			blocks: res.rows.flatMap((r, k) => { const it = byId.get(r.id); return [{ type: 'table', id: 'it' + k, title: `Vật tư ${r.id}${it.parent ? ` (cha ${it.parent}, ${it.qty} / cha)` : ' (vật tư cuối)'} – thời gian chờ ${it.lead}, tồn ${it.onHand}, cỡ lô ${it.lot || 'theo nhu cầu'}`,
				columns: [{ key: 'n', label: '', fmt: 'text', role: 'label' }, ...pk.map((c, t) => ({ key: c, label: `Kỳ ${t + 1}`, fmt: 'num' }))],
				rows: [['Tổng nhu cầu', r.gross], ['Tồn kho dự kiến cuối kỳ', r.projected], ['Nhu cầu ròng', r.net], ['Nhận hàng kế hoạch', r.receipt], ['Phát lệnh kế hoạch', r.release]].map(([n, arr], j) => ({ highlight: j === 4, cells: { n, ...Object.fromEntries(arr.map((v, t) => [pk[t], v])) } })) },
				...(r.pastDue > 0 ? [{ type: 'note', text: `⚠ Vật tư ${r.id}: cần ${r.pastDue} đơn vị nhưng lệnh đáng lẽ phải phát từ trước kỳ 1 (thời gian chờ quá dài).` }] : [])]; }) };
	},
};
export const mrpModule = mk({ id: 'mrp', name: 'Hoạch định nhu cầu vật tư (MRP)', group: 'Tồn kho & vận hành', keywords: 'mrp material requirements planning bom bill of materials planned order release hoach dinh nhu cau vat tu dinh muc',
	models: [{ id: 'mrp', name: 'MRP nhiều cấp (cây BOM)', table: 'mrp', dims: [{ id: 'items', label: 'Số vật tư', default: 4, min: 1, max: 60 }, { id: 'periods', label: 'Số kỳ', default: 8, min: 2, max: 52 }], params: [] }] }, { mrp: mrpM });

// =================== Simulation ===================
const sim = {
	inputTable: (d, m, sample) => ({ title: 'Mô phỏng Monte Carlo – phân phối', sheet: 'Mô phỏng', hint: 'Mỗi dòng là một giá trị có thể xảy ra và xác suất của nó (tổng bằng 1). Số lần mô phỏng và hạt giống số ngẫu nhiên nhập ở ô tham số.',
		columns: [{ label: 'Giá trị', fmt: 'num' }, { label: 'Xác suất', fmt: 'num' }], rows: sample ? [[0, 0.1], [1, 0.2], [2, 0.3], [3, 0.25], [4, 0.15]] : Array.from({ length: d.rows }, () => ['', '']), firstInputCol: 0 }),
	parse({ rows }) {
		const data = rowsOf(rows);
		if (data.length < 2) throw new InputError('Cần ít nhất 2 giá trị.');
		const values = data.map(({ r, i }) => toNum(r[0], i, 0, `Giá trị dòng ${i + 1}`)), probs = data.map(({ r, i }) => toNum(r[1], i, 1, `Xác suất dòng ${i + 1}`));
		if (new Set(values).size !== values.length) throw new InputError('Các giá trị phải khác nhau.');
		const s = probs.reduce((a, b) => a + b, 0);
		if (Math.abs(s - 1) > 1e-6) throw new InputError(`Tổng xác suất phải bằng 1 (đang là ${+s.toFixed(6)}).`, data[data.length - 1].i, 1);
		return { values, probs };
	},
	solve(inp, m, p) { const n = Math.round(+p.n); if (!(n >= 1 && n <= 1000)) throw new InputError('Số lần mô phỏng phải từ 1 đến 1000.'); return C.simulate(inp.values, inp.probs, n, Math.round(+p.seed)); },
	summary: (res) => [{ label: 'Trung bình mô phỏng', value: res.mean, fmt: 'num', strong: true }, { label: 'Kỳ vọng lý thuyết', value: res.expected, fmt: 'num' }, { label: 'Chênh lệch', value: res.mean - res.expected, fmt: 'num' }],
	report(inp, res) {
		const k = inp.values.length, n = res.sims.length;
		return { title: 'Mô phỏng Monte Carlo – kết quả', subtitle: 'Số ngẫu nhiên (cột vàng) tra vào bảng xác suất tích luỹ bằng LOOKUP. Sửa các giá trị hoặc xác suất là kết quả mô phỏng tự tính lại.',
			blocks: [{ type: 'table', id: 'd', title: 'Phân phối', columns: [{ key: 'v', label: 'Giá trị', fmt: 'num', role: 'input' }, { key: 'p', label: 'Xác suất', fmt: 'prob', role: 'input' }, { key: 'lo', label: 'Cận dưới tích luỹ', fmt: 'prob' }, { key: 'f', label: 'Tần suất mô phỏng', fmt: 'prob' }],
				rows: inp.values.map((v, i) => ({ cells: { v, p: inp.probs[i], lo: i ? { f: (R) => `=${R.cell('d', i - 1, 'lo')}+${R.cell('d', i - 1, 'p')}`, v: res.lower[i] } : 0, f: { f: (R) => `=COUNTIF(${R.col('sim', 'x')},${R.cell('d', i, 'v')})/${n}`, v: res.freq[i] } } })) },
				{ type: 'kv', id: 'r', title: 'Kết quả', items: [{ key: 'm', label: 'Trung bình mô phỏng', value: { f: (R) => `=AVERAGE(${R.col('sim', 'x')})`, v: res.mean }, fmt: 'num' }, { key: 'e', label: 'Kỳ vọng lý thuyết', value: { f: (R) => `=SUMPRODUCT(${R.col('d', 'v', 0, k - 1)},${R.col('d', 'p', 0, k - 1)})`, v: res.expected }, fmt: 'num' }, { key: 'x', label: 'Chênh lệch', value: { f: (R) => `=${R.kv('r', 'm')}-${R.kv('r', 'e')}`, v: res.mean - res.expected }, fmt: 'num' }] },
				{ type: 'chart', kind: 'column', title: 'Xác suất lý thuyết và tần suất mô phỏng', table: 'd', x: 'v', series: [{ name: 'Lý thuyết', key: 'p' }, { name: 'Mô phỏng', key: 'f' }] },
				{ type: 'table', id: 'sim', title: `${n} lần mô phỏng`, columns: [{ key: 'k', label: 'Lần', fmt: 'int', role: 'label' }, { key: 'r', label: 'Số ngẫu nhiên', fmt: 'prob', role: 'input' }, { key: 'x', label: 'Kết quả', fmt: 'num' }],
					rows: res.rs.map((r, i) => ({ cells: { k: i + 1, r, x: { f: (R) => `=LOOKUP(${R.cell('sim', i, 'r')},${R.col('d', 'lo', 0, k - 1)},${R.col('d', 'v', 0, k - 1)})`, v: res.sims[i] } } })) }] };
	},
};
export const simulation = mk({ id: 'simulation', name: 'Mô phỏng', group: 'Thống kê', keywords: 'simulation monte carlo random numbers frequency distribution mo phong ngau nhien',
	models: [{ id: 'mc', name: 'Mô phỏng Monte Carlo từ bảng xác suất', table: 'mc', dims: [{ id: 'rows', label: 'Số giá trị', default: 5, min: 2, max: 30 }], params: [{ id: 'n', label: 'Số lần mô phỏng', type: 'int', default: 100, min: 1, max: 1000 }, { id: 'seed', label: 'Hạt giống số ngẫu nhiên', type: 'int', default: 12345, min: 1 }] }] }, { mc: sim });
