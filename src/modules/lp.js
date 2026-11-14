import { solveLP } from '../../lib/lp.js';
import { cornerPoints, constraintSegments, plotBox } from '../../lib/lpgraph.js';
import { InputError } from '../core/errors.js';
import { toNum, isBlank } from './common.js';

const OPS = { '<=': '<=', '≤': '<=', '=<': '<=', '>=': '>=', '≥': '>=', '=>': '>=', '=': '=' };

export default {
	id: 'lp',
	name: 'Quy hoạch tuyến tính',
	group: 'Tối ưu hoá',
	keywords: 'linear programming simplex lp toi uu quy hoach',
	models: [{ id: 'lp', name: 'Quy hoạch tuyến tính (simplex)', params: [
		{ id: 'sense', label: 'Mục tiêu', type: 'select', default: 'max', options: [['max', 'Cực đại (Max)'], ['min', 'Cực tiểu (Min)']] },
		{ id: 'ranging', label: 'Phân tích độ nhạy (ranging)', type: 'bool', default: true },
		{ id: 'graph', label: 'Đồ thị và điểm góc (bài 2 biến)', type: 'bool', default: true },
		{ id: 'iters', label: 'Bảng lặp simplex', type: 'bool', default: false },
	] }],
	dims: [{ id: 'vars', label: 'Số biến', default: 2, min: 1, max: 50 }, { id: 'cons', label: 'Số ràng buộc', default: 3, min: 1, max: 100 }],
	inputTable(dims, model, sample) {
		// Flair Furniture (Render, Stair & Hanna): max 70T + 50C
		const vars = sample ? ['Bàn (T)', 'Ghế (C)'] : Array.from({ length: dims.vars }, (_, j) => `x${j + 1}`);
		const rows = sample
			? [['Hàm mục tiêu', 70, 50, '', ''], ['Giờ mộc', 4, 3, '<=', 240], ['Giờ sơn', 2, 1, '<=', 100]]
			: [['Hàm mục tiêu', ...vars.map(() => ''), '', ''], ...Array.from({ length: dims.cons }, (_, i) => [`R${i + 1}`, ...vars.map(() => ''), '<=', ''])];
		return {
			title: 'Quy hoạch tuyến tính – dữ liệu',
			hint: 'Dòng đầu là hệ số hàm mục tiêu. Mỗi dòng sau là một ràng buộc. Đổi tên biến ở dòng tiêu đề. Mọi biến ≥ 0.',
			columns: [{ label: 'Tên', fmt: 'text' }, ...vars.map((v) => ({ label: v, fmt: 'num' })), { label: 'Dấu', fmt: 'text', list: ['<=', '>=', '='] }, { label: 'Vế phải', fmt: 'num' }],
			rows, firstInputCol: 1,
		};
	},
	parse({ header, rows }) {
		const nv = header.length - 3;
		if (nv < 1) throw new InputError('Bảng cần ít nhất 1 cột biến giữa cột Tên và cột Dấu.');
		const names = header.slice(1, 1 + nv).map((h, j) => (isBlank(h) ? `x${j + 1}` : String(h)));
		if (!rows.length) throw new InputError('Bảng chưa có dòng hàm mục tiêu.');
		const c = rows[0].slice(1, 1 + nv).map((v, j) => toNum(v, 0, 1 + j, `Hệ số mục tiêu của ${names[j]}`));
		const constraints = [];
		rows.slice(1).forEach((r, k) => {
			const i = k + 1;
			if (r.slice(1).every(isBlank)) return;
			const op = OPS[String(r[1 + nv]).trim()];
			if (!op) throw new InputError(`Ràng buộc ${r[0] || i}: cột Dấu phải là <=, >= hoặc =.`, i, 1 + nv);
			constraints.push({
				name: isBlank(r[0]) ? `R${i}` : String(r[0]),
				a: r.slice(1, 1 + nv).map((v, j) => toNum(isBlank(v) ? 0 : v, i, 1 + j, `Hệ số ${names[j]} ở ràng buộc ${r[0] || i}`)),
				op, b: toNum(r[2 + nv], i, 2 + nv, `Vế phải của ràng buộc ${r[0] || i}`),
			});
		});
		if (!constraints.length) throw new InputError('Cần ít nhất 1 ràng buộc.');
		return { names, c, constraints };
	},
	solve(input, model, p) {
		return solveLP({ sense: p.sense, c: input.c, constraints: input.constraints }, { trace: !!p.iters, names: input.names });
	},
	summary(res, model, p) {
		if (res.status !== 'optimal') return [{ label: 'Trạng thái', value: res.status === 'infeasible' ? 'Vô nghiệm' : 'Không giới nội', strong: true }];
		return [
			{ label: p.sense === 'max' ? 'Giá trị cực đại' : 'Giá trị cực tiểu', value: res.objective, fmt: 'num', strong: true },
			...res.x.slice(0, 6).map((x, j) => ({ label: res._names[j], value: x, fmt: 'num' })),
			{ label: 'Ràng buộc chặt', value: res.slack.filter((s) => Math.abs(s) < 1e-9).length, fmt: 'int' },
		];
	},
	report(input, res, model, p) {
		const nv = input.names.length, m = input.constraints.length;
		const status = { optimal: 'Tối ưu', infeasible: 'Vô nghiệm (không có phương án khả thi)', unbounded: 'Không giới nội (mục tiêu tăng vô hạn)' }[res.status];
		const head = { type: 'kv', id: 'p', title: 'Bài toán', items: [
			{ key: 'sense', label: 'Mục tiêu', value: p.sense === 'max' ? 'Cực đại' : 'Cực tiểu', role: 'label' },
			{ key: 'status', label: 'Trạng thái', value: status, role: 'label' },
		] };
		if (res.status !== 'optimal') return { title: 'Quy hoạch tuyến tính', subtitle: 'Không có nghiệm tối ưu.', blocks: [head, ...(p.iters ? iterationBlocks(res, input) : [])] };
		const varCols = input.names.map((n, j) => ({ key: 'v' + j, label: n, fmt: 'num', role: 'input' }));
		const xcol = (R) => R.col('sol', 'x');
		return {
			title: 'Quy hoạch tuyến tính – kết quả',
			subtitle: 'Nghiệm do simplex tính. Vế trái, slack và giá trị mục tiêu là công thức theo nghiệm.',
			blocks: [
				head,
				{ type: 'table', id: 'sol', title: 'Nghiệm tối ưu', columns: [
					{ key: 'name', label: 'Biến', fmt: 'text', role: 'label' }, { key: 'x', label: 'Giá trị', fmt: 'num' },
					{ key: 'c', label: 'Hệ số mục tiêu', fmt: 'num', role: 'input' }, { key: 'contrib', label: 'Đóng góp', fmt: 'num' },
				], rows: input.names.map((n, j) => ({ cells: { name: n, x: res.x[j], c: input.c[j], contrib: { f: (R) => `=${R.cell('sol', j, 'x')}*${R.cell('sol', j, 'c')}` } } })) },
				{ type: 'kv', id: 'obj', items: [{ key: 'z', label: p.sense === 'max' ? 'Giá trị cực đại' : 'Giá trị cực tiểu', value: { f: (R) => `=SUM(${R.col('sol', 'contrib')})`, v: res.objective }, fmt: 'num' }] },
				{ type: 'table', id: 'cons', title: 'Ràng buộc', columns: [
					{ key: 'name', label: 'Ràng buộc', fmt: 'text', role: 'label' }, ...varCols,
					{ key: 'op', label: 'Dấu', fmt: 'text', role: 'input' }, { key: 'b', label: 'Vế phải', fmt: 'num', role: 'input' },
					{ key: 'lhs', label: 'Vế trái', fmt: 'num' }, { key: 'slack', label: 'Slack / Surplus', fmt: 'num' },
					{ key: 'shadow', label: 'Giá bóng (dual)', fmt: 'num' }, { key: 'tight', label: 'Chặt?', fmt: 'text' },
				], rows: input.constraints.map((k, i) => ({
					highlight: false,
					cells: {
						name: k.name, ...Object.fromEntries(k.a.map((v, j) => ['v' + j, v])), op: k.op, b: k.b,
						lhs: { f: (R) => `=MMULT(${R.row('cons', i, 'v0', 'v' + (nv - 1))},${xcol(R)})`, v: res.lhs[i] },
						slack: { f: (R) => k.op === '<=' ? `=${R.cell('cons', i, 'b')}-${R.cell('cons', i, 'lhs')}` : k.op === '>=' ? `=${R.cell('cons', i, 'lhs')}-${R.cell('cons', i, 'b')}` : '=0', v: res.slack[i] },
						shadow: res.shadow[i],
						tight: { f: (R) => `=IF(ABS(${R.cell('cons', i, 'slack')})<1E-9,"Chặt","")` },
					},
				})) },
				{ type: 'note', text: `Giá bóng: mục tiêu thay đổi bao nhiêu khi vế phải tăng 1 đơn vị (trong phạm vi nghiệm cơ sở không đổi). ${m} ràng buộc, ${nv} biến.` },
				...(p.ranging !== false ? rangingBlocks(res, input) : []),
				...(p.graph !== false && nv === 2 ? graphBlocks(res, input) : []),
				...(p.iters ? iterationBlocks(res, input) : []),
			],
		};
	},
};

const lim = (v) => (v === Infinity ? 'Không giới hạn' : v === -Infinity ? 'Không giới hạn' : v);
function rangingBlocks(res, input) {
	return [
		{ type: 'table', id: 'rc', title: 'Độ nhạy – hệ số hàm mục tiêu', columns: [
			{ key: 'name', label: 'Biến', fmt: 'text', role: 'label' }, { key: 'x', label: 'Giá trị', fmt: 'num' },
			{ key: 'rc', label: 'Chi phí giảm (reduced cost)', fmt: 'num' }, { key: 'c', label: 'Hệ số hiện tại', fmt: 'num', role: 'input' },
			{ key: 'lo', label: 'Cận dưới', fmt: 'num' }, { key: 'hi', label: 'Cận trên', fmt: 'num' },
		], rows: input.names.map((n, j) => ({ cells: { name: n, x: res.x[j], rc: res.costRange[j].reduced, c: input.c[j], lo: lim(res.costRange[j].lower), hi: lim(res.costRange[j].upper) } })) },
		{ type: 'table', id: 'rr', title: 'Độ nhạy – vế phải', columns: [
			{ key: 'name', label: 'Ràng buộc', fmt: 'text', role: 'label' }, { key: 'dual', label: 'Giá bóng', fmt: 'num' },
			{ key: 'b', label: 'Vế phải hiện tại', fmt: 'num', role: 'input' }, { key: 'lo', label: 'Cận dưới', fmt: 'num' }, { key: 'hi', label: 'Cận trên', fmt: 'num' },
		], rows: input.constraints.map((k, i) => ({ cells: { name: k.name, dual: res.shadow[i], b: k.b, lo: lim(res.rhsRange[i].lower), hi: lim(res.rhsRange[i].upper) } })) },
		{ type: 'note', text: 'Trong khoảng [cận dưới, cận trên], thay đổi một hệ số (các hệ số khác giữ nguyên) không làm đổi tập biến cơ sở; giá bóng còn đúng trong khoảng của vế phải.' },
	];
}
function graphBlocks(res, input) {
	const corners = cornerPoints(input.c, input.constraints);
	const [X, Y] = plotBox(input.constraints, corners);
	const segs = constraintSegments(input.constraints, X, Y);
	const pts = [];
	const series = [];
	segs.forEach((sg, i) => {
		if (!sg) return;
		series.push({ name: input.constraints[i].name, table: 'gp', x: 'x', y: 'y', from: pts.length, to: pts.length + 1, lines: true });
		pts.push({ s: input.constraints[i].name, x: sg[0][0], y: sg[0][1] }, { s: input.constraints[i].name, x: sg[1][0], y: sg[1][1] });
	});
	if (corners.length >= 3) {
		series.push({ name: 'Miền khả thi', table: 'gp', x: 'x', y: 'y', from: pts.length, to: pts.length + corners.length, lines: true, markers: true });
		[...corners, corners[0]].forEach((c) => pts.push({ s: 'Miền khả thi', x: c.x, y: c.y }));
	}
	series.push({ name: 'Nghiệm tối ưu', table: 'gp', x: 'x', y: 'y', from: pts.length, to: pts.length, lines: false, markers: true });
	pts.push({ s: 'Tối ưu', x: res.x[0], y: res.x[1] });
	const best = Math.max(...corners.map((c) => (res.sign === 1 ? c.z : -c.z)));
	return [
		{ type: 'table', id: 'cp', title: 'Các điểm góc của miền khả thi', columns: [
			{ key: 'x', label: input.names[0], fmt: 'num' }, { key: 'y', label: input.names[1], fmt: 'num' }, { key: 'z', label: 'Giá trị mục tiêu', fmt: 'num' },
		], rows: corners.map((c) => ({ highlight: Math.abs((res.sign === 1 ? c.z : -c.z) - best) < 1e-7, cells: {
			x: c.x, y: c.y, z: { f: (R) => `=${R.cell('cp', corners.indexOf(c), 'x')}*${input.c[0]}+${R.cell('cp', corners.indexOf(c), 'y')}*${input.c[1]}`, v: c.z } } })) },
		{ type: 'table', id: 'gp', title: 'Dữ liệu vẽ đồ thị', columns: [{ key: 's', label: 'Đường', fmt: 'text', role: 'label' }, { key: 'x', label: input.names[0], fmt: 'num' }, { key: 'y', label: input.names[1], fmt: 'num' }],
			rows: pts.map((q) => ({ cells: q })) },
		{ type: 'chart', kind: 'scatter', title: 'Miền khả thi và nghiệm tối ưu', xTitle: input.names[0], yTitle: input.names[1], series },
	];
}
function iterationBlocks(res, input) {
	const tr = res.trace || [];
	const names = res.colNames;
	const out = [{ type: 'note', text: `Bảng lặp simplex (${tr.length} bảng). Dòng Zj − Cj tính cho bài toán dạng cực đại${res.sign === -1 ? ' (đã đổi dấu hàm mục tiêu cực tiểu)' : ''}; giai đoạn 1 cực tiểu tổng biến giả.` }];
	tr.forEach((t, k) => {
		const N = t.T[0].length - 1;
		const cols = [{ key: 'b', label: 'Cơ sở', fmt: 'text', role: 'label' }, ...names.slice(0, N).map((nm, j) => ({ key: 'c' + j, label: nm, fmt: 'num' })), { key: 'rhs', label: 'Vế phải', fmt: 'num' }];
		const rows = t.T.map((row, i) => ({ highlight: i === t.leave, cells: { b: names[t.basis[i]], ...Object.fromEntries(row.slice(0, N).map((v, j) => ['c' + j, cl(v)])), rhs: cl(row[N]) } }));
		rows.push({ cells: { b: 'Zj − Cj', ...Object.fromEntries(t.obj.slice(0, N).map((v, j) => ['c' + j, cl(v)])), rhs: cl(t.obj[N]) } });
		const move = t.enter >= 0 ? `biến vào ${names[t.enter]}, biến ra ${names[t.basis[t.leave]]}` : 'tối ưu cho giai đoạn này';
		out.push({ type: 'table', id: 'it' + k, title: `Bảng ${k + 1} (giai đoạn ${t.phase}) – ${move}`, columns: cols, rows });
	});
	return out;
}
const cl = (v) => (Math.abs(v) < 1e-9 ? 0 : Math.round(v * 1e6) / 1e6);
