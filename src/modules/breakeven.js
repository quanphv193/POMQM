import { scalarModel } from './param.js';
import { InputError } from '../core/errors.js';
import { toNum, isBlank } from './common.js';

const blank = (n, w) => Array.from({ length: n }, () => Array(w).fill(''));

const be = scalarModel({
	title: 'Hoà vốn (chi phí – doanh thu) – dữ liệu', sheet: 'Hoà vốn',
	hint: 'Điểm hoà vốn là sản lượng tại đó doanh thu bằng tổng chi phí.',
	items: [
		{ key: 'F', label: 'Tổng chi phí cố định (F)', default: 10000, min: 0 }, { key: 'V', label: 'Chi phí biến đổi mỗi đơn vị (V)', default: 3.5, min: 0 },
		{ key: 'P', label: 'Giá bán mỗi đơn vị (P)', default: 8.5, positive: true }, { key: 'Q', label: 'Sản lượng kế hoạch (để tính lợi nhuận)', default: 3000, min: 0 },
	],
	validate: (v) => (v.P <= v.V ? { message: 'Giá bán phải lớn hơn chi phí biến đổi mỗi đơn vị, nếu không không bao giờ hoà vốn.', row: 2 } : null),
	compute: (v) => { const cm = v.P - v.V, q = v.F / cm; return { cm, bq: q, brev: q * v.P, ratio: cm / v.P, profit: v.Q * cm - v.F, margin: v.Q ? (v.Q - q) / v.Q : null }; },
	outputs: [
		{ key: 'cm', label: 'Lãi trên biến phí mỗi đơn vị', f: (I) => `=${I('P')}-${I('V')}` },
		{ key: 'bq', label: 'Sản lượng hoà vốn', strong: true, f: (I, O) => `=${I('F')}/${O('cm')}` },
		{ key: 'brev', label: 'Doanh thu hoà vốn', f: (I, O) => `=${O('bq')}*${I('P')}` },
		{ key: 'ratio', label: 'Tỷ lệ lãi trên biến phí', fmt: 'pct', f: (I, O) => `=${O('cm')}/${I('P')}` },
		{ key: 'profit', label: 'Lợi nhuận tại sản lượng kế hoạch', strong: true, fmt: 'money', f: (I, O) => `=${I('Q')}*${O('cm')}-${I('F')}` },
		{ key: 'margin', label: 'Biên an toàn (so với sản lượng kế hoạch)', fmt: 'pct', f: (I, O) => `=IF(${I('Q')}=0,"",(${I('Q')}-${O('bq')})/${I('Q')})` },
	],
	tables: (v, r) => {
		const top = Math.max(v.Q, r.bq * 1.5, 1), steps = 10;
		const pts = Array.from({ length: steps + 1 }, (_, i) => Math.round(top * i / steps * 100) / 100);
		return [
			{ type: 'table', id: 'g', title: 'Doanh thu và chi phí theo sản lượng', columns: [{ key: 'q', label: 'Sản lượng', fmt: 'num', role: 'input' }, { key: 'rev', label: 'Doanh thu', fmt: 'money' }, { key: 'cost', label: 'Tổng chi phí', fmt: 'money' }, { key: 'pr', label: 'Lợi nhuận', fmt: 'money' }],
				rows: pts.map((q, i) => ({ cells: { q, rev: { f: (R) => `=${R.cell('g', i, 'q')}*${R.kv('in', 'P')}`, v: q * v.P }, cost: { f: (R) => `=${R.kv('in', 'F')}+${R.cell('g', i, 'q')}*${R.kv('in', 'V')}`, v: v.F + q * v.V }, pr: { f: (R) => `=${R.cell('g', i, 'rev')}-${R.cell('g', i, 'cost')}`, v: q * (v.P - v.V) - v.F } } })) },
			{ type: 'chart', kind: 'line', title: 'Đồ thị hoà vốn', table: 'g', x: 'q', series: [{ name: 'Doanh thu', key: 'rev' }, { name: 'Tổng chi phí', key: 'cost' }] },
		];
	},
});

// Cost-volume crossover between several options.
const cv = {
	inputTable: (d, m, sample) => ({
		title: 'Điểm giao nhau chi phí – sản lượng – dữ liệu', sheet: 'Cost-volume', hint: 'Mỗi dòng là một phương án: chi phí cố định và chi phí biến đổi mỗi đơn vị. Khối lượng dự kiến (tuỳ chọn) để biết phương án nào rẻ nhất.',
		columns: [{ label: 'Phương án', fmt: 'text' }, { label: 'Chi phí cố định', fmt: 'num' }, { label: 'Chi phí biến đổi / đơn vị', fmt: 'num' }],
		rows: sample ? [['Tự sản xuất', 800, 10], ['Thuê ngoài', 200, 12], ['Mua sẵn', 0, 15]] : blank(d.rows, 3), firstInputCol: 1,
	}),
	parse({ rows }) {
		const data = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.some((v) => !isBlank(v)));
		if (data.length < 2) throw new InputError('Cần ít nhất 2 phương án.');
		return { names: data.map(({ r, i }) => (isBlank(r[0]) ? `Phương án ${i + 1}` : String(r[0]))), F: data.map(({ r, i }) => toNum(r[1], i, 1, `Chi phí cố định dòng ${i + 1}`)), V: data.map(({ r, i }) => toNum(r[2], i, 2, `Chi phí biến đổi dòng ${i + 1}`)) };
	},
	solve(inp, m, p) {
		const n = inp.F.length, cross = [];
		for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
			const dv = inp.V[i] - inp.V[j];
			if (Math.abs(dv) > 1e-12) { const q = (inp.F[j] - inp.F[i]) / dv; if (q >= 0) cross.push({ a: i, b: j, q, cost: inp.F[i] + inp.V[i] * q }); }
		}
		const vol = Number(p.volume);
		const at = Number.isFinite(vol) && p.volume !== '' ? inp.F.map((f, i) => f + inp.V[i] * vol) : null;
		return { cross, at, best: at ? at.indexOf(Math.min(...at)) : null, vol };
	},
	summary: (res, m, p) => [...(res.best !== null ? [{ label: `Rẻ nhất tại ${res.vol} đơn vị`, value: res._names[res.best], strong: true }] : []), ...res.cross.slice(0, 4).map((c) => ({ label: `${res._names[c.a]} = ${res._names[c.b]}`, value: c.q, fmt: 'num' }))],
	report(inp, res, m, p) {
		const n = inp.F.length;
		const top = Math.max(1, ...res.cross.map((c) => c.q), Number(p.volume) || 0) * 1.5;
		const pts = Array.from({ length: 11 }, (_, i) => Math.round(top * i / 10 * 100) / 100);
		const blocks = [
			{ type: 'table', id: 'opt', title: 'Các phương án', columns: [{ key: 'name', label: 'Phương án', fmt: 'text', role: 'label' }, { key: 'F', label: 'Chi phí cố định', fmt: 'money', role: 'input' }, { key: 'V', label: 'Biến phí / đơn vị', fmt: 'num', role: 'input' }, { key: 'at', label: 'Tổng chi phí tại khối lượng dự kiến', fmt: 'money' }],
				rows: inp.names.map((nm, i) => ({ highlight: i === res.best, cells: { name: nm, F: inp.F[i], V: inp.V[i], at: res.at ? { f: (R) => `=${R.cell('opt', i, 'F')}+${R.cell('opt', i, 'V')}*${R.kv('p', 'vol')}`, v: res.at[i] } : '' } })) },
			{ type: 'kv', id: 'p', title: 'Khối lượng dự kiến', items: [{ key: 'vol', label: 'Khối lượng', value: Number.isFinite(res.vol) ? res.vol : '', fmt: 'num', role: 'input' }] },
			{ type: 'table', id: 'x', title: 'Điểm giao nhau', columns: [{ key: 'a', label: 'Phương án A', fmt: 'text', role: 'label' }, { key: 'b', label: 'Phương án B', fmt: 'text', role: 'label' }, { key: 'q', label: 'Khối lượng bằng chi phí', fmt: 'num' }, { key: 'c', label: 'Chi phí tại điểm đó', fmt: 'money' }],
				rows: res.cross.map((c) => ({ cells: { a: inp.names[c.a], b: inp.names[c.b], q: { f: (R) => `=(${R.cell('opt', c.b, 'F')}-${R.cell('opt', c.a, 'F')})/(${R.cell('opt', c.a, 'V')}-${R.cell('opt', c.b, 'V')})`, v: c.q }, c: { f: (R) => `=${R.cell('opt', c.a, 'F')}+${R.cell('opt', c.a, 'V')}*${R.cell('x', res.cross.indexOf(c), 'q')}`, v: c.cost } } })) },
			{ type: 'table', id: 'g', title: 'Chi phí theo khối lượng', columns: [{ key: 'q', label: 'Khối lượng', fmt: 'num', role: 'input' }, ...inp.names.map((nm, i) => ({ key: 'c' + i, label: nm, fmt: 'money' }))],
				rows: pts.map((q, r) => ({ cells: { q, ...Object.fromEntries(inp.F.map((F, i) => ['c' + i, { f: (R) => `=${R.cell('opt', i, 'F')}+${R.cell('opt', i, 'V')}*${R.cell('g', r, 'q')}`, v: F + inp.V[i] * q }])) } })) },
			{ type: 'chart', kind: 'line', title: 'Chi phí các phương án', table: 'g', x: 'q', series: inp.names.map((nm, i) => ({ name: nm, key: 'c' + i })) },
		];
		void n;
		return { title: 'Điểm giao nhau chi phí – sản lượng – kết quả', subtitle: 'Phương án tô vàng rẻ nhất tại khối lượng dự kiến.', blocks };
	},
};

// Multiproduct breakeven
const multi = {
	inputTable: (d, m, sample) => ({
		title: 'Hoà vốn nhiều sản phẩm – dữ liệu', sheet: 'Hoà vốn nhiều SP', hint: 'Mỗi dòng là một sản phẩm. Ô “Tổng chi phí cố định” ghi ở dòng đầu, cột bên phải.',
		columns: [{ label: 'Sản phẩm', fmt: 'text' }, { label: 'Giá bán', fmt: 'num' }, { label: 'Biến phí / đơn vị', fmt: 'num' }, { label: 'Tỷ trọng doanh số', fmt: 'num' }, { label: 'Tổng chi phí cố định', fmt: 'num' }],
		rows: sample ? [['Bữa trưa', 6.9, 3.2, 0.5, 15000], ['Đồ uống', 1.5, 0.5, 0.3, ''], ['Tráng miệng', 3, 1.6, 0.2, '']] : blank(d.rows, 5), firstInputCol: 1,
	}),
	parse({ rows }) {
		const data = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.slice(0, 4).some((v) => !isBlank(v)));
		if (data.length < 1) throw new InputError('Cần ít nhất 1 sản phẩm.');
		if (isBlank(rows[0]?.[4])) throw new InputError('Nhập tổng chi phí cố định ở dòng đầu, cột “Tổng chi phí cố định”.', 0, 4);
		const F = toNum(rows[0][4], 0, 4, 'Tổng chi phí cố định');
		const items = data.map(({ r, i }) => ({ name: isBlank(r[0]) ? `Sản phẩm ${i + 1}` : String(r[0]), price: toNum(r[1], i, 1, `Giá dòng ${i + 1}`), vc: toNum(r[2], i, 2, `Biến phí dòng ${i + 1}`), w: toNum(r[3], i, 3, `Tỷ trọng dòng ${i + 1}`), _row: i }));
		const sw = items.reduce((a, b) => a + b.w, 0);
		if (Math.abs(sw - 1) > 1e-6) throw new InputError(`Tổng tỷ trọng doanh số phải bằng 1 (đang là ${+sw.toFixed(6)}).`, items[items.length - 1]._row, 3);
		for (const it of items) if (it.price <= 0) throw new InputError(`Giá bán của ${it.name} phải lớn hơn 0.`, it._row, 1);
		return { F, items };
	},
	solve(inp) {
		const wc = inp.items.reduce((a, it) => a + (1 - it.vc / it.price) * it.w, 0);
		if (wc <= 0) throw new InputError('Tỷ lệ lãi biến phí bình quân không dương; không thể hoà vốn.');
		const rev = inp.F / wc;
		return { wc, rev, rows: inp.items.map((it) => ({ rev: rev * it.w, units: rev * it.w / it.price })) };
	},
	summary: (res) => [{ label: 'Doanh thu hoà vốn', value: res.rev, fmt: 'money', strong: true }, { label: 'Tỷ lệ lãi biến phí bình quân', value: res.wc, fmt: 'pct' }],
	report(inp, res) {
		const n = inp.items.length;
		return {
			title: 'Hoà vốn nhiều sản phẩm – kết quả', subtitle: 'Doanh thu hoà vốn = chi phí cố định / tỷ lệ lãi biến phí bình quân có trọng số.',
			blocks: [
				{ type: 'kv', id: 'p', title: 'Tham số', items: [{ key: 'F', label: 'Tổng chi phí cố định', value: inp.F, fmt: 'money', role: 'input' }] },
				{ type: 'table', id: 't', title: 'Sản phẩm', columns: [
					{ key: 'name', label: 'Sản phẩm', fmt: 'text', role: 'label' }, { key: 'price', label: 'Giá bán', fmt: 'num', role: 'input' }, { key: 'vc', label: 'Biến phí', fmt: 'num', role: 'input' }, { key: 'w', label: 'Tỷ trọng', fmt: 'num', role: 'input' },
					{ key: 'cm', label: 'Lãi biến phí %', fmt: 'pct' }, { key: 'wcm', label: 'Đóng góp có trọng số', fmt: 'num' }, { key: 'rev', label: 'Doanh thu hoà vốn', fmt: 'money' }, { key: 'u', label: 'Số đơn vị hoà vốn', fmt: 'num' },
				], rows: inp.items.map((it, i) => ({ cells: { name: it.name, price: it.price, vc: it.vc, w: it.w,
					cm: { f: (R) => `=1-${R.cell('t', i, 'vc')}/${R.cell('t', i, 'price')}`, v: 1 - it.vc / it.price }, wcm: { f: (R) => `=${R.cell('t', i, 'cm')}*${R.cell('t', i, 'w')}`, v: (1 - it.vc / it.price) * it.w },
					rev: { f: (R) => `=${R.kv('r', 'rev')}*${R.cell('t', i, 'w')}`, v: res.rows[i].rev }, u: { f: (R) => `=${R.cell('t', i, 'rev')}/${R.cell('t', i, 'price')}`, v: res.rows[i].units } } })) },
				{ type: 'kv', id: 'r', title: 'Kết quả', items: [
					{ key: 'wc', label: 'Tỷ lệ lãi biến phí bình quân', value: { f: (R) => `=SUM(${R.col('t', 'wcm', 0, n - 1)})`, v: res.wc }, fmt: 'pct' },
					{ key: 'rev', label: 'Doanh thu hoà vốn', value: { f: (R) => `=${R.kv('p', 'F')}/${R.kv('r', 'wc')}`, v: res.rev }, fmt: 'money' },
				] },
			],
		};
	},
};

export { cv as crossModel };
const IMPL = { cost: be, cross: cv, multi };
export default {
	id: 'breakeven',
	name: 'Hoà vốn / Cost-volume',
	group: 'Tài chính',
	keywords: 'breakeven cost volume crossover multiproduct hoa von giao nhau nhieu san pham',
	models: [
		{ id: 'cost', name: 'Hoà vốn chi phí – doanh thu', table: 'cost', params: [] },
		{ id: 'cross', name: 'Điểm giao nhau chi phí giữa các phương án', table: 'cross', dims: [{ id: 'rows', label: 'Số phương án', default: 3, min: 2, max: 20 }], params: [{ id: 'volume', label: 'Khối lượng dự kiến (tuỳ chọn)', type: 'num', default: 500, optional: true }] },
		{ id: 'multi', name: 'Hoà vốn nhiều sản phẩm', table: 'multi', dims: [{ id: 'rows', label: 'Số sản phẩm', default: 3, min: 1, max: 30 }], params: [] },
	],
	inputTable: (d, m, s) => IMPL[m.id].inputTable(d, m, s),
	parse: (t, m, p) => IMPL[m.id].parse(t, m, p),
	solve(i, m, p) { const r = IMPL[m.id].solve(i, m, p); if (m.id === 'cross') r._names = i.names; return r; },
	summary: (r, m, p) => IMPL[m.id].summary(r, m, p),
	report: (i, r, m, p) => IMPL[m.id].report(i, r, m, p),
};
