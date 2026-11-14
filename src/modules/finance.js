import * as F from '../../lib/finance.js';
import { scalarModel } from './param.js';
import { InputError } from '../core/errors.js';
import { toNum, isBlank } from './common.js';

const G1 = 'Lãi suất & giá trị tiền', G2 = 'Trả góp & vay', G3 = 'Đánh giá dự án';
const blank = (n, w) => Array.from({ length: n }, () => Array(w).fill(''));
const rowsOf = (rows) => rows.map((r, i) => ({ r, i })).filter(({ r }) => r.some((v) => !isBlank(v)));
const TYPE = { key: 'type', label: 'Thời điểm trả: 0 = cuối kỳ, 1 = đầu kỳ', default: 0, min: 0, max: 1 };
const typeOk = (v) => (v.type === 0 || v.type === 1 ? null : { message: 'Thời điểm trả chỉ nhận 0 (cuối kỳ) hoặc 1 (đầu kỳ).' });

// ---------- Rates and a single sum ----------
const FREQ = [[1, 'Hằng năm'], [2, 'Nửa năm'], [4, 'Quý'], [12, 'Tháng'], [365, 'Ngày']];
const rates = scalarModel({
	title: 'Lãi suất thực, danh nghĩa và giá trị tương lai – dữ liệu', sheet: 'Lãi suất thực', hint: 'Lãi suất danh nghĩa năm và số kỳ ghép lãi mỗi năm. Bảng bên dưới so sánh các cách ghép lãi (bài 1).',
	items: [{ key: 'pv', label: 'Số tiền gửi ban đầu', default: 3000000, positive: true, fmt: 'money' }, { key: 'nom', label: 'Lãi suất danh nghĩa năm (ví dụ 0,12)', default: 0.12, positive: true, fmt: 'prob' },
		{ key: 'm', label: 'Số kỳ ghép lãi mỗi năm', default: 4, min: 1 }, { key: 'years', label: 'Số năm gửi', default: 2, positive: true }],
	compute: (v) => ({ per: v.nom / v.m, eff: F.effective(v.nom, v.m), fv: F.fvSum(v.pv, v.nom / v.m, v.m * v.years), simple: v.pv * (1 + v.nom * v.years) }),
	outputs: [
		{ key: 'per', label: 'Lãi suất mỗi kỳ ghép lãi', fmt: 'prob', f: (I) => `=${I('nom')}/${I('m')}` },
		{ key: 'eff', label: 'Lãi suất thực năm', fmt: 'prob', strong: true, f: (I) => `=(1+${I('nom')}/${I('m')})^${I('m')}-1` },
		{ key: 'fv', label: 'Số tiền nhận được (lãi kép)', fmt: 'money', strong: true, f: (I) => `=${I('pv')}*(1+${I('nom')}/${I('m')})^(${I('m')}*${I('years')})` },
		{ key: 'simple', label: 'Số tiền nếu tính lãi đơn', fmt: 'money', f: (I) => `=${I('pv')}*(1+${I('nom')}*${I('years')})` },
	],
	tables: (v) => [{ type: 'table', id: 'cmp', title: 'So sánh các kỳ ghép lãi', columns: [{ key: 'n', label: 'Ghép lãi', fmt: 'text', role: 'label' }, { key: 'm', label: 'Số kỳ / năm', fmt: 'int', role: 'input' }, { key: 'e', label: 'Lãi suất thực năm', fmt: 'prob' }, { key: 'f', label: `Số tiền sau ${v.years} năm`, fmt: 'money' }],
		rows: FREQ.map(([m, n], i) => ({ cells: { n, m, e: { f: (R) => `=(1+${R.kv('in', 'nom')}/${R.cell('cmp', i, 'm')})^${R.cell('cmp', i, 'm')}-1`, v: F.effective(v.nom, m) }, f: { f: (R) => `=${R.kv('in', 'pv')}*(1+${R.kv('in', 'nom')}/${R.cell('cmp', i, 'm')})^(${R.cell('cmp', i, 'm')}*${R.kv('in', 'years')})`, v: F.fvSum(v.pv, v.nom / m, m * v.years) } } })) }],
});

const fvpv = scalarModel({
	title: 'Giá trị tương lai, hiện tại, lãi suất và số kỳ – dữ liệu', sheet: 'Tương lai hiện tại', hint: 'Điền bất kỳ ba trong bốn ô (số tiền hiện tại, số tiền tương lai, lãi suất mỗi kỳ, số kỳ); ô để trống sẽ được tính.',
	items: [{ key: 'pv', label: 'Số tiền hiện tại (PV)', default: 1000, optional: true, fmt: 'money' }, { key: 'fv', label: 'Số tiền tương lai (FV)', default: 1311, optional: true, fmt: 'money' },
		{ key: 'r', label: 'Lãi suất mỗi kỳ', default: '', optional: true, fmt: 'prob' }, { key: 'n', label: 'Số kỳ', default: 4, optional: true }],
	validate: (v) => (Object.values({ a: v.pv, b: v.fv, c: v.r, d: v.n }).filter((x) => x === null).length !== 1 ? { message: 'Hãy để trống đúng một trong bốn ô (ô cần tính).', row: 0 } : null),
	compute(v) {
		if (v.pv === null) return { pvOut: F.pvSum(v.fv, v.r, v.n) };
		if (v.fv === null) return { fvOut: F.fvSum(v.pv, v.r, v.n) };
		if (v.r === null) return { rOut: F.rateOfSum(v.pv, v.fv, v.n) };
		return { nOut: F.nperOfSum(v.pv, v.fv, v.r) };
	},
	outputs: [
		{ key: 'pvOut', label: 'Số tiền hiện tại (PV)', fmt: 'money', strong: true, f: (I) => `=${I('fv')}/(1+${I('r')})^${I('n')}` },
		{ key: 'fvOut', label: 'Số tiền tương lai (FV)', fmt: 'money', strong: true, f: (I) => `=${I('pv')}*(1+${I('r')})^${I('n')}` },
		{ key: 'rOut', label: 'Lãi suất mỗi kỳ', fmt: 'prob', strong: true, f: (I) => `=(${I('fv')}/${I('pv')})^(1/${I('n')})-1` },
		{ key: 'nOut', label: 'Số kỳ', strong: true, f: (I) => `=LN(${I('fv')}/${I('pv')})/LN(1+${I('r')})` },
	],
});

// ---------- Annuities ----------
const annuity = scalarModel({
	title: 'Giá trị hiện tại và tương lai của niên kim – dữ liệu', sheet: 'Niên kim', hint: 'Dòng tiền đều nhau mỗi kỳ. Trả cuối kỳ (niên kim thường) hoặc đầu kỳ (niên kim đầu kỳ).',
	items: [{ key: 'pmt', label: 'Khoản tiền mỗi kỳ', default: 500000, positive: true, fmt: 'money' }, { key: 'r', label: 'Lãi suất mỗi kỳ', default: 0.14, min: 0, fmt: 'prob' }, { key: 'n', label: 'Số kỳ', default: 30, positive: true }, TYPE],
	validate: typeOk,
	compute: (v) => ({ pv: v.pmt * F.pvFactor(v.r, v.n, v.type), fv: v.pmt * F.fvFactor(v.r, v.n, v.type) }),
	outputs: [{ key: 'fv', label: 'Giá trị tương lai (FV)', fmt: 'money', strong: true, f: (I) => `=FV(${I('r')},${I('n')},-${I('pmt')},0,${I('type')})` }, { key: 'pv', label: 'Giá trị hiện tại (PV)', fmt: 'money', strong: true, f: (I) => `=PV(${I('r')},${I('n')},-${I('pmt')},0,${I('type')})` }],
});
const payment = scalarModel({
	title: 'Tìm khoản tiền đều mỗi kỳ – dữ liệu', sheet: 'Khoản trả đều', hint: 'Điền PV để tính khoản trả góp/trả nợ đều (bài 2, 9, 18), hoặc FV để tính khoản trích lập quỹ đều (bài 3, 5, 15). Có thể điền cả hai.',
	items: [{ key: 'pv', label: 'Số tiền vay / giá trị hiện tại cần trả dần (PV)', default: 450000000, optional: true, fmt: 'money' }, { key: 'fv', label: 'Số tiền cần có ở cuối (FV)', default: 500000000, optional: true, fmt: 'money' },
		{ key: 'r', label: 'Lãi suất mỗi kỳ', default: 0.08, min: 0, fmt: 'prob' }, { key: 'n', label: 'Số kỳ', default: 25, positive: true }, TYPE],
	validate: (v) => (v.pv === null && v.fv === null ? { message: 'Nhập PV hoặc FV.', row: 0 } : typeOk(v)),
	compute: (v) => ({ ...(v.pv !== null ? { pmtPV: F.pmtFromPV(v.pv, v.r, v.n, v.type) } : {}), ...(v.fv !== null ? { pmtFV: F.pmtFromFV(v.fv, v.r, v.n, v.type) } : {}) }),
	outputs: [{ key: 'pmtPV', label: 'Khoản trả đều để trả hết PV', fmt: 'money', strong: true, f: (I) => `=-PMT(${I('r')},${I('n')},${I('pv')},0,${I('type')})` }, { key: 'pmtFV', label: 'Khoản gửi đều để đạt FV', fmt: 'money', strong: true, f: (I) => `=PMT(${I('r')},${I('n')},0,-${I('fv')},${I('type')})` }],
});
const rate = scalarModel({
	title: 'Tìm lãi suất của khoản vay trả góp – dữ liệu', sheet: 'Tìm lãi suất', hint: 'Cho số tiền thực nhận, khoản trả mỗi kỳ và số kỳ, tìm lãi suất thật mà người vay chịu (bài 13, 17, 19).',
	items: [{ key: 'pv', label: 'Số tiền thực nhận (giá trả ngay − trả trước)', default: 1000, positive: true, fmt: 'money' }, { key: 'pmt', label: 'Khoản trả mỗi kỳ', default: 65, positive: true, fmt: 'money' }, { key: 'n', label: 'Số kỳ trả', default: 18, positive: true },
		{ key: 'm', label: 'Số kỳ trong một năm (12 = tháng, 365 = ngày)', default: 12, positive: true }, TYPE],
	validate: typeOk,
	compute(v) { const r = F.rateOfAnnuity(v.n, v.pmt, v.pv, 0, v.type); return { r, nom: r * v.m, eff: (1 + r) ** v.m - 1, total: v.pmt * v.n, interest: v.pmt * v.n - v.pv }; },
	outputs: [
		{ key: 'r', label: 'Lãi suất mỗi kỳ', fmt: 'prob', strong: true, f: (I, O, R) => `=RATE(${I('n')},-${I('pmt')},${I('pv')},0,${I('type')},0.01)` },
		{ key: 'nom', label: 'Lãi suất danh nghĩa năm', fmt: 'prob', f: (I, O) => `=${O('r')}*${I('m')}` },
		{ key: 'eff', label: 'Lãi suất thực năm', fmt: 'prob', strong: true, f: (I, O) => `=(1+${O('r')})^${I('m')}-1` },
		{ key: 'total', label: 'Tổng tiền phải trả', fmt: 'money', f: (I) => `=${I('pmt')}*${I('n')}` }, { key: 'interest', label: 'Tổng tiền lãi', fmt: 'money', f: (I, O) => `=${O('total')}-${I('pv')}` },
	],
});

// ---------- Loan schedule ----------
const loan = {
	inputTable: (d, m, sample) => ({ title: 'Lịch trả nợ – dữ liệu', sheet: 'Lịch trả nợ', hint: 'Vay trả đều mỗi kỳ. Bảng lịch trả nợ cho từng kỳ: dư nợ, tiền trả, tiền lãi, trả gốc.',
		columns: [{ label: 'Tham số', fmt: 'text' }, { label: 'Giá trị', fmt: 'num' }],
		rows: [['Số tiền vay', sample ? 500000000 : ''], ['Lãi suất mỗi kỳ', sample ? 0.12 : ''], ['Số kỳ trả', sample ? 5 : ''], ['Thời điểm trả: 0 = cuối kỳ, 1 = đầu kỳ', sample ? 0 : '']], firstInputCol: 1 }),
	parse({ rows }) {
		const g = (i, w) => toNum(rows[i]?.[1], i, 1, w);
		const principal = g(0, 'Số tiền vay'), r = g(1, 'Lãi suất mỗi kỳ'), n = g(2, 'Số kỳ'), type = g(3, 'Thời điểm trả');
		if (!(principal > 0)) throw new InputError('Số tiền vay phải lớn hơn 0.', 0, 1);
		if (!(r >= 0)) throw new InputError('Lãi suất không được âm.', 1, 1);
		if (!(n >= 1 && n <= 600 && Number.isInteger(n))) throw new InputError('Số kỳ phải là số nguyên từ 1 đến 600.', 2, 1);
		if (type !== 0 && type !== 1) throw new InputError('Thời điểm trả chỉ nhận 0 hoặc 1.', 3, 1);
		return { principal, r, n, type };
	},
	solve: (inp) => F.amortize(inp.principal, inp.r, inp.n, inp.type),
	summary: (res) => [{ label: 'Khoản trả mỗi kỳ', value: res.pmt, fmt: 'money', strong: true }, { label: 'Tổng tiền trả', value: res.totalPaid, fmt: 'money' }, { label: 'Tổng tiền lãi', value: res.totalInterest, fmt: 'money' }],
	report(inp, res) {
		const N = inp.n, T = inp.type;
		return { title: 'Lịch trả nợ – kết quả', subtitle: T === 0 ? 'Trả cuối mỗi kỳ: lãi = dư nợ đầu kỳ × lãi suất; trả gốc = khoản trả − lãi.' : 'Trả đầu mỗi kỳ: khoản trả giảm gốc ngay đầu kỳ, lãi tính trên dư nợ sau khi trả.',
			blocks: [{ type: 'kv', id: 'p', title: 'Khoản vay', items: [{ key: 'pv', label: 'Số tiền vay', value: inp.principal, fmt: 'money', role: 'input' }, { key: 'r', label: 'Lãi suất mỗi kỳ', value: inp.r, fmt: 'prob', role: 'input' }, { key: 'n', label: 'Số kỳ', value: inp.n, fmt: 'int', role: 'input' }, { key: 'ty', label: 'Thời điểm trả (0 cuối, 1 đầu)', value: inp.type, fmt: 'int', role: 'input' },
				{ key: 'pmt', label: 'Khoản trả mỗi kỳ', value: { f: (R) => `=-PMT(${R.kv('p', 'r')},${R.kv('p', 'n')},${R.kv('p', 'pv')},0,${R.kv('p', 'ty')})`, v: res.pmt }, fmt: 'money' }] },
				{ type: 'table', id: 't', title: 'Lịch trả nợ', columns: [{ key: 'k', label: 'Kỳ', fmt: 'int', role: 'label' }, { key: 'o', label: 'Dư nợ đầu kỳ', fmt: 'money' }, { key: 'pay', label: 'Khoản trả', fmt: 'money' }, { key: 'i', label: 'Tiền lãi', fmt: 'money' }, { key: 'g', label: 'Trả gốc', fmt: 'money' }, { key: 'c', label: 'Dư nợ cuối kỳ', fmt: 'money' }],
					rows: res.rows.map((r, i) => ({ cells: { k: r.k,
						o: i ? { f: (R) => `=${R.cell('t', i - 1, 'c')}`, v: r.open } : { f: (R) => `=${R.kv('p', 'pv')}`, v: r.open },
						pay: { f: (R) => `=${R.kv('p', 'pmt')}`, v: r.pay },
						i: { f: (R) => (T === 1 ? `=(${R.cell('t', i, 'o')}-${R.cell('t', i, 'pay')})*${R.kv('p', 'r')}` : `=${R.cell('t', i, 'o')}*${R.kv('p', 'r')}`), v: r.interest },
						g: { f: (R) => (T === 1 ? `=${R.cell('t', i, 'pay')}` : `=${R.cell('t', i, 'pay')}-${R.cell('t', i, 'i')}`), v: r.principal },
						c: { f: (R) => `=ROUND(${R.cell('t', i, 'o')}-${R.cell('t', i, 'g')}+${T === 1 ? R.cell('t', i, 'i') : '0'},6)`, v: r.close } } })) },
				{ type: 'kv', id: 'r', title: 'Tổng kết', items: [{ key: 'tp', label: 'Tổng tiền đã trả', value: { f: (R) => `=SUM(${R.col('t', 'pay')})`, v: res.totalPaid }, fmt: 'money' }, { key: 'ti', label: 'Tổng tiền lãi', value: { f: (R) => `=SUM(${R.col('t', 'i')})`, v: res.totalInterest }, fmt: 'money' }, { key: 'tg', label: 'Tổng gốc đã trả', value: { f: (R) => `=SUM(${R.col('t', 'g')})`, v: inp.principal }, fmt: 'money' }] },
				{ type: 'chart', kind: 'column', title: 'Cơ cấu mỗi kỳ trả: lãi và gốc', table: 't', x: 'k', series: [{ name: 'Tiền lãi', key: 'i' }, { name: 'Trả gốc', key: 'g' }] }], _N: N };
	},
};

// ---------- Project appraisal ----------
const projects = {
	inputTable(d, m, sample) {
		const names = sample ? ['Dự án S', 'Dự án L'] : Array.from({ length: d.projects }, (_, j) => `Dự án ${j + 1}`);
		const cols = [{ label: 'Kỳ', fmt: 'text' }, ...names.map((n) => ({ label: n, fmt: 'num' }))];
		let rows;
		if (sample) rows = [['Lãi suất riêng (bỏ trống = dùng lãi suất chung)', '', ''], [0, -30, -30], [1, 20, 8], [2, 20, 8], [3, 0, 8], [4, 0, 8], [5, 0, 8], [6, 0, 8]];
		else rows = [['Lãi suất riêng (bỏ trống = dùng lãi suất chung)', ...Array(d.projects).fill('')], ...Array.from({ length: d.periods }, (_, t) => [t, ...Array(d.projects).fill('')])];
		return { title: 'So sánh dự án đầu tư – dòng tiền', sheet: 'So sánh dự án', hint: 'Mỗi cột là một dự án, mỗi dòng là một kỳ (kỳ 0 là vốn đầu tư, số âm). Dòng đầu cho phép đặt lãi suất riêng cho từng dự án.', columns: cols, rows, firstInputCol: 1 };
	},
	parse({ header, rows }) {
		const k = header.length - 1;
		if (k < 1) throw new InputError('Cần ít nhất một cột dự án.');
		const names = header.slice(1).map((h, j) => (isBlank(h) ? `Dự án ${j + 1}` : String(h)));
		const data = rowsOf(rows);
		const own = Array(k).fill(null);
		const flowRows = [];
		data.forEach(({ r, i }) => {
			if (/l[aã]i|rate/i.test(String(r[0]))) { r.slice(1).forEach((v, j) => { if (!isBlank(v)) own[j] = toNum(v, i, 1 + j, `Lãi suất riêng của ${names[j]}`); }); return; }
			flowRows.push({ r, i });
		});
		if (flowRows.length < 2) throw new InputError('Cần ít nhất 2 kỳ dòng tiền.');
		if (flowRows.every(({ r }) => r.slice(1).every((v) => isBlank(v) || Number(v) === 0))) throw new InputError('Chưa nhập dòng tiền nào.', flowRows[0].i, 1);
		const flows = names.map((n, j) => flowRows.map(({ r, i }) => (isBlank(r[1 + j]) ? 0 : toNum(r[1 + j], i, 1 + j, `Dòng tiền ${n} kỳ ${r[0]}`))));
		return { names, own, flows, n: flowRows.length };
	},
	solve(inp, m, p) {
		const base = Number(p.rate), maxR = Number(p.maxRate), step = Number(p.step);
		if (!(step > 0) || !(maxR > 0) || maxR / step > 200) throw new InputError('Bước lãi suất phải dương và số điểm của đồ thị không quá 200.');
		const rates = Array.from({ length: Math.floor(maxR / step + 1e-9) + 1 }, (_, i) => Math.round(i * step * 1e9) / 1e9);
		const per = inp.flows.map((f, j) => { const r = inp.own[j] ?? base; return { r, npv: F.npvOf(r, f), irr: F.irrOf(f), pb: F.payback(f, 0), dpb: F.payback(f, r), pi: f[0] < 0 ? (F.npvOf(r, f) - f[0]) / -f[0] : null, prof: F.profile(f, rates) }; });
		return { per, rates, cross: inp.flows.length >= 2 ? F.crossover(inp.flows[0], inp.flows[1]) : null, base };
	},
	summary: (res, m, p) => res.per.map((x, j) => ({ label: `${res._names[j]}: NPV tại ${(x.r * 100).toFixed(2)}%`, value: x.npv, fmt: 'num', strong: j === 0 })).concat(res.per.map((x, j) => ({ label: `${res._names[j]}: IRR`, value: x.irr === null ? 'Không có' : x.irr, fmt: 'pct' }))),
	report(inp, res) {
		const k = inp.names.length, n = inp.n, pk = inp.names.map((_, j) => 'p' + j);
		const rateCell = (R, j) => R.cell('own', 0, pk[j]);
		return { title: 'So sánh dự án đầu tư – kết quả', subtitle: 'NPV = CF₀ + Σ CFₜ/(1+r)ᵗ. Dòng “lãi suất dùng” lấy lãi suất riêng nếu có, nếu không dùng lãi suất chung.',
			blocks: [{ type: 'kv', id: 'p', title: 'Lãi suất chung', items: [{ key: 'rate', label: 'Lãi suất chiết khấu chung', value: res.base, fmt: 'prob', role: 'input' }] },
				{ type: 'table', id: 'own', title: 'Lãi suất dùng cho từng dự án', columns: [{ key: 'l', label: '', fmt: 'text', role: 'label' }, ...inp.names.map((nm, j) => ({ key: pk[j], label: nm, fmt: 'prob', role: 'input' }))], rows: [{ cells: { l: 'Lãi suất riêng', ...Object.fromEntries(inp.own.map((v, j) => [pk[j], v ?? ''])) } }, { cells: { l: 'Lãi suất dùng', ...Object.fromEntries(res.per.map((x, j) => [pk[j], { f: (R) => `=IF(${R.cell('own', 0, pk[j])}="",${R.kv('p', 'rate')},${R.cell('own', 0, pk[j])})`, v: x.r }])) } }] },
				{ type: 'table', id: 'cf', title: 'Dòng tiền', columns: [{ key: 't', label: 'Kỳ', fmt: 'int', role: 'label' }, ...inp.names.map((nm, j) => ({ key: pk[j], label: nm, fmt: 'num', role: 'input' }))], rows: Array.from({ length: n }, (_, t) => ({ cells: { t, ...Object.fromEntries(inp.flows.map((f, j) => [pk[j], f[t]])) } })) },
				{ type: 'table', id: 'sum', title: 'Chỉ tiêu hiệu quả', columns: [{ key: 'n', label: 'Dự án', fmt: 'text', role: 'label' }, { key: 'npv', label: 'NPV', fmt: 'num' }, { key: 'irr', label: 'IRR', fmt: 'prob' }, { key: 'pi', label: 'Chỉ số sinh lời PI', fmt: 'num' }, { key: 'pb', label: 'Hoàn vốn (kỳ)', fmt: 'num' }, { key: 'dpb', label: 'Hoàn vốn có chiết khấu (kỳ)', fmt: 'num' }],
					rows: inp.names.map((nm, j) => ({ cells: { n: nm,
						npv: { f: (R) => `=${R.cell('cf', 0, pk[j])}+NPV(${R.cell('own', 1, pk[j])},${R.col('cf', pk[j], 1, n - 1)})`, v: res.per[j].npv },
						irr: res.per[j].irr === null ? 'Không có' : { f: (R) => `=IRR(${R.col('cf', pk[j])},0.1)`, v: res.per[j].irr },
						pi: res.per[j].pi === null ? '' : { f: (R) => `=(${R.cell('sum', j, 'npv')}-${R.cell('cf', 0, pk[j])})/-${R.cell('cf', 0, pk[j])}`, v: res.per[j].pi },
						pb: res.per[j].pb === null ? 'Chưa hoàn vốn' : res.per[j].pb, dpb: res.per[j].dpb === null ? 'Chưa hoàn vốn' : res.per[j].dpb } })) },
				{ type: 'table', id: 'prof', title: 'NPV theo lãi suất chiết khấu', columns: [{ key: 'r', label: 'Lãi suất', fmt: 'prob', role: 'input' }, ...inp.names.map((nm, j) => ({ key: pk[j], label: nm, fmt: 'num' }))],
					rows: res.rates.map((r, i) => ({ cells: { r, ...Object.fromEntries(inp.flows.map((f, j) => [pk[j], { f: (R) => `=${R.cell('cf', 0, pk[j])}+NPV(${R.cell('prof', i, 'r')},${R.col('cf', pk[j], 1, n - 1)})`, v: res.per[j].prof[i] }])) } })) },
				{ type: 'chart', kind: 'scatter', title: 'NPV theo lãi suất chiết khấu', xTitle: 'Lãi suất', yTitle: 'NPV', series: inp.names.map((nm, j) => ({ name: nm, table: 'prof', x: 'r', y: pk[j], lines: true })) },
				...(res.cross !== null ? [{ type: 'kv', id: 'x', title: 'Giao điểm Fisher', items: [{ key: 'c', label: `Lãi suất làm NPV hai dự án đầu bằng nhau`, value: res.cross, fmt: 'prob' }] }, { type: 'note', text: 'Dưới lãi suất giao điểm, dự án có NPV lớn hơn ở lãi suất thấp (thường là dự án dài hạn) tốt hơn; trên lãi suất giao điểm thì ngược lại.' }] : [])], _k: k };
	},
};

// ---------- Equipment choice ----------
const equip = {
	inputTable: (d, m, sample) => ({ title: 'Chọn thiết bị – dữ liệu', sheet: 'Chọn thiết bị', hint: 'Mỗi dòng là một phương án thiết bị. Để doanh thu bằng 0 nếu chỉ so sánh chi phí (bài 23). So sánh theo giá trị tương đương hằng năm khi tuổi thọ khác nhau (bài 22).',
		columns: [{ label: 'Phương án', fmt: 'text' }, { label: 'Giá mua', fmt: 'num' }, { label: 'Chi phí vận hành / năm', fmt: 'num' }, { label: 'Doanh thu / năm', fmt: 'num' }, { label: 'Tuổi thọ (năm)', fmt: 'num' }, { label: 'Giá trị thanh lý', fmt: 'num' }],
		rows: sample ? [['Hãng B', 150, 40, 70, 5, 30], ['Hãng C', 200, 45, 90, 10, 0]] : blank(d.rows, 6), firstInputCol: 1 }),
	parse({ rows }) {
		const data = rowsOf(rows);
		if (!data.length) throw new InputError('Chưa có phương án nào.');
		return { opts: data.map(({ r, i }) => { const g = (j, w) => toNum(isBlank(r[j]) ? 0 : r[j], i, j, `${w} dòng ${i + 1}`); const life = toNum(r[4], i, 4, `Tuổi thọ dòng ${i + 1}`); if (!(life >= 1)) throw new InputError('Tuổi thọ phải ≥ 1 năm.', i, 4); return { name: isBlank(r[0]) ? `Phương án ${i + 1}` : String(r[0]), price: g(1, 'Giá mua'), cost: g(2, 'Chi phí vận hành'), rev: g(3, 'Doanh thu'), life, salvage: g(5, 'Giá trị thanh lý') }; }) };
	},
	solve(inp, m, p) {
		const r = Number(p.rate); if (!(r > 0)) throw new InputError('Lãi suất phải lớn hơn 0.');
		const rows = inp.opts.map((o) => ({ ...o, ...F.equipment(o, r) }));
		return { rows, r, best: rows.reduce((b, x, i) => (x.eaa > rows[b].eaa ? i : b), 0) };
	},
	summary: (res) => [{ label: 'Phương án tốt nhất (EAA lớn nhất)', value: res.rows[res.best].name, strong: true }, ...res.rows.map((x) => ({ label: `${x.name}: NPV / EAA`, value: `${x.npv.toFixed(2)} / ${x.eaa.toFixed(2)}` }))],
	report(inp, res) {
		const N = res.rows.length;
		return { title: 'Chọn thiết bị – kết quả', subtitle: 'NPV = −giá mua + (doanh thu − chi phí) × hệ số niên kim + thanh lý/(1+r)ⁿ. EAA = NPV / hệ số niên kim: giá trị tương đương mỗi năm, dùng để so sánh phương án có tuổi thọ khác nhau.',
			blocks: [{ type: 'kv', id: 'p', title: 'Tham số', items: [{ key: 'r', label: 'Lãi suất nguồn vốn', value: res.r, fmt: 'prob', role: 'input' }] },
				{ type: 'table', id: 't', title: 'Các phương án', columns: [{ key: 'n', label: 'Phương án', fmt: 'text', role: 'label' }, { key: 'pr', label: 'Giá mua', fmt: 'num', role: 'input' }, { key: 'c', label: 'Chi phí / năm', fmt: 'num', role: 'input' }, { key: 'rv', label: 'Doanh thu / năm', fmt: 'num', role: 'input' }, { key: 'l', label: 'Tuổi thọ', fmt: 'num', role: 'input' }, { key: 's', label: 'Thanh lý', fmt: 'num', role: 'input' },
					{ key: 'af', label: 'Hệ số niên kim', fmt: 'prob' }, { key: 'npv', label: 'NPV', fmt: 'num' }, { key: 'eaa', label: 'EAA (giá trị tương đương / năm)', fmt: 'num' }],
					rows: res.rows.map((x, i) => ({ highlight: i === res.best, cells: { n: x.name, pr: x.price, c: x.cost, rv: x.rev, l: x.life, s: x.salvage,
						af: { f: (R) => `=(1-(1+${R.kv('p', 'r')})^-${R.cell('t', i, 'l')})/${R.kv('p', 'r')}`, v: x.af },
						npv: { f: (R) => `=-${R.cell('t', i, 'pr')}+(${R.cell('t', i, 'rv')}-${R.cell('t', i, 'c')})*${R.cell('t', i, 'af')}+${R.cell('t', i, 's')}/(1+${R.kv('p', 'r')})^${R.cell('t', i, 'l')}`, v: x.npv },
						eaa: { f: (R) => `=${R.cell('t', i, 'npv')}/${R.cell('t', i, 'af')}`, v: x.eaa } } })) },
				{ type: 'kv', id: 'b', title: 'Kết luận', items: [{ key: 'best', label: 'Phương án tốt nhất', value: { f: (R) => `=INDEX(${R.col('t', 'n', 0, N - 1)},MATCH(MAX(${R.col('t', 'eaa', 0, N - 1)}),${R.col('t', 'eaa', 0, N - 1)},0))`, v: res.rows[res.best].name }, role: 'label' }] },
				{ type: 'note', text: 'Chỉ có một phương án: NPV > 0 nghĩa là nên mua. Với phương án chỉ có chi phí (doanh thu = 0), EAA âm là chi phí tương đương mỗi năm; chọn phương án có EAA lớn hơn (chi phí nhỏ hơn).' }] };
	},
};

const leaseM = scalarModel({
	title: 'Mua hay thuê thiết bị – dữ liệu', sheet: 'Mua hay thuê', hint: 'Tìm tiền thuê hằng năm để hai phương án mua và thuê tốn kém như nhau (bài 24).',
	items: [{ key: 'price', label: 'Giá mua', default: 110000, positive: true, fmt: 'money' }, { key: 'annual', label: 'Chi phí hằng năm khi mua (bảo hiểm, bảo trì)', default: 3000, min: 0, fmt: 'money' }, { key: 'salvage', label: 'Giá bán lại cuối kỳ', default: 10000, min: 0, fmt: 'money' },
		{ key: 'r', label: 'Lãi suất nguồn vốn', default: 0.14, positive: true, fmt: 'prob' }, { key: 'n', label: 'Số năm sử dụng', default: 8, positive: true }],
	compute: (v) => F.lease(v),
	outputs: [{ key: 'pvCost', label: 'Giá trị hiện tại chi phí khi mua', fmt: 'money', f: (I) => `=${I('price')}+${I('annual')}*(1-(1+${I('r')})^-${I('n')})/${I('r')}-${I('salvage')}/(1+${I('r')})^${I('n')}` },
		{ key: 'rentEnd', label: 'Tiền thuê hoà vốn (trả cuối mỗi năm)', fmt: 'money', strong: true, f: (I, O) => `=${O('pvCost')}/((1-(1+${I('r')})^-${I('n')})/${I('r')})` },
		{ key: 'rentStart', label: 'Tiền thuê hoà vốn (trả đầu mỗi năm)', fmt: 'money', strong: true, f: (I, O) => `=${O('rentEnd')}/(1+${I('r')})` }],
});

// ---------- Project with depreciation and tax ----------
const taxM = scalarModel({
	title: 'Dự án có khấu hao và thuế – dữ liệu', sheet: 'Dự án thuế', hint: 'Dòng tiền sau thuế = lợi nhuận sau thuế + khấu hao + thanh lý + vốn lưu động thu hồi (bài 28). Chọn cách tính thuế trên thanh lý ở ô tham số trong pane.',
	items: [{ key: 'invest', label: 'Vốn đầu tư ban đầu', default: 1250000, positive: true, fmt: 'money' }, { key: 'life', label: 'Tuổi thọ dự án (năm)', default: 5, positive: true }, { key: 'salvage', label: 'Giá trị còn lại / thanh lý cuối kỳ', default: 250000, min: 0, fmt: 'money' },
		{ key: 'wc', label: 'Vốn lưu động thu hồi cuối kỳ', default: 100000, min: 0, fmt: 'money' }, { key: 'rev1', label: 'Doanh thu năm 1', default: 1000000, positive: true, fmt: 'money' }, { key: 'growth', label: 'Tốc độ tăng doanh thu mỗi năm', default: 0.1, min: 0, fmt: 'prob' },
		{ key: 'vcRatio', label: 'Biến phí / doanh thu', default: 0.5, min: 0, max: 1, fmt: 'prob' }, { key: 'fixed', label: 'Định phí hằng năm (chưa gồm khấu hao)', default: 150000, min: 0, fmt: 'money' }, { key: 'tax', label: 'Thuế suất thu nhập doanh nghiệp', default: 0.4, min: 0, max: 1, fmt: 'prob' },
		{ key: 'rate1', label: 'Lãi suất chiết khấu 1', default: 0.12, positive: true, fmt: 'prob' }, { key: 'rate2', label: 'Lãi suất chiết khấu 2 (tuỳ chọn, để nội suy IRR)', default: 0.24, optional: true, fmt: 'prob' }],
	validate: (v) => (!Number.isInteger(v.life) || v.life > 60 ? { message: 'Tuổi thọ phải là số nguyên từ 1 đến 60 năm.', row: 1 } : v.salvage > v.invest ? { message: 'Giá trị thanh lý không thể lớn hơn vốn đầu tư.', row: 2 } : null),
	compute: (v, p) => { const r = F.taxProject({ ...v, taxSalvage: p.salvageTax === 'all' }); return { ...r, npv1: r.npv1, npv2: r.npv2 ?? null, irr: r.irr, irrInterp: r.irrInterp ?? null, payback: r.payback }; },
	outputs: [{ key: 'dep', label: 'Khấu hao hằng năm', fmt: 'money' }, { key: 'npv1', label: 'NPV tại lãi suất 1', fmt: 'money', strong: true }, { key: 'npv2', label: 'NPV tại lãi suất 2', fmt: 'money', strong: true },
		{ key: 'irr', label: 'IRR (chính xác)', fmt: 'prob' }, { key: 'irrInterp', label: 'IRR nội suy tuyến tính giữa hai lãi suất (cách giải trong sách)', fmt: 'prob' }, { key: 'payback', label: 'Thời gian hoàn vốn (năm, chưa chiết khấu)' }],
	tables: (v, res, p) => {
		const N = v.life;
		const cols = [{ key: 't', label: 'Năm', fmt: 'int', role: 'label' }, { key: 'rev', label: 'Doanh thu', fmt: 'money' }, { key: 'vc', label: 'Biến phí', fmt: 'money' }, { key: 'fx', label: 'Định phí', fmt: 'money' }, { key: 'dep', label: 'Khấu hao', fmt: 'money' }, { key: 'ebit', label: 'Lợi nhuận trước thuế', fmt: 'money' }, { key: 'tax', label: 'Thuế', fmt: 'money' }, { key: 'sv', label: 'Thanh lý (sau thuế)', fmt: 'money' }, { key: 'wc', label: 'Vốn lưu động', fmt: 'money' }, { key: 'cf', label: 'Dòng tiền sau thuế', fmt: 'money' }];
		const ts = p.salvageTax === 'all';
		return [{ type: 'table', id: 'y', title: 'Dòng tiền theo năm', columns: cols, rows: res.rows.map((r, i) => ({ cells: { t: r.t,
			rev: i ? { f: (R) => `=${R.cell('y', i - 1, 'rev')}*(1+${R.kv('in', 'growth')})`, v: r.rev } : { f: (R) => `=${R.kv('in', 'rev1')}`, v: r.rev },
			vc: { f: (R) => `=${R.cell('y', i, 'rev')}*${R.kv('in', 'vcRatio')}`, v: r.vc }, fx: { f: (R) => `=${R.kv('in', 'fixed')}`, v: r.fixed }, dep: { f: (R) => `=(${R.kv('in', 'invest')}-${R.kv('in', 'salvage')})/${R.kv('in', 'life')}`, v: r.dep },
			ebit: { f: (R) => `=${R.cell('y', i, 'rev')}-${R.cell('y', i, 'vc')}-${R.cell('y', i, 'fx')}-${R.cell('y', i, 'dep')}`, v: r.ebit }, tax: { f: (R) => `=${R.cell('y', i, 'ebit')}*${R.kv('in', 'tax')}`, v: r.tax },
			sv: i === N - 1 ? { f: (R) => `=${R.kv('in', 'salvage')}${ts ? `*(1-${R.kv('in', 'tax')})` : ''}`, v: r.salvageCf } : 0, wc: i === N - 1 ? { f: (R) => `=${R.kv('in', 'wc')}`, v: r.wc } : 0,
			cf: { f: (R) => `=${R.cell('y', i, 'ebit')}-${R.cell('y', i, 'tax')}+${R.cell('y', i, 'dep')}+${R.cell('y', i, 'sv')}+${R.cell('y', i, 'wc')}`, v: r.cf } } })) },
		{ type: 'table', id: 'npv', title: 'NPV', columns: [{ key: 'l', label: '', fmt: 'text', role: 'label' }, { key: 'r', label: 'Lãi suất', fmt: 'prob', role: 'input' }, { key: 'n', label: 'NPV', fmt: 'money' }],
			rows: [[1, v.rate1, res.npv1], ...(v.rate2 !== null ? [[2, v.rate2, res.npv2]] : [])].map(([k, r, npv], i) => ({ cells: { l: `Lãi suất ${k}`, r, n: { f: (R) => `=-${R.kv('in', 'invest')}+NPV(${R.cell('npv', i, 'r')},${R.col('y', 'cf')})`, v: npv } } })) },
		{ type: 'note', text: ts ? 'Cách tính thuế: toàn bộ giá trị thanh lý chịu thuế (như file giải Excel của thầy).' : 'Cách tính thuế: thanh lý bằng giá trị sổ sách nên không phát sinh thuế (khớp đáp số trong đề).' }];
	},
});

const IMPL = { rates, fvpv, annuity, payment, rate, loan, projects, equip, lease: leaseM, tax: taxM };
export default {
	id: 'finance',
	name: 'Tài chính: giá trị thời gian của tiền',
	group: 'Tài chính',
	keywords: 'finance time value of money tvm interest annuity loan amortization schedule payback npv irr lease equivalent annual lai suat thuc danh nghia nien kim tra gop tra no lich hoan von mua thue thiet bi khau hao thue',
	models: [
		{ id: 'rates', name: 'Lãi suất thực, danh nghĩa và số tiền tương lai', group: G1, table: 'rates', params: [] },
		{ id: 'fvpv', name: 'Giá trị tương lai / hiện tại / lãi suất / số kỳ', group: G1, table: 'fvpv', params: [] },
		{ id: 'annuity', name: 'Giá trị của niên kim (PV, FV)', group: G1, table: 'annuity', params: [] },
		{ id: 'payment', name: 'Khoản trả đều / khoản trích lập quỹ', group: G2, table: 'payment', params: [] },
		{ id: 'loan', name: 'Lịch trả nợ (gốc, lãi từng kỳ)', group: G2, table: 'loan', params: [] },
		{ id: 'rate', name: 'Tìm lãi suất của khoản vay trả góp', group: G2, table: 'rate', params: [] },
		{ id: 'projects', name: 'So sánh dự án: NPV, IRR, hoàn vốn, đồ thị NPV', group: G3, table: 'projects', dims: [{ id: 'periods', label: 'Số kỳ (gồm kỳ 0)', default: 7, min: 2, max: 100 }, { id: 'projects', label: 'Số dự án', default: 2, min: 1, max: 8 }],
			params: [{ id: 'rate', label: 'Lãi suất chiết khấu chung', type: 'num', default: 0.1, step: 0.01, min: 0.0001 }, { id: 'maxRate', label: 'Lãi suất lớn nhất trên đồ thị NPV', type: 'num', default: 0.25, step: 0.05, min: 0.01 }, { id: 'step', label: 'Bước lãi suất trên đồ thị', type: 'num', default: 0.05, step: 0.01, min: 0.001 }] },
		{ id: 'equip', name: 'Chọn thiết bị (NPV và giá trị tương đương hằng năm)', group: G3, table: 'equip', dims: [{ id: 'rows', label: 'Số phương án', default: 2, min: 1, max: 20 }], params: [{ id: 'rate', label: 'Lãi suất nguồn vốn', type: 'num', default: 0.1, step: 0.01, min: 0.0001 }] },
		{ id: 'lease', name: 'Mua hay thuê (tiền thuê hoà vốn)', group: G3, table: 'lease', params: [] },
		{ id: 'tax', name: 'Dự án có khấu hao và thuế', group: G3, table: 'tax', params: [{ id: 'salvageTax', label: 'Thuế trên giá trị thanh lý', type: 'select', default: 'none', options: [['none', 'Không tính thuế (thanh lý = giá trị sổ sách) – khớp đáp số trong đề'], ['all', 'Tính thuế toàn bộ giá trị thanh lý – như file giải Excel']] }] },
	],
	inputTable: (d, m, s) => IMPL[m.id].inputTable(d, m, s),
	parse: (t, m, p) => IMPL[m.id].parse(t, m, p),
	solve(i, m, p) { const r = IMPL[m.id].solve(i, m, p); if (m.id === 'projects') r._names = i.names; return r; },
	summary: (r, m, p) => IMPL[m.id].summary(r, m, p),
	report: (i, r, m, p) => IMPL[m.id].report(i, r, m, p),
};
void blank;
