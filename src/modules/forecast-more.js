// Forecasting models beyond the basic time-series methods.
import { trendES, sesSeasonal, regression, decompose, seasonalIndices, errorStats, coefCI, predictInterval } from '../../lib/forecast2.js';
import { InputError } from '../core/errors.js';
import { toNum, isBlank } from './common.js';

// Quarterly sales, 3 years (Render, Stair & Hanna – Turner Industries)
export const QUARTERLY = [108, 125, 150, 141, 116, 134, 159, 152, 123, 142, 168, 165];
// Heizer & Render – Midwestern Manufacturing (trend-adjusted ES)
const MIDWEST = [12, 17, 20, 19, 24, 21, 31, 28, 36];
// Heizer & Render – Nodel Construction: payroll (X) vs sales (Y)
const NODEL = [[1, 2], [3, 3], [4, 2.5], [2, 2], [1, 2], [7, 3.5]];
// Render – Jenny Wilson Realty: price (Y) vs sq ft, age
const JENNY = [[95000, 1926, 30], [119000, 2069, 40], [124800, 1720, 30], [135000, 1396, 15], [142000, 1706, 32], [145000, 1847, 38], [159000, 1950, 27], [165000, 2323, 30], [182000, 2285, 26], [183000, 3752, 35], [200000, 2300, 18], [211000, 2525, 17], [215000, 3800, 40], [219000, 1740, 12]];

const ERR_COLS = [
	{ key: 'err', label: 'Sai số', fmt: 'num' }, { key: 'abs', label: '|Sai số|', fmt: 'num' },
	{ key: 'sq', label: 'Sai số²', fmt: 'num' }, { key: 'pct', label: '|Sai số| / Thực tế', fmt: 'pct' },
];
// Error cells for row i of table `tid` with actual column `a` and forecast column `f`.
const errCells = (tid, i, a = 'actual', f = 'fc') => ({
	err: { f: (R) => `=${R.cell(tid, i, a)}-${R.cell(tid, i, f)}` },
	abs: { f: (R) => `=ABS(${R.cell(tid, i, 'err')})` },
	sq: { f: (R) => `=${R.cell(tid, i, 'err')}^2` },
	pct: { f: (R) => `=IF(${R.cell(tid, i, a)}=0,"",${R.cell(tid, i, 'abs')}/ABS(${R.cell(tid, i, a)}))` },
});
// Error-measure block over rows from..to of table `tid`.
export function errBlock(tid, from, to, res, extra = []) {
	const col = (k) => (R) => R.col(tid, k, from, to);
	return { type: 'kv', id: 'err', title: 'Đo lường sai số', items: [
		...extra,
		{ key: 'bias', label: 'Bias (sai số trung bình)', value: { f: (R) => `=AVERAGE(${col('err')(R)})`, v: res.bias }, fmt: 'num' },
		{ key: 'mad', label: 'MAD', value: { f: (R) => `=AVERAGE(${col('abs')(R)})`, v: res.mad }, fmt: 'num' },
		{ key: 'mse', label: 'MSE', value: { f: (R) => `=AVERAGE(${col('sq')(R)})`, v: res.mse }, fmt: 'num' },
		{ key: 'rmse', label: 'RMSE', value: { f: (R) => `=SQRT(${R.kv('err', 'mse')})`, v: res.rmse }, fmt: 'num' },
		{ key: 'mape', label: 'MAPE', value: { f: (R) => `=AVERAGE(${col('pct')(R)})`, v: res.mape }, fmt: 'pct' },
		{ key: 'ts', label: 'Tracking signal', value: { f: (R) => `=SUM(${col('err')(R)})/${R.kv('err', 'mad')}`, v: res.ts }, fmt: 'num' },
	] };
}
const errSummary = (res) => [{ label: 'MAD', value: res.mad, fmt: 'num' }, { label: 'MAPE', value: res.mape, fmt: 'pct' }];
const confOf = (p) => { const c = Number(p.conf); return c > 0.5 && c < 1 ? c : 0.95; };
// ANOVA table of a regression. `main` is the data table (needs columns y and sq), k = number of regressors.
function anovaBlock(res, k, n, confKv) {
	const A = (R, row, key) => R.cell('an', row, key), SS = (R, row) => A(R, row, 'ss');
	return { type: 'table', id: 'an', title: 'Bảng phân tích phương sai (ANOVA)', columns: [{ key: 'src', label: 'Nguồn biến động', fmt: 'text', role: 'label' }, { key: 'df', label: 'Bậc tự do', fmt: 'int' }, { key: 'ss', label: 'Tổng bình phương', fmt: 'num' }, { key: 'ms', label: 'Trung bình bình phương', fmt: 'num' }, { key: 'F', label: 'F', fmt: 'num' }, { key: 'sig', label: 'Significance F (giá trị p)', fmt: 'prob' }],
		rows: [
			{ cells: { src: 'Hồi quy (giải thích được)', df: k, ss: { f: (R) => `=${SS(R, 2)}-${SS(R, 1)}`, v: res.ssr }, ms: { f: (R) => `=${SS(R, 0)}/${A(R, 0, 'df')}`, v: res.msr }, F: { f: (R) => `=${A(R, 0, 'ms')}/${A(R, 1, 'ms')}`, v: res.F }, sig: { f: (R) => `=F.DIST.RT(${A(R, 0, 'F')},${A(R, 0, 'df')},${A(R, 1, 'df')})`, v: res.sigF } } },
			{ cells: { src: 'Phần dư (sai số)', df: n - k - 1, ss: { f: (R) => `=SUM(${R.col('main', 'sq', 0, n - 1)})`, v: res.sse }, ms: { f: (R) => `=${SS(R, 1)}/${A(R, 1, 'df')}`, v: res.sse / (n - k - 1) }, F: '', sig: '' } },
			{ cells: { src: 'Tổng', df: n - 1, ss: { f: (R) => `=DEVSQ(${R.col('main', 'y', 0, n - 1)})`, v: res.sst }, ms: '', F: '', sig: '' } },
		] };
}
const blankOr = (v) => (v === '' || v === undefined || v === null ? null : Number(v));

function tsTable(sample, n, data, title) {
	const y = sample ? data : null;
	const len = sample ? data.length : n;
	return {
		table: 'ts', title: title || 'Dự báo – dữ liệu', hint: 'Nhập số liệu thực tế mỗi kỳ vào cột màu vàng, theo thứ tự thời gian. Kỳ đầu tiên là mùa 1.',
		columns: [{ label: 'Kỳ', fmt: 'text' }, { label: 'Nhu cầu', fmt: 'num' }],
		rows: Array.from({ length: len }, (_, i) => [i + 1, y ? y[i] : '']), firstInputCol: 1,
	};
}
function parseSeries(rows) {
	const data = rows.map((r, i) => ({ r, i })).filter(({ r }) => !isBlank(r[1]));
	if (data.length < 2) throw new InputError('Cần ít nhất 2 kỳ có số liệu.');
	return { labels: data.map(({ r, i }) => (isBlank(r[0]) ? String(i + 1) : String(r[0]))), y: data.map(({ r, i }) => toNum(r[1], i, 1, `Số liệu kỳ ${i + 1}`)) };
}

export const MORE = {
	// ---------- Trend-adjusted exponential smoothing ----------
	trendES: {
		inputTable: (d, m, sample) => tsTable(sample, d.rows, MIDWEST),
		parse: ({ rows }) => parseSeries(rows),
		solve: (inp, m, p) => trendES(inp.y, Number(p.alpha), Number(p.beta), blankOr(p.F1), blankOr(p.T1) ?? 0),
		summary: (res) => [{ label: 'Dự báo kỳ tới (FIT)', value: res.next, fmt: 'num', strong: true }, ...errSummary(res), { label: 'Tracking signal', value: res.ts, fmt: 'num' }],
		report(inp, res, m, p) {
			const N = inp.y.length;
			const A = (R, i) => R.cell('main', i, 'actual');
			const rows = [];
			for (let i = 0; i <= N; i++) {
				const last = i === N;
				const F = i === 0 ? { f: (R) => (blankOr(p.F1) === null ? `=${A(R, 0)}` : `=${R.kv('p', 'F1')}`), v: res.F[0] }
					: { f: (R) => `=${R.kv('p', 'alpha')}*${A(R, i - 1)}+(1-${R.kv('p', 'alpha')})*(${R.cell('main', i - 1, 'F')}+${R.cell('main', i - 1, 'T')})`, v: res.F[i] };
				const T = i === 0 ? { f: (R) => `=${R.kv('p', 'T1')}`, v: res.T[0] }
					: { f: (R) => `=${R.kv('p', 'beta')}*(${R.cell('main', i, 'F')}-${R.cell('main', i - 1, 'F')})+(1-${R.kv('p', 'beta')})*${R.cell('main', i - 1, 'T')}`, v: res.T[i] };
				const hasErr = !last && i >= res.start;
				rows.push({ highlight: last, cells: { t: i + 1, label: last ? 'Kỳ tới' : inp.labels[i], actual: last ? null : inp.y[i], F, T,
					fc: { f: (R) => `=${R.cell('main', i, 'F')}+${R.cell('main', i, 'T')}`, v: res.FIT[i] }, ...(hasErr ? errCells('main', i) : {}) } });
			}
			return {
				title: 'Dự báo – San bằng hàm mũ có xu hướng', subtitle: 'FIT = F + T. Sửa α, β, F₁, T₁ ở ô vàng để tính lại.',
				blocks: [
					{ type: 'kv', id: 'p', title: 'Tham số', items: [
						{ key: 'alpha', label: 'α (san bằng mức)', value: Number(p.alpha), fmt: 'num', role: 'input' },
						{ key: 'beta', label: 'β (san bằng xu hướng)', value: Number(p.beta), fmt: 'num', role: 'input' },
						{ key: 'F1', label: 'F₁ (để trống = thực tế kỳ 1)', value: blankOr(p.F1) ?? '', fmt: 'num', role: 'input' },
						{ key: 'T1', label: 'T₁ (xu hướng ban đầu)', value: blankOr(p.T1) ?? 0, fmt: 'num', role: 'input' },
					] },
					{ type: 'table', id: 'main', title: 'Bảng tính', columns: [
						{ key: 't', label: 't', fmt: 'int', role: 'label' }, { key: 'label', label: 'Kỳ', fmt: 'text', role: 'label' },
						{ key: 'actual', label: 'Thực tế', fmt: 'num', role: 'input' }, { key: 'F', label: 'F (mức)', fmt: 'num' },
						{ key: 'T', label: 'T (xu hướng)', fmt: 'num' }, { key: 'fc', label: 'FIT (dự báo)', fmt: 'num' }, ...ERR_COLS,
					], rows },
					errBlock('main', res.start, N - 1, res, [{ key: 'next', label: 'Dự báo kỳ tới', value: { f: (R) => `=${R.cell('main', N, 'fc')}`, v: res.next }, fmt: 'num' }]),
					{ type: 'chart', kind: 'line', title: 'Thực tế và FIT', table: 'main', x: 't', series: [{ name: 'Thực tế', key: 'actual' }, { name: 'FIT', key: 'fc' }] },
				],
			};
		},
	},

	// ---------- Simple exponential smoothing on the deseasonalised series ----------
	sesSeasonal: {
		inputTable: (d, m, sample) => tsTable(sample, d.rows, QUARTERLY),
		parse: ({ rows }) => parseSeries(rows),
		solve(inp, m, p) { try { return sesSeasonal(inp.y, Number(p.s), Number(p.alpha)); } catch (e) { throw new InputError(e.message); } },
		summary: (res) => [{ label: 'Dự báo kỳ tới', value: res.next, fmt: 'num', strong: true }, { label: 'Dự báo đã khử mùa vụ', value: res.nextDeseason, fmt: 'num' }, ...errSummary(res)],
		report(inp, res, m, p) {
			const N = inp.y.length, s = Number(p.s), A = (R, i) => R.cell('main', i, 'actual');
			const rows = [];
			for (let i = 0; i <= N; i++) {
				const last = i === N;
				rows.push({ highlight: last, cells: { t: i + 1, season: (i % s) + 1, actual: last ? null : inp.y[i],
					si: { f: (R) => `=INDEX(${R.col('si', 'si')},${R.cell('main', i, 'season')})`, v: res.SI[i % s] },
					des: last ? null : { f: (R) => `=${A(R, i)}/${R.cell('main', i, 'si')}`, v: res.ds[i] },
					ses: i === 0 ? null : i === 1 ? { f: (R) => `=${R.cell('main', 0, 'des')}`, v: res.F[1] } : { f: (R) => `=${R.cell('main', i - 1, 'ses')}+${R.kv('p', 'alpha')}*(${R.cell('main', i - 1, 'des')}-${R.cell('main', i - 1, 'ses')})`, v: res.F[i] },
					fc: i === 0 ? null : { f: (R) => `=${R.cell('main', i, 'ses')}*${R.cell('main', i, 'si')}`, v: last ? res.next : res.fitted[i] },
					...(i >= 1 && !last ? errCells('main', i) : {}) } });
			}
			return { title: 'San bằng hàm mũ trên chuỗi đã khử mùa vụ', subtitle: 'Chỉ số mùa = trung bình mùa / trung bình chung. Khử mùa: Y / chỉ số; san bằng hàm mũ trên chuỗi đã khử mùa; dự báo = kết quả san bằng × chỉ số mùa.',
				blocks: [{ type: 'kv', id: 'p', title: 'Tham số', items: [{ key: 'alpha', label: 'α (sửa để tính lại)', value: Number(p.alpha), fmt: 'num', role: 'input' }, { key: 'avg', label: 'Trung bình chung', value: { f: (R) => `=AVERAGE(${R.col('main', 'actual', 0, N - 1)})`, v: res.overall }, fmt: 'num' }] },
					{ type: 'table', id: 'si', title: 'Chỉ số mùa vụ', columns: [{ key: 'k', label: 'Mùa', fmt: 'int', role: 'label' }, { key: 'av', label: 'Trung bình mùa', fmt: 'num' }, { key: 'si', label: 'Chỉ số mùa', fmt: 'num' }],
						rows: res.SI.map((v, k) => ({ cells: { k: k + 1, av: { f: (R) => `=AVERAGEIF(${R.col('main', 'season', 0, N - 1)},${R.cell('si', k, 'k')},${R.col('main', 'actual', 0, N - 1)})`, v: res.seasonAvg[k] }, si: { f: (R) => `=${R.cell('si', k, 'av')}/${R.kv('p', 'avg')}`, v } } })) },
					{ type: 'table', id: 'main', title: 'Bảng tính', columns: [{ key: 't', label: 't', fmt: 'int', role: 'label' }, { key: 'season', label: 'Mùa', fmt: 'int', role: 'label' }, { key: 'actual', label: 'Thực tế', fmt: 'num', role: 'input' }, { key: 'si', label: 'Chỉ số mùa', fmt: 'num' }, { key: 'des', label: 'Đã khử mùa', fmt: 'num' }, { key: 'ses', label: 'San bằng (khử mùa)', fmt: 'num' }, { key: 'fc', label: 'Dự báo', fmt: 'num' }, ...ERR_COLS], rows },
					errBlock('main', 1, N - 1, res, [{ key: 'next', label: 'Dự báo kỳ tới', value: { f: (R) => `=${R.cell('main', N, 'fc')}`, v: res.next }, fmt: 'num' }]),
					{ type: 'chart', kind: 'line', title: 'Thực tế và dự báo', table: 'main', x: 't', series: [{ name: 'Thực tế', key: 'actual' }, { name: 'Dự báo', key: 'fc' }] }] };
		},
	},

	// ---------- Seasonal indices (average method) ----------
	seasonal: {
		inputTable: (d, m, sample) => tsTable(sample, d.rows, QUARTERLY),
		parse: ({ rows }) => parseSeries(rows),
		solve: (inp, m, p) => seasonalIndices(inp.y, Number(p.s), blankOr(p.total)),
		summary: (res) => [{ label: 'Tổng chu kỳ tới', value: res.total, fmt: 'num', strong: true }, ...res.SI.slice(0, 6).map((v, k) => ({ label: `Chỉ số mùa ${k + 1}`, value: v, fmt: 'num' }))],
		report(inp, res, m, p) {
			const s = Number(p.s), N = inp.y.length;
			return {
				title: 'Chỉ số mùa vụ (phương pháp bình quân)', subtitle: 'Chỉ số = trung bình mùa / trung bình chung. Dự báo = (tổng chu kỳ tới / số mùa) × chỉ số.',
				blocks: [
					{ type: 'table', id: 'data', title: 'Dữ liệu', columns: [{ key: 't', label: 't', fmt: 'int', role: 'label' }, { key: 'season', label: 'Mùa', fmt: 'int', role: 'label' }, { key: 'actual', label: 'Thực tế', fmt: 'num', role: 'input' }],
						rows: inp.y.map((v, i) => ({ cells: { t: i + 1, season: (i % s) + 1, actual: v } })) },
					{ type: 'kv', id: 'p', title: 'Tham số', items: [
						{ key: 'avg', label: 'Trung bình chung', value: { f: (R) => `=AVERAGE(${R.col('data', 'actual')})`, v: res.overall }, fmt: 'num' },
						{ key: 'total', label: 'Tổng dự kiến chu kỳ tới', value: res.total, fmt: 'num', role: 'input' },
						{ key: 's', label: 'Số mùa mỗi chu kỳ', value: s, fmt: 'int', role: 'label' },
					] },
					{ type: 'table', id: 'si', title: 'Chỉ số và dự báo', columns: [
						{ key: 'k', label: 'Mùa', fmt: 'int', role: 'label' }, { key: 'avg', label: 'Trung bình mùa', fmt: 'num' },
						{ key: 'si', label: 'Chỉ số mùa', fmt: 'num' }, { key: 'fc', label: 'Dự báo chu kỳ tới', fmt: 'num' },
					], rows: res.SI.map((v, k) => ({ cells: {
						k: k + 1,
						avg: { f: (R) => `=AVERAGEIF(${R.col('data', 'season', 0, N - 1)},${R.cell('si', k, 'k')},${R.col('data', 'actual', 0, N - 1)})`, v: res.seasonAvg[k] },
						si: { f: (R) => `=${R.cell('si', k, 'avg')}/${R.kv('p', 'avg')}`, v },
						fc: { f: (R) => `=${R.kv('p', 'total')}/${R.kv('p', 's')}*${R.cell('si', k, 'si')}`, v: res.forecast[k] },
					} })) },
					{ type: 'chart', kind: 'column', title: 'Chỉ số mùa', table: 'si', x: 'k', series: [{ name: 'Chỉ số', key: 'si' }] },
				],
			};
		},
	},

	// ---------- Classic decomposition ----------
	decomp: {
		inputTable: (d, m, sample) => tsTable(sample, d.rows, QUARTERLY),
		parse: ({ rows }) => parseSeries(rows),
		solve: (inp, m, p) => decompose(inp.y, Number(p.s), m.id === 'decompAdd' ? 'add' : 'mult', Number(p.ahead) || Number(p.s)),
		summary: (res) => [{ label: 'Dự báo kỳ tới', value: res.future[0].forecast, fmt: 'num', strong: true }, { label: 'Xu hướng', value: `${res.a.toFixed(2)} + ${res.b.toFixed(3)}·t` }, ...errSummary(res)],
		report(inp, res, m, p) {
			const s = Number(p.s), N = inp.y.length, h = Math.floor(s / 2);
			const mult = m.id !== 'decompAdd';
			const op = mult ? '/' : '-';
			const A = (R, i) => R.cell('main', i, 'actual');
			const siOf = (R, i) => `INDEX(${R.col('si', 'si')},${R.cell('main', i, 'season')})`;
			const rows = inp.y.map((v, i) => {
				const hasCma = res.cma[i] !== null;
				const cma = !hasCma ? null : { f: (R) => (s % 2
					? `=AVERAGE(${R.col('main', 'actual', i - h, i + h)})`
					: `=(0.5*${A(R, i - h)}+SUM(${R.col('main', 'actual', i - h + 1, i + h - 1)})+0.5*${A(R, i + h)})/${s}`), v: res.cma[i] };
				return { cells: {
					t: i + 1, season: (i % s) + 1, actual: v, cma,
					ratio: hasCma ? { f: (R) => `=${A(R, i)}${op}${R.cell('main', i, 'cma')}`, v: res.ratio[i] } : null,
					des: { f: (R) => `=${A(R, i)}${op}${siOf(R, i)}`, v: res.des[i] },
					trend: { f: (R) => `=${R.kv('p', 'a')}+${R.kv('p', 'b')}*${R.cell('main', i, 't')}` },
					fc: { f: (R) => (mult ? `=${R.cell('main', i, 'trend')}*${siOf(R, i)}` : `=${R.cell('main', i, 'trend')}+${siOf(R, i)}`), v: res.fitted[i] },
					...errCells('main', i),
				} };
			});
			return {
				title: `Phân rã ${mult ? 'nhân' : 'cộng'} chuỗi thời gian`, subtitle: `Y = Xu hướng ${mult ? '×' : '+'} Mùa vụ. Trung bình trượt trung tâm ${s} kỳ; xu hướng hồi quy trên chuỗi đã khử mùa.`,
				blocks: [
					{ type: 'table', id: 'main', title: 'Bảng tính', columns: [
						{ key: 't', label: 't', fmt: 'int', role: 'label' }, { key: 'season', label: 'Mùa', fmt: 'int', role: 'label' },
						{ key: 'actual', label: 'Thực tế', fmt: 'num', role: 'input' }, { key: 'cma', label: 'TB trượt trung tâm', fmt: 'num' },
						{ key: 'ratio', label: mult ? 'Thực tế / TBTT' : 'Thực tế − TBTT', fmt: 'num' }, { key: 'des', label: 'Đã khử mùa', fmt: 'num' },
						{ key: 'trend', label: 'Xu hướng', fmt: 'num' }, { key: 'fc', label: 'Giá trị khớp', fmt: 'num' }, ...ERR_COLS,
					], rows },
					{ type: 'table', id: 'si', title: 'Chỉ số mùa', columns: [
						{ key: 'k', label: 'Mùa', fmt: 'int', role: 'label' }, { key: 'raw', label: 'Trung bình thô', fmt: 'num' }, { key: 'si', label: 'Chỉ số (đã chuẩn hoá)', fmt: 'num' },
					], rows: res.SI.map((v, k) => ({ cells: {
						k: k + 1,
						raw: { f: (R) => `=AVERAGEIF(${R.col('main', 'season')},${R.cell('si', k, 'k')},${R.col('main', 'ratio')})`, v: res.raw[k] },
						si: { f: (R) => (mult ? `=${R.cell('si', k, 'raw')}*${s}/SUM(${R.col('si', 'raw')})` : `=${R.cell('si', k, 'raw')}-AVERAGE(${R.col('si', 'raw')})`), v },
					} })) },
					{ type: 'kv', id: 'p', title: 'Đường xu hướng', items: [
						{ key: 'a', label: 'Hệ số chặn a', value: { f: (R) => `=INTERCEPT(${R.col('main', 'des')},${R.col('main', 't')})`, v: res.a }, fmt: 'num' },
						{ key: 'b', label: 'Hệ số góc b', value: { f: (R) => `=SLOPE(${R.col('main', 'des')},${R.col('main', 't')})`, v: res.b }, fmt: 'num' },
					] },
					{ type: 'table', id: 'fut', title: 'Dự báo các kỳ tới', columns: [
						{ key: 't', label: 't', fmt: 'int', role: 'label' }, { key: 'season', label: 'Mùa', fmt: 'int', role: 'label' },
						{ key: 'trend', label: 'Xu hướng', fmt: 'num' }, { key: 'fc', label: 'Dự báo', fmt: 'num' },
					], rows: res.future.map((f, j) => ({ highlight: j === 0, cells: {
						t: f.t, season: f.season,
						trend: { f: (R) => `=${R.kv('p', 'a')}+${R.kv('p', 'b')}*${R.cell('fut', j, 't')}`, v: f.trend },
						fc: { f: (R) => (mult ? `=${R.cell('fut', j, 'trend')}*INDEX(${R.col('si', 'si')},${R.cell('fut', j, 'season')})` : `=${R.cell('fut', j, 'trend')}+INDEX(${R.col('si', 'si')},${R.cell('fut', j, 'season')})`), v: f.forecast },
					} })) },
					errBlock('main', 0, N - 1, res),
					{ type: 'chart', kind: 'line', title: 'Thực tế và giá trị khớp', table: 'main', x: 't', series: [{ name: 'Thực tế', key: 'actual' }, { name: 'Khớp', key: 'fc' }] },
				],
			};
		},
	},

	// ---------- Simple linear regression (Y on X) ----------
	linreg: {
		inputTable: (d, m, sample) => ({
			table: 'xy', title: 'Hồi quy tuyến tính – dữ liệu', hint: 'Mỗi dòng là một quan sát: biến độc lập X và biến phụ thuộc Y.',
			columns: [{ label: 'X', fmt: 'num' }, { label: 'Y', fmt: 'num' }],
			rows: sample ? NODEL : Array.from({ length: d.rows }, () => ['', '']), firstInputCol: 0,
		}),
		parse({ header, rows }) {
			const data = rows.map((r, i) => ({ r, i })).filter(({ r }) => !isBlank(r[0]) || !isBlank(r[1]));
			if (data.length < 3) throw new InputError('Cần ít nhất 3 quan sát.');
			return { xName: String(header[0] || 'X'), yName: String(header[1] || 'Y'),
				x: data.map(({ r, i }) => toNum(r[0], i, 0, `X dòng ${i + 1}`)), y: data.map(({ r, i }) => toNum(r[1], i, 1, `Y dòng ${i + 1}`)) };
		},
		solve(inp, m, p) {
			const reg = regression(inp.x.map((v) => [v]), inp.y);
			const xn = blankOr(p.xNext), conf = confOf(p);
			const pint = xn === null ? null : predictInterval(reg, [xn], conf);
			return { ...reg, conf, ci: coefCI(reg, conf), xNext: xn, pred: xn === null ? null : reg.b[0] + reg.b[1] * xn, pint, elasticity: reg.b[1] * reg.xbar[0] / reg.ybar, ...errorStats(inp.y, reg.fitted) };
		},
		summary: (res) => [
			{ label: 'Phương trình', value: `ŷ = ${res.b[0].toFixed(4)} + ${res.b[1].toFixed(4)}·X`, strong: true },
			{ label: 'r', value: res.r, fmt: 'num' }, { label: 'R²', value: res.r2, fmt: 'num' }, { label: 'Sai số chuẩn ước lượng', value: res.se, fmt: 'num' },
			{ label: 'F', value: res.F, fmt: 'num' }, { label: 'Significance F', value: res.sigF, fmt: 'prob' }, { label: 'Hệ số co dãn tại trung bình', value: res.elasticity, fmt: 'num' },
			...(res.pred !== null ? [{ label: `Dự báo tại X = ${res.xNext}`, value: res.pred, fmt: 'num' }, { label: `Khoảng dự báo ${(res.conf * 100).toFixed(0)}% (cá biệt)`, value: `${res.pint.predLo.toFixed(2)} → ${res.pint.predHi.toFixed(2)}` }] : []),
		],
		report(inp, res) {
			const n = inp.x.length;
			const X = (R) => R.col('main', 'x'), Y = (R) => R.col('main', 'y');
			return {
				title: 'Hồi quy tuyến tính đơn', subtitle: `ŷ = a + b·${inp.xName}. Mọi chỉ số là công thức Excel theo dữ liệu.`,
				blocks: [
					{ type: 'kv', id: 'p', title: 'Kết quả', items: [
						{ key: 'a', label: 'Hệ số chặn a', value: { f: (R) => `=INTERCEPT(${Y(R)},${X(R)})`, v: res.b[0] }, fmt: 'num' },
						{ key: 'b', label: 'Hệ số góc b', value: { f: (R) => `=SLOPE(${Y(R)},${X(R)})`, v: res.b[1] }, fmt: 'num' },
						{ key: 'r', label: 'Hệ số tương quan r', value: { f: (R) => `=CORREL(${X(R)},${Y(R)})`, v: res.r }, fmt: 'num' },
						{ key: 'r2', label: 'Hệ số xác định R²', value: { f: (R) => `=RSQ(${Y(R)},${X(R)})`, v: res.r2 }, fmt: 'num' },
						{ key: 'se', label: 'Sai số chuẩn ước lượng', value: { f: (R) => `=STEYX(${Y(R)},${X(R)})`, v: res.se }, fmt: 'num' },
						{ key: 'el', label: 'Hệ số co dãn tại trung bình (b·x̄/ȳ)', value: { f: (R) => `=${R.kv('p', 'b')}*AVERAGE(${X(R)})/AVERAGE(${Y(R)})`, v: res.elasticity }, fmt: 'num' },
						{ key: 'conf', label: 'Độ tin cậy cho khoảng tin cậy / dự báo', value: res.conf, fmt: 'prob', role: 'input' },
						{ key: 'xn', label: `${inp.xName} cần dự báo (nhập)`, value: res.xNext ?? '', fmt: 'num', role: 'input' },
						{ key: 'pred', label: 'Dự báo ŷ', value: { f: (R) => `=IF(${R.kv('p', 'xn')}="","",${R.kv('p', 'a')}+${R.kv('p', 'b')}*${R.kv('p', 'xn')})`, v: res.pred }, fmt: 'num' },
					] },
					anovaBlock(res, 1, n),
					{ type: 'table', id: 'coef', title: 'Hệ số hồi quy và kiểm định', columns: [{ key: 'nm', label: 'Hệ số', fmt: 'text', role: 'label' }, { key: 'b', label: 'Giá trị', fmt: 'num' }, { key: 'se', label: 'Sai số chuẩn', fmt: 'num' }, { key: 't', label: 't', fmt: 'num' }, { key: 'p', label: 'Giá trị p', fmt: 'prob' }, { key: 'lo', label: 'Cận dưới (khoảng tin cậy)', fmt: 'num' }, { key: 'hi', label: 'Cận trên (khoảng tin cậy)', fmt: 'num' }],
						rows: [['Hệ số chặn a', 0], [`Hệ số góc b (${inp.xName})`, 1]].map(([nm, j]) => ({ cells: { nm,
							b: { f: (R) => `=${R.kv('p', j ? 'b' : 'a')}`, v: res.b[j] },
							se: { f: (R) => (j ? `=STEYX(${Y(R)},${X(R)})/SQRT(DEVSQ(${X(R)}))` : `=STEYX(${Y(R)},${X(R)})*SQRT(1/COUNT(${X(R)})+AVERAGE(${X(R)})^2/DEVSQ(${X(R)}))`), v: res.seb[j] },
							t: { f: (R) => `=${R.cell('coef', j, 'b')}/${R.cell('coef', j, 'se')}`, v: res.t[j] },
							p: { f: (R) => `=T.DIST.2T(ABS(${R.cell('coef', j, 't')}),${n - 2})`, v: res.p[j] },
							lo: { f: (R) => `=${R.cell('coef', j, 'b')}-T.INV.2T(1-${R.kv('p', 'conf')},${n - 2})*${R.cell('coef', j, 'se')}`, v: res.ci[j].lo },
							hi: { f: (R) => `=${R.cell('coef', j, 'b')}+T.INV.2T(1-${R.kv('p', 'conf')},${n - 2})*${R.cell('coef', j, 'se')}`, v: res.ci[j].hi } } })) },
					...(res.pint ? [{ type: 'kv', id: 'pi', title: 'Khoảng dự báo tại giá trị X đã nhập', items: [
						{ key: 'sf', label: 'Sai số chuẩn của giá trị trung bình', value: { f: (R) => `=STEYX(${Y(R)},${X(R)})*SQRT(1/COUNT(${X(R)})+(${R.kv('p', 'xn')}-AVERAGE(${X(R)}))^2/DEVSQ(${X(R)}))`, v: res.pint.seFit }, fmt: 'num' },
						{ key: 'sp', label: 'Sai số chuẩn của giá trị cá biệt', value: { f: (R) => `=STEYX(${Y(R)},${X(R)})*SQRT(1+1/COUNT(${X(R)})+(${R.kv('p', 'xn')}-AVERAGE(${X(R)}))^2/DEVSQ(${X(R)}))`, v: res.pint.sePred }, fmt: 'num' },
						{ key: 'tc', label: 'Giá trị t tới hạn', value: { f: (R) => `=T.INV.2T(1-${R.kv('p', 'conf')},${n - 2})`, v: res.pint.tcrit }, fmt: 'num' },
						{ key: 'ml', label: 'Trung bình: cận dưới', value: { f: (R) => `=${R.kv('p', 'pred')}-${R.kv('pi', 'tc')}*${R.kv('pi', 'sf')}`, v: res.pint.meanLo }, fmt: 'num' }, { key: 'mh', label: 'Trung bình: cận trên', value: { f: (R) => `=${R.kv('p', 'pred')}+${R.kv('pi', 'tc')}*${R.kv('pi', 'sf')}`, v: res.pint.meanHi }, fmt: 'num' },
						{ key: 'pl', label: 'Cá biệt: cận dưới', value: { f: (R) => `=${R.kv('p', 'pred')}-${R.kv('pi', 'tc')}*${R.kv('pi', 'sp')}`, v: res.pint.predLo }, fmt: 'num' }, { key: 'ph', label: 'Cá biệt: cận trên', value: { f: (R) => `=${R.kv('p', 'pred')}+${R.kv('pi', 'tc')}*${R.kv('pi', 'sp')}`, v: res.pint.predHi }, fmt: 'num' },
					] }] : []),
					{ type: 'table', id: 'main', title: 'Dữ liệu và giá trị khớp', columns: [
						{ key: 'x', label: inp.xName, fmt: 'num', role: 'input' }, { key: 'y', label: inp.yName, fmt: 'num', role: 'input' },
						{ key: 'fc', label: 'ŷ', fmt: 'num' }, ...ERR_COLS,
					], rows: inp.x.map((x, i) => ({ cells: { x, y: inp.y[i],
						fc: { f: (R) => `=${R.kv('p', 'a')}+${R.kv('p', 'b')}*${R.cell('main', i, 'x')}`, v: res.fitted[i] }, ...errCells('main', i, 'y') } })) },
					errBlock('main', 0, n - 1, res),
					{ type: 'chart', kind: 'scatter', title: `${inp.yName} theo ${inp.xName}`, xTitle: inp.xName, yTitle: inp.yName, series: [
						{ name: 'Dữ liệu', table: 'main', x: 'x', y: 'y', lines: false, markers: true },
						{ name: 'Đường hồi quy', table: 'main', x: 'x', y: 'fc', lines: true },
					] },
				],
			};
		},
	},

	// ---------- Multiple regression ----------
	multreg: {
		inputTable(d, m, sample) {
			const k = sample ? 2 : d.vars;
			return {
				table: 'multi', title: 'Hồi quy bội – dữ liệu', hint: 'Cột đầu là biến phụ thuộc Y, các cột sau là biến độc lập. Đổi tên cột ở dòng tiêu đề.',
				columns: sample ? [{ label: 'Giá bán', fmt: 'money' }, { label: 'Diện tích (ft²)', fmt: 'num' }, { label: 'Tuổi nhà', fmt: 'num' }]
					: [{ label: 'Y', fmt: 'num' }, ...Array.from({ length: k }, (_, j) => ({ label: `X${j + 1}`, fmt: 'num' }))],
				rows: sample ? JENNY : Array.from({ length: d.rows }, () => Array(k + 1).fill('')), firstInputCol: 0,
			};
		},
		parse({ header, rows }) {
			const k = header.length - 1;
			if (k < 1) throw new InputError('Cần ít nhất 1 cột biến độc lập.');
			const data = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.some((v) => !isBlank(v)));
			const names = header.map((h, j) => (isBlank(h) ? (j ? `X${j}` : 'Y') : String(h)));
			if (data.length < k + 2) throw new InputError(`Cần ít nhất ${k + 2} quan sát cho ${k} biến độc lập (đang có ${data.length}).`);
			return { yName: names[0], names: names.slice(1),
				y: data.map(({ r, i }) => toNum(r[0], i, 0, `${names[0]} dòng ${i + 1}`)),
				X: data.map(({ r, i }) => r.slice(1).map((v, j) => toNum(v, i, j + 1, `${names[j + 1]} dòng ${i + 1}`))) };
		},
		solve(inp, m, p) {
			const reg = regression(inp.X, inp.y);
			const xs = String(p.xNew ?? '').trim();
			let pred = null, xNew = null;
			if (xs) {
				xNew = xs.split(/[;\s]+/).filter(Boolean).map((v) => Number(v.replace(',', '.')));
				if (xNew.length !== inp.names.length || xNew.some((v) => !Number.isFinite(v))) throw new InputError(`Giá trị dự báo cần ${inp.names.length} số, cách nhau bởi dấu chấm phẩy.`);
				pred = reg.b[0] + xNew.reduce((s, v, j) => s + v * reg.b[j + 1], 0);
			}
			const conf = confOf(p);
			return { ...reg, conf, ci: coefCI(reg, conf), xNew, pred, pint: pred === null ? null : predictInterval(reg, xNew, conf), ...errorStats(inp.y, reg.fitted) };
		},
		summary: (res, m) => [{ label: 'R²', value: res.r2, fmt: 'num', strong: true }, { label: 'F', value: res.F, fmt: 'num' }, { label: 'Significance F', value: res.sigF, fmt: 'prob' }, { label: 'Sai số chuẩn', value: res.se, fmt: 'num' },
			{ label: 'Hệ số chặn', value: res.b[0], fmt: 'num' }, ...(res.pred !== null ? [{ label: 'Dự báo', value: res.pred, fmt: 'num' }] : [])],
		report(inp, res) {
			const k = inp.names.length, n = inp.y.length;
			const xk = inp.names.map((_, j) => 'x' + j);
			const coefCol = (R) => R.col('coef', 'b', 1, k);
			const rows = inp.y.map((y, i) => ({ cells: { y, ...Object.fromEntries(inp.X[i].map((v, j) => [xk[j], v])),
				fc: { f: (R) => `=${R.cell('coef', 0, 'b')}+MMULT(${R.row('main', i, xk[0], xk[k - 1])},${coefCol(R)})`, v: res.fitted[i] }, ...errCells('main', i, 'y') } }));
			const blocks = [
				{ type: 'table', id: 'coef', title: 'Hệ số hồi quy', columns: [
					{ key: 'name', label: 'Biến', fmt: 'text', role: 'label' }, { key: 'b', label: 'Hệ số', fmt: 'num' },
					{ key: 'se', label: 'Sai số chuẩn', fmt: 'num' }, { key: 't', label: 't', fmt: 'num' }, { key: 'p', label: 'Giá trị p', fmt: 'prob' }, { key: 'lo', label: 'Cận dưới', fmt: 'num' }, { key: 'hi', label: 'Cận trên', fmt: 'num' },
				], rows: ['Hệ số chặn', ...inp.names].map((nm, j) => ({ cells: { name: nm, b: res.b[j], se: res.seb[j],
					t: { f: (R) => `=${R.cell('coef', j, 'b')}/${R.cell('coef', j, 'se')}`, v: res.t[j] }, p: { f: (R) => `=T.DIST.2T(ABS(${R.cell('coef', j, 't')}),${R.kv('fit', 'df')})`, v: res.p[j] },
					lo: { f: (R) => `=${R.cell('coef', j, 'b')}-T.INV.2T(1-${R.kv('cf', 'conf')},${R.kv('fit', 'df')})*${R.cell('coef', j, 'se')}`, v: res.ci[j].lo },
					hi: { f: (R) => `=${R.cell('coef', j, 'b')}+T.INV.2T(1-${R.kv('cf', 'conf')},${R.kv('fit', 'df')})*${R.cell('coef', j, 'se')}`, v: res.ci[j].hi } } })) },
				{ type: 'kv', id: 'cf', items: [{ key: 'conf', label: 'Độ tin cậy cho khoảng tin cậy', value: res.conf, fmt: 'prob', role: 'input' }] },
				anovaBlock(res, k, n),
				{ type: 'kv', id: 'fit', title: 'Độ phù hợp', items: [
					{ key: 'r2', label: 'R²', value: res.r2, fmt: 'num' }, { key: 'ar2', label: 'R² hiệu chỉnh', value: res.adjR2, fmt: 'num' },
					{ key: 'se', label: 'Sai số chuẩn ước lượng', value: res.se, fmt: 'num' }, { key: 'df', label: 'Bậc tự do', value: res.df, fmt: 'int' },
				] },
			];
			if (res.pint) blocks.push({ type: 'kv', id: 'pi', title: `Khoảng dự báo ${(res.conf * 100).toFixed(0)}% (giá trị tính sẵn)`, items: [{ key: 'ml', label: 'Trung bình: cận dưới', value: res.pint.meanLo, fmt: 'num' }, { key: 'mh', label: 'Trung bình: cận trên', value: res.pint.meanHi, fmt: 'num' }, { key: 'pl', label: 'Cá biệt: cận dưới', value: res.pint.predLo, fmt: 'num' }, { key: 'ph', label: 'Cá biệt: cận trên', value: res.pint.predHi, fmt: 'num' }] });
			if (res.pred !== null) blocks.push({ type: 'table', id: 'new', title: 'Dự báo cho giá trị mới', columns: [...inp.names.map((nm, j) => ({ key: xk[j], label: nm, fmt: 'num', role: 'input' })), { key: 'fc', label: inp.yName + ' dự báo', fmt: 'num' }],
				rows: [{ highlight: true, cells: { ...Object.fromEntries(res.xNew.map((v, j) => [xk[j], v])), fc: { f: (R) => `=${R.cell('coef', 0, 'b')}+MMULT(${R.row('new', 0, xk[0], xk[k - 1])},${coefCol(R)})`, v: res.pred } } }] });
			blocks.push(
				{ type: 'table', id: 'main', title: 'Dữ liệu và giá trị khớp', columns: [{ key: 'y', label: inp.yName, fmt: 'num', role: 'input' }, ...inp.names.map((nm, j) => ({ key: xk[j], label: nm, fmt: 'num', role: 'input' })), { key: 'fc', label: 'ŷ', fmt: 'num' }, ...ERR_COLS], rows },
				errBlock('main', 0, n - 1, res),
			);
			return { title: 'Hồi quy bội', subtitle: 'Hệ số tính bằng bình phương tối thiểu. Cột ŷ là công thức theo bảng hệ số.', blocks };
		},
	},

	// ---------- Regression projector ----------
	projector: {
		inputTable(d, m, sample) {
			const k = sample ? 2 : d.vars;
			return {
				table: 'proj', title: 'Dự báo từ phương trình hồi quy', hint: 'Mỗi dòng là một bộ giá trị X cần dự báo. Hệ số nhập ở ô tham số trong pane.',
				columns: Array.from({ length: k }, (_, j) => ({ label: `X${j + 1}`, fmt: 'num' })),
				rows: sample ? [[2000, 20], [2400, 15], [1800, 35]] : Array.from({ length: d.rows }, () => Array(k).fill('')), firstInputCol: 0,
			};
		},
		parse({ header, rows }) {
			const data = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.some((v) => !isBlank(v)));
			if (!data.length) throw new InputError('Chưa có dòng giá trị X nào.');
			return { names: header.map((h, j) => (isBlank(h) ? `X${j + 1}` : String(h))), X: data.map(({ r, i }) => r.map((v, j) => toNum(v, i, j, `X${j + 1} dòng ${i + 1}`))) };
		},
		solve(inp, m, p) {
			const b = String(p.coef ?? '').split(/[;\s]+/).filter(Boolean).map((v) => Number(v.replace(',', '.')));
			if (b.length !== inp.names.length + 1 || b.some((v) => !Number.isFinite(v))) throw new InputError(`Cần ${inp.names.length + 1} hệ số (hệ số chặn rồi ${inp.names.length} hệ số góc), cách nhau bởi dấu chấm phẩy.`);
			return { b, pred: inp.X.map((r) => b[0] + r.reduce((s, v, j) => s + v * b[j + 1], 0)) };
		},
		summary: (res) => res.pred.slice(0, 6).map((v, i) => ({ label: `Dòng ${i + 1}`, value: v, fmt: 'num', strong: i === 0 })),
		report(inp, res) {
			const k = inp.names.length, xk = inp.names.map((_, j) => 'x' + j);
			return {
				title: 'Dự báo từ phương trình hồi quy', subtitle: 'Sửa hệ số hoặc giá trị X ở ô vàng; cột dự báo tự tính lại.',
				blocks: [
					{ type: 'table', id: 'coef', title: 'Hệ số', columns: [{ key: 'name', label: 'Hệ số', fmt: 'text', role: 'label' }, { key: 'b', label: 'Giá trị', fmt: 'num', role: 'input' }],
						rows: ['Hệ số chặn', ...inp.names].map((nm, j) => ({ cells: { name: nm, b: res.b[j] } })) },
					{ type: 'table', id: 'main', title: 'Dự báo', columns: [...inp.names.map((nm, j) => ({ key: xk[j], label: nm, fmt: 'num', role: 'input' })), { key: 'fc', label: 'ŷ', fmt: 'num' }],
						rows: inp.X.map((r, i) => ({ cells: { ...Object.fromEntries(r.map((v, j) => [xk[j], v])), fc: { f: (R) => `=${R.cell('coef', 0, 'b')}+MMULT(${R.row('main', i, xk[0], xk[k - 1])},${R.col('coef', 'b', 1, k)})`, v: res.pred[i] } } })) },
				],
			};
		},
	},

	// ---------- Error analysis ----------
	errors: {
		inputTable: (d, m, sample) => ({
			table: 'err', title: 'Phân tích sai số – dữ liệu', hint: 'Nhập số liệu thực tế và dự báo đã có cho từng kỳ.',
			columns: [{ label: 'Kỳ', fmt: 'text' }, { label: 'Thực tế', fmt: 'num' }, { label: 'Dự báo', fmt: 'num' }],
			rows: sample ? [[1, 100, 110], [2, 120, 112], [3, 115, 118], [4, 130, 121], [5, 125, 128], [6, 140, 132]] : Array.from({ length: d.rows }, (_, i) => [i + 1, '', '']), firstInputCol: 1,
		}),
		parse({ rows }) {
			const data = rows.map((r, i) => ({ r, i })).filter(({ r }) => !isBlank(r[1]) || !isBlank(r[2]));
			if (!data.length) throw new InputError('Chưa có số liệu.');
			return { labels: data.map(({ r, i }) => (isBlank(r[0]) ? String(i + 1) : String(r[0]))),
				y: data.map(({ r, i }) => toNum(r[1], i, 1, `Thực tế kỳ ${i + 1}`)), f: data.map(({ r, i }) => toNum(r[2], i, 2, `Dự báo kỳ ${i + 1}`)) };
		},
		solve: (inp) => errorStats(inp.y, inp.f),
		summary: (res) => [{ label: 'MAD', value: res.mad, fmt: 'num', strong: true }, { label: 'MSE', value: res.mse, fmt: 'num' }, { label: 'MAPE', value: res.mape, fmt: 'pct' }, { label: 'Bias', value: res.bias, fmt: 'num' }, { label: 'Tracking signal', value: res.ts, fmt: 'num' }],
		report(inp, res) {
			const n = inp.y.length;
			return {
				title: 'Phân tích sai số dự báo', subtitle: 'Sửa thực tế hoặc dự báo ở ô vàng; các chỉ số tự tính lại.',
				blocks: [
					{ type: 'table', id: 'main', title: 'Bảng sai số', columns: [{ key: 'label', label: 'Kỳ', fmt: 'text', role: 'label' }, { key: 'actual', label: 'Thực tế', fmt: 'num', role: 'input' }, { key: 'fc', label: 'Dự báo', fmt: 'num', role: 'input' }, ...ERR_COLS],
						rows: inp.y.map((y, i) => ({ cells: { label: inp.labels[i], actual: y, fc: inp.f[i], ...errCells('main', i) } })) },
					errBlock('main', 0, n - 1, res),
					{ type: 'chart', kind: 'line', title: 'Thực tế và dự báo', table: 'main', x: 'label', series: [{ name: 'Thực tế', key: 'actual' }, { name: 'Dự báo', key: 'fc' }] },
				],
			};
		},
	},
};
