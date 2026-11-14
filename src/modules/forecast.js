import { MORE } from './forecast-more.js';
import { forecast as solve } from '../../lib/forecast.js';
import { InputError } from '../core/errors.js';
import { toNum, isBlank } from './common.js';

const SAMPLE = [10, 12, 13, 16, 19, 23, 26, 30, 28, 18, 16, 14];

const TS_BASE = {
	id: 'forecast',
	name: 'Dự báo',
	group: 'Hoạch định & dự báo',
	keywords: 'forecast moving average exponential smoothing trend naive du bao',
	models: [
		{ id: 'naive', name: 'Naive (lấy kỳ trước)', params: [] },
		{ id: 'avg', name: 'Trung bình giản đơn (trung bình mọi kỳ trước)', params: [] },
		{ id: 'ma', name: 'Trung bình trượt', params: [{ id: 'n', label: 'Số kỳ trung bình (n)', type: 'int', default: 3, min: 1 }] },
		{ id: 'wma', name: 'Trung bình trượt có trọng số', params: [{ id: 'weights', label: 'Trọng số, từ cũ đến mới', type: 'list', default: '1, 2, 3' }] },
		{ id: 'es', name: 'San bằng hàm mũ', params: [{ id: 'alpha', label: 'Hệ số san bằng α (0–1)', type: 'num', default: 0.3, min: 0.01, max: 1, step: 0.05 }] },
		{ id: 'trend', name: 'Xu hướng tuyến tính (hồi quy theo thời gian)', params: [] },
	],
	dims: [{ id: 'rows', label: 'Số kỳ dữ liệu', default: 12, min: 3, max: 500 }],
	inputTable(dims, model, sample) {
		const n = sample ? SAMPLE.length : dims.rows;
		return {
			title: 'Dự báo – dữ liệu', hint: 'Nhập nhu cầu thực tế mỗi kỳ vào cột màu vàng. Thêm dòng bằng cách gõ ngay dưới bảng.',
			columns: [{ label: 'Kỳ', fmt: 'text' }, { label: 'Nhu cầu', fmt: 'num' }],
			rows: Array.from({ length: n }, (_, i) => [i + 1, sample ? SAMPLE[i] : '']),
			firstInputCol: 1,
		};
	},
	parse({ rows }) {
		const data = rows.map((r, i) => ({ r, i })).filter(({ r }) => !isBlank(r[1]));
		if (data.length < 2) throw new InputError('Cần ít nhất 2 kỳ có số liệu nhu cầu.');
		return { labels: data.map(({ r, i }) => (isBlank(r[0]) ? String(i + 1) : String(r[0]))), y: data.map(({ r, i }) => toNum(r[1], i, 1, `Nhu cầu kỳ ${i + 1}`)) };
	},
	solve(input, model, p) {
		const opts = { n: p.n, alpha: p.alpha, weights: parseWeights(p.weights) };
		const r = solve(input.y, model.id, opts);
		const used = r.rows.filter((x) => x.err !== null);
		const bias = used.reduce((s, x) => s + x.err, 0) / used.length;
		const ts = r.mad ? used.reduce((s, x) => s + x.err, 0) / r.mad : null;
		return { ...r, bias, ts, opts };
	},
	summary(res, model, p) {
		return [
			{ label: 'Dự báo kỳ tới', value: res.next, fmt: 'num', strong: true },
			{ label: 'MAD', value: res.mad, fmt: 'num' },
			{ label: 'MAPE', value: res.mape, fmt: 'pct' },
			{ label: 'Tracking signal', value: res.ts, fmt: 'num' },
		];
	},
	report(input, res, model, p) {
		const N = input.y.length;
		const first = res.rows.findIndex((x) => x.forecast !== null);
		const A = (R, i) => R.cell('main', i, 'actual');
		const F = (R, i) => R.cell('main', i, 'fc');
		const w = res.opts.weights;
		const sumW = w ? w.reduce((a, b) => a + b, 0) : 0;
		const fcFormula = (i) => (R) => {
			switch (model.id) {
				case 'naive': return `=${A(R, i - 1)}`;
				case 'avg': return `=AVERAGE(${R.col('main', 'actual', 0, i - 1)})`;
				case 'ma': return `=AVERAGE(${R.col('main', 'actual', i - p.n, i - 1)})`;
				case 'wma': return `=SUMPRODUCT(${R.col('main', 'actual', i - w.length, i - 1)},{${w.join(';')}})/${sumW}`;
				case 'es': return i === 1 ? `=${A(R, 0)}` : `=${F(R, i - 1)}+${R.kv('p', 'alpha')}*(${A(R, i - 1)}-${F(R, i - 1)})`;
				case 'trend': return `=${R.kv('p', 'intercept')}+${R.kv('p', 'slope')}*${R.cell('main', i, 't')}`;
			}
		};
		const rows = [];
		for (let i = 0; i <= N; i++) {
			const last = i === N;
			const has = last || i >= first;
			const fc = has ? { f: fcFormula(i), v: last ? res.next : res.rows[i].forecast } : null;
			const errOk = !last && has;
			rows.push({
				highlight: last,
				cells: {
					t: i + 1,
					label: last ? 'Kỳ tới' : input.labels[i],
					actual: last ? null : input.y[i],
					fc,
					err: errOk ? { f: (R) => `=${A(R, i)}-${F(R, i)}` } : null,
					abs: errOk ? { f: (R) => `=ABS(${R.cell('main', i, 'err')})` } : null,
					sq: errOk ? { f: (R) => `=${R.cell('main', i, 'err')}^2` } : null,
					pct: errOk ? { f: (R) => `=IF(${A(R, i)}=0,"",${R.cell('main', i, 'abs')}/ABS(${A(R, i)}))` } : null,
				},
			});
		}
		const params = [{ key: 'method', label: 'Phương pháp', value: model.name, role: 'label' }];
		if (model.id === 'ma') params.push({ key: 'n', label: 'Số kỳ n', value: p.n, fmt: 'int', role: 'input' });
		if (model.id === 'wma') params.push({ key: 'w', label: 'Trọng số', value: w.join('; '), role: 'input' });
		if (model.id === 'es') params.push({ key: 'alpha', label: 'α (sửa ô này để tính lại)', value: p.alpha, fmt: 'num', role: 'input' });
		if (model.id === 'trend') {
			params.push({ key: 'slope', label: 'Hệ số góc b', value: { f: (R) => `=SLOPE(${R.col('main', 'actual', 0, N - 1)},${R.col('main', 't', 0, N - 1)})`, v: res.coef.slope }, fmt: 'num' });
			params.push({ key: 'intercept', label: 'Hệ số chặn a', value: { f: (R) => `=INTERCEPT(${R.col('main', 'actual', 0, N - 1)},${R.col('main', 't', 0, N - 1)})`, v: res.coef.intercept }, fmt: 'num' });
		}
		const er = (key) => (R) => R.col('main', key, first, N - 1);
		return {
			title: `Dự báo – ${model.name}`,
			subtitle: 'Ô vàng là dữ liệu/tham số có thể sửa; ô xanh là công thức, Excel tự tính lại.',
			blocks: [
				{ type: 'kv', id: 'p', title: 'Tham số', items: params },
				{ type: 'table', id: 'main', title: 'Bảng tính', columns: [
					{ key: 't', label: 't', fmt: 'int', role: 'label' }, { key: 'label', label: 'Kỳ', fmt: 'text', role: 'label' },
					{ key: 'actual', label: 'Thực tế', fmt: 'num', role: 'input' }, { key: 'fc', label: 'Dự báo', fmt: 'num' },
					{ key: 'err', label: 'Sai số', fmt: 'num' }, { key: 'abs', label: '|Sai số|', fmt: 'num' },
					{ key: 'sq', label: 'Sai số²', fmt: 'num' }, { key: 'pct', label: '|Sai số| / Thực tế', fmt: 'pct' },
				], rows },
				{ type: 'kv', id: 'err', title: 'Đo lường sai số', items: [
					{ key: 'next', label: 'Dự báo kỳ tới', value: { f: (R) => `=${F(R, N)}`, v: res.next }, fmt: 'num' },
					{ key: 'bias', label: 'Bias (sai số trung bình)', value: { f: (R) => `=AVERAGE(${er('err')(R)})`, v: res.bias }, fmt: 'num' },
					{ key: 'mad', label: 'MAD', value: { f: (R) => `=AVERAGE(${er('abs')(R)})`, v: res.mad }, fmt: 'num' },
					{ key: 'mse', label: 'MSE', value: { f: (R) => `=AVERAGE(${er('sq')(R)})`, v: res.mse }, fmt: 'num' },
					{ key: 'rmse', label: 'RMSE', value: { f: (R) => `=SQRT(${R.kv('err', 'mse')})`, v: res.rmse }, fmt: 'num' },
					{ key: 'mape', label: 'MAPE', value: { f: (R) => `=AVERAGE(${er('pct')(R)})`, v: res.mape }, fmt: 'pct' },
					{ key: 'ts', label: 'Tracking signal', value: { f: (R) => `=SUM(${er('err')(R)})/${R.kv('err', 'mad')}`, v: res.ts }, fmt: 'num' },
				] },
				{ type: 'chart', kind: 'line', title: 'Thực tế và dự báo', table: 'main', x: 't', series: [{ name: 'Thực tế', key: 'actual' }, { name: 'Dự báo', key: 'fc' }] },
			],
		};
	},
};

export { TS_BASE };
export function parseWeights(s) {
	if (s === undefined || s === null) return undefined;
	const t = String(s).trim();
	// "0,2; 0,3; 0,5" uses decimal commas; otherwise items are split by commas or spaces.
	const parts = t.includes(';') ? t.split(';').map((x) => x.trim().replace(',', '.')) : t.split(/[,\s]+/);
	const w = parts.filter(Boolean).map(Number);
	if (!w.length || w.some((x) => !Number.isFinite(x))) throw new InputError('Trọng số phải là các số, ví dụ: 1, 2, 3 hoặc 0,2; 0,3; 0,5.');
	return w;
}

// ---------- Module: basic time-series methods + the models in forecast-more.js ----------

const TS_DIMS = [{ id: 'rows', label: 'Số kỳ dữ liệu', default: 12, min: 3, max: 500 }];
const S_PARAM = { id: 's', label: 'Số mùa mỗi chu kỳ (4 = quý, 12 = tháng)', type: 'int', default: 4, min: 2, max: 52 };
const G1 = 'Chuỗi thời gian', G2 = 'Mùa vụ', G3 = 'Hồi quy', G4 = 'Công cụ';
const basic = (m) => ({ ...m, group: G1, table: 'ts', dims: TS_DIMS, kind: 'basic' });

export default {
	id: 'forecast',
	name: 'Dự báo',
	group: 'Hoạch định & dự báo',
	keywords: 'forecast moving average exponential smoothing trend naive regression seasonal decomposition hoi quy mua vu phan ra du bao',
	models: [
		...TS_BASE.models.map(basic),
		{ id: 'trendES', name: 'San bằng hàm mũ có xu hướng (α, β)', group: G1, table: 'ts', dims: TS_DIMS, kind: 'trendES', params: [
			{ id: 'alpha', label: 'α – san bằng mức (0–1)', type: 'num', default: 0.2, min: 0.01, max: 1, step: 0.05 },
			{ id: 'beta', label: 'β – san bằng xu hướng (0–1)', type: 'num', default: 0.4, min: 0, max: 1, step: 0.05 },
			{ id: 'F1', label: 'Dự báo ban đầu F₁ (trống = thực tế kỳ 1)', type: 'num', default: 11, optional: true },
			{ id: 'T1', label: 'Xu hướng ban đầu T₁', type: 'num', default: 2, optional: true },
		] },
		{ id: 'sesSeasonal', name: 'San bằng hàm mũ trên chuỗi đã khử mùa vụ', group: G2, table: 'ts', dims: TS_DIMS, kind: 'sesSeasonal', params: [S_PARAM, { id: 'alpha', label: 'Hệ số san bằng α (0–1)', type: 'num', default: 0.3, min: 0.01, max: 1, step: 0.05 }] },
		{ id: 'seasonal', name: 'Chỉ số mùa vụ (bình quân)', group: G2, table: 'ts', dims: TS_DIMS, kind: 'seasonal', params: [S_PARAM, { id: 'total', label: 'Tổng dự kiến chu kỳ tới (trống = trung bình các chu kỳ)', type: 'num', default: '', optional: true }] },
		{ id: 'decompMult', name: 'Phân rã nhân (xu hướng × mùa vụ)', group: G2, table: 'ts', dims: TS_DIMS, kind: 'decomp', params: [S_PARAM, { id: 'ahead', label: 'Số kỳ cần dự báo', type: 'int', default: 4, min: 1, max: 60 }] },
		{ id: 'decompAdd', name: 'Phân rã cộng (xu hướng + mùa vụ)', group: G2, table: 'ts', dims: TS_DIMS, kind: 'decomp', params: [S_PARAM, { id: 'ahead', label: 'Số kỳ cần dự báo', type: 'int', default: 4, min: 1, max: 60 }] },
		{ id: 'linreg', name: 'Hồi quy tuyến tính đơn (Y theo X)', group: G3, table: 'xy', kind: 'linreg', dims: [{ id: 'rows', label: 'Số quan sát', default: 6, min: 3, max: 1000 }],
			params: [{ id: 'xNext', label: 'Giá trị X cần dự báo (tuỳ chọn)', type: 'num', default: 6, optional: true }, { id: 'conf', label: 'Độ tin cậy cho khoảng tin cậy (ví dụ 0,95)', type: 'num', default: 0.95, min: 0.5, max: 0.999, step: 0.01 }] },
		{ id: 'multreg', name: 'Hồi quy bội', group: G3, table: 'multi', kind: 'multreg', dims: [{ id: 'rows', label: 'Số quan sát', default: 14, min: 3, max: 1000 }, { id: 'vars', label: 'Số biến X', default: 2, min: 1, max: 20 }],
			params: [{ id: 'xNew', label: 'Giá trị X để dự báo (cách nhau bởi ;)', type: 'list', default: '1900; 35' }, { id: 'conf', label: 'Độ tin cậy cho khoảng tin cậy (ví dụ 0,95)', type: 'num', default: 0.95, min: 0.5, max: 0.999, step: 0.01 }] },
		{ id: 'projector', name: 'Dự báo từ phương trình hồi quy có sẵn', group: G4, table: 'proj', kind: 'projector', dims: [{ id: 'rows', label: 'Số dòng cần dự báo', default: 3, min: 1, max: 500 }, { id: 'vars', label: 'Số biến X', default: 2, min: 1, max: 20 }],
			params: [{ id: 'coef', label: 'Hệ số: chặn; b1; b2… (cách nhau bởi ;)', type: 'list', default: '146631; 43,82; -2899' }] },
		{ id: 'errors', name: 'Phân tích sai số (thực tế vs dự báo)', group: G4, table: 'err', kind: 'errors', dims: [{ id: 'rows', label: 'Số kỳ', default: 6, min: 1, max: 1000 }], params: [] },
	],
	inputTable(d, m, sample) {
		if (m.kind === 'basic') return { ...TS_BASE.inputTable(d, m, sample), table: 'ts' };
		return MORE[m.kind].inputTable(d, m, sample);
	},
	parse(t, m, p) { return m.kind === 'basic' ? TS_BASE.parse(t, m, p) : MORE[m.kind].parse(t, m, p); },
	solve(i, m, p) { return m.kind === 'basic' ? TS_BASE.solve(i, m, p) : MORE[m.kind].solve(i, m, p); },
	summary(r, m, p) { return m.kind === 'basic' ? TS_BASE.summary(r, m, p) : MORE[m.kind].summary(r, m, p); },
	report(i, r, m, p) { return m.kind === 'basic' ? TS_BASE.report(i, r, m, p) : MORE[m.kind].report(i, r, m, p); },
};
