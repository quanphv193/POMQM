import * as Q from '../../lib/quality.js';
import { InputError } from '../core/errors.js';
import { scalarModel } from './param.js';
import { toNum, isBlank } from './common.js';

const blank = (n, w) => Array.from({ length: n }, () => Array(w).fill(''));
const Z = { id: 'z', label: 'Số độ lệch chuẩn của giới hạn (z)', type: 'num', default: 3, min: 1, max: 6, step: 0.5 };

const pChart = {
	inputTable: (d, m, sample) => ({
		title: 'Biểu đồ kiểm soát p – dữ liệu', sheet: 'Biểu đồ p', hint: 'Mỗi dòng là một mẫu: số sản phẩm lỗi trong mẫu. Cỡ mẫu nhập ở ô tham số.',
		columns: [{ label: 'Mẫu', fmt: 'text' }, { label: 'Số sản phẩm lỗi', fmt: 'num' }],
		rows: sample ? [4, 2, 5, 3, 6, 1, 3, 4, 2, 7, 3, 2, 4, 5, 3, 2, 6, 4, 3, 2].map((v, i) => [i + 1, v]) : blank(d.rows, 2).map((r, i) => [i + 1, '']), firstInputCol: 1,
	}),
	parse({ rows }) {
		const data = rows.map((r, i) => ({ r, i })).filter(({ r }) => !isBlank(r[1]));
		if (data.length < 2) throw new InputError('Cần ít nhất 2 mẫu.');
		return { d: data.map(({ r, i }) => toNum(r[1], i, 1, `Số lỗi mẫu ${i + 1}`)), labels: data.map(({ r, i }) => (isBlank(r[0]) ? String(i + 1) : String(r[0]))) };
	},
	solve(inp, m, p) {
		const n = Number(p.n);
		if (!(n >= 1)) throw new InputError('Cỡ mẫu phải ≥ 1.');
		if (inp.d.some((v) => v > n || v < 0)) throw new InputError('Số lỗi trong một mẫu không thể lớn hơn cỡ mẫu hoặc âm.');
		return Q.pChart(inp.d, n, Number(p.z) || 3);
	},
	summary: (res) => [{ label: 'p trung bình', value: res.pbar, fmt: 'pct', strong: true }, { label: 'UCL', value: res.ucl, fmt: 'pct' }, { label: 'LCL', value: res.lcl, fmt: 'pct' }, { label: 'Điểm ngoài giới hạn', value: res.rows.filter((r) => r.out).length, fmt: 'int' }],
	report(inp, res, m, p) {
		const N = inp.d.length;
		return {
			title: 'Biểu đồ kiểm soát p – kết quả', subtitle: 'UCL/LCL = p̄ ± z·√(p̄(1−p̄)/n). Điểm tô vàng nằm ngoài giới hạn kiểm soát.',
			blocks: [
				{ type: 'kv', id: 'p', title: 'Tham số', items: [{ key: 'n', label: 'Cỡ mẫu n', value: Number(p.n), fmt: 'int', role: 'input' }, { key: 'z', label: 'z', value: Number(p.z) || 3, fmt: 'num', role: 'input' }] },
				{ type: 'table', id: 't', title: 'Dữ liệu mẫu', columns: [{ key: 'k', label: 'Mẫu', fmt: 'text', role: 'label' }, { key: 'd', label: 'Số lỗi', fmt: 'num', role: 'input' }, { key: 'p', label: 'Tỷ lệ lỗi p', fmt: 'pct' }, { key: 'cl', label: 'Đường tâm', fmt: 'pct' }, { key: 'u', label: 'UCL', fmt: 'pct' }, { key: 'l', label: 'LCL', fmt: 'pct' }, { key: 'o', label: 'Ngoài giới hạn?', fmt: 'text' }],
					rows: inp.labels.map((k, i) => ({ highlight: res.rows[i].out, cells: { k, d: inp.d[i], p: { f: (R) => `=${R.cell('t', i, 'd')}/${R.kv('p', 'n')}`, v: res.rows[i].p },
						cl: { f: (R) => `=${R.kv('lim', 'pbar')}`, v: res.pbar }, u: { f: (R) => `=${R.kv('lim', 'ucl')}`, v: res.ucl }, l: { f: (R) => `=${R.kv('lim', 'lcl')}`, v: res.lcl },
						o: { f: (R) => `=IF(OR(${R.cell('t', i, 'p')}>${R.cell('t', i, 'u')},${R.cell('t', i, 'p')}<${R.cell('t', i, 'l')}),"Có","")` } } })) },
				{ type: 'kv', id: 'lim', title: 'Giới hạn kiểm soát', items: [
					{ key: 'pbar', label: 'p̄ (tỷ lệ lỗi trung bình)', value: { f: (R) => `=SUM(${R.col('t', 'd', 0, N - 1)})/(${N}*${R.kv('p', 'n')})`, v: res.pbar }, fmt: 'pct' },
					{ key: 'sd', label: 'Độ lệch chuẩn', value: { f: (R) => `=SQRT(${R.kv('lim', 'pbar')}*(1-${R.kv('lim', 'pbar')})/${R.kv('p', 'n')})`, v: res.sd }, fmt: 'pct' },
					{ key: 'ucl', label: 'UCL', value: { f: (R) => `=MIN(1,${R.kv('lim', 'pbar')}+${R.kv('p', 'z')}*${R.kv('lim', 'sd')})`, v: res.ucl }, fmt: 'pct' },
					{ key: 'lcl', label: 'LCL', value: { f: (R) => `=MAX(0,${R.kv('lim', 'pbar')}-${R.kv('p', 'z')}*${R.kv('lim', 'sd')})`, v: res.lcl }, fmt: 'pct' },
				] },
				{ type: 'chart', kind: 'line', title: 'Biểu đồ p', table: 't', x: 'k', series: [{ name: 'p', key: 'p' }, { name: 'UCL', key: 'u' }, { name: 'Tâm', key: 'cl' }, { name: 'LCL', key: 'l' }] },
			],
		};
	},
};

const cChart = {
	inputTable: (d, m, sample) => ({
		title: 'Biểu đồ kiểm soát c – dữ liệu', sheet: 'Biểu đồ c', hint: 'Mỗi dòng là một đơn vị kiểm tra (một lô, một tấm…): số khuyết tật tìm thấy.',
		columns: [{ label: 'Đơn vị', fmt: 'text' }, { label: 'Số khuyết tật', fmt: 'num' }],
		rows: sample ? [9, 12, 8, 15, 10, 6, 11, 9, 13, 7, 10, 14, 8, 11, 12].map((v, i) => [i + 1, v]) : blank(d.rows, 2).map((r, i) => [i + 1, '']), firstInputCol: 1,
	}),
	parse({ rows }) {
		const data = rows.map((r, i) => ({ r, i })).filter(({ r }) => !isBlank(r[1]));
		if (data.length < 2) throw new InputError('Cần ít nhất 2 đơn vị.');
		return { c: data.map(({ r, i }) => toNum(r[1], i, 1, `Số khuyết tật dòng ${i + 1}`)), labels: data.map(({ r, i }) => (isBlank(r[0]) ? String(i + 1) : String(r[0]))) };
	},
	solve: (inp, m, p) => Q.cChart(inp.c, Number(p.z) || 3),
	summary: (res) => [{ label: 'c trung bình', value: res.cbar, fmt: 'num', strong: true }, { label: 'UCL', value: res.ucl, fmt: 'num' }, { label: 'LCL', value: res.lcl, fmt: 'num' }, { label: 'Điểm ngoài giới hạn', value: res.rows.filter((r) => r.out).length, fmt: 'int' }],
	report(inp, res, m, p) {
		const N = inp.c.length;
		return {
			title: 'Biểu đồ kiểm soát c – kết quả', subtitle: 'UCL/LCL = c̄ ± z·√c̄.',
			blocks: [
				{ type: 'kv', id: 'p', title: 'Tham số', items: [{ key: 'z', label: 'z', value: Number(p.z) || 3, fmt: 'num', role: 'input' }] },
				{ type: 'table', id: 't', title: 'Dữ liệu', columns: [{ key: 'k', label: 'Đơn vị', fmt: 'text', role: 'label' }, { key: 'c', label: 'Số khuyết tật', fmt: 'num', role: 'input' }, { key: 'cl', label: 'Đường tâm', fmt: 'num' }, { key: 'u', label: 'UCL', fmt: 'num' }, { key: 'l', label: 'LCL', fmt: 'num' }, { key: 'o', label: 'Ngoài giới hạn?', fmt: 'text' }],
					rows: inp.labels.map((k, i) => ({ highlight: res.rows[i].out, cells: { k, c: inp.c[i], cl: { f: (R) => `=${R.kv('lim', 'cbar')}`, v: res.cbar }, u: { f: (R) => `=${R.kv('lim', 'ucl')}`, v: res.ucl }, l: { f: (R) => `=${R.kv('lim', 'lcl')}`, v: res.lcl },
						o: { f: (R) => `=IF(OR(${R.cell('t', i, 'c')}>${R.cell('t', i, 'u')},${R.cell('t', i, 'c')}<${R.cell('t', i, 'l')}),"Có","")` } } })) },
				{ type: 'kv', id: 'lim', title: 'Giới hạn kiểm soát', items: [
					{ key: 'cbar', label: 'c̄', value: { f: (R) => `=AVERAGE(${R.col('t', 'c', 0, N - 1)})`, v: res.cbar }, fmt: 'num' },
					{ key: 'ucl', label: 'UCL', value: { f: (R) => `=${R.kv('lim', 'cbar')}+${R.kv('p', 'z')}*SQRT(${R.kv('lim', 'cbar')})`, v: res.ucl }, fmt: 'num' },
					{ key: 'lcl', label: 'LCL', value: { f: (R) => `=MAX(0,${R.kv('lim', 'cbar')}-${R.kv('p', 'z')}*SQRT(${R.kv('lim', 'cbar')}))`, v: res.lcl }, fmt: 'num' },
				] },
				{ type: 'chart', kind: 'line', title: 'Biểu đồ c', table: 't', x: 'k', series: [{ name: 'c', key: 'c' }, { name: 'UCL', key: 'u' }, { name: 'Tâm', key: 'cl' }, { name: 'LCL', key: 'l' }] },
			],
		};
	},
};

const xbar = {
	inputTable(d, m, sample) {
		const n = sample ? 5 : d.n;
		const cols = [{ label: 'Nhóm', fmt: 'text' }, ...Array.from({ length: n }, (_, j) => ({ label: `Quan sát ${j + 1}`, fmt: 'num' }))];
		const data = [[5.02, 5.01, 4.94, 4.99, 4.96], [5.01, 5.03, 5.07, 4.95, 4.96], [4.99, 5.00, 4.93, 4.92, 4.99], [5.03, 4.91, 5.01, 4.98, 4.89], [4.95, 4.92, 5.03, 5.05, 5.01], [4.97, 5.06, 5.06, 4.96, 5.03], [5.05, 5.01, 5.10, 4.96, 4.99], [5.09, 5.10, 5.00, 4.99, 5.08], [5.14, 5.10, 4.99, 5.08, 5.09], [5.01, 4.98, 5.08, 5.07, 4.99]];
		return { title: 'Biểu đồ x̄ và R – dữ liệu', sheet: 'Biểu đồ x̄-R', hint: 'Mỗi dòng là một nhóm mẫu; các cột là các quan sát trong nhóm (cỡ mẫu 2–10).', columns: cols,
			rows: sample ? data.map((r, i) => [i + 1, ...r]) : Array.from({ length: d.groups }, (_, i) => [i + 1, ...Array(n).fill('')]), firstInputCol: 1 };
	},
	parse({ header, rows }) {
		const n = header.length - 1;
		if (n < 2 || n > 10) throw new InputError('Cỡ mẫu mỗi nhóm (số cột quan sát) phải từ 2 đến 10.');
		const data = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.slice(1).some((v) => !isBlank(v)));
		if (data.length < 2) throw new InputError('Cần ít nhất 2 nhóm mẫu.');
		return { labels: data.map(({ r, i }) => (isBlank(r[0]) ? String(i + 1) : String(r[0]))), samples: data.map(({ r, i }) => r.slice(1).map((v, j) => toNum(v, i, 1 + j, `Quan sát ${j + 1} của nhóm ${r[0] || i + 1}`))) };
	},
	solve(inp) { try { return Q.xbarR(inp.samples); } catch (e) { throw new InputError(e.message); } },
	summary: (res) => [{ label: 'x̿ (trung bình các trung bình)', value: res.xx, fmt: 'num', strong: true }, { label: 'R̄', value: res.rbar, fmt: 'num' }, { label: 'UCL x̄ / LCL x̄', value: `${res.xbar.ucl.toFixed(4)} / ${res.xbar.lcl.toFixed(4)}` },
		{ label: 'Ngoài giới hạn', value: `${res.rows.filter((r) => r.outX).length} (x̄), ${res.rows.filter((r) => r.outR).length} (R)` }],
	report(inp, res) {
		const N = inp.samples.length, n = res.n, ok = inp.samples[0].map((_, j) => 'o' + j);
		return {
			title: 'Biểu đồ x̄ và R – kết quả', subtitle: `Cỡ mẫu n = ${n}; A₂ = ${res.A2}, D₃ = ${res.D3}, D₄ = ${res.D4}. UCLx̄ = x̿ + A₂R̄, UCL R = D₄R̄, LCL R = D₃R̄.`,
			blocks: [
				{ type: 'table', id: 't', title: 'Dữ liệu và thống kê từng nhóm', columns: [{ key: 'k', label: 'Nhóm', fmt: 'text', role: 'label' }, ...ok.map((k, j) => ({ key: k, label: `Q${j + 1}`, fmt: 'num', role: 'input' })), { key: 'm', label: 'Trung bình x̄', fmt: 'num' }, { key: 'r', label: 'Khoảng R', fmt: 'num' }, { key: 'xu', label: 'UCL x̄', fmt: 'num' }, { key: 'xl', label: 'LCL x̄', fmt: 'num' }, { key: 'ru', label: 'UCL R', fmt: 'num' }, { key: 'rl', label: 'LCL R', fmt: 'num' }],
					rows: inp.labels.map((k, i) => ({ highlight: res.rows[i].outX || res.rows[i].outR, cells: { k, ...Object.fromEntries(inp.samples[i].map((v, j) => [ok[j], v])),
						m: { f: (R) => `=AVERAGE(${R.row('t', i, ok[0], ok[n - 1])})`, v: res.means[i] }, r: { f: (R) => `=MAX(${R.row('t', i, ok[0], ok[n - 1])})-MIN(${R.row('t', i, ok[0], ok[n - 1])})`, v: res.ranges[i] },
						xu: { f: (R) => `=${R.kv('c', 'xu')}`, v: res.xbar.ucl }, xl: { f: (R) => `=${R.kv('c', 'xl')}`, v: res.xbar.lcl }, ru: { f: (R) => `=${R.kv('c', 'ru')}`, v: res.r.ucl }, rl: { f: (R) => `=${R.kv('c', 'rl')}`, v: res.r.lcl } } })) },
				{ type: 'kv', id: 'c', title: 'Giới hạn kiểm soát', items: [
					{ key: 'A2', label: 'A₂ (bảng hằng số)', value: res.A2, fmt: 'num', role: 'input' }, { key: 'D3', label: 'D₃', value: res.D3, fmt: 'num', role: 'input' }, { key: 'D4', label: 'D₄', value: res.D4, fmt: 'num', role: 'input' },
					{ key: 'xx', label: 'x̿', value: { f: (R) => `=AVERAGE(${R.col('t', 'm', 0, N - 1)})`, v: res.xx }, fmt: 'num' }, { key: 'rb', label: 'R̄', value: { f: (R) => `=AVERAGE(${R.col('t', 'r', 0, N - 1)})`, v: res.rbar }, fmt: 'num' },
					{ key: 'xu', label: 'UCL x̄', value: { f: (R) => `=${R.kv('c', 'xx')}+${R.kv('c', 'A2')}*${R.kv('c', 'rb')}`, v: res.xbar.ucl }, fmt: 'num' }, { key: 'xl', label: 'LCL x̄', value: { f: (R) => `=${R.kv('c', 'xx')}-${R.kv('c', 'A2')}*${R.kv('c', 'rb')}`, v: res.xbar.lcl }, fmt: 'num' },
					{ key: 'ru', label: 'UCL R', value: { f: (R) => `=${R.kv('c', 'D4')}*${R.kv('c', 'rb')}`, v: res.r.ucl }, fmt: 'num' }, { key: 'rl', label: 'LCL R', value: { f: (R) => `=${R.kv('c', 'D3')}*${R.kv('c', 'rb')}`, v: res.r.lcl }, fmt: 'num' },
				] },
				{ type: 'chart', kind: 'line', title: 'Biểu đồ x̄', table: 't', x: 'k', series: [{ name: 'x̄', key: 'm' }, { name: 'UCL', key: 'xu' }, { name: 'LCL', key: 'xl' }] },
				{ type: 'chart', kind: 'line', title: 'Biểu đồ R', table: 't', x: 'k', series: [{ name: 'R', key: 'r' }, { name: 'UCL', key: 'ru' }, { name: 'LCL', key: 'rl' }] },
			],
		};
	},
};

const capab = scalarModel({
	title: 'Năng lực quá trình Cp, Cpk – dữ liệu', sheet: 'Cp Cpk', hint: 'Giới hạn đặc tả trên/dưới, trung bình và độ lệch chuẩn của quá trình.',
	items: [{ key: 'usl', label: 'Giới hạn đặc tả trên (USL)', default: 10.6 }, { key: 'lsl', label: 'Giới hạn đặc tả dưới (LSL)', default: 9.4 }, { key: 'mean', label: 'Trung bình quá trình', default: 10.1 }, { key: 'sd', label: 'Độ lệch chuẩn quá trình', default: 0.2, positive: true }],
	validate: (v) => (v.usl <= v.lsl ? { message: 'USL phải lớn hơn LSL.', row: 0 } : null),
	compute: (v) => Q.capability(v),
	outputs: [
		{ key: 'cp', label: 'Cp', strong: true, f: (I) => `=(${I('usl')}-${I('lsl')})/(6*${I('sd')})` },
		{ key: 'cpu', label: 'Cpu', f: (I) => `=(${I('usl')}-${I('mean')})/(3*${I('sd')})` }, { key: 'cpl', label: 'Cpl', f: (I) => `=(${I('mean')}-${I('lsl')})/(3*${I('sd')})` },
		{ key: 'cpk', label: 'Cpk', strong: true, f: (I, O) => `=MIN(${O('cpu')},${O('cpl')})` },
		{ key: 'ppmOut', label: 'Số sản phẩm ngoài đặc tả (ppm)', fmt: 'int', f: (I) => `=(NORM.DIST(${I('lsl')},${I('mean')},${I('sd')},TRUE)+1-NORM.DIST(${I('usl')},${I('mean')},${I('sd')},TRUE))*1000000` },
	],
});

const plan = scalarModel({
	title: 'Kế hoạch lấy mẫu chấp nhận – dữ liệu', sheet: 'Lấy mẫu chấp nhận', hint: 'Kế hoạch (n, c): lấy n sản phẩm, chấp nhận lô nếu có tối đa c sản phẩm lỗi. AQL là tỷ lệ lỗi chấp nhận được; LTPD là tỷ lệ lỗi tối đa chịu được.',
	items: [{ key: 'n', label: 'Cỡ mẫu n', default: 98, min: 1 }, { key: 'c', label: 'Số lỗi tối đa chấp nhận c', default: 4, min: 0 }, { key: 'aql', label: 'AQL (tỷ lệ lỗi, 0–1)', default: 0.02, min: 0, max: 1 }, { key: 'ltpd', label: 'LTPD (tỷ lệ lỗi, 0–1)', default: 0.08, min: 0, max: 1 }],
	validate: (v) => (v.ltpd <= v.aql ? { message: 'LTPD phải lớn hơn AQL.', row: 3 } : null),
	compute: (v) => Q.samplingPlan({ ...v, n: Math.round(v.n), c: Math.round(v.c) }),
	outputs: [
		{ key: 'paAql', label: 'Xác suất chấp nhận lô tại AQL', fmt: 'pct', f: (I) => `=BINOM.DIST(${I('c')},${I('n')},${I('aql')},TRUE)` },
		{ key: 'alpha', label: 'Rủi ro của nhà sản xuất α', strong: true, fmt: 'pct', f: (I, O) => `=1-${O('paAql')}` },
		{ key: 'paLtpd', label: 'Xác suất chấp nhận lô tại LTPD', fmt: 'pct', f: (I) => `=BINOM.DIST(${I('c')},${I('n')},${I('ltpd')},TRUE)` },
		{ key: 'beta', label: 'Rủi ro của người tiêu dùng β', strong: true, fmt: 'pct', f: (I, O) => `=${O('paLtpd')}` },
	],
});

const oc = {
	inputTable: (d, m, sample) => ({
		title: 'Đường OC và AOQ – dữ liệu', sheet: 'Đường OC', hint: 'Kế hoạch lấy mẫu (n, c) và tỷ lệ lỗi tối đa cần vẽ.',
		columns: [{ label: 'Tham số', fmt: 'text' }, { label: 'Giá trị', fmt: 'num' }],
		rows: [['Cỡ mẫu n', sample ? 98 : ''], ['Số lỗi tối đa chấp nhận c', sample ? 4 : ''], ['Tỷ lệ lỗi lớn nhất cần vẽ (0–1)', sample ? 0.15 : '']], firstInputCol: 1,
	}),
	parse({ rows }) {
		const n = toNum(rows[0]?.[1], 0, 1, 'Cỡ mẫu'), c = toNum(rows[1]?.[1], 1, 1, 'c'), pm = toNum(rows[2]?.[1], 2, 1, 'Tỷ lệ lỗi lớn nhất');
		if (n < 1 || c < 0 || !(pm > 0 && pm <= 1)) throw new InputError('Cần n ≥ 1, c ≥ 0 và tỷ lệ lỗi trong (0, 1].');
		return { n: Math.round(n), c: Math.round(c), pm };
	},
	solve: (inp) => { const pts = Q.ocCurve(inp.n, inp.c, inp.pm, 20); return { pts, aoql: Math.max(...pts.map((q) => q.aoq)) }; },
	summary: (res) => [{ label: 'AOQL (giới hạn chất lượng đầu ra)', value: res.aoql, fmt: 'pct', strong: true }],
	report(inp, res) {
		return {
			title: 'Đường OC và AOQ – kết quả', subtitle: 'Pa = P(số lỗi ≤ c) theo phân phối nhị thức; AOQ = p × Pa.',
			blocks: [
				{ type: 'kv', id: 'p', title: 'Kế hoạch', items: [{ key: 'n', label: 'n', value: inp.n, fmt: 'int', role: 'input' }, { key: 'c', label: 'c', value: inp.c, fmt: 'int', role: 'input' }] },
				{ type: 'table', id: 't', title: 'Đường OC', columns: [{ key: 'p', label: 'Tỷ lệ lỗi p', fmt: 'pct', role: 'input' }, { key: 'pa', label: 'Xác suất chấp nhận Pa', fmt: 'pct' }, { key: 'aoq', label: 'AOQ', fmt: 'pct' }],
					rows: res.pts.map((q, i) => ({ cells: { p: q.p, pa: { f: (R) => `=BINOM.DIST(${R.kv('p', 'c')},${R.kv('p', 'n')},${R.cell('t', i, 'p')},TRUE)`, v: q.pa }, aoq: { f: (R) => `=${R.cell('t', i, 'p')}*${R.cell('t', i, 'pa')}`, v: q.aoq } } })) },
				{ type: 'kv', id: 'r', items: [{ key: 'a', label: 'AOQL', value: { f: (R) => `=MAX(${R.col('t', 'aoq')})`, v: res.aoql }, fmt: 'pct' }] },
				{ type: 'chart', kind: 'scatter', title: 'Đường đặc tính vận hành (OC)', xTitle: 'Tỷ lệ lỗi', yTitle: 'Xác suất chấp nhận', series: [{ name: 'Pa', table: 't', x: 'p', y: 'pa', lines: true }] },
				{ type: 'chart', kind: 'scatter', title: 'Chất lượng đầu ra trung bình (AOQ)', xTitle: 'Tỷ lệ lỗi', yTitle: 'AOQ', series: [{ name: 'AOQ', table: 't', x: 'p', y: 'aoq', lines: true }] },
			],
		};
	},
};

const IMPL = { p: pChart, c: cChart, xbar, cp: capab, plan, oc };
const nChart = { id: 'n', label: 'Cỡ mẫu mỗi nhóm n', type: 'int', default: 100, min: 1 };
export default {
	id: 'quality',
	name: 'Kiểm soát chất lượng',
	group: 'Chất lượng',
	keywords: 'quality control chart p c xbar r acceptance sampling oc curve aoq capability cp cpk chat luong bieu do kiem soat lay mau',
	models: [
		{ id: 'p', name: 'Biểu đồ kiểm soát p (tỷ lệ lỗi)', group: 'Biểu đồ kiểm soát', table: 'p', dims: [{ id: 'rows', label: 'Số mẫu', default: 20, min: 2, max: 200 }], params: [nChart, Z] },
		{ id: 'xbar', name: 'Biểu đồ x̄ và R', group: 'Biểu đồ kiểm soát', table: 'xbar', dims: [{ id: 'groups', label: 'Số nhóm', default: 10, min: 2, max: 100 }, { id: 'n', label: 'Cỡ mẫu mỗi nhóm', default: 5, min: 2, max: 10 }], params: [] },
		{ id: 'c', name: 'Biểu đồ kiểm soát c (số khuyết tật)', group: 'Biểu đồ kiểm soát', table: 'c', dims: [{ id: 'rows', label: 'Số đơn vị', default: 15, min: 2, max: 200 }], params: [Z] },
		{ id: 'plan', name: 'Kế hoạch lấy mẫu chấp nhận (rủi ro α, β)', group: 'Lấy mẫu chấp nhận', table: 'plan', params: [] },
		{ id: 'oc', name: 'Đường OC và AOQ', group: 'Lấy mẫu chấp nhận', table: 'oc', params: [] },
		{ id: 'cp', name: 'Năng lực quá trình Cp, Cpk', group: 'Năng lực quá trình', table: 'cp', params: [] },
	],
	inputTable: (d, m, s) => IMPL[m.id].inputTable(d, m, s),
	parse: (t, m, p) => IMPL[m.id].parse(t, m, p),
	solve: (i, m, p) => IMPL[m.id].solve(i, m, p),
	summary: (r, m, p) => IMPL[m.id].summary(r, m, p),
	report: (i, r, m, p) => IMPL[m.id].report(i, r, m, p),
};
