import * as B from '../../lib/ops_b.js';
import { InputError } from '../core/errors.js';
import { toNum, isBlank } from './common.js';

const blank = (n, w) => Array.from({ length: n }, () => Array(w).fill(''));
const rowsOf = (rows) => rows.map((r, i) => ({ r, i })).filter(({ r }) => r.some((v) => !isBlank(v)));
const splitPre = (v) => String(v ?? '').split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
const mk = (mod, IMPL) => ({ ...mod, inputTable: (d, m, s) => IMPL[m.id].inputTable(d, m, s), parse: (t, m, p) => IMPL[m.id].parse(t, m, p), solve: (i, m, p) => IMPL[m.id].solve(i, m, p), summary: (r, m, p) => IMPL[m.id].summary(r, m, p), report: (i, r, m, p) => IMPL[m.id].report(i, r, m, p) });
const idOf = (v) => String(v).trim();

// =================== Networks ===================
const EDGES = { mst: [['1', '2', 6], ['1', '3', 4], ['2', '3', 5], ['2', '4', 8], ['3', '4', 7], ['3', '5', 9], ['4', '5', 3]], path: [['A', 'B', 10], ['A', 'C', 5], ['B', 'C', 15], ['B', 'D', 10], ['C', 'D', 10], ['C', 'E', 20], ['D', 'E', 6]], flow: [['s', 'a', 10], ['s', 'b', 5], ['a', 'b', 15], ['a', 't', 10], ['b', 't', 10]] };
const netTable = (kind) => ({
	inputTable: (d, m, sample) => ({
		title: { mst: 'Cây khung nhỏ nhất – các cạnh', path: 'Đường đi ngắn nhất – các cạnh', flow: 'Luồng cực đại – các cung' }[kind], sheet: { mst: 'Cây khung', path: 'Đường ngắn nhất', flow: 'Luồng cực đại' }[kind],
		hint: kind === 'flow' ? 'Mỗi dòng là một cung có hướng từ nút đầu đến nút cuối với khả năng thông qua.' : 'Mỗi dòng là một cạnh nối hai nút với độ dài (chi phí). Cạnh không có hướng trừ khi bật “Cạnh có hướng”.',
		columns: [{ label: 'Nút đầu', fmt: 'text' }, { label: 'Nút cuối', fmt: 'text' }, { label: kind === 'flow' ? 'Khả năng thông qua' : 'Độ dài', fmt: 'num' }],
		rows: sample ? EDGES[kind] : blank(d.rows, 3), firstInputCol: 2,
	}),
	parse({ rows }) {
		const data = rowsOf(rows);
		if (data.length < 1) throw new InputError('Chưa có cạnh nào.');
		return { edges: data.map(({ r, i }) => {
			if (isBlank(r[0]) || isBlank(r[1])) throw new InputError('Cạnh thiếu nút đầu hoặc nút cuối.', i, isBlank(r[0]) ? 0 : 1);
			const w = toNum(r[2], i, 2, `Độ dài / khả năng dòng ${i + 1}`); if (w < 0) throw new InputError('Giá trị không được âm.', i, 2);
			return { a: idOf(r[0]), b: idOf(r[1]), w };
		}) };
	},
	solve(inp, m, p) {
		try {
			if (kind === 'mst') return B.mst(inp.edges);
			if (kind === 'path') return B.shortestPath(inp.edges, idOf(p.source), idOf(p.sink), !!p.directed);
			return B.maxFlow(inp.edges, idOf(p.source), idOf(p.sink));
		} catch (e) { throw new InputError(e.message); }
	},
	summary: (res) => (kind === 'mst' ? [{ label: 'Tổng độ dài cây khung', value: res.total, fmt: 'num', strong: true }, { label: 'Số cạnh được chọn', value: res.chosen.length, fmt: 'int' }]
		: kind === 'path' ? [{ label: 'Khoảng cách ngắn nhất', value: res.distance, fmt: 'num', strong: true }, { label: 'Đường đi', value: res.path.join(' → ') }] : [{ label: 'Luồng cực đại', value: res.total, fmt: 'num', strong: true }]),
	report(inp, res, m, p) {
		const E = inp.edges, N = E.length;
		const edgeCols = [{ key: 'a', label: 'Nút đầu', fmt: 'text', role: 'label' }, { key: 'b', label: 'Nút cuối', fmt: 'text', role: 'label' }, { key: 'w', label: kind === 'flow' ? 'Khả năng' : 'Độ dài', fmt: 'num', role: 'input' }];
		if (kind === 'mst') return { title: 'Cây khung nhỏ nhất – kết quả', subtitle: 'Thuật toán Kruskal: duyệt cạnh theo độ dài tăng dần, nhận cạnh nếu không tạo chu trình.',
			blocks: [{ type: 'table', id: 't', title: 'Các cạnh theo thứ tự xét', columns: [...edgeCols, { key: 'tk', label: 'Được chọn?', fmt: 'text' }], rows: res.steps.map((e) => ({ highlight: e.taken, cells: { a: e.a, b: e.b, w: e.w, tk: e.taken ? 'Có' : 'Không (tạo chu trình)' } })) },
				{ type: 'kv', id: 'r', title: 'Kết quả', items: [{ key: 'tot', label: 'Tổng độ dài cây khung', value: res.total, fmt: 'num' }, { key: 'n', label: 'Số cạnh được chọn', value: res.chosen.length, fmt: 'int' }] }] };
		if (kind === 'path') return { title: 'Đường đi ngắn nhất – kết quả', subtitle: `Thuật toán Dijkstra từ ${idOf(p.source)} đến ${idOf(p.sink)}.`,
			blocks: [{ type: 'kv', id: 'r', title: 'Kết quả', items: [{ key: 'd', label: 'Khoảng cách ngắn nhất', value: res.distance, fmt: 'num' }, { key: 'p', label: 'Đường đi', value: res.path.join(' → '), role: 'label' }] },
				{ type: 'table', id: 't', title: 'Khoảng cách ngắn nhất từ nút nguồn tới từng nút', columns: [{ key: 'n', label: 'Nút', fmt: 'text', role: 'label' }, { key: 'd', label: 'Khoảng cách', fmt: 'num' }], rows: Object.entries(res.dist).map(([n, d]) => ({ highlight: res.path.includes(n), cells: { n, d: d === Infinity ? 'Không tới được' : d } })) },
				{ type: 'table', id: 'e', title: 'Các cạnh', columns: edgeCols, rows: E.map((e) => ({ cells: { a: e.a, b: e.b, w: e.w } })) }] };
		return { title: 'Luồng cực đại – kết quả', subtitle: `Thuật toán Edmonds–Karp từ ${idOf(p.source)} đến ${idOf(p.sink)}.`,
			blocks: [{ type: 'table', id: 't', title: 'Luồng trên từng cung', columns: [...edgeCols, { key: 'f', label: 'Luồng', fmt: 'num' }, { key: 'u', label: 'Còn dư', fmt: 'num' }],
				rows: E.map((e, i) => ({ highlight: res.flows[i] >= e.w - 1e-9 && e.w > 0, cells: { a: e.a, b: e.b, w: e.w, f: res.flows[i], u: { f: (R) => `=${R.cell('t', i, 'w')}-${R.cell('t', i, 'f')}`, v: e.w - res.flows[i] } } })) },
				{ type: 'kv', id: 'r', title: 'Kết quả', items: [{ key: 'm', label: 'Luồng cực đại', value: res.total, fmt: 'num' }] }, { type: 'note', text: 'Cung tô vàng đã đầy (luồng bằng khả năng thông qua).' }] };
	},
});
const NODES = [{ id: 'source', label: 'Nút nguồn', type: 'list', default: 'A' }, { id: 'sink', label: 'Nút đích', type: 'list', default: 'E' }];
export const networks = mk({ id: 'networks', name: 'Mạng (cây khung, luồng, đường đi)', group: 'Tối ưu hoá', keywords: 'network minimum spanning tree shortest path maximal flow mang cay khung duong di ngan nhat luong cuc dai',
	models: [{ id: 'mst', name: 'Cây khung nhỏ nhất', table: 'mst', dims: [{ id: 'rows', label: 'Số cạnh', default: 7, min: 1, max: 300 }], params: [] },
		{ id: 'path', name: 'Đường đi ngắn nhất', table: 'path', dims: [{ id: 'rows', label: 'Số cạnh', default: 7, min: 1, max: 300 }], params: [...NODES, { id: 'directed', label: 'Cạnh có hướng (chỉ đi từ nút đầu sang nút cuối)', type: 'bool', default: false }] },
		{ id: 'flow', name: 'Luồng cực đại', table: 'flow', dims: [{ id: 'rows', label: 'Số cung', default: 5, min: 1, max: 300 }], params: [{ ...NODES[0], default: 's' }, { ...NODES[1], default: 't' }] }] },
	{ mst: netTable('mst'), path: netTable('path'), flow: netTable('flow') });

// =================== Lot sizing ===================
const LOTM = { l4l: 'Lô theo nhu cầu (lot-for-lot)', eoq: 'EOQ', poq: 'Chu kỳ đặt hàng kinh tế (POQ)', sm: 'Silver–Meal', ww: 'Wagner–Whitin (tối ưu)' };
const lot = {
	inputTable: (d, m, sample) => ({ title: 'Xác định cỡ lô – nhu cầu từng kỳ', sheet: 'Cỡ lô', hint: 'Nhu cầu ròng của từng kỳ. Chi phí đặt hàng và lưu kho nhập ở ô tham số.',
		columns: [{ label: 'Kỳ', fmt: 'int' }, { label: 'Nhu cầu', fmt: 'num' }], rows: sample ? [10, 10, 15, 20, 70, 180, 250, 270, 230, 40, 0, 10].map((v, i) => [i + 1, v]) : Array.from({ length: d.rows }, (_, i) => [i + 1, '']), firstInputCol: 1 }),
	parse({ rows }) {
		const data = rows.map((r, i) => ({ r, i })).filter(({ r }) => !isBlank(r[1]));
		if (data.length < 2) throw new InputError('Cần ít nhất 2 kỳ.');
		return { d: data.map(({ r, i }) => { const v = toNum(r[1], i, 1, `Nhu cầu kỳ ${i + 1}`); if (v < 0) throw new InputError('Nhu cầu không được âm.', i, 1); return v; }) };
	},
	solve(inp, m, p) {
		const S = Number(p.S), H = Number(p.H);
		if (!(S >= 0 && H > 0)) throw new InputError('Chi phí đặt hàng phải ≥ 0 và chi phí lưu kho phải > 0.');
		try { const all = Object.fromEntries(Object.keys(LOTM).map((k) => [k, B.lotSizing(k, inp.d, S, H)])); return { ...all[p.method], method: p.method, all, S, H }; } catch (e) { throw new InputError(e.message); }
	},
	summary: (res) => [{ label: `Tổng chi phí (${LOTM[res.method]})`, value: res.total, fmt: 'money', strong: true }, { label: 'Số lần đặt hàng', value: res.orders.filter((o) => o > 0).length, fmt: 'int' }, { label: 'Phương pháp rẻ nhất', value: LOTM[Object.keys(res.all).reduce((a, b) => (res.all[b].total < res.all[a].total - 1e-9 ? b : a))] }],
	report(inp, res, m, p) {
		const N = inp.d.length;
		return { title: `Xác định cỡ lô – ${LOTM[res.method]}`, subtitle: 'Chi phí lưu kho tính trên tồn kho cuối mỗi kỳ. Tồn kho cuối = tồn kho trước + đặt hàng − nhu cầu.',
			blocks: [{ type: 'kv', id: 'p', title: 'Tham số', items: [{ key: 'S', label: 'Chi phí đặt hàng mỗi lần', value: res.S, fmt: 'num', role: 'input' }, { key: 'H', label: 'Chi phí lưu kho mỗi đơn vị mỗi kỳ', value: res.H, fmt: 'num', role: 'input' }] },
				{ type: 'table', id: 't', title: 'Kế hoạch đặt hàng', columns: [{ key: 'k', label: 'Kỳ', fmt: 'int', role: 'label' }, { key: 'd', label: 'Nhu cầu', fmt: 'num', role: 'input' }, { key: 'o', label: 'Lượng đặt', fmt: 'num', role: 'input' }, { key: 'e', label: 'Tồn kho cuối', fmt: 'num' }, { key: 's', label: 'Chi phí đặt', fmt: 'money' }, { key: 'h', label: 'Chi phí lưu kho', fmt: 'money' }],
					rows: res.rows.map((r, i) => ({ highlight: r.order > 0, cells: { k: r.t, d: r.demand, o: r.order,
						e: { f: (R) => (i ? `=${R.cell('t', i - 1, 'e')}+${R.cell('t', i, 'o')}-${R.cell('t', i, 'd')}` : `=${R.cell('t', 0, 'o')}-${R.cell('t', 0, 'd')}`), v: r.end },
						s: { f: (R) => `=IF(${R.cell('t', i, 'o')}>0,${R.kv('p', 'S')},0)`, v: r.setup }, h: { f: (R) => `=${R.cell('t', i, 'e')}*${R.kv('p', 'H')}`, v: r.hold } } })) },
				{ type: 'kv', id: 'r', title: 'Tổng chi phí', items: [{ key: 'su', label: 'Chi phí đặt hàng', value: { f: (R) => `=SUM(${R.col('t', 's')})`, v: res.setup }, fmt: 'money' }, { key: 'ho', label: 'Chi phí lưu kho', value: { f: (R) => `=SUM(${R.col('t', 'h')})`, v: res.hold }, fmt: 'money' }, { key: 'to', label: 'Tổng', value: { f: (R) => `=${R.kv('r', 'su')}+${R.kv('r', 'ho')}`, v: res.total }, fmt: 'money' }] },
				{ type: 'table', id: 'cmp', title: 'So sánh các phương pháp (giá trị tính sẵn)', columns: [{ key: 'm', label: 'Phương pháp', fmt: 'text', role: 'label' }, { key: 'n', label: 'Số lần đặt', fmt: 'int' }, { key: 'su', label: 'Chi phí đặt', fmt: 'money' }, { key: 'ho', label: 'Chi phí lưu kho', fmt: 'money' }, { key: 'to', label: 'Tổng', fmt: 'money' }],
					rows: Object.entries(res.all).map(([k, v]) => ({ highlight: v.total <= Math.min(...Object.values(res.all).map((x) => x.total)) + 1e-9, cells: { m: LOTM[k], n: v.orders.filter((o) => o > 0).length, su: v.setup, ho: v.hold, to: v.total } })) },
				{ type: 'chart', kind: 'column', title: 'Tổng chi phí theo phương pháp', table: 'cmp', x: 'm', series: [{ name: 'Tổng chi phí', key: 'to' }] }],
			_N: N };
	},
};
export const lotsizing = mk({ id: 'lotsizing', name: 'Xác định cỡ lô (lot sizing)', group: 'Tồn kho & vận hành', keywords: 'lot sizing wagner whitin silver meal lot for lot eoq poq co lo dat hang',
	models: [{ id: 'lot', name: 'Cỡ lô cho nhu cầu không đều', table: 'lot', dims: [{ id: 'rows', label: 'Số kỳ', default: 12, min: 2, max: 120 }], params: [
		{ id: 'method', label: 'Phương pháp', type: 'select', default: 'ww', options: Object.entries(LOTM) }, { id: 'S', label: 'Chi phí đặt hàng mỗi lần', type: 'num', default: 100, min: 0 }, { id: 'H', label: 'Chi phí lưu kho mỗi đơn vị mỗi kỳ', type: 'num', default: 1, min: 0.0001, step: 0.1 }] }] }, { lot });

// =================== Job-shop scheduling ===================
const RULES = { spt: 'SPT – thời gian xử lý ngắn nhất', fcfs: 'FCFS – đến trước làm trước', edd: 'EDD – hạn giao sớm nhất', slack: 'Slack – dự trữ thời gian nhỏ nhất', lpt: 'LPT – thời gian xử lý dài nhất', cr: 'Tỷ lệ tới hạn nhỏ nhất', moore: 'Moore – ít việc trễ nhất' };
const oneMachine = {
	inputTable: (d, m, sample) => ({ title: 'Lập lịch một máy – dữ liệu', sheet: 'Lập lịch 1 máy', hint: 'Mỗi dòng là một việc: thời gian xử lý và hạn giao (tính từ thời điểm 0). Thứ tự dòng là thứ tự đến.',
		columns: [{ label: 'Việc', fmt: 'text' }, { label: 'Thời gian xử lý', fmt: 'num' }, { label: 'Hạn giao', fmt: 'num' }], rows: sample ? [['A', 6, 8], ['B', 2, 6], ['C', 8, 18], ['D', 3, 15], ['E', 9, 23]] : Array.from({ length: d.rows }, (_, i) => [String.fromCharCode(65 + i), '', '']), firstInputCol: 1 }),
	parse({ rows }) {
		const data = rowsOf(rows);
		if (data.length < 2) throw new InputError('Cần ít nhất 2 việc.');
		return { jobs: data.map(({ r, i }) => { const p = toNum(r[1], i, 1, `Thời gian xử lý dòng ${i + 1}`), due = toNum(r[2], i, 2, `Hạn giao dòng ${i + 1}`); if (!(p > 0)) throw new InputError('Thời gian xử lý phải lớn hơn 0.', i, 1); return { name: isBlank(r[0]) ? `Việc ${i + 1}` : String(r[0]), p, due }; }) };
	},
	solve(inp, m, p) { const order = B.sequence(inp.jobs, p.rule); return { order, ...B.evaluate(inp.jobs, order), rule: p.rule, all: Object.fromEntries(Object.keys(RULES).map((k) => [k, B.evaluate(inp.jobs, B.sequence(inp.jobs, k))])) }; },
	summary: (res, m, p) => [{ label: 'Thứ tự', value: res.order.map((i) => res._names[i]).join(' → '), strong: true }, { label: 'Thời gian hoàn thành trung bình', value: res.avgFlow, fmt: 'num' }, { label: 'Số việc trễ', value: res.nTardy, fmt: 'int' }, { label: 'Độ trễ trung bình', value: res.avgLate, fmt: 'num' }],
	report(inp, res, m, p) {
		const N = inp.jobs.length;
		return { title: `Lập lịch một máy – ${RULES[res.rule]}`, subtitle: 'Hoàn thành = tổng thời gian xử lý đến hết việc đó; trễ = max(0, hoàn thành − hạn giao).',
			blocks: [{ type: 'table', id: 't', title: 'Thứ tự thực hiện', columns: [{ key: 'j', label: 'Việc', fmt: 'text', role: 'label' }, { key: 'p', label: 'Xử lý', fmt: 'num', role: 'input' }, { key: 'due', label: 'Hạn giao', fmt: 'num', role: 'input' }, { key: 's', label: 'Bắt đầu', fmt: 'num' }, { key: 'e', label: 'Hoàn thành', fmt: 'num' }, { key: 'l', label: 'Trễ hạn (+) / sớm (−)', fmt: 'num' }, { key: 'tard', label: 'Độ trễ', fmt: 'num' }],
				rows: res.rows.map((r, k) => ({ highlight: r.late > 1e-12, cells: { j: inp.jobs[r.i].name, p: inp.jobs[r.i].p, due: inp.jobs[r.i].due,
					s: k ? { f: (R) => `=${R.cell('t', k - 1, 'e')}`, v: r.start } : 0, e: { f: (R) => `=${R.cell('t', k, 's')}+${R.cell('t', k, 'p')}`, v: r.end },
					l: { f: (R) => `=${R.cell('t', k, 'e')}-${R.cell('t', k, 'due')}`, v: r.late }, tard: { f: (R) => `=MAX(0,${R.cell('t', k, 'l')})`, v: r.tardy } } })) },
				{ type: 'kv', id: 'r', title: 'Chỉ tiêu', items: [{ key: 'af', label: 'Thời gian hoàn thành trung bình', value: { f: (R) => `=AVERAGE(${R.col('t', 'e')})`, v: res.avgFlow }, fmt: 'num' }, { key: 'al', label: 'Độ trễ trung bình', value: { f: (R) => `=AVERAGE(${R.col('t', 'tard')})`, v: res.avgLate }, fmt: 'num' },
					{ key: 'nt', label: 'Số việc trễ', value: { f: (R) => `=COUNTIF(${R.col('t', 'l')},">0")`, v: res.nTardy }, fmt: 'int' }, { key: 'ml', label: 'Độ trễ lớn nhất', value: { f: (R) => `=MAX(${R.col('t', 'tard')})`, v: res.maxLate }, fmt: 'num' }] },
				{ type: 'table', id: 'cmp', title: 'So sánh các quy tắc (giá trị tính sẵn)', columns: [{ key: 'r', label: 'Quy tắc', fmt: 'text', role: 'label' }, { key: 'af', label: 'Hoàn thành TB', fmt: 'num' }, { key: 'al', label: 'Độ trễ TB', fmt: 'num' }, { key: 'nt', label: 'Số việc trễ', fmt: 'int' }],
					rows: Object.entries(res.all).map(([k, v]) => ({ highlight: k === res.rule, cells: { r: RULES[k], af: v.avgFlow, al: v.avgLate, nt: v.nTardy } })) }],
			_N: N };
	},
};
const twoMachine = {
	inputTable: (d, m, sample) => ({ title: 'Lập lịch hai máy (Johnson) – dữ liệu', sheet: 'Johnson', hint: 'Mỗi việc đi qua máy 1 rồi máy 2. Thuật toán Johnson cực tiểu hoá thời gian hoàn thành toàn bộ.',
		columns: [{ label: 'Việc', fmt: 'text' }, { label: 'Máy 1', fmt: 'num' }, { label: 'Máy 2', fmt: 'num' }], rows: sample ? [['A', 5, 2], ['B', 1, 6], ['C', 9, 7], ['D', 3, 8], ['E', 10, 4]] : Array.from({ length: d.rows }, (_, i) => [String.fromCharCode(65 + i), '', '']), firstInputCol: 1 }),
	parse({ rows }) {
		const data = rowsOf(rows);
		if (data.length < 2) throw new InputError('Cần ít nhất 2 việc.');
		return { jobs: data.map(({ r, i }) => ({ name: isBlank(r[0]) ? `Việc ${i + 1}` : String(r[0]), a: toNum(r[1], i, 1, `Máy 1 dòng ${i + 1}`), b: toNum(r[2], i, 2, `Máy 2 dòng ${i + 1}`) })) };
	},
	solve(inp) { const order = B.johnson(inp.jobs); return { order, ...B.flowShop(inp.jobs, order), fcfs: B.flowShop(inp.jobs, inp.jobs.map((_, i) => i)) }; },
	summary: (res) => [{ label: 'Thứ tự Johnson', value: res.order.map((i) => res._names[i]).join(' → '), strong: true }, { label: 'Tổng thời gian hoàn thành', value: res.makespan, fmt: 'num' }, { label: 'Nếu làm theo thứ tự đến', value: res.fcfs.makespan, fmt: 'num' }, { label: 'Máy 2 rảnh', value: res.idle2, fmt: 'num' }],
	report(inp, res) {
		return { title: 'Lập lịch hai máy (Johnson) – kết quả', subtitle: 'Việc có thời gian máy 1 ≤ máy 2 làm trước (tăng dần theo máy 1); việc còn lại làm sau (giảm dần theo máy 2).',
			blocks: [{ type: 'table', id: 't', title: 'Lịch trình', columns: [{ key: 'j', label: 'Việc', fmt: 'text', role: 'label' }, { key: 'a', label: 'Máy 1', fmt: 'num', role: 'input' }, { key: 'b', label: 'Máy 2', fmt: 'num', role: 'input' }, { key: 's1', label: 'Máy 1 bắt đầu', fmt: 'num' }, { key: 'e1', label: 'Máy 1 xong', fmt: 'num' }, { key: 's2', label: 'Máy 2 bắt đầu', fmt: 'num' }, { key: 'e2', label: 'Máy 2 xong', fmt: 'num' }],
				rows: res.rows.map((r, k) => ({ cells: { j: inp.jobs[r.i].name, a: inp.jobs[r.i].a, b: inp.jobs[r.i].b, s1: k ? { f: (R) => `=${R.cell('t', k - 1, 'e1')}`, v: r.s1 } : 0, e1: { f: (R) => `=${R.cell('t', k, 's1')}+${R.cell('t', k, 'a')}`, v: r.e1 },
					s2: { f: (R) => (k ? `=MAX(${R.cell('t', k, 'e1')},${R.cell('t', k - 1, 'e2')})` : `=${R.cell('t', 0, 'e1')}`), v: r.s2 }, e2: { f: (R) => `=${R.cell('t', k, 's2')}+${R.cell('t', k, 'b')}`, v: r.e2 } } })) },
				{ type: 'kv', id: 'r', title: 'Kết quả', items: [{ key: 'm', label: 'Tổng thời gian hoàn thành', value: { f: (R) => `=MAX(${R.col('t', 'e2')})`, v: res.makespan }, fmt: 'num' }, { key: 'f', label: 'Tổng nếu làm theo thứ tự đến (tính sẵn)', value: res.fcfs.makespan, fmt: 'num' }, { key: 'i', label: 'Thời gian máy 2 rảnh', value: res.idle2, fmt: 'num' }] }] };
	},
};
export const scheduling = mk({ id: 'scheduling', name: 'Lập lịch (job shop)', group: 'Tồn kho & vận hành', keywords: 'job shop scheduling sequencing spt edd moore johnson critical ratio lap lich thu tu cong viec',
	models: [{ id: 'one', name: 'Một máy (SPT, EDD, Slack, Moore…)', table: 'one', dims: [{ id: 'rows', label: 'Số việc', default: 5, min: 2, max: 100 }], params: [{ id: 'rule', label: 'Quy tắc ưu tiên', type: 'select', default: 'spt', options: Object.entries(RULES) }] },
		{ id: 'two', name: 'Hai máy (Johnson)', table: 'two', dims: [{ id: 'rows', label: 'Số việc', default: 5, min: 2, max: 100 }], params: [] }] },
	{ one: { ...oneMachine, solve: (i, m, p) => { const r = oneMachine.solve(i, m, p); r._names = i.jobs.map((j) => j.name); return r; } }, two: { ...twoMachine, solve: (i) => { const r = twoMachine.solve(i); r._names = i.jobs.map((j) => j.name); return r; } } });

// =================== Line balancing ===================
const LB = { lot: 'Thời gian dài nhất', mft: 'Nhiều công việc theo sau nhất', rpw: 'Trọng số vị trí xếp hạng (RPW)', sot: 'Thời gian ngắn nhất', lft: 'Ít công việc theo sau nhất' };
const lineBal = {
	inputTable: (d, m, sample) => ({ title: 'Cân bằng dây chuyền – dữ liệu', sheet: 'Cân bằng dây chuyền', hint: 'Mỗi dòng là một công việc: thời gian và các công việc phải làm trước (cách nhau bởi dấu phẩy). Thời gian chu kỳ nhập ở ô tham số.',
		columns: [{ label: 'Công việc', fmt: 'text' }, { label: 'Thời gian', fmt: 'num' }, { label: 'Tiền nhiệm', fmt: 'text' }],
		rows: sample ? [['A', 10, ''], ['B', 11, 'A'], ['C', 5, 'B'], ['D', 4, 'B'], ['E', 12, 'A'], ['F', 3, 'C, D'], ['G', 7, 'F'], ['H', 11, 'E'], ['I', 3, 'G, H']] : Array.from({ length: d.rows }, (_, i) => [String.fromCharCode(65 + i), '', '']), firstInputCol: 1 }),
	parse({ rows }) {
		const data = rowsOf(rows);
		if (data.length < 2) throw new InputError('Cần ít nhất 2 công việc.');
		const tasks = data.map(({ r, i }) => { if (isBlank(r[0])) throw new InputError('Công việc thiếu mã.', i, 0); const t = toNum(r[1], i, 1, `Thời gian ${r[0]}`); if (!(t > 0)) throw new InputError('Thời gian phải lớn hơn 0.', i, 1); return { id: idOf(r[0]), time: t, pre: splitPre(r[2]), _row: i }; });
		const ids = new Set(tasks.map((t) => t.id));
		for (const t of tasks) for (const q of t.pre) if (!ids.has(q)) throw new InputError(`Công việc ${t.id} có tiền nhiệm “${q}” không có trong bảng.`, t._row, 2);
		return { tasks };
	},
	solve(inp, m, p) {
		const cycle = Number(p.cycle); if (!(cycle > 0)) throw new InputError('Thời gian chu kỳ phải lớn hơn 0.');
		try { return { ...B.lineBalance(inp.tasks, cycle, p.rule), cycle, rule: p.rule }; } catch (e) { throw new InputError(e.message); }
	},
	summary: (res) => [{ label: 'Số trạm làm việc', value: res.stations.length, fmt: 'int', strong: true }, { label: 'Số trạm lý thuyết tối thiểu', value: res.minStations, fmt: 'int' }, { label: 'Hiệu suất dây chuyền', value: res.efficiency, fmt: 'pct' }, { label: 'Thời gian rảnh', value: res.idle, fmt: 'num' }],
	report(inp, res) {
		const N = inp.tasks.length;
		return { title: `Cân bằng dây chuyền – ${LB[res.rule]}`, subtitle: 'Mỗi trạm nhận các công việc đủ điều kiện (đã xong tiền nhiệm, vừa thời gian còn lại) theo quy tắc ưu tiên đến khi hết chỗ.',
			blocks: [{ type: 'kv', id: 'p', title: 'Tham số', items: [{ key: 'c', label: 'Thời gian chu kỳ', value: res.cycle, fmt: 'num', role: 'input' }] },
				{ type: 'table', id: 't', title: 'Công việc', columns: [{ key: 'id', label: 'Công việc', fmt: 'text', role: 'label' }, { key: 'tm', label: 'Thời gian', fmt: 'num', role: 'input' }, { key: 'pre', label: 'Tiền nhiệm', fmt: 'text', role: 'label' }, { key: 'fol', label: 'Số việc theo sau', fmt: 'int' }, { key: 'rpw', label: 'RPW', fmt: 'num' }, { key: 'st', label: 'Trạm', fmt: 'int' }],
					rows: inp.tasks.map((t, i) => ({ cells: { id: t.id, tm: t.time, pre: t.pre.join(', '), fol: res.following[i], rpw: res.rpw[i], st: res.station[i] } })) },
				{ type: 'table', id: 's', title: 'Các trạm', columns: [{ key: 'k', label: 'Trạm', fmt: 'int', role: 'label' }, { key: 'm', label: 'Công việc', fmt: 'text', role: 'label' }, { key: 'u', label: 'Thời gian dùng', fmt: 'num' }, { key: 'i', label: 'Thời gian rảnh', fmt: 'num' }],
					rows: res.stations.map((s, k) => ({ cells: { k: k + 1, m: s.members.map((i) => inp.tasks[i].id).join(', '), u: { f: (R) => `=SUMIF(${R.col('t', 'st', 0, N - 1)},${R.cell('s', k, 'k')},${R.col('t', 'tm', 0, N - 1)})`, v: s.used }, i: { f: (R) => `=${R.kv('p', 'c')}-${R.cell('s', k, 'u')}`, v: s.idle } } })) },
				{ type: 'kv', id: 'r', title: 'Kết quả', items: [{ key: 'tot', label: 'Tổng thời gian công việc', value: { f: (R) => `=SUM(${R.col('t', 'tm')})`, v: res.total }, fmt: 'num' }, { key: 'min', label: 'Số trạm lý thuyết tối thiểu', value: { f: (R) => `=ROUNDUP(ROUND(${R.kv('r', 'tot')}/${R.kv('p', 'c')},9),0)`, v: res.minStations }, fmt: 'int' },
					{ key: 'n', label: 'Số trạm thực tế', value: { f: (R) => `=MAX(${R.col('t', 'st')})`, v: res.stations.length }, fmt: 'int' }, { key: 'eff', label: 'Hiệu suất', value: { f: (R) => `=${R.kv('r', 'tot')}/(${R.kv('r', 'n')}*${R.kv('p', 'c')})`, v: res.efficiency }, fmt: 'pct' }] }] };
	},
};
export const linebalance = mk({ id: 'linebalance', name: 'Cân bằng dây chuyền', group: 'Tồn kho & vận hành', keywords: 'assembly line balancing cycle time rpw ranked positional weight can bang day chuyen tram lam viec',
	models: [{ id: 'alb', name: 'Cân bằng dây chuyền lắp ráp (5 quy tắc heuristic)', table: 'alb', dims: [{ id: 'rows', label: 'Số công việc', default: 9, min: 2, max: 100 }], params: [{ id: 'cycle', label: 'Thời gian chu kỳ', type: 'num', default: 20, min: 0.0001 }, { id: 'rule', label: 'Quy tắc chọn công việc', type: 'select', default: 'rpw', options: Object.entries(LB) }] }] }, { alb: lineBal });

// =================== Layout ===================
const layoutM = {
	inputTable(d, m, sample) {
		const n = sample ? 4 : d.n, names = sample ? ['Cắt', 'Hàn', 'Sơn', 'Đóng gói'] : Array.from({ length: n }, (_, i) => `PB${i + 1}`);
		const flow = [[0, 10, 5, 0], [10, 0, 2, 6], [5, 2, 0, 1], [0, 6, 1, 0]], dist = [[0, 1, 2, 3], [1, 0, 1, 2], [2, 1, 0, 1], [3, 2, 1, 0]];
		const cols = [{ label: 'Loại', fmt: 'text' }, { label: 'Tên', fmt: 'text' }, ...names.map((l) => ({ label: l, fmt: 'num' }))];
		const rows = [...names.map((nm, i) => ['Dòng chảy', nm, ...(sample ? flow[i] : Array(n).fill(''))]), ...names.map((nm, i) => ['Khoảng cách', `Vị trí ${i + 1}`, ...(sample ? dist[i] : Array(n).fill(''))])];
		return { title: 'Bố trí mặt bằng – dữ liệu', sheet: 'Bố trí mặt bằng', hint: 'Nửa trên: dòng chảy (số lần di chuyển) giữa các phòng ban. Nửa dưới: khoảng cách giữa các vị trí. Cột đầu ghi “Dòng chảy” hoặc “Khoảng cách”.', columns: cols, rows, firstInputCol: 2 };
	},
	parse({ header, rows }) {
		const n = header.length - 2, data = rowsOf(rows);
		if (n < 2) throw new InputError('Cần ít nhất 2 phòng ban.');
		const f = data.filter(({ r }) => /d[oò]ng\s*ch[aả]y|flow/i.test(String(r[0]))), d = data.filter(({ r }) => /kho[aả]ng|dist/i.test(String(r[0])));
		if (f.length !== n || d.length !== n) throw new InputError(`Cần đúng ${n} dòng “Dòng chảy” và ${n} dòng “Khoảng cách”.`);
		const mat = (arr, what) => arr.map(({ r, i }) => Array.from({ length: n }, (_, j) => toNum(isBlank(r[2 + j]) ? 0 : r[2 + j], i, 2 + j, `${what} (${r[1] || i + 1}, ${j + 1})`)));
		const flow = mat(f, 'Dòng chảy'), dist = mat(d, 'Khoảng cách');
		if (flow.every((r) => r.every((v) => v === 0))) throw new InputError('Chưa nhập dòng chảy giữa các phòng ban.', f[0].i, 2);
		return { names: header.slice(2).map((h, j) => (isBlank(h) ? `PB${j + 1}` : String(h))), flow, dist };
	},
	solve(inp, m, p) { try { return { ...(p.method === 'enum' ? B.layoutEnumerate(inp.flow, inp.dist) : B.layoutPairwise(inp.flow, inp.dist)), method: p.method }; } catch (e) { throw new InputError(e.message); } },
	summary: (res) => [{ label: 'Tổng chi phí di chuyển', value: res.cost, fmt: 'num', strong: true }, { label: 'Bố trí ban đầu', value: res.initial, fmt: 'num' }, { label: 'Tiết kiệm', value: res.initial ? 1 - res.cost / res.initial : 0, fmt: 'pct' }],
	report(inp, res) {
		const n = inp.names.length;
		return { title: `Bố trí mặt bằng – ${res.method === 'enum' ? 'liệt kê toàn bộ' : 'đổi chỗ từng cặp'}`, subtitle: 'Chi phí = Σ dòng chảy(i, j) × khoảng cách(vị trí của i, vị trí của j). Bố trí ban đầu: phòng ban i ở vị trí i.',
			blocks: [{ type: 'table', id: 't', title: 'Bố trí tốt nhất tìm được', columns: [{ key: 'd', label: 'Phòng ban', fmt: 'text', role: 'label' }, { key: 'l', label: 'Đặt ở vị trí', fmt: 'int' }], rows: inp.names.map((nm, i) => ({ cells: { d: nm, l: res.loc[i] + 1 } })) },
				{ type: 'kv', id: 'r', title: 'Chi phí', items: [{ key: 'c', label: 'Tổng chi phí di chuyển', value: res.cost, fmt: 'num' }, { key: 'i', label: 'Chi phí bố trí ban đầu', value: res.initial, fmt: 'num' }, ...(res.evaluated ? [{ key: 'e', label: 'Số phương án đã xét', value: res.evaluated, fmt: 'int' }] : [])] },
				...(res.steps?.length ? [{ type: 'table', id: 'st', title: 'Các bước đổi chỗ', columns: [{ key: 'k', label: 'Bước', fmt: 'int', role: 'label' }, { key: 'a', label: 'Đổi chỗ', fmt: 'text', role: 'label' }, { key: 'c', label: 'Chi phí sau bước', fmt: 'num' }], rows: res.steps.map((s, k) => ({ cells: { k: k + 1, a: `${inp.names[s.i]} ↔ ${inp.names[s.j]}`, c: s.cost } })) }] : []),
				{ type: 'note', text: 'Các giá trị chi phí là tính sẵn; sửa dữ liệu rồi bấm Giải lại.' }], _n: n };
	},
};
export const layout = mk({ id: 'layout', name: 'Bố trí mặt bằng', group: 'Tồn kho & vận hành', keywords: 'layout facility flow matrix distance pairwise exchange enumeration bo tri mat bang phong ban',
	models: [{ id: 'layout', name: 'Gán phòng ban vào vị trí (liệt kê / đổi chỗ cặp)', table: 'layout', dims: [{ id: 'n', label: 'Số phòng ban', default: 4, min: 2, max: 12 }], params: [{ id: 'method', label: 'Phương pháp', type: 'select', default: 'enum', options: [['enum', 'Liệt kê toàn bộ (tối ưu, tối đa 8 phòng)'], ['pair', 'Đổi chỗ từng cặp (heuristic)']] }] }] }, { layout: layoutM });
