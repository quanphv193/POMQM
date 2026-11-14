import { InputError } from '../core/errors.js';
import { toNum, isBlank } from './common.js';
import { crossModel } from './breakeven.js';

const blank = (n, w) => Array.from({ length: n }, () => Array(w).fill(''));

const factor = {
	inputTable(d, m, sample) {
		const sites = sample ? ['Địa điểm A', 'Địa điểm B', 'Địa điểm C'] : Array.from({ length: d.sites }, (_, j) => `Địa điểm ${j + 1}`);
		return {
			title: 'Chấm điểm địa điểm – dữ liệu', sheet: 'Chấm điểm địa điểm', hint: 'Mỗi dòng là một tiêu chí: trọng số và điểm của từng địa điểm (cùng thang điểm, ví dụ 0–100).',
			columns: [{ label: 'Tiêu chí', fmt: 'text' }, { label: 'Trọng số', fmt: 'num' }, ...sites.map((s) => ({ label: s, fmt: 'num' }))],
			rows: sample ? [['Chi phí nhân công', 0.25, 70, 60, 85], ['Chất lượng sống', 0.2, 80, 90, 50], ['Hạ tầng giao thông', 0.2, 85, 80, 60], ['Gần thị trường', 0.15, 90, 75, 55], ['Ưu đãi thuế', 0.2, 40, 85, 80]] : blank(d.factors, 2 + d.sites), firstInputCol: 1,
		};
	},
	parse({ header, rows }) {
		const k = header.length - 2;
		if (k < 2) throw new InputError('Cần ít nhất 2 địa điểm.');
		const sites = header.slice(2).map((h, j) => (isBlank(h) ? `Địa điểm ${j + 1}` : String(h)));
		const data = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.some((v) => !isBlank(v)));
		if (!data.length) throw new InputError('Chưa có tiêu chí nào.');
		return { sites, names: data.map(({ r, i }) => (isBlank(r[0]) ? `Tiêu chí ${i + 1}` : String(r[0]))), w: data.map(({ r, i }) => toNum(r[1], i, 1, `Trọng số dòng ${i + 1}`)),
			score: data.map(({ r, i }) => sites.map((_, j) => toNum(r[2 + j], i, 2 + j, `Điểm (${r[0] || i + 1}, ${sites[j]})`))) };
	},
	solve(inp, m, p) {
		const sw = inp.w.reduce((a, b) => a + b, 0);
		if (p.normalize === false && Math.abs(sw - 1) > 1e-6) throw new InputError(`Tổng trọng số phải bằng 1 (đang là ${+sw.toFixed(6)}); hoặc bật “Chuẩn hoá trọng số”.`);
		const total = inp.sites.map((_, j) => inp.w.reduce((a, w, i) => a + w * inp.score[i][j], 0) / (p.normalize === false ? 1 : sw));
		return { sw, total, best: total.indexOf(Math.max(...total)) };
	},
	summary: (res, m, p) => [{ label: 'Địa điểm tốt nhất', value: res._sites[res.best], strong: true }, ...res.total.map((v, j) => ({ label: res._sites[j], value: v, fmt: 'num' }))],
	report(inp, res, m, p) {
		const n = inp.w.length, sk = inp.sites.map((_, j) => 's' + j);
		const norm = p.normalize !== false;
		return {
			title: 'Chấm điểm địa điểm – kết quả', subtitle: norm ? 'Điểm tổng = Σ trọng số × điểm / Σ trọng số.' : 'Điểm tổng = Σ trọng số × điểm.',
			blocks: [
				{ type: 'table', id: 't', title: 'Bảng điểm', columns: [{ key: 'f', label: 'Tiêu chí', fmt: 'text', role: 'label' }, { key: 'w', label: 'Trọng số', fmt: 'num', role: 'input' }, ...inp.sites.map((s, j) => ({ key: sk[j], label: s, fmt: 'num', role: 'input' }))],
					rows: [...inp.names.map((nm, i) => ({ cells: { f: nm, w: inp.w[i], ...Object.fromEntries(inp.score[i].map((v, j) => [sk[j], v])) } })),
						{ highlight: true, cells: { f: 'Điểm tổng', w: { f: (R) => `=SUM(${R.col('t', 'w', 0, n - 1)})`, v: res.sw }, ...Object.fromEntries(sk.map((c, j) => [c, { f: (R) => `=SUMPRODUCT(${R.col('t', 'w', 0, n - 1)},${R.col('t', c, 0, n - 1)})${norm ? `/${R.cell('t', n, 'w')}` : ''}`, v: res.total[j] }])) } }] },
				{ type: 'table', id: 'sc', title: 'Tổng hợp theo địa điểm', columns: [{ key: 'site', label: 'Địa điểm', fmt: 'text', role: 'label' }, { key: 'score', label: 'Điểm tổng', fmt: 'num' }],
					rows: inp.sites.map((nm, j) => ({ highlight: j === res.best, cells: { site: nm, score: { f: (R) => `=${R.cell('t', n, sk[j])}`, v: res.total[j] } } })) },
				{ type: 'kv', id: 'r', title: 'Kết luận', items: [{ key: 'b', label: 'Địa điểm có điểm cao nhất', value: { f: (R) => `=INDEX(${R.col('sc', 'site')},MATCH(MAX(${R.col('sc', 'score')}),${R.col('sc', 'score')},0))`, v: inp.sites[res.best] }, role: 'label' }] },
				{ type: 'chart', kind: 'column', title: 'Điểm tổng theo địa điểm', table: 'sc', x: 'site', series: [{ name: 'Điểm', key: 'score' }] },
			],
		};
	},
};

const cog = {
	inputTable: (d, m, sample) => ({
		title: 'Trọng tâm vận chuyển – dữ liệu', sheet: 'Trọng tâm', hint: 'Toạ độ x, y của từng điểm (kho, nhà máy, thị trường) và khối lượng vận chuyển.',
		columns: [{ label: 'Địa điểm', fmt: 'text' }, { label: 'Toạ độ x', fmt: 'num' }, { label: 'Toạ độ y', fmt: 'num' }, { label: 'Khối lượng', fmt: 'num' }],
		rows: sample ? [['Chicago', 800, 1100, 2000], ['Pittsburgh', 1300, 800, 3000], ['New York', 2000, 600, 2500], ['Atlanta', 1400, 200, 1500]] : blank(d.rows, 4), firstInputCol: 1,
	}),
	parse({ rows }) {
		const data = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.some((v) => !isBlank(v)));
		if (!data.length) throw new InputError('Chưa có điểm nào.');
		return { names: data.map(({ r, i }) => (isBlank(r[0]) ? `Điểm ${i + 1}` : String(r[0]))), x: data.map(({ r, i }) => toNum(r[1], i, 1, `x dòng ${i + 1}`)), y: data.map(({ r, i }) => toNum(r[2], i, 2, `y dòng ${i + 1}`)), v: data.map(({ r, i }) => toNum(r[3], i, 3, `Khối lượng dòng ${i + 1}`)) };
	},
	solve(inp) {
		const sv = inp.v.reduce((a, b) => a + b, 0);
		if (sv <= 0) throw new InputError('Tổng khối lượng phải lớn hơn 0.');
		return { cx: inp.x.reduce((a, x, i) => a + x * inp.v[i], 0) / sv, cy: inp.y.reduce((a, y, i) => a + y * inp.v[i], 0) / sv, sv };
	},
	summary: (res) => [{ label: 'Toạ độ x tối ưu', value: res.cx, fmt: 'num', strong: true }, { label: 'Toạ độ y tối ưu', value: res.cy, fmt: 'num', strong: true }],
	report(inp, res) {
		const n = inp.x.length;
		return {
			title: 'Trọng tâm vận chuyển – kết quả', subtitle: 'Cx = Σ(x·khối lượng) / Σ khối lượng; Cy tương tự.',
			blocks: [
				{ type: 'table', id: 't', title: 'Các điểm', columns: [{ key: 'name', label: 'Địa điểm', fmt: 'text', role: 'label' }, { key: 'x', label: 'x', fmt: 'num', role: 'input' }, { key: 'y', label: 'y', fmt: 'num', role: 'input' }, { key: 'v', label: 'Khối lượng', fmt: 'num', role: 'input' }],
					rows: inp.names.map((nm, i) => ({ cells: { name: nm, x: inp.x[i], y: inp.y[i], v: inp.v[i] } })) },
				{ type: 'kv', id: 'r', title: 'Vị trí đặt tối ưu', items: [
					{ key: 'cx', label: 'Cx', value: { f: (R) => `=SUMPRODUCT(${R.col('t', 'x')},${R.col('t', 'v')})/SUM(${R.col('t', 'v')})`, v: res.cx }, fmt: 'num' },
					{ key: 'cy', label: 'Cy', value: { f: (R) => `=SUMPRODUCT(${R.col('t', 'y')},${R.col('t', 'v')})/SUM(${R.col('t', 'v')})`, v: res.cy }, fmt: 'num' },
				] },
				{ type: 'chart', kind: 'scatter', title: 'Bản đồ các điểm', xTitle: 'x', yTitle: 'y', series: [{ name: 'Các điểm', table: 't', x: 'x', y: 'y', lines: false, markers: true }] },
			],
		};
	},
};

const IMPL = { factor, cog, costvol: crossModel };
export default {
	id: 'location',
	name: 'Địa điểm',
	group: 'Tồn kho & vận hành',
	keywords: 'location factor rating center of gravity cost volume dia diem trong tam cham diem',
	models: [
		{ id: 'factor', name: 'Chấm điểm theo trọng số (factor rating)', table: 'factor', dims: [{ id: 'factors', label: 'Số tiêu chí', default: 5, min: 1, max: 30 }, { id: 'sites', label: 'Số địa điểm', default: 3, min: 2, max: 12 }],
			params: [{ id: 'normalize', label: 'Chuẩn hoá trọng số (chia cho tổng trọng số)', type: 'bool', default: true }] },
		{ id: 'cog', name: 'Trọng tâm vận chuyển (center of gravity)', table: 'cog', dims: [{ id: 'rows', label: 'Số điểm', default: 4, min: 1, max: 50 }], params: [] },
		{ id: 'costvol', name: 'Chi phí – sản lượng theo địa điểm', table: 'costvol', dims: [{ id: 'rows', label: 'Số địa điểm', default: 3, min: 2, max: 20 }], params: [{ id: 'volume', label: 'Khối lượng dự kiến (tuỳ chọn)', type: 'num', default: 500, optional: true }] },
	],
	inputTable: (d, m, s) => IMPL[m.id].inputTable(d, m, s),
	parse: (t, m, p) => IMPL[m.id].parse(t, m, p),
	solve(i, m, p) { const r = IMPL[m.id].solve(i, m, p); if (m.id === 'factor') r._sites = i.sites; if (m.id === 'costvol') r._names = i.names; return r; },
	summary: (r, m, p) => IMPL[m.id].summary(r, m, p),
	report: (i, r, m, p) => IMPL[m.id].report(i, r, m, p),
};
