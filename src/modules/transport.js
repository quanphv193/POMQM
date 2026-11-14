import { balance, northwest, minCost, vogel, optimalTransport } from '../../lib/transport.js';
import { assign } from '../../lib/assign.js';
import { InputError } from '../core/errors.js';
import { toNum, isBlank } from './common.js';

const DEMAND = /c[aầ]u|demand/i;
const letters = (n, p) => Array.from({ length: n }, (_, i) => `${p}${i + 1}`);

const METHODS = { vogel: 'Vogel (VAM)', nw: 'Góc tây bắc', mc: 'Chi phí nhỏ nhất' };
const SENSE = { id: 'sense', label: 'Mục tiêu', type: 'select', default: 'min', options: [['min', 'Cực tiểu chi phí'], ['max', 'Cực đại lợi nhuận']] };

const transModel = {
	inputTable(d, m, sample) {
		const m0 = sample ? 3 : d.src, n0 = sample ? 3 : d.dst;
		const cols = [{ label: 'Nguồn \\ Đích', fmt: 'text' }, ...(sample ? ['Albuquerque', 'Boston', 'Cleveland'] : letters(n0, 'Đích ')).map((l) => ({ label: l, fmt: 'num' })), { label: 'Cung', fmt: 'num' }];
		const rows = sample
			? [['Des Moines', 5, 4, 3, 100], ['Evansville', 8, 4, 3, 300], ['Fort Lauderdale', 9, 7, 5, 300], ['Cầu', 300, 200, 200, '']]
			: [...letters(m0, 'Nguồn ').map((l) => [l, ...Array(n0).fill(''), '']), ['Cầu', ...Array(n0).fill(''), '']];
		return { title: 'Bài toán vận tải – dữ liệu', sheet: 'Vận tải', hint: 'Mỗi dòng là một nguồn: chi phí vận chuyển một đơn vị đến từng đích, rồi lượng cung. Dòng “Cầu” ghi lượng cầu của từng đích. Cung và cầu không cân bằng thì tự thêm nguồn/đích giả.', columns: cols, rows, firstInputCol: 1 };
	},
	parse({ header, rows }) {
		const n = header.length - 2;
		if (n < 1) throw new InputError('Bảng cần ít nhất 1 cột đích giữa cột tên và cột Cung.');
		const di = rows.findIndex((r) => DEMAND.test(String(r[0])));
		if (di < 0) throw new InputError('Thiếu dòng “Cầu” ở cuối bảng.');
		const dst = header.slice(1, 1 + n).map((h, j) => (isBlank(h) ? `Đích ${j + 1}` : String(h)));
		const demand = rows[di].slice(1, 1 + n).map((v, j) => toNum(v, di, 1 + j, `Cầu của ${dst[j]}`));
		const src = [], cost = [], supply = [];
		rows.forEach((r, i) => {
			if (i === di || r.every(isBlank)) return;
			src.push(isBlank(r[0]) ? `Nguồn ${src.length + 1}` : String(r[0]));
			cost.push(r.slice(1, 1 + n).map((v, j) => toNum(v, i, 1 + j, `Chi phí ${r[0] || i + 1} → ${dst[j]}`)));
			supply.push(toNum(r[1 + n], i, 1 + n, `Cung của ${r[0] || `dòng ${i + 1}`}`));
		});
		if (!src.length) throw new InputError('Cần ít nhất 1 nguồn.');
		if (supply.some((v) => v < 0) || demand.some((v) => v < 0)) throw new InputError('Cung và cầu không được âm.');
		return { src, dst, cost, supply, demand };
	},
	solve(inp, m, p) {
		const b = balance(inp.cost, inp.supply, inp.demand);
		const sense = p.sense || 'min';
		const cost = sense === 'max' ? b.cost.map((r) => r.map((v) => -v)) : b.cost;
		const init = { vogel, nw: northwest, mc: minCost }[p.method || 'vogel'](cost, b.supply, b.demand);
		const opt = optimalTransport(b.cost, b.supply, b.demand, sense);
		const names = { src: [...inp.src, ...(b.dummy === 'row' ? ['Nguồn giả'] : [])], dst: [...inp.dst, ...(b.dummy === 'col' ? ['Đích giả'] : [])] };
		const sumCost = (x) => x.reduce((a, r, i) => a + r.reduce((s, v, j) => s + v * b.cost[i][j], 0), 0);
		return { b, init: { x: init.x, cost: sumCost(init.x) }, opt: { x: opt.x, cost: opt.cost }, names, sense, method: p.method || 'vogel' };
	},
	summary: (res) => [{ label: 'Chi phí tối ưu', value: res.opt.cost, fmt: 'money', strong: true }, { label: `Chi phí phương án ban đầu (${METHODS[res.method]})`, value: res.init.cost, fmt: 'money' },
		...(res.b.dummy ? [{ label: 'Cung ≠ cầu', value: `Đã thêm ${res.b.dummy === 'row' ? 'nguồn' : 'đích'} giả` }] : [])],
	report(inp, res) {
		const { b, names } = res, m = b.cost.length, n = b.cost[0].length;
		const dk = names.dst.map((_, j) => 'd' + j);
		const mk = (id, title, mat, role, fmt = 'num') => ({ type: 'table', id, title, columns: [{ key: 'name', label: 'Nguồn \\ Đích', fmt: 'text', role: 'label' }, ...names.dst.map((nm, j) => ({ key: dk[j], label: nm, fmt, role }))],
			rows: names.src.map((s, i) => ({ cells: { name: s, ...Object.fromEntries(mat[i].map((v, j) => [dk[j], v])) } })) });
		const sp = (R, id) => Array.from({ length: m }, (_, i) => `SUMPRODUCT(${R.row('c', i, dk[0], dk[n - 1])},${R.row(id, i, dk[0], dk[n - 1])})`).join('+');
		const allocTable = (id, title, x, total) => {
			const t = mk(id, title, x, 'result');
			t.columns.push({ key: 'rs', label: 'Tổng hàng', fmt: 'num' });
			t.rows.forEach((r, i) => { r.cells.rs = { f: (R) => `=SUM(${R.row(id, i, dk[0], dk[n - 1])})`, v: x[i].reduce((a, v) => a + v, 0) }; });
			return [t, { type: 'kv', id: id + 'k', items: [{ key: 'tc', label: `Chi phí ${title.toLowerCase()}`, value: { f: (R) => `=${sp(R, id)}`, v: total }, fmt: 'money' }] }];
		};
		const cT = mk('c', 'Chi phí vận chuyển một đơn vị', b.cost, 'input');
		cT.columns.push({ key: 'sup', label: 'Cung', fmt: 'num', role: 'input' });
		cT.rows.forEach((r, i) => { r.cells.sup = b.supply[i]; });
		cT.rows.push({ cells: { name: 'Cầu', ...Object.fromEntries(b.demand.map((v, j) => [dk[j], v])), sup: '' } });
		return {
			title: 'Bài toán vận tải – kết quả', subtitle: `${res.b.dummy ? `Cung (${b.totalSupply}) khác cầu (${b.totalDemand}) nên đã thêm ${res.b.dummy === 'row' ? 'nguồn' : 'đích'} giả chi phí 0. ` : ''}Phương án ban đầu theo ${METHODS[res.method]}, sau đó tối ưu bằng quy hoạch tuyến tính.`,
			blocks: [cT, ...allocTable('init', `phương án ban đầu (${METHODS[res.method]})`, res.init.x, res.init.cost), ...allocTable('x', 'phương án tối ưu', res.opt.x, res.opt.cost),
				{ type: 'note', text: `Phương án ban đầu cao hơn tối ưu ${Math.abs(res.init.cost - res.opt.cost) < 1e-9 ? '0 (đã tối ưu)' : Math.abs(res.init.cost - res.opt.cost).toLocaleString('vi-VN')}.` }],
		};
	},
};

const assignModel = {
	inputTable(d, m, sample) {
		const n = sample ? 3 : d.size;
		const cols = [{ label: 'Người \\ Việc', fmt: 'text' }, ...(sample ? ['Dự án 1', 'Dự án 2', 'Dự án 3'] : letters(n, 'Việc ')).map((l) => ({ label: l, fmt: 'num' }))];
		const rows = sample ? [['Adams', 11, 14, 6], ['Brown', 8, 10, 11], ['Cooper', 9, 12, 7]] : letters(n, 'Người ').map((l) => [l, ...Array(n).fill('')]);
		return { title: 'Bài toán phân công – dữ liệu', sheet: 'Phân công', hint: 'Mỗi dòng là một người, mỗi cột là một công việc; ô là chi phí (hoặc lợi nhuận) khi giao việc đó cho người đó. Số người khác số việc thì tự thêm dòng/cột giả.', columns: cols, rows, firstInputCol: 1 };
	},
	parse({ header, rows }) {
		const data = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.some((v) => !isBlank(v)));
		if (!data.length) throw new InputError('Chưa có dữ liệu.');
		const jobs = header.slice(1).map((h, j) => (isBlank(h) ? `Việc ${j + 1}` : String(h)));
		return { workers: data.map(({ r, i }) => (isBlank(r[0]) ? `Người ${i + 1}` : String(r[0]))), jobs, cost: data.map(({ r, i }) => jobs.map((_, j) => toNum(r[1 + j], i, 1 + j, `Ô (${r[0] || i + 1}, ${jobs[j]})`))) };
	},
	solve(inp, m, p) { return { ...assign(inp.cost, p.sense || 'min'), sense: p.sense || 'min' }; },
	summary: (res) => [{ label: res.sense === 'max' ? 'Tổng lợi nhuận tối đa' : 'Tổng chi phí tối thiểu', value: res.cost, fmt: 'num', strong: true }, { label: 'Số cặp được giao', value: res.pairs.length, fmt: 'int' }],
	report(inp, res) {
		const m = inp.cost.length, n = inp.jobs.length;
		const jk = inp.jobs.map((_, j) => 'j' + j);
		const X = inp.cost.map((_, i) => inp.jobs.map((_, j) => (res.pairs.some((q) => q[0] === i && q[1] === j) ? 1 : 0)));
		return {
			title: 'Bài toán phân công – kết quả', subtitle: 'Giải bằng thuật toán Hungary. Ma trận 1/0 cho biết ai làm việc gì; tổng tính bằng SUMPRODUCT.',
			blocks: [
				{ type: 'table', id: 'c', title: res.sense === 'max' ? 'Ma trận lợi nhuận' : 'Ma trận chi phí', columns: [{ key: 'name', label: 'Người \\ Việc', fmt: 'text', role: 'label' }, ...inp.jobs.map((nm, j) => ({ key: jk[j], label: nm, fmt: 'num', role: 'input' }))],
					rows: inp.workers.map((w, i) => ({ cells: { name: w, ...Object.fromEntries(inp.cost[i].map((v, j) => [jk[j], v])) } })) },
				{ type: 'table', id: 'x', title: 'Phân công (1 = được giao)', columns: [{ key: 'name', label: 'Người \\ Việc', fmt: 'text', role: 'label' }, ...inp.jobs.map((nm, j) => ({ key: jk[j], label: nm, fmt: 'int' })), { key: 'job', label: 'Việc được giao', fmt: 'text' }],
					rows: inp.workers.map((w, i) => ({ highlight: X[i].some(Boolean), cells: { name: w, ...Object.fromEntries(X[i].map((v, j) => [jk[j], v])),
						job: res.pairs.find((q) => q[0] === i) ? inp.jobs[res.pairs.find((q) => q[0] === i)[1]] : 'Không được giao' } })) },
				{ type: 'kv', id: 'r', title: 'Kết quả', items: [{ key: 't', label: res.sense === 'max' ? 'Tổng lợi nhuận' : 'Tổng chi phí', value: { f: (R) => Array.from({ length: m }, (_, i) => `SUMPRODUCT(${R.row('c', i, jk[0], jk[n - 1])},${R.row('x', i, jk[0], jk[n - 1])})`).join('+').replace(/^/, '='), v: res.cost }, fmt: 'num' }] },
				...(m !== n ? [{ type: 'note', text: `Số người (${m}) khác số việc (${n}); ${m > n ? 'một số người không được giao việc' : 'một số việc không có người làm'}.` }] : []),
			],
		};
	},
};

const IMPL = { trans: transModel, assign: assignModel };
export const transModels = [
	{ id: 'trans', name: 'Vận tải (Vogel, góc tây bắc, chi phí nhỏ nhất)', table: 'trans', dims: [{ id: 'src', label: 'Số nguồn', default: 3, min: 1, max: 30 }, { id: 'dst', label: 'Số đích', default: 3, min: 1, max: 30 }],
		params: [{ id: 'method', label: 'Phương pháp lập phương án ban đầu', type: 'select', default: 'vogel', options: Object.entries(METHODS) }, SENSE] },
];
export default {
	id: 'transport',
	name: 'Vận tải',
	group: 'Tối ưu hoá',
	keywords: 'transportation vogel northwest corner minimum cost van tai nguon dich',
	models: transModels,
	inputTable: (d, m, s) => IMPL.trans.inputTable(d, m, s), parse: (t, m, p) => IMPL.trans.parse(t, m, p), solve: (i, m, p) => IMPL.trans.solve(i, m, p), summary: (r) => IMPL.trans.summary(r), report: (i, r, m, p) => IMPL.trans.report(i, r, m, p),
};
export const assignModule = {
	id: 'assign',
	name: 'Phân công',
	group: 'Tối ưu hoá',
	keywords: 'assignment hungarian phan cong nguoi viec',
	models: [{ id: 'assign', name: 'Phân công (thuật toán Hungary)', table: 'assign', dims: [{ id: 'size', label: 'Số người = số việc', default: 3, min: 2, max: 30 }], params: [{ ...SENSE, label: 'Giá trị trong bảng là' , options: [['min', 'Chi phí (cực tiểu)'], ['max', 'Lợi nhuận (cực đại)']] }] }],
	inputTable: (d, m, s) => IMPL.assign.inputTable(d, m, s), parse: (t, m, p) => IMPL.assign.parse(t, m, p), solve: (i, m, p) => IMPL.assign.solve(i, m, p), summary: (r) => IMPL.assign.summary(r), report: (i, r, m, p) => IMPL.assign.report(i, r, m, p),
};
