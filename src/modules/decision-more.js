import { rollback, singlePeriod } from '../../lib/dtree.js';
import { treeLayout } from '../../lib/treelayout.js';
import { treeSvg } from '../core/treesvg.js';
import { InputError } from '../core/errors.js';
import { toNum, isBlank } from './common.js';

const SENSE = { id: 'sense', label: 'Giá trị là', type: 'select', default: 'profit', options: [['profit', 'Lợi nhuận (càng lớn càng tốt)'], ['cost', 'Chi phí (càng nhỏ càng tốt)']] };
const TYPE_VI = { decision: 'Quyết định', chance: 'Ngẫu nhiên', end: 'Kết thúc' };

// Thompson Lumber with a market survey (Render, Stair & Hanna); payoffs already net of the $10,000 survey.
const THOMPSON = [
	[1, 2, 'Khảo sát thị trường', '', 0], [1, 3, 'Không khảo sát', '', 0],
	[2, 4, 'Khảo sát: thuận lợi', 0.45, 0], [2, 5, 'Khảo sát: bất lợi', 0.55, 0],
	[4, 6, 'Nhà máy lớn', '', 0], [4, 7, 'Nhà máy nhỏ', '', 0], [4, 8, 'Không làm gì', '', -10000],
	[6, 9, 'Thị trường tốt', 0.78, 190000], [6, 10, 'Thị trường xấu', 0.22, -190000],
	[7, 11, 'Thị trường tốt', 0.78, 90000], [7, 12, 'Thị trường xấu', 0.22, -30000],
	[5, 13, 'Nhà máy lớn', '', 0], [5, 14, 'Nhà máy nhỏ', '', 0], [5, 15, 'Không làm gì', '', -10000],
	[13, 16, 'Thị trường tốt', 0.27, 190000], [13, 17, 'Thị trường xấu', 0.73, -190000],
	[14, 18, 'Thị trường tốt', 0.27, 90000], [14, 19, 'Thị trường xấu', 0.73, -30000],
	[3, 20, 'Nhà máy lớn', '', 0], [3, 21, 'Nhà máy nhỏ', '', 0], [3, 22, 'Không làm gì', '', 0],
	[20, 23, 'Thị trường tốt', 0.5, 200000], [20, 24, 'Thị trường xấu', 0.5, -180000],
	[21, 25, 'Thị trường tốt', 0.5, 100000], [21, 26, 'Thị trường xấu', 0.5, -20000],
];

export const MORE = {
	models: [
		{ id: 'bayes', kind: 'bayes', table: 'bayes', name: 'Xác suất hậu nghiệm Bayes (khi mua thông tin)', hint: 'Cho xác suất tiên nghiệm của các trạng thái và khả năng chỉ báo (khảo sát, dự báo) đúng/sai; tính xác suất của từng chỉ báo và xác suất hậu nghiệm để dùng trên cây quyết định.', dims: [{ id: 'states', label: 'Số trạng thái', default: 2, min: 2, max: 10 }, { id: 'inds', label: 'Số chỉ báo', default: 2, min: 2, max: 10 }], params: [] },
		{ id: 'freq', kind: 'freq', table: 'freq', name: 'Xác suất từ bảng tần suất (đếm)', hint: 'Bảng đếm số trường hợp: hàng là trạng thái thực tế, cột là chỉ báo. Tính xác suất đồng thời, biên và có điều kiện.', dims: [{ id: 'states', label: 'Số trạng thái', default: 2, min: 2, max: 10 }, { id: 'inds', label: 'Số chỉ báo', default: 2, min: 2, max: 10 }], params: [] },
		{ id: 'tree', kind: 'tree', table: 'tree', name: 'Cây quyết định (nhập dạng bảng nhánh)', params: [SENSE],
			hint: 'Mỗi dòng là một nhánh: từ nút → đến nút. Nhánh từ nút ngẫu nhiên có xác suất; nhánh từ nút quyết định để trống xác suất. Giá trị ghi trên nhánh (thường ở nhánh cuối).',
			dims: [{ id: 'rows', label: 'Số nhánh', default: 8, min: 1, max: 500 }] },
		{ id: 'single', kind: 'single', table: 'single', name: 'Tồn kho một kỳ (bảng quyết định theo nhu cầu)',
			hint: 'Mỗi mức nhu cầu cũng là một phương án đặt hàng. Lợi nhuận = giá bán × số bán − chi phí × số đặt + thanh lý × dư − phạt × thiếu.',
			dims: [{ id: 'rows', label: 'Số mức nhu cầu', default: 5, min: 2, max: 100 }],
			params: [
				{ id: 'price', label: 'Giá bán mỗi đơn vị', type: 'num', default: 10 },
				{ id: 'cost', label: 'Chi phí mỗi đơn vị', type: 'num', default: 6 },
				{ id: 'salvage', label: 'Giá thanh lý hàng dư', type: 'num', default: 2 },
				{ id: 'shortage', label: 'Chi phí thiếu hàng (mỗi đơn vị)', type: 'num', default: 0 },
			] },
	],

	bayes: {
		inputTable(d, m, sample) {
			const S = sample ? 2 : d.states, K = sample ? 2 : d.inds;
			const cols = [{ label: 'Trạng thái', fmt: 'text' }, { label: 'Xác suất tiên nghiệm', fmt: 'num' }, ...(sample ? ['Chỉ báo thuận lợi', 'Chỉ báo bất lợi'] : Array.from({ length: K }, (_, j) => `Chỉ báo ${j + 1}`)).map((l) => ({ label: l, fmt: 'num' }))];
			return { title: 'Xác suất hậu nghiệm Bayes – dữ liệu', sheet: 'Bayes', hint: 'Cột 2: xác suất tiên nghiệm P(trạng thái). Các cột sau: P(chỉ báo | trạng thái); mỗi hàng cộng các chỉ báo bằng 1.', columns: cols,
				rows: sample ? [['Thị trường tốt', 0.5, 0.7, 0.3], ['Thị trường xấu', 0.5, 0.2, 0.8]] : Array.from({ length: S }, (_, i) => [`Trạng thái ${i + 1}`, ...Array(K + 1).fill('')]), firstInputCol: 1 };
		},
		parse({ header, rows }) {
			const K = header.length - 2, data = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.some((v) => !isBlank(v)));
			if (K < 2 || data.length < 2) throw new InputError('Cần ít nhất 2 trạng thái và 2 chỉ báo.');
			const names = data.map(({ r, i }) => (isBlank(r[0]) ? `Trạng thái ${i + 1}` : String(r[0]))), inds = header.slice(2).map((h, j) => (isBlank(h) ? `Chỉ báo ${j + 1}` : String(h)));
			const prior = data.map(({ r, i }) => toNum(r[1], i, 1, `Tiên nghiệm của ${names[0]}`)), lik = data.map(({ r, i }) => inds.map((_, j) => toNum(r[2 + j], i, 2 + j, `P(${inds[j]} | ${r[0] || i + 1})`)));
			const sp = prior.reduce((a, b) => a + b, 0);
			if (Math.abs(sp - 1) > 1e-6) throw new InputError(`Tổng xác suất tiên nghiệm phải bằng 1 (đang là ${+sp.toFixed(6)}).`, data[0].i, 1);
			lik.forEach((row, k) => { const t = row.reduce((a, b) => a + b, 0); if (Math.abs(t - 1) > 1e-6) throw new InputError(`Các xác suất có điều kiện của “${names[k]}” phải cộng bằng 1 (đang là ${+t.toFixed(6)}).`, data[k].i, 2); });
			return { names, inds, prior, lik };
		},
		solve(inp) {
			const joint = inp.prior.map((p0, s2) => inp.lik[s2].map((l) => p0 * l)), marg = inp.inds.map((_, j) => joint.reduce((a, row) => a + row[j], 0));
			if (marg.some((v) => v <= 0)) throw new InputError('Có chỉ báo với xác suất bằng 0 nên không tính được xác suất hậu nghiệm.');
			return { joint, marg, post: joint.map((row) => row.map((v, j) => v / marg[j])) };
		},
		summary: (res, m, p) => res.marg.map((v, j) => ({ label: `P(${res._inds[j]})`, value: v, fmt: 'prob', strong: j === 0 })).concat(res.post[0].map((v, j) => ({ label: `P(${res._names[0]} | ${res._inds[j]})`, value: v, fmt: 'prob' }))),
		report(inp, res) {
			const S = inp.names.length, K = inp.inds.length, ik = inp.inds.map((_, j) => 'i' + j);
			return { title: 'Xác suất hậu nghiệm Bayes – kết quả', subtitle: 'P(trạng thái, chỉ báo) = tiên nghiệm × P(chỉ báo | trạng thái); P(chỉ báo) = tổng theo trạng thái; hậu nghiệm = đồng thời / P(chỉ báo). Dùng P(chỉ báo) và hậu nghiệm làm xác suất trên các nhánh của cây quyết định.',
				blocks: [{ type: 'table', id: 'inp', title: 'Dữ liệu', columns: [{ key: 'n', label: 'Trạng thái', fmt: 'text', role: 'label' }, { key: 'pr', label: 'Tiên nghiệm', fmt: 'prob', role: 'input' }, ...inp.inds.map((nm, j) => ({ key: ik[j], label: `P(${nm} | …)`, fmt: 'prob', role: 'input' }))], rows: inp.names.map((nm, i) => ({ cells: { n: nm, pr: inp.prior[i], ...Object.fromEntries(inp.lik[i].map((v, j) => [ik[j], v])) } })) },
					{ type: 'table', id: 'jt', title: 'Xác suất đồng thời', columns: [{ key: 'n', label: 'Trạng thái', fmt: 'text', role: 'label' }, ...inp.inds.map((nm, j) => ({ key: ik[j], label: nm, fmt: 'prob' })), { key: 'ps', label: 'P(trạng thái)', fmt: 'prob' }],
						rows: [...inp.names.map((nm, i) => ({ cells: { n: nm, ...Object.fromEntries(res.joint[i].map((v, j) => [ik[j], { f: (R) => `=${R.cell('inp', i, 'pr')}*${R.cell('inp', i, ik[j])}`, v }])), ps: { f: (R) => `=SUM(${R.row('jt', i, ik[0], ik[K - 1])})`, v: inp.prior[i] } } })),
							{ highlight: true, cells: { n: 'P(chỉ báo)', ...Object.fromEntries(res.marg.map((v, j) => [ik[j], { f: (R) => `=SUM(${R.col('jt', ik[j], 0, S - 1)})`, v }])), ps: { f: (R) => `=SUM(${R.col('jt', 'ps', 0, S - 1)})`, v: 1 } } }] },
					{ type: 'table', id: 'po', title: 'Xác suất hậu nghiệm P(trạng thái | chỉ báo)', columns: [{ key: 'n', label: 'Trạng thái', fmt: 'text', role: 'label' }, ...inp.inds.map((nm, j) => ({ key: ik[j], label: `Khi ${nm}`, fmt: 'prob' }))],
						rows: inp.names.map((nm, i) => ({ cells: { n: nm, ...Object.fromEntries(res.post[i].map((v, j) => [ik[j], { f: (R) => `=${R.cell('jt', i, ik[j])}/${R.cell('jt', S, ik[j])}`, v }])) } })) }] };
		},
	},

	freq: {
		inputTable(d, m, sample) {
			const S = sample ? 2 : d.states, K = sample ? 2 : d.inds;
			return { title: 'Xác suất từ bảng tần suất – dữ liệu', sheet: 'Tần suất', hint: 'Số lần quan sát: hàng là trạng thái thực tế, cột là chỉ báo (ví dụ kết quả điều tra).',
				columns: [{ label: 'Trạng thái', fmt: 'text' }, ...(sample ? ['Điều tra thuận lợi', 'Điều tra bất lợi'] : Array.from({ length: K }, (_, j) => `Chỉ báo ${j + 1}`)).map((l) => ({ label: l, fmt: 'num' }))],
				rows: sample ? [['Thị trường thuận lợi', 145, 5], ['Thị trường không thuận lợi', 3, 47]] : Array.from({ length: S }, (_, i) => [`Trạng thái ${i + 1}`, ...Array(K).fill('')]), firstInputCol: 1 };
		},
		parse({ header, rows }) {
			const data = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.some((v) => !isBlank(v))), K = header.length - 1;
			if (K < 2 || data.length < 2) throw new InputError('Cần ít nhất 2 trạng thái và 2 chỉ báo.');
			const inds = header.slice(1).map((h, j) => (isBlank(h) ? `Chỉ báo ${j + 1}` : String(h)));
			const c = data.map(({ r, i }) => inds.map((_, j) => { const v = toNum(isBlank(r[1 + j]) ? 0 : r[1 + j], i, 1 + j, `Số đếm (${r[0] || i + 1}, ${inds[j]})`); if (v < 0) throw new InputError('Số đếm không được âm.', i, 1 + j); return v; }));
			if (c.flat().reduce((a, b) => a + b, 0) <= 0) throw new InputError('Bảng đếm toàn số 0.');
			return { names: data.map(({ r, i }) => (isBlank(r[0]) ? `Trạng thái ${i + 1}` : String(r[0]))), inds, c };
		},
		solve(inp) {
			const tot = inp.c.flat().reduce((a, b) => a + b, 0), rows = inp.c.map((r) => r.reduce((a, b) => a + b, 0)), cols = inp.inds.map((_, j) => inp.c.reduce((a, r) => a + r[j], 0));
			return { tot, rows, cols, pRow: rows.map((v) => v / tot), pCol: cols.map((v) => v / tot) };
		},
		summary: (res) => res.pRow.map((v, i) => ({ label: `P(${res._names[i]})`, value: v, fmt: 'prob', strong: i === 0 })).concat(res.pCol.map((v, j) => ({ label: `P(${res._inds[j]})`, value: v, fmt: 'prob' }))),
		report(inp, res) {
			const S = inp.names.length, K = inp.inds.length, ik = inp.inds.map((_, j) => 'i' + j);
			const tbl = (id, title, fn, fmt = 'prob') => ({ type: 'table', id, title, columns: [{ key: 'n', label: 'Trạng thái', fmt: 'text', role: 'label' }, ...inp.inds.map((nm, j) => ({ key: ik[j], label: nm, fmt })), { key: 'rs', label: 'Cộng hàng', fmt }], rows: inp.names.map((nm, i) => fn(nm, i)) });
			return { title: 'Xác suất từ bảng tần suất – kết quả', subtitle: 'Xác suất đồng thời = số đếm / tổng; P(chỉ báo | trạng thái) = số đếm / cộng hàng; P(trạng thái | chỉ báo) = số đếm / cộng cột.',
				blocks: [{ type: 'table', id: 'c', title: 'Bảng đếm', columns: [{ key: 'n', label: 'Trạng thái', fmt: 'text', role: 'label' }, ...inp.inds.map((nm, j) => ({ key: ik[j], label: nm, fmt: 'int', role: 'input' })), { key: 'rs', label: 'Cộng hàng', fmt: 'int' }],
					rows: [...inp.names.map((nm, i) => ({ cells: { n: nm, ...Object.fromEntries(inp.c[i].map((v, j) => [ik[j], v])), rs: { f: (R) => `=SUM(${R.row('c', i, ik[0], ik[K - 1])})`, v: res.rows[i] } } })), { highlight: true, cells: { n: 'Cộng cột', ...Object.fromEntries(res.cols.map((v, j) => [ik[j], { f: (R) => `=SUM(${R.col('c', ik[j], 0, S - 1)})`, v }])), rs: { f: (R) => `=SUM(${R.col('c', 'rs', 0, S - 1)})`, v: res.tot } } }] },
					tbl('jp', 'Xác suất đồng thời P(trạng thái, chỉ báo)', (nm, i) => ({ cells: { n: nm, ...Object.fromEntries(inp.c[i].map((v, j) => [ik[j], { f: (R) => `=${R.cell('c', i, ik[j])}/${R.cell('c', S, 'rs')}`, v: v / res.tot }])), rs: { f: (R) => `=${R.cell('c', i, 'rs')}/${R.cell('c', S, 'rs')}`, v: res.pRow[i] } } })),
					tbl('ci', 'Xác suất có điều kiện P(chỉ báo | trạng thái)', (nm, i) => ({ cells: { n: nm, ...Object.fromEntries(inp.c[i].map((v, j) => [ik[j], { f: (R) => `=${R.cell('c', i, ik[j])}/${R.cell('c', i, 'rs')}`, v: v / res.rows[i] }])), rs: { f: (R) => `=SUM(${R.row('ci', i, ik[0], ik[K - 1])})`, v: 1 } } })),
					tbl('cs', 'Xác suất hậu nghiệm P(trạng thái | chỉ báo)', (nm, i) => ({ cells: { n: nm, ...Object.fromEntries(inp.c[i].map((v, j) => [ik[j], { f: (R) => `=${R.cell('c', i, ik[j])}/${R.cell('c', S, ik[j])}`, v: v / res.cols[j] }])), rs: '' } })),
					{ type: 'table', id: 'mg', title: 'Xác suất biên', columns: [{ key: 'n', label: '', fmt: 'text', role: 'label' }, { key: 'p', label: 'Xác suất', fmt: 'prob' }],
						rows: [...inp.names.map((nm, i) => ({ cells: { n: `P(${nm})`, p: { f: (R) => `=${R.cell('c', i, 'rs')}/${R.cell('c', S, 'rs')}`, v: res.pRow[i] } } })), ...inp.inds.map((nm, j) => ({ cells: { n: `P(${nm})`, p: { f: (R) => `=${R.cell('c', S, ik[j])}/${R.cell('c', S, 'rs')}`, v: res.pCol[j] } } }))] }] };
		},
	},

	tree: {
		preview: (inp, res) => treeSvg(treeLayout(res, inp.branches)),
		inputTable: (d, m, sample) => ({
			title: 'Cây quyết định – các nhánh', sheet: 'Cây quyết định',
			hint: 'Nút gốc là nút không có nhánh nào đi vào. Nhánh ra khỏi một nút ngẫu nhiên phải có tổng xác suất bằng 1.',
			columns: [{ label: 'Từ nút', fmt: 'text' }, { label: 'Đến nút', fmt: 'text' }, { label: 'Tên nhánh', fmt: 'text' }, { label: 'Xác suất', fmt: 'num' }, { label: 'Giá trị trên nhánh', fmt: 'money' }],
			rows: sample ? THOMPSON : Array.from({ length: d.rows }, () => ['', '', '', '', '']), firstInputCol: 0,
		}),
		parse({ rows }) {
			const branches = [];
			rows.forEach((r, i) => {
				if (r.every(isBlank)) return;
				if (isBlank(r[0]) || isBlank(r[1])) throw new InputError('Nhánh thiếu nút đầu hoặc nút cuối.', i, isBlank(r[0]) ? 0 : 1);
				branches.push({ from: String(r[0]).trim(), to: String(r[1]).trim(), name: isBlank(r[2]) ? `${r[0]}→${r[1]}` : String(r[2]),
					prob: isBlank(r[3]) ? null : toNum(r[3], i, 3, `Xác suất nhánh ${r[0]}→${r[1]}`), value: isBlank(r[4]) ? 0 : toNum(r[4], i, 4, `Giá trị nhánh ${r[0]}→${r[1]}`), row: i });
			});
			if (!branches.length) throw new InputError('Chưa có nhánh nào.');
			return { branches };
		},
		solve(inp, m, p) {
			try { return rollback(inp.branches, p.sense); } catch (e) { throw new InputError(e.message); }
		},
		summary(res) {
			const first = res.best.get(res.root);
			return [{ label: 'Giá trị kỳ vọng tại gốc', value: res.value, fmt: 'money', strong: true }, ...(first ? [{ label: 'Quyết định đầu tiên', value: first.name }] : []),
				{ label: 'Số nút', value: res.order.length, fmt: 'int' }];
		},
		report(inp, res, m, p) {
			const cost = p.sense === 'cost';
			// branches grouped by their from-node, in tree order, so each node's branches are contiguous
			const sorted = res.order.flatMap((n) => res.out.get(n) || []);
			const firstRow = new Map(), lastRow = new Map();
			sorted.forEach((b, i) => { if (!firstRow.has(b.from)) firstRow.set(b.from, i); lastRow.set(b.from, i); });
			const nodeIdx = new Map(res.order.map((n, i) => [n, i]));
			const nodeRows = res.order.map((n) => {
				const t = res.type.get(n);
				const f = firstRow.get(n), l = lastRow.get(n);
				const ev = t === 'end' ? { f: '=0', v: 0 }
					: t === 'chance' ? { f: (R) => `=SUMPRODUCT(${R.col('br', 'p', f, l)},${R.col('br', 'total', f, l)})`, v: res.ev.get(n) }
					: { f: (R) => `=${cost ? 'MIN' : 'MAX'}(${R.col('br', 'total', f, l)})`, v: res.ev.get(n) };
				const bestName = t === 'decision' ? { f: (R) => `=INDEX(${R.col('br', 'name', f, l)},MATCH(${R.cell('nodes', nodeIdx.get(n), 'ev')},${R.col('br', 'total', f, l)},0))`, v: res.best.get(n).name } : '';
				return { highlight: n === res.root, cells: { node: n, type: TYPE_VI[t], depth: res.depth.get(n), ev, best: bestName } };
			});
			const brRows = sorted.map((b) => ({ highlight: res.onPath.has(b) && res.type.get(b.from) === 'decision', cells: {
				outline: '    '.repeat(res.depth.get(b.from)) + (res.type.get(b.from) === 'decision' ? '▸ ' : '○ ') + b.name,
				from: b.from, to: b.to, name: b.name, p: b.prob ?? '', value: b.value,
				total: { f: (R) => `=${R.cell('br', sorted.indexOf(b), 'value')}+${R.cell('nodes', nodeIdx.get(b.to), 'ev')}`, v: b.value + res.ev.get(b.to) },
			} }));
			return {
				title: 'Cây quyết định – kết quả', subtitle: `Quy hồi từ cuối cây về gốc: nút ngẫu nhiên lấy kỳ vọng, nút quyết định lấy ${cost ? 'giá trị nhỏ nhất' : 'giá trị lớn nhất'}. Nhánh tô vàng là quyết định tốt nhất.`,
				blocks: [
					{ type: 'kv', id: 'top', items: [{ key: 'v', label: 'Giá trị kỳ vọng tại gốc', value: { f: (R) => `=${R.cell('nodes', 0, 'ev')}`, v: res.value }, fmt: 'money' }] },
					{ type: 'table', id: 'br', title: 'Các nhánh (thụt lề theo cây)', columns: [
						{ key: 'outline', label: 'Cây', fmt: 'text', role: 'label' }, { key: 'from', label: 'Từ', fmt: 'text', role: 'label' }, { key: 'to', label: 'Đến', fmt: 'text', role: 'label' },
						{ key: 'name', label: 'Nhánh', fmt: 'text', role: 'label' }, { key: 'p', label: 'Xác suất', fmt: 'num', role: 'input' },
						{ key: 'value', label: 'Giá trị nhánh', fmt: 'money', role: 'input' }, { key: 'total', label: 'Giá trị nhánh + nút sau', fmt: 'money' },
					], rows: brRows },
					{ type: 'tree', title: 'Sơ đồ cây quyết định (ô vuông = quyết định, tròn = ngẫu nhiên; đường đậm = lựa chọn tốt nhất)', layout: treeLayout(res, inp.branches) },
					{ type: 'table', id: 'nodes', title: 'Giá trị tại các nút', columns: [
						{ key: 'node', label: 'Nút', fmt: 'text', role: 'label' }, { key: 'type', label: 'Loại', fmt: 'text', role: 'label' }, { key: 'depth', label: 'Mức', fmt: 'int', role: 'label' },
						{ key: 'ev', label: 'Giá trị kỳ vọng', fmt: 'money' }, { key: 'best', label: 'Chọn nhánh', fmt: 'text' },
					], rows: nodeRows },
				],
			};
		},
	},

	single: {
		inputTable: (d, m, sample) => ({
			title: 'Tồn kho một kỳ – phân phối nhu cầu', sheet: 'Tồn kho một kỳ',
			hint: 'Mỗi dòng: một mức nhu cầu và xác suất của nó. Tổng xác suất bằng 1.',
			columns: [{ label: 'Nhu cầu', fmt: 'num' }, { label: 'Xác suất', fmt: 'num' }],
			rows: sample ? [[100, 0.1], [110, 0.2], [120, 0.3], [130, 0.25], [140, 0.15]] : Array.from({ length: d.rows }, () => ['', '']), firstInputCol: 0,
		}),
		parse({ rows }) {
			const data = rows.map((r, i) => ({ r, i })).filter(({ r }) => !isBlank(r[0]) || !isBlank(r[1]));
			if (data.length < 2) throw new InputError('Cần ít nhất 2 mức nhu cầu.');
			const demand = data.map(({ r, i }) => toNum(r[0], i, 0, `Nhu cầu dòng ${i + 1}`)), probs = data.map(({ r, i }) => toNum(r[1], i, 1, `Xác suất dòng ${i + 1}`));
			const s = probs.reduce((a, b) => a + b, 0);
			if (Math.abs(s - 1) > 1e-6) throw new InputError(`Tổng xác suất phải bằng 1 (đang là ${+s.toFixed(6)}).`, data[data.length - 1].i, 1);
			return { demand, probs };
		},
		solve(inp, m, p) {
			const r = singlePeriod({ ...inp, price: +p.price, cost: +p.cost, salvage: +p.salvage || 0, shortage: +p.shortage || 0 });
			r._q = inp.demand[r.best];
			return r;
		},
		summary: (res, m, p) => [{ label: 'Số lượng nên đặt', value: res._q, fmt: 'num', strong: true }, { label: 'EMV tốt nhất', value: res.emv[res.best], fmt: 'money' },
			{ label: 'EVPI', value: res.evpi, fmt: 'money' }, { label: 'Tỷ lệ tới hạn Cu/(Cu+Co)', value: res.criticalRatio, fmt: 'pct' }],
		report(inp, res, m, p) {
			const n = inp.demand.length;
			const D = inp.demand.map((_, j) => 'd' + j);
			const pay = (R, i, j) => {
				const q = R.cell('pay', i, 'q'), d = R.cell('dem', 0, D[j]);
				return `=${R.kv('p', 'price')}*MIN(${q},${d})-${R.kv('p', 'cost')}*${q}+${R.kv('p', 'salvage')}*MAX(${q}-${d},0)-${R.kv('p', 'shortage')}*MAX(${d}-${q},0)`;
			};
			return {
				title: 'Tồn kho một kỳ – bảng quyết định', subtitle: 'Mỗi ô là lợi nhuận khi đặt Q (dòng) và nhu cầu thực là D (cột). Sửa giá, chi phí ở ô vàng để tính lại.',
				blocks: [
					{ type: 'kv', id: 'p', title: 'Tham số', items: [
						{ key: 'price', label: 'Giá bán', value: +p.price, fmt: 'num', role: 'input' }, { key: 'cost', label: 'Chi phí', value: +p.cost, fmt: 'num', role: 'input' },
						{ key: 'salvage', label: 'Giá thanh lý', value: +p.salvage || 0, fmt: 'num', role: 'input' }, { key: 'shortage', label: 'Chi phí thiếu hàng', value: +p.shortage || 0, fmt: 'num', role: 'input' },
						{ key: 'cr', label: 'Tỷ lệ tới hạn Cu/(Cu+Co)', value: { f: (R) => `=(${R.kv('p', 'price')}-${R.kv('p', 'cost')}+${R.kv('p', 'shortage')})/((${R.kv('p', 'price')}-${R.kv('p', 'cost')}+${R.kv('p', 'shortage')})+(${R.kv('p', 'cost')}-${R.kv('p', 'salvage')}))`, v: res.criticalRatio }, fmt: 'pct' },
					] },
					{ type: 'table', id: 'dem', title: 'Nhu cầu', columns: [{ key: 'h', label: '', fmt: 'text', role: 'label' }, ...D.map((k, j) => ({ key: k, label: `D${j + 1}`, fmt: 'num', role: 'input' }))],
						rows: [{ cells: { h: 'Nhu cầu', ...Object.fromEntries(inp.demand.map((v, j) => [D[j], v])) } }, { cells: { h: 'Xác suất', ...Object.fromEntries(inp.probs.map((v, j) => [D[j], v])) } }] },
					{ type: 'table', id: 'pay', title: 'Lợi nhuận theo số lượng đặt (Q)', columns: [
						{ key: 'q', label: 'Đặt Q', fmt: 'num', role: 'input' }, ...D.map((k, j) => ({ key: k, label: `D = ${inp.demand[j]}`, fmt: 'money' })), { key: 'emv', label: 'EMV', fmt: 'money' },
					], rows: inp.demand.map((q, i) => ({ highlight: i === res.best, cells: { q, ...Object.fromEntries(D.map((k, j) => [k, { f: (R) => pay(R, i, j), v: res.table[i][j] }])),
						emv: { f: (R) => `=SUMPRODUCT(${R.row('pay', i, D[0], D[n - 1])},${R.row('dem', 1, D[0], D[n - 1])})`, v: res.emv[i] } } })) },
					{ type: 'kv', id: 'r', title: 'Kết luận', items: [
						{ key: 'best', label: 'Số lượng nên đặt', value: { f: (R) => `=INDEX(${R.col('pay', 'q')},MATCH(MAX(${R.col('pay', 'emv')}),${R.col('pay', 'emv')},0))`, v: inp.demand[res.best] }, fmt: 'num' },
						{ key: 'emv', label: 'EMV tốt nhất', value: { f: (R) => `=MAX(${R.col('pay', 'emv')})`, v: res.emv[res.best] }, fmt: 'money' },
						{ key: 'evpi', label: 'EVPI', value: res.evpi, fmt: 'money' },
					] },
				],
			};
		},
	},
};
