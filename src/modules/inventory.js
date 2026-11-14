import * as L from '../../lib/inventory.js';
import { scalarModel } from './param.js';
import { InputError } from '../core/errors.js';
import { toNum, isBlank } from './common.js';

const G1 = 'Đặt hàng kinh tế', G2 = 'Dự trữ an toàn', G3 = 'Phân loại & Kanban';
const dims = (d) => [{ id: 'rows', label: d.label, default: d.default, min: d.min ?? 2, max: d.max ?? 200 }];
const blank = (n, w) => Array.from({ length: n }, () => Array(w).fill(''));

const eoqModel = scalarModel({
	title: 'EOQ – dữ liệu', sheet: 'EOQ', hint: 'Mô hình lượng đặt hàng kinh tế cơ bản (nhu cầu đều, nhận hàng tức thì).',
	items: [
		{ key: 'D', label: 'Nhu cầu hằng năm (D)', default: 1000, positive: true }, { key: 'S', label: 'Chi phí đặt hàng mỗi lần (S)', default: 10, min: 0 },
		{ key: 'H', label: 'Chi phí lưu kho mỗi đơn vị mỗi năm (H)', default: 0.5, positive: true }, { key: 'days', label: 'Số ngày làm việc trong năm', default: 250, positive: true },
	],
	compute: (v) => L.eoq(v),
	outputs: [
		{ key: 'Q', label: 'Lượng đặt tối ưu EOQ', strong: true, f: (I) => `=SQRT(2*${I('D')}*${I('S')}/${I('H')})` },
		{ key: 'N', label: 'Số lần đặt hàng mỗi năm', f: (I, O) => `=${I('D')}/${O('Q')}` },
		{ key: 'T', label: 'Thời gian giữa hai lần đặt (ngày)', f: (I, O) => `=${I('days')}/${O('N')}` },
		{ key: 'ordering', label: 'Chi phí đặt hàng hằng năm', f: (I, O) => `=${O('N')}*${I('S')}` },
		{ key: 'holding', label: 'Chi phí lưu kho hằng năm', f: (I, O) => `=${O('Q')}/2*${I('H')}` },
		{ key: 'total', label: 'Tổng chi phí tồn kho hằng năm', strong: true, f: (I, O) => `=${O('ordering')}+${O('holding')}` },
	],
});
const epqModel = scalarModel({
	title: 'EOQ nhận hàng dần (POQ) – dữ liệu', sheet: 'POQ', hint: 'Sản xuất hoặc nhận hàng dần: tốc độ sản xuất p lớn hơn tốc độ tiêu thụ d.',
	items: [
		{ key: 'D', label: 'Nhu cầu hằng năm (D)', default: 1000, positive: true }, { key: 'S', label: 'Chi phí chuẩn bị mỗi lần (S)', default: 10, min: 0 },
		{ key: 'H', label: 'Chi phí lưu kho mỗi đơn vị mỗi năm (H)', default: 0.5, positive: true },
		{ key: 'p', label: 'Tốc độ sản xuất mỗi ngày (p)', default: 8, positive: true }, { key: 'd', label: 'Tốc độ tiêu thụ mỗi ngày (d)', default: 4, positive: true },
	],
	compute: (v) => L.epq(v),
	outputs: [
		{ key: 'Q', label: 'Lượng sản xuất tối ưu', strong: true, f: (I) => `=SQRT(2*${I('D')}*${I('S')}/(${I('H')}*(1-${I('d')}/${I('p')})))` },
		{ key: 'Imax', label: 'Tồn kho tối đa', f: (I, O) => `=${O('Q')}*(1-${I('d')}/${I('p')})` },
		{ key: 'runTime', label: 'Thời gian chạy mỗi đợt (ngày)', f: (I, O) => `=${O('Q')}/${I('p')}` },
		{ key: 'N', label: 'Số đợt mỗi năm', f: (I, O) => `=${I('D')}/${O('Q')}` },
		{ key: 'ordering', label: 'Chi phí chuẩn bị hằng năm', f: (I, O) => `=${O('N')}*${I('S')}` },
		{ key: 'holding', label: 'Chi phí lưu kho hằng năm', f: (I, O) => `=${O('Imax')}/2*${I('H')}` },
		{ key: 'total', label: 'Tổng chi phí hằng năm', strong: true, f: (I, O) => `=${O('ordering')}+${O('holding')}` },
	],
});
const shortModel = scalarModel({
	title: 'EOQ cho phép thiếu hàng – dữ liệu', sheet: 'EOQ thiếu hàng', hint: 'Thiếu hàng được ghi nhận và giao bù sau (backorder).',
	items: [
		{ key: 'D', label: 'Nhu cầu hằng năm (D)', default: 1000, positive: true }, { key: 'S', label: 'Chi phí đặt hàng mỗi lần (S)', default: 10, min: 0 },
		{ key: 'H', label: 'Chi phí lưu kho mỗi đơn vị mỗi năm (H)', default: 0.5, positive: true }, { key: 'B', label: 'Chi phí thiếu hàng mỗi đơn vị mỗi năm (B)', default: 2, positive: true },
	],
	compute: (v) => L.eoqShortage(v),
	outputs: [
		{ key: 'Q', label: 'Lượng đặt tối ưu', strong: true, f: (I) => `=SQRT(2*${I('D')}*${I('S')}/${I('H')}*(${I('H')}+${I('B')})/${I('B')})` },
		{ key: 'Smax', label: 'Tồn kho tối đa', f: (I, O) => `=${O('Q')}*${I('B')}/(${I('H')}+${I('B')})` },
		{ key: 'back', label: 'Lượng thiếu tối đa', f: (I, O) => `=${O('Q')}-${O('Smax')}` },
		{ key: 'N', label: 'Số lần đặt mỗi năm', f: (I, O) => `=${I('D')}/${O('Q')}` },
		{ key: 'ordering', label: 'Chi phí đặt hàng', f: (I, O) => `=${O('N')}*${I('S')}` },
		{ key: 'holding', label: 'Chi phí lưu kho', f: (I, O) => `=${O('Smax')}^2/(2*${O('Q')})*${I('H')}` },
		{ key: 'shortage', label: 'Chi phí thiếu hàng', f: (I, O) => `=${O('back')}^2/(2*${O('Q')})*${I('B')}` },
		{ key: 'total', label: 'Tổng chi phí hằng năm', strong: true, f: (I, O) => `=${O('ordering')}+${O('holding')}+${O('shortage')}` },
	],
});
const kanbanModel = scalarModel({
	title: 'Số thẻ Kanban – dữ liệu', sheet: 'Kanban', hint: 'N = D × L × (1 + S) / C',
	items: [
		{ key: 'D', label: 'Nhu cầu mỗi ngày (D)', default: 500, positive: true }, { key: 'L', label: 'Thời gian chờ + gia công (ngày) (L)', default: 0.12, min: 0 },
		{ key: 'S', label: 'Hệ số an toàn (S)', default: 0.1, min: 0 }, { key: 'C', label: 'Số đơn vị trong một thùng (C)', default: 22, positive: true },
	],
	compute: (v) => { const k = L.kanban(v); return { N: k.N, Nup: Math.ceil(k.N - 1e-9) }; },
	outputs: [
		{ key: 'N', label: 'Số thẻ Kanban (chưa làm tròn)', f: (I) => `=${I('D')}*${I('L')}*(1+${I('S')})/${I('C')}` },
		{ key: 'Nup', label: 'Số thẻ Kanban cần dùng', strong: true, fmt: 'int', f: (I, O) => `=ROUNDUP(ROUND(${O('N')},9),0)` },
	],
});
const ropNormal = scalarModel({
	title: 'Điểm đặt hàng lại (phân phối chuẩn) – dữ liệu', sheet: 'ROP chuẩn', hint: 'Nhu cầu trong thời gian chờ hàng theo phân phối chuẩn.',
	items: [
		{ key: 'mu', label: 'Nhu cầu trung bình trong thời gian chờ', default: 350, min: 0 }, { key: 'sigma', label: 'Độ lệch chuẩn nhu cầu trong thời gian chờ', default: 10, positive: true },
		{ key: 'service', label: 'Mức phục vụ (0–1)', default: 0.95, min: 0.001, max: 0.999 },
	],
	compute: (v) => L.reorderNormal(v),
	outputs: [
		{ key: 'z', label: 'Hệ số z', f: (I) => `=NORM.S.INV(${I('service')})` },
		{ key: 'safety', label: 'Tồn kho an toàn', f: (I, O) => `=${O('z')}*${I('sigma')}` },
		{ key: 'rop', label: 'Điểm đặt hàng lại (ROP)', strong: true, f: (I, O) => `=${I('mu')}+${O('safety')}` },
	],
});

const rowsOf = (rows) => rows.map((r, i) => ({ r, i })).filter(({ r }) => r.some((v) => !isBlank(v)));

const tiers = {
	inputTable: (d, m, sample) => ({
		title: 'Chiết khấu theo số lượng – dữ liệu', sheet: 'Chiết khấu số lượng', hint: 'Mỗi dòng là một mức giá: số lượng tối thiểu để được giá đó. Chi phí lưu kho tính theo tỷ lệ % của giá (hoặc nhập H cố định).',
		columns: [{ label: 'Tham số', fmt: 'text' }, { label: 'Giá trị', fmt: 'num' }, { label: 'Số lượng tối thiểu', fmt: 'num' }, { label: 'Đơn giá', fmt: 'num' }],
		rows: sample ? [['Nhu cầu hằng năm (D)', 5000, 1, 5], ['Chi phí đặt hàng (S)', 49, 1000, 4.8], ['Tỷ lệ lưu kho (I, % giá)', 0.2, 2000, 4.75], ['Lưu kho cố định H (trống = dùng I)', '', '', '']]
			: [['Nhu cầu hằng năm (D)', '', '', ''], ['Chi phí đặt hàng (S)', '', '', ''], ['Tỷ lệ lưu kho (I, % giá)', '', '', ''], ['Lưu kho cố định H (trống = dùng I)', '', '', ''], ...blank(Math.max(0, d.rows - 4), 4).map((r) => ['', '', '', ''])],
		firstInputCol: 1,
	}),
	parse({ rows }) {
		const D = toNum(rows[0]?.[1], 0, 1, 'Nhu cầu hằng năm'), S = toNum(rows[1]?.[1], 1, 1, 'Chi phí đặt hàng');
		const I = isBlank(rows[2]?.[1]) ? null : toNum(rows[2][1], 2, 1, 'Tỷ lệ lưu kho'), H = isBlank(rows[3]?.[1]) ? null : toNum(rows[3][1], 3, 1, 'Lưu kho cố định');
		if (I === null && H === null) throw new InputError('Cần nhập tỷ lệ lưu kho I hoặc chi phí lưu kho cố định H.', 2, 1);
		const tr = rows.map((r, i) => ({ r, i })).filter(({ r }) => !isBlank(r[2]) || !isBlank(r[3]))
			.map(({ r, i }) => ({ min: toNum(r[2], i, 2, `Số lượng tối thiểu dòng ${i + 1}`), price: toNum(r[3], i, 3, `Đơn giá dòng ${i + 1}`) }));
		if (tr.length < 2) throw new InputError('Cần ít nhất 2 mức giá.');
		return { D, S, I, H, tiers: tr };
	},
	solve: (inp) => L.quantityDiscount({ D: inp.D, S: inp.S, I: inp.I ?? undefined, H: inp.H ?? undefined, tiers: inp.tiers }),
	summary: (res) => [{ label: 'Số lượng nên đặt', value: res.best.Q, fmt: 'num', strong: true }, { label: 'Đơn giá được hưởng', value: res.best.price, fmt: 'num' }, { label: 'Tổng chi phí', value: res.best.total, fmt: 'money' }],
	report(inp, res) {
		return {
			title: 'Chiết khấu theo số lượng – kết quả', subtitle: 'Với mỗi mức giá: tính EOQ, điều chỉnh lên mức tối thiểu nếu EOQ nhỏ hơn, loại bỏ nếu EOQ vượt khung. Chọn tổng chi phí nhỏ nhất.',
			blocks: [
				{ type: 'kv', id: 'p', title: 'Tham số', items: [{ key: 'D', label: 'Nhu cầu hằng năm', value: inp.D, fmt: 'num', role: 'input' }, { key: 'S', label: 'Chi phí đặt hàng', value: inp.S, fmt: 'num', role: 'input' }, { key: 'I', label: 'Tỷ lệ lưu kho (I)', value: inp.I ?? '', fmt: 'num', role: 'input' }] },
				{ type: 'table', id: 't', title: 'So sánh các mức giá', columns: [
					{ key: 'min', label: 'Từ số lượng', fmt: 'num', role: 'input' }, { key: 'max', label: 'Đến', fmt: 'text', role: 'label' }, { key: 'price', label: 'Đơn giá', fmt: 'num', role: 'input' },
					{ key: 'h', label: 'Chi phí lưu kho / đơn vị', fmt: 'num' }, { key: 'qs', label: 'EOQ', fmt: 'num' }, { key: 'q', label: 'Lượng đặt dùng', fmt: 'num' },
					{ key: 'tc', label: 'Tổng chi phí', fmt: 'money' },
				], rows: res.rows.map((r, i) => ({ highlight: i === res.bestIndex, cells: {
					min: r.min, max: r.max === Infinity ? 'trở lên' : r.max, price: r.price,
					h: inp.H !== null ? inp.H : { f: (R) => `=${R.kv('p', 'I')}*${R.cell('t', i, 'price')}`, v: r.h },
					qs: { f: (R) => `=SQRT(2*${R.kv('p', 'D')}*${R.kv('p', 'S')}/${R.cell('t', i, 'h')})`, v: r.qStar },
					q: r.Q === null ? 'Không khả thi' : { f: (R) => `=IF(${R.cell('t', i, 'qs')}<${R.cell('t', i, 'min')},${R.cell('t', i, 'min')},${R.cell('t', i, 'qs')})`, v: r.Q },
					tc: r.total === null ? '' : { f: (R) => `=${R.kv('p', 'D')}/${R.cell('t', i, 'q')}*${R.kv('p', 'S')}+${R.cell('t', i, 'q')}/2*${R.cell('t', i, 'h')}+${R.kv('p', 'D')}*${R.cell('t', i, 'price')}`, v: r.total },
				} })) },
				{ type: 'kv', id: 'r', title: 'Kết luận', items: [{ key: 'q', label: 'Số lượng nên đặt', value: res.best.Q, fmt: 'num' }, { key: 'pr', label: 'Đơn giá được hưởng', value: res.best.price, fmt: 'num' }, { key: 'c', label: 'Tổng chi phí', value: res.best.total, fmt: 'money' }] },
			],
		};
	},
};

const abcModel = {
	inputTable: (d, m, sample) => ({
		title: 'Phân tích ABC – dữ liệu', sheet: 'ABC', hint: 'Mỗi dòng là một mặt hàng: nhu cầu hằng năm và giá trị mỗi đơn vị. Ngưỡng nhóm A và B chỉnh ở ô tham số trong pane.',
		columns: [{ label: 'Mặt hàng', fmt: 'text' }, { label: 'Nhu cầu hằng năm', fmt: 'num' }, { label: 'Giá mỗi đơn vị', fmt: 'num' }],
		rows: sample ? [['#10286', 1000, 90], ['#11526', 500, 154], ['#12760', 1550, 17], ['#10867', 350, 42.86], ['#10500', 1000, 12.5], ['#12572', 600, 14.17], ['#14075', 2000, 0.6], ['#01307', 100, 8.5], ['#10572', 250, 0.42], ['#12134', 1200, 0.5]]
			: blank(d.rows, 3), firstInputCol: 1,
	}),
	parse({ rows }) {
		const data = rowsOf(rows);
		if (data.length < 2) throw new InputError('Cần ít nhất 2 mặt hàng.');
		return { items: data.map(({ r, i }) => ({ name: isBlank(r[0]) ? `Mặt hàng ${i + 1}` : String(r[0]), demand: toNum(r[1], i, 1, `Nhu cầu dòng ${i + 1}`), cost: toNum(r[2], i, 2, `Giá dòng ${i + 1}`) })) };
	},
	solve: (inp, m, p) => L.abc(inp.items, Number(p.cutA) || 0.8, Number(p.cutB) || 0.95),
	summary: (res) => ['A', 'B', 'C'].map((c) => ({ label: `Nhóm ${c}`, value: `${res.rows.filter((r) => r.cls === c).length} mặt hàng, ${(res.rows.filter((r) => r.cls === c).reduce((s, r) => s + r.share, 0) * 100).toFixed(1)}% giá trị` })),
	report(inp, res, m, p) {
		const N = res.rows.length;
		return {
			title: 'Phân tích ABC – kết quả', subtitle: 'Sắp xếp theo giá trị hằng năm giảm dần; nhóm A đến hết ngưỡng A, nhóm B đến hết ngưỡng B, còn lại là nhóm C.',
			blocks: [
				{ type: 'kv', id: 'p', title: 'Ngưỡng cộng dồn', items: [{ key: 'a', label: 'Ngưỡng nhóm A', value: Number(p.cutA) || 0.8, fmt: 'pct', role: 'input' }, { key: 'b', label: 'Ngưỡng nhóm B', value: Number(p.cutB) || 0.95, fmt: 'pct', role: 'input' }] },
				{ type: 'table', id: 't', title: 'Bảng phân loại', columns: [
					{ key: 'name', label: 'Mặt hàng', fmt: 'text', role: 'label' }, { key: 'dem', label: 'Nhu cầu', fmt: 'num', role: 'input' }, { key: 'cost', label: 'Giá / đơn vị', fmt: 'num', role: 'input' },
					{ key: 'vol', label: 'Giá trị hằng năm', fmt: 'money' }, { key: 'sh', label: '% giá trị', fmt: 'pct' }, { key: 'cum', label: '% cộng dồn', fmt: 'pct' }, { key: 'cls', label: 'Nhóm', fmt: 'text' },
				], rows: res.rows.map((r, i) => ({ highlight: r.cls === 'A', cells: {
					name: r.name, dem: r.demand, cost: r.cost,
					vol: { f: (R) => `=${R.cell('t', i, 'dem')}*${R.cell('t', i, 'cost')}`, v: r.vol },
					sh: { f: (R) => `=${R.cell('t', i, 'vol')}/SUM(${R.col('t', 'vol', 0, N - 1)})`, v: r.share },
					cum: { f: (R) => (i ? `=${R.cell('t', i - 1, 'cum')}+${R.cell('t', i, 'sh')}` : `=${R.cell('t', 0, 'sh')}`), v: r.cum },
					cls: { f: (R) => `=IF(${i ? R.cell('t', i - 1, 'cum') : '0'}<${R.kv('p', 'a')}-0.000000000001,"A",IF(${i ? R.cell('t', i - 1, 'cum') : '0'}<${R.kv('p', 'b')}-0.000000000001,"B","C"))` },
				} })) },
				{ type: 'chart', kind: 'line', title: 'Đường cong Pareto (% giá trị cộng dồn)', table: 't', x: 'name', series: [{ name: '% cộng dồn', key: 'cum' }] },
			],
		};
	},
};
const discrete = {
	inputTable: (d, m, sample) => ({
		title: 'Điểm đặt hàng lại (phân phối rời rạc) – dữ liệu', sheet: 'ROP rời rạc', hint: 'Mỗi dòng: nhu cầu có thể xảy ra trong thời gian chờ hàng và xác suất. Ba ô đầu cột “Giá trị”: chi phí lưu kho, chi phí thiếu hàng, số lần đặt mỗi năm.',
		columns: [{ label: 'Nhu cầu trong thời gian chờ', fmt: 'num' }, { label: 'Xác suất', fmt: 'num' }, { label: 'Tham số', fmt: 'text' }, { label: 'Giá trị', fmt: 'num' }],
		rows: sample ? [[30, 0.2, 'Chi phí lưu kho / đơn vị / năm', 5], [40, 0.2, 'Chi phí thiếu hàng / đơn vị / lần đặt', 40], [50, 0.3, 'Số lần đặt mỗi năm', 6], [60, 0.2, '', ''], [70, 0.1, '', '']]
			: [['', '', 'Chi phí lưu kho / đơn vị / năm', ''], ['', '', 'Chi phí thiếu hàng / đơn vị / lần đặt', ''], ['', '', 'Số lần đặt mỗi năm', ''], ...blank(Math.max(0, d.rows - 3), 4)],
		firstInputCol: 0,
	}),
	parse({ rows }) {
		const pr = (i, what) => toNum(rows[i]?.[3], i, 3, what);
		const carry = pr(0, 'Chi phí lưu kho'), stockout = pr(1, 'Chi phí thiếu hàng'), orders = pr(2, 'Số lần đặt hàng');
		const data = rows.map((r, i) => ({ r, i })).filter(({ r }) => !isBlank(r[0]) || !isBlank(r[1]));
		if (data.length < 2) throw new InputError('Cần ít nhất 2 mức nhu cầu.');
		const demand = data.map(({ r, i }) => toNum(r[0], i, 0, `Nhu cầu dòng ${i + 1}`)), probs = data.map(({ r, i }) => toNum(r[1], i, 1, `Xác suất dòng ${i + 1}`));
		const s = probs.reduce((a, b) => a + b, 0);
		if (Math.abs(s - 1) > 1e-6) throw new InputError(`Tổng xác suất phải bằng 1 (đang là ${+s.toFixed(6)}).`, data[data.length - 1].i, 1);
		return { demand, probs, carry, stockout, orders };
	},
	solve: (inp) => L.reorderDiscrete(inp),
	summary: (res) => [{ label: 'Điểm đặt hàng lại tốt nhất', value: res.best.rop, fmt: 'num', strong: true }, { label: 'Tồn kho an toàn', value: res.best.safety, fmt: 'num' }, { label: 'Chi phí kỳ vọng', value: res.best.total, fmt: 'money' }, { label: 'Mức phục vụ', value: res.best.serviceLevel, fmt: 'pct' }],
	report(inp, res) {
		const n = res.rows.length;
		return {
			title: 'Điểm đặt hàng lại (rời rạc) – kết quả', subtitle: 'Chi phí = tồn kho an toàn × chi phí lưu kho + thiếu hụt kỳ vọng × chi phí thiếu × số lần đặt. Chọn ROP có tổng thấp nhất.',
			blocks: [
				{ type: 'kv', id: 'p', title: 'Tham số', items: [{ key: 'mean', label: 'Nhu cầu trung bình', value: res.mean, fmt: 'num' }, { key: 'c', label: 'Chi phí lưu kho', value: inp.carry, fmt: 'num', role: 'input' }, { key: 's', label: 'Chi phí thiếu hàng', value: inp.stockout, fmt: 'num', role: 'input' }, { key: 'o', label: 'Số lần đặt mỗi năm', value: inp.orders, fmt: 'num', role: 'input' }] },
				{ type: 'table', id: 't', title: 'Chi phí theo từng điểm đặt hàng lại', columns: [
					{ key: 'rop', label: 'ROP', fmt: 'num', role: 'input' }, { key: 'safe', label: 'Tồn kho an toàn', fmt: 'num' }, { key: 'sh', label: 'Thiếu hụt kỳ vọng', fmt: 'num' },
					{ key: 'cc', label: 'Chi phí lưu kho', fmt: 'money' }, { key: 'sc', label: 'Chi phí thiếu hàng', fmt: 'money' }, { key: 'tc', label: 'Tổng chi phí', fmt: 'money' }, { key: 'sl', label: 'Mức phục vụ', fmt: 'pct' },
				], rows: res.rows.map((r, i) => ({ highlight: i === res.bestIndex, cells: {
					rop: r.rop, safe: { f: (R) => `=${R.cell('t', i, 'rop')}-${R.kv('p', 'mean')}`, v: r.safety }, sh: r.expShort,
					cc: { f: (R) => `=MAX(${R.cell('t', i, 'safe')},0)*${R.kv('p', 'c')}`, v: r.carryCost }, sc: { f: (R) => `=${R.cell('t', i, 'sh')}*${R.kv('p', 's')}*${R.kv('p', 'o')}`, v: r.stockCost },
					tc: { f: (R) => `=${R.cell('t', i, 'cc')}+${R.cell('t', i, 'sc')}`, v: r.total }, sl: r.serviceLevel,
				} })) },
				{ type: 'kv', id: 'r', title: 'Kết luận', items: [{ key: 'b', label: 'ROP chi phí thấp nhất', value: { f: (R) => `=INDEX(${R.col('t', 'rop', 0, n - 1)},MATCH(MIN(${R.col('t', 'tc', 0, n - 1)}),${R.col('t', 'tc', 0, n - 1)},0))`, v: res.best.rop }, fmt: 'num' }] },
			],
		};
	},
};

const MODELS = [
	{ id: 'eoq', name: 'EOQ cơ bản', group: G1, impl: eoqModel, table: 'eoq' },
	{ id: 'poq', name: 'EOQ nhận hàng dần (POQ / EPQ)', group: G1, impl: epqModel, table: 'poq' },
	{ id: 'shortage', name: 'EOQ cho phép thiếu hàng', group: G1, impl: shortModel, table: 'shortage' },
	{ id: 'discount', name: 'Chiết khấu theo số lượng', group: G1, impl: tiers, table: 'discount', dims: dims({ label: 'Số dòng', default: 7, min: 6 }) },
	{ id: 'ropNormal', name: 'Điểm đặt hàng lại – phân phối chuẩn', group: G2, impl: ropNormal, table: 'ropNormal' },
	{ id: 'ropDiscrete', name: 'Điểm đặt hàng lại – phân phối rời rạc', group: G2, impl: discrete, table: 'ropDiscrete', dims: dims({ label: 'Số dòng', default: 8, min: 4 }) },
	{ id: 'abc', name: 'Phân tích ABC', group: G3, impl: abcModel, table: 'abc', dims: dims({ label: 'Số mặt hàng', default: 10, min: 2 }),
		params: [{ id: 'cutA', label: 'Ngưỡng cộng dồn nhóm A', type: 'num', default: 0.8, min: 0.05, max: 0.99, step: 0.05 }, { id: 'cutB', label: 'Ngưỡng cộng dồn nhóm B', type: 'num', default: 0.95, min: 0.1, max: 0.999, step: 0.05 }] },
	{ id: 'kanban', name: 'Số thẻ Kanban', group: G3, impl: kanbanModel, table: 'kanban' },
];
const byId = Object.fromEntries(MODELS.map((m) => [m.id, m]));

export default {
	id: 'inventory',
	name: 'Tồn kho',
	group: 'Tồn kho & vận hành',
	keywords: 'inventory eoq epq poq quantity discount abc reorder point safety stock kanban ton kho dat hang chiet khau',
	models: MODELS.map(({ id, name, group, table, dims: d, params }) => ({ id, name, group, table, dims: d, params: params || [] })),
	inputTable: (d, m, s) => byId[m.id].impl.inputTable(d, m, s),
	parse: (t, m, p) => byId[m.id].impl.parse(t, m, p),
	solve: (i, m, p) => byId[m.id].impl.solve(i, m, p),
	summary: (r, m, p) => byId[m.id].impl.summary(r, m, p),
	report: (i, r, m, p) => byId[m.id].impl.report(i, r, m, p),
};
