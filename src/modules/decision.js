import { decide } from '../../lib/decision.js';
import { MORE } from './decision-more.js';
import { InputError } from '../core/errors.js';
import { toNum, isBlank } from './common.js';

const PROB = /x[aá]c\s*su[aấ]t|prob/i;

const TABLE_BASE = {
	id: 'decision',
	name: 'Phân tích quyết định',
	group: 'Ra quyết định',
	keywords: 'decision table maximax maximin hurwicz laplace regret emv evpi quyet dinh',
	models: [{ id: 'table', name: 'Bảng quyết định', params: [
		{ id: 'sense', label: 'Giá trị trong bảng là', type: 'select', default: 'profit', options: [['profit', 'Lợi nhuận (càng lớn càng tốt)'], ['cost', 'Chi phí (càng nhỏ càng tốt)']] },
		{ id: 'alpha', label: 'Hệ số lạc quan Hurwicz α (0–1)', type: 'num', default: 0.5, min: 0, max: 1, step: 0.1 },
	] }],
	dims: [{ id: 'alts', label: 'Số phương án', default: 3, min: 1, max: 50 }, { id: 'states', label: 'Số trạng thái', default: 2, min: 1, max: 30 }],
	inputTable(dims, model, sample) {
		// Thompson Lumber (Render, Stair & Hanna)
		if (sample) return {
			title: 'Phân tích quyết định – dữ liệu', hint: 'Mỗi dòng là một phương án, mỗi cột là một trạng thái. Dòng “Xác suất” có thể để trống.',
			columns: [{ label: 'Phương án', fmt: 'text' }, { label: 'Thị trường tốt', fmt: 'money' }, { label: 'Thị trường xấu', fmt: 'money' }],
			rows: [['Nhà máy lớn', 200000, -180000], ['Nhà máy nhỏ', 100000, -20000], ['Không làm gì', 0, 0], ['Xác suất', 0.5, 0.5]], rowFormats: { 3: 'num' }, firstInputCol: 1,
		};
		return {
			title: 'Phân tích quyết định – dữ liệu', hint: 'Mỗi dòng là một phương án, mỗi cột là một trạng thái. Dòng “Xác suất” có thể để trống.',
			columns: [{ label: 'Phương án', fmt: 'text' }, ...Array.from({ length: dims.states }, (_, j) => ({ label: `Trạng thái ${j + 1}`, fmt: 'num' }))],
			rows: [...Array.from({ length: dims.alts }, (_, i) => [`Phương án ${i + 1}`, ...Array(dims.states).fill('')]), ['Xác suất', ...Array(dims.states).fill('')]], rowFormats: { [dims.alts]: 'num' }, firstInputCol: 1,
		};
	},
	parse({ header, rows }) {
		const n = header.length - 1;
		if (n < 1) throw new InputError('Bảng cần ít nhất 1 cột trạng thái.');
		const states = header.slice(1).map((h, j) => (isBlank(h) ? `Trạng thái ${j + 1}` : String(h)));
		let probs = null;
		const alts = [];
		rows.forEach((r, i) => {
			if (r.every(isBlank)) return;
			if (PROB.test(String(r[0]))) {
				const vals = r.slice(1);
				if (vals.every(isBlank)) return;
				probs = vals.map((v, j) => toNum(v, i, 1 + j, `Xác suất của ${states[j]}`));
				return;
			}
			alts.push({ name: isBlank(r[0]) ? `Phương án ${alts.length + 1}` : String(r[0]), row: r.slice(1).map((v, j) => toNum(v, i, 1 + j, `Giá trị của ${r[0] || 'phương án'} ở ${states[j]}`)) });
		});
		if (!alts.length) throw new InputError('Cần ít nhất 1 phương án.');
		if (probs) {
			const s = probs.reduce((a, b) => a + b, 0);
			if (Math.abs(s - 1) > 1e-6) throw new InputError(`Tổng xác suất phải bằng 1 (đang là ${+s.toFixed(6)}).`, rows.findIndex((r) => PROB.test(String(r[0]))), 1);
		}
		return { states, names: alts.map((a) => a.name), payoff: alts.map((a) => a.row), probs };
	},
	solve(input, model, p) {
		return decide({ payoff: input.payoff, probs: input.probs, alpha: p.alpha, sense: p.sense });
	},
	summary(res, model, p) {
		const names = res._names;
		const out = [];
		if (res.emv) out.push({ label: 'Chọn theo EMV', value: names[res.emv.best], strong: true }, { label: 'EMV', value: res.emv.values[res.emv.best], fmt: 'money' }, { label: 'EVPI', value: res.emv.evpi, fmt: 'money' });
		out.push({ label: res.criteria[1].name, value: names[res.criteria[1].best] }, { label: 'Minimax regret', value: names[res.criteria[4].best] });
		return out;
	},
	report(input, res, model, p) {
		const m = input.names.length, n = input.states.length;
		const cost = p.sense === 'cost';
		const BEST = cost ? 'MIN' : 'MAX', WORST = cost ? 'MAX' : 'MIN';
		const S = input.states.map((_, j) => 's' + j);
		const hasP = !!input.probs;
		const payRows = input.names.map((nm, i) => ({ cells: { name: nm, ...Object.fromEntries(input.payoff[i].map((v, j) => [S[j], v])) } }));
		const bestRowIdx = m + (hasP ? 1 : 0);
		if (hasP) payRows.push({ cells: { name: 'Xác suất', ...Object.fromEntries(input.probs.map((v, j) => [S[j], v])) } });
		payRows.push({ role: 'result', cells: { name: cost ? 'Nhỏ nhất theo trạng thái' : 'Lớn nhất theo trạng thái', ...Object.fromEntries(S.map((s) => [s, { f: (R) => `=${BEST}(${R.col('pay', s, 0, m - 1)})` }])) } });
		const row = (R, i) => R.row('pay', i, S[0], S[n - 1]);
		const crit = [
			{ key: 'mx', label: cost ? 'Minimin' : 'Maximax', f: (R, i) => `=${BEST}(${row(R, i)})`, pick: BEST },
			{ key: 'mn', label: cost ? 'Minimax' : 'Maximin', f: (R, i) => `=${WORST}(${row(R, i)})`, pick: BEST },
			{ key: 'hw', label: 'Hurwicz', f: (R, i) => `=${R.kv('p', 'alpha')}*${BEST}(${row(R, i)})+(1-${R.kv('p', 'alpha')})*${WORST}(${row(R, i)})`, pick: BEST },
			{ key: 'lp', label: 'Laplace', f: (R, i) => `=AVERAGE(${row(R, i)})`, pick: BEST },
			{ key: 'rg', label: 'Tiếc nuối lớn nhất', f: (R, i) => `=MAX(${R.row('reg', i, S[0], S[n - 1])})`, pick: 'MIN' },
		];
		if (hasP) crit.push({ key: 'emv', label: cost ? 'EV (chi phí kỳ vọng)' : 'EMV', f: (R, i) => `=SUMPRODUCT(${row(R, i)},${R.row('pay', m, S[0], S[n - 1])})`, pick: BEST });
		const critRows = input.names.map((nm, i) => ({ cells: { name: nm, ...Object.fromEntries(crit.map((c) => [c.key, { f: (R) => c.f(R, i) }])) } }));
		critRows.push({ highlight: true, cells: { name: 'Phương án chọn', ...Object.fromEntries(crit.map((c) => [c.key, { f: (R) => `=INDEX(${R.col('crit', 'name', 0, m - 1)},MATCH(${c.pick}(${R.col('crit', c.key, 0, m - 1)}),${R.col('crit', c.key, 0, m - 1)},0))` }])) } });
		const blocks = [
			{ type: 'kv', id: 'p', title: 'Tham số', items: [
				{ key: 'sense', label: 'Loại giá trị', value: cost ? 'Chi phí' : 'Lợi nhuận', role: 'label' },
				{ key: 'alpha', label: 'Hurwicz α (sửa để tính lại)', value: p.alpha, fmt: 'num', role: 'input' },
			] },
			{ type: 'table', id: 'pay', title: 'Bảng giá trị', columns: [{ key: 'name', label: 'Phương án', fmt: 'text', role: 'label' }, ...input.states.map((s, j) => ({ key: S[j], label: s, fmt: 'num', role: 'input' }))], rows: payRows },
			{ type: 'table', id: 'crit', title: 'Theo từng tiêu chí', columns: [{ key: 'name', label: 'Phương án', fmt: 'text', role: 'label' }, ...crit.map((c) => ({ key: c.key, label: c.label, fmt: 'num' }))], rows: critRows },
			{ type: 'table', id: 'reg', title: 'Bảng tiếc nuối (opportunity loss)', columns: [{ key: 'name', label: 'Phương án', fmt: 'text', role: 'label' }, ...input.states.map((s, j) => ({ key: S[j], label: s, fmt: 'num' }))],
				rows: input.names.map((nm, i) => ({ cells: { name: nm, ...Object.fromEntries(S.map((s) => [s, { f: (R) => cost ? `=${R.cell('pay', i, s)}-${R.cell('pay', bestRowIdx, s)}` : `=${R.cell('pay', bestRowIdx, s)}-${R.cell('pay', i, s)}` }])) } })) },
		];
		if (hasP) blocks.push({ type: 'kv', id: 'ev', title: 'Giá trị của thông tin', items: [
			{ key: 'evwpi', label: 'EV với thông tin hoàn hảo', value: { f: (R) => `=SUMPRODUCT(${R.row('pay', bestRowIdx, S[0], S[n - 1])},${R.row('pay', m, S[0], S[n - 1])})`, v: res.emv.evwpi }, fmt: 'num' },
			{ key: 'best', label: cost ? 'EV tốt nhất (nhỏ nhất)' : 'EMV tốt nhất', value: { f: (R) => `=${BEST}(${R.col('crit', 'emv', 0, m - 1)})`, v: res.emv.values[res.emv.best] }, fmt: 'num' },
			{ key: 'evpi', label: 'EVPI', value: { f: (R) => `=ABS(${R.kv('ev', 'evwpi')}-${R.kv('ev', 'best')})`, v: res.emv.evpi }, fmt: 'num' },
		] });
		else blocks.push({ type: 'note', text: 'Thêm dòng “Xác suất” vào bảng nhập để có EMV và EVPI.' });
		return { title: 'Phân tích quyết định – kết quả', subtitle: 'Mọi tiêu chí là công thức Excel; sửa ô vàng để tính lại.', blocks };
	},
};

export default {
	id: 'decision',
	name: 'Phân tích quyết định',
	group: 'Ra quyết định',
	keywords: TABLE_BASE.keywords + ' decision tree cay quyet dinh single period newsvendor ton kho mot ky',
	models: [
		{ ...TABLE_BASE.models[0], kind: 'table', table: 'main', dims: TABLE_BASE.dims },
		...MORE.models,
	],
	inputTable(d, m, sample) { return m.kind === 'table' ? TABLE_BASE.inputTable(d, m, sample) : MORE[m.kind].inputTable(d, m, sample); },
	parse(t, m, p) { return m.kind === 'table' ? TABLE_BASE.parse(t, m, p) : MORE[m.kind].parse(t, m, p); },
	solve(i, m, p) { const r = m.kind === 'table' ? TABLE_BASE.solve(i, m, p) : MORE[m.kind].solve(i, m, p); if (m.kind === 'bayes' || m.kind === 'freq') { r._names = i.names; r._inds = i.inds; } return r; },
	preview(i, r, m, p) { return m.kind === 'tree' && MORE.tree.preview ? MORE.tree.preview(i, r, m, p) : null; },
	summary(r, m, p) { return m.kind === 'table' ? TABLE_BASE.summary(r, m, p) : MORE[m.kind].summary(r, m, p); },
	report(i, r, m, p) { return m.kind === 'table' ? TABLE_BASE.report(i, r, m, p) : MORE[m.kind].report(i, r, m, p); },
};
