import { normInv, Phi, binomPmf, binomCdf, poissonPmf, poissonCdf, describe } from '../../lib/stats.js';
import { scalarModel } from './param.js';
import { InputError } from '../core/errors.js';
import { toNum, isBlank } from './common.js';

const normal = scalarModel({
	title: 'Phân phối chuẩn – dữ liệu', sheet: 'Phân phối chuẩn', hint: 'Tính xác suất cho biến X ~ N(μ, σ²). Cần ít nhất một trong hai giá trị x₁ và x₂.',
	items: [{ key: 'mu', label: 'Trung bình μ', default: 100 }, { key: 'sd', label: 'Độ lệch chuẩn σ', default: 15, positive: true },
		{ key: 'x1', label: 'Giá trị x₁', default: 85, optional: true }, { key: 'x2', label: 'Giá trị x₂ (≥ x₁)', default: 120, optional: true }],
	validate: (v) => (v.x1 === null && v.x2 === null ? { message: 'Nhập ít nhất x₁ hoặc x₂.', row: 2 } : v.x1 !== null && v.x2 !== null && v.x2 < v.x1 ? { message: 'x₂ phải lớn hơn hoặc bằng x₁.', row: 3 } : null),
	compute(v) {
		const z = (x) => (x - v.mu) / v.sd, out = {};
		if (v.x1 !== null) Object.assign(out, { z1: z(v.x1), pBelow1: Phi(z(v.x1)), pAbove1: 1 - Phi(z(v.x1)) });
		if (v.x2 !== null) Object.assign(out, { z2: z(v.x2), pBelow2: Phi(z(v.x2)), pAbove2: 1 - Phi(z(v.x2)) });
		if (v.x1 !== null && v.x2 !== null) out.pBetween = Phi(z(v.x2)) - Phi(z(v.x1));
		return out;
	},
	outputs: [
		{ key: 'z1', label: 'z của x₁', f: (I) => `=(${I('x1')}-${I('mu')})/${I('sd')}` }, { key: 'pBelow1', label: 'P(X ≤ x₁)', fmt: 'prob', strong: true, f: (I) => `=NORM.DIST(${I('x1')},${I('mu')},${I('sd')},TRUE)` },
		{ key: 'pAbove1', label: 'P(X > x₁)', fmt: 'prob', f: (I) => `=1-NORM.DIST(${I('x1')},${I('mu')},${I('sd')},TRUE)` },
		{ key: 'z2', label: 'z của x₂', f: (I) => `=(${I('x2')}-${I('mu')})/${I('sd')}` }, { key: 'pBelow2', label: 'P(X ≤ x₂)', fmt: 'prob', f: (I) => `=NORM.DIST(${I('x2')},${I('mu')},${I('sd')},TRUE)` },
		{ key: 'pAbove2', label: 'P(X > x₂)', fmt: 'prob', f: (I) => `=1-NORM.DIST(${I('x2')},${I('mu')},${I('sd')},TRUE)` },
		{ key: 'pBetween', label: 'P(x₁ < X ≤ x₂)', fmt: 'prob', strong: true, f: (I) => `=NORM.DIST(${I('x2')},${I('mu')},${I('sd')},TRUE)-NORM.DIST(${I('x1')},${I('mu')},${I('sd')},TRUE)` },
	],
});
const inv = scalarModel({
	title: 'Phân phối chuẩn ngược – dữ liệu', sheet: 'Chuẩn ngược', hint: 'Tìm giá trị x sao cho P(X ≤ x) = p.',
	items: [{ key: 'mu', label: 'Trung bình μ', default: 100 }, { key: 'sd', label: 'Độ lệch chuẩn σ', default: 15, positive: true }, { key: 'p', label: 'Xác suất p (0–1)', default: 0.95, min: 0.0000001, max: 0.9999999 }],
	compute: (v) => { const z = normInv(v.p); return { z, x: v.mu + z * v.sd }; },
	outputs: [{ key: 'z', label: 'z', f: (I) => `=NORM.S.INV(${I('p')})` }, { key: 'x', label: 'x', strong: true, f: (I) => `=NORM.INV(${I('p')},${I('mu')},${I('sd')})` }],
});
const binom = scalarModel({
	title: 'Phân phối nhị thức – dữ liệu', sheet: 'Nhị thức', hint: 'X ~ B(n, p): số lần thành công trong n phép thử.',
	items: [{ key: 'n', label: 'Số phép thử n', default: 10, min: 1 }, { key: 'p', label: 'Xác suất thành công p', default: 0.3, min: 0, max: 1 }, { key: 'k', label: 'Số lần thành công k', default: 4, min: 0 }],
	validate: (v) => (v.k > v.n ? { message: 'k không thể lớn hơn n.', row: 2 } : null),
	compute: (v) => ({ pmf: binomPmf(v.n, v.k, v.p), cdf: binomCdf(v.n, v.k, v.p), mean: v.n * v.p, sd: Math.sqrt(v.n * v.p * (1 - v.p)) }),
	outputs: [{ key: 'pmf', label: 'P(X = k)', fmt: 'prob', strong: true, f: (I) => `=BINOM.DIST(${I('k')},${I('n')},${I('p')},FALSE)` }, { key: 'cdf', label: 'P(X ≤ k)', fmt: 'prob', f: (I) => `=BINOM.DIST(${I('k')},${I('n')},${I('p')},TRUE)` },
		{ key: 'ge', label: 'P(X ≥ k)', fmt: 'prob', f: (I) => `=1-BINOM.DIST(${I('k')}-1,${I('n')},${I('p')},TRUE)` },
		{ key: 'mean', label: 'Trung bình', f: (I) => `=${I('n')}*${I('p')}` }, { key: 'sd', label: 'Độ lệch chuẩn', f: (I) => `=SQRT(${I('n')}*${I('p')}*(1-${I('p')}))` }],
});
const poisson = scalarModel({
	title: 'Phân phối Poisson – dữ liệu', sheet: 'Poisson', hint: 'X ~ Poisson(λ): số biến cố trong một đơn vị thời gian/không gian.',
	items: [{ key: 'lam', label: 'Trung bình λ', default: 3, positive: true }, { key: 'k', label: 'Số biến cố k', default: 2, min: 0 }],
	compute: (v) => ({ pmf: poissonPmf(v.k, v.lam), cdf: poissonCdf(v.k, v.lam), ge: 1 - poissonCdf(v.k - 1, v.lam), sd: Math.sqrt(v.lam) }),
	outputs: [{ key: 'pmf', label: 'P(X = k)', fmt: 'prob', strong: true, f: (I) => `=POISSON.DIST(${I('k')},${I('lam')},FALSE)` }, { key: 'cdf', label: 'P(X ≤ k)', fmt: 'prob', f: (I) => `=POISSON.DIST(${I('k')},${I('lam')},TRUE)` },
		{ key: 'ge', label: 'P(X ≥ k)', fmt: 'prob', f: (I) => `=1-POISSON.DIST(${I('k')}-1,${I('lam')},TRUE)` }, { key: 'sd', label: 'Độ lệch chuẩn', f: (I) => `=SQRT(${I('lam')})` }],
});
const expo = scalarModel({
	title: 'Phân phối mũ – dữ liệu', sheet: 'Phân phối mũ', hint: 'X ~ Exp(λ): thời gian giữa hai biến cố liên tiếp.',
	items: [{ key: 'lam', label: 'Tốc độ λ (biến cố / đơn vị thời gian)', default: 0.5, positive: true }, { key: 'x', label: 'Giá trị x', default: 2, min: 0 }],
	compute: (v) => ({ cdf: 1 - Math.exp(-v.lam * v.x), sf: Math.exp(-v.lam * v.x), mean: 1 / v.lam }),
	outputs: [{ key: 'cdf', label: 'P(X ≤ x)', fmt: 'prob', strong: true, f: (I) => `=EXPON.DIST(${I('x')},${I('lam')},TRUE)` }, { key: 'sf', label: 'P(X > x)', fmt: 'prob', f: (I) => `=1-EXPON.DIST(${I('x')},${I('lam')},TRUE)` }, { key: 'mean', label: 'Trung bình = độ lệch chuẩn', f: (I) => `=1/${I('lam')}` }],
});

const raw = {
	inputTable: (d, m, sample) => ({
		title: 'Thống kê mô tả – dữ liệu', sheet: 'Thống kê mô tả', hint: 'Một giá trị mỗi dòng, trong cột màu vàng.',
		columns: [{ label: 'STT', fmt: 'text' }, { label: 'Giá trị', fmt: 'num' }],
		rows: sample ? [12, 15, 11, 18, 14, 20, 16, 13, 17, 19].map((v, i) => [i + 1, v]) : Array.from({ length: d.rows }, (_, i) => [i + 1, '']), firstInputCol: 1,
	}),
	parse({ rows }) {
		const data = rows.map((r, i) => ({ r, i })).filter(({ r }) => !isBlank(r[1]));
		if (data.length < 2) throw new InputError('Cần ít nhất 2 giá trị.');
		return { x: data.map(({ r, i }) => toNum(r[1], i, 1, `Giá trị dòng ${i + 1}`)) };
	},
	solve: (inp) => describe(inp.x),
	summary: (res) => [{ label: 'Trung bình', value: res.mean, fmt: 'num', strong: true }, { label: 'Độ lệch chuẩn mẫu', value: res.sdS, fmt: 'num' }, { label: 'Trung vị', value: res.median, fmt: 'num' }, { label: 'n', value: res.n, fmt: 'int' }],
	report(inp, res) {
		const X = (R) => R.col('t', 'x');
		const it = (key, label, f, v, fmt = 'num') => ({ key, label, value: { f, v }, fmt });
		return {
			title: 'Thống kê mô tả – kết quả', subtitle: 'Mọi chỉ số là công thức Excel theo cột dữ liệu.',
			blocks: [
				{ type: 'table', id: 't', title: 'Dữ liệu', columns: [{ key: 'x', label: 'Giá trị', fmt: 'num', role: 'input' }], rows: inp.x.map((v) => ({ cells: { x: v } })) },
				{ type: 'kv', id: 'r', title: 'Chỉ số', items: [
					it('n', 'Số quan sát', (R) => `=COUNT(${X(R)})`, res.n, 'int'), it('sum', 'Tổng', (R) => `=SUM(${X(R)})`, res.sum), it('mean', 'Trung bình', (R) => `=AVERAGE(${X(R)})`, res.mean),
					it('med', 'Trung vị', (R) => `=MEDIAN(${X(R)})`, res.median), it('min', 'Nhỏ nhất', (R) => `=MIN(${X(R)})`, res.min), it('max', 'Lớn nhất', (R) => `=MAX(${X(R)})`, res.max),
					it('rng', 'Khoảng biến thiên', (R) => `=MAX(${X(R)})-MIN(${X(R)})`, res.range), it('q1', 'Tứ phân vị Q1', (R) => `=QUARTILE.INC(${X(R)},1)`, res.q1), it('q3', 'Tứ phân vị Q3', (R) => `=QUARTILE.INC(${X(R)},3)`, res.q3),
					it('vs', 'Phương sai mẫu', (R) => `=VAR.S(${X(R)})`, res.varS), it('ss', 'Độ lệch chuẩn mẫu', (R) => `=STDEV.S(${X(R)})`, res.sdS),
					it('vp', 'Phương sai tổng thể', (R) => `=VAR.P(${X(R)})`, res.varP), it('sp', 'Độ lệch chuẩn tổng thể', (R) => `=STDEV.P(${X(R)})`, res.sdP),
				] },
				{ type: 'chart', kind: 'column', title: 'Giá trị theo thứ tự', table: 't', x: 'x', series: [{ name: 'Giá trị', key: 'x' }] },
			],
		};
	},
};

const IMPL = { normal, invnormal: inv, binom, poisson, expo, raw };
export default {
	id: 'stats',
	name: 'Thống kê & phân phối',
	group: 'Thống kê',
	keywords: 'statistics normal distribution binomial poisson exponential descriptive thong ke phan phoi chuan nhi thuc mean variance',
	models: [
		{ id: 'normal', name: 'Phân phối chuẩn (tính xác suất)', group: 'Phân phối', table: 'normal', params: [] },
		{ id: 'invnormal', name: 'Phân phối chuẩn ngược (tìm x từ xác suất)', group: 'Phân phối', table: 'invnormal', params: [] },
		{ id: 'binom', name: 'Phân phối nhị thức', group: 'Phân phối', table: 'binom', params: [] },
		{ id: 'poisson', name: 'Phân phối Poisson', group: 'Phân phối', table: 'poisson', params: [] },
		{ id: 'expo', name: 'Phân phối mũ', group: 'Phân phối', table: 'expo', params: [] },
		{ id: 'raw', name: 'Thống kê mô tả từ dữ liệu thô', group: 'Mô tả', table: 'raw', dims: [{ id: 'rows', label: 'Số quan sát', default: 10, min: 2, max: 1000 }], params: [] },
	],
	inputTable: (d, m, s) => IMPL[m.id].inputTable(d, m, s),
	parse: (t, m, p) => IMPL[m.id].parse(t, m, p),
	solve: (i, m, p) => IMPL[m.id].solve(i, m, p),
	summary: (r, m, p) => IMPL[m.id].summary(r, m, p),
	report: (i, r, m, p) => IMPL[m.id].report(i, r, m, p),
};
