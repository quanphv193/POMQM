import { solveIP } from '../../lib/ip.js';
import { InputError } from '../core/errors.js';
import LP from './lp.js';
import { isBlank } from './common.js';

const TYPES = { 'nguyên': 'int', 'nguyen': 'int', 'int': 'int', 'integer': 'int', 'nhị phân': 'bin', 'nhi phan': 'bin', '0-1': 'bin', 'bin': 'bin', 'binary': 'bin', 'liên tục': 'cont', 'lien tuc': 'cont', 'cont': 'cont', 'thực': 'cont' };
const TYPE_LABEL = { int: 'Nguyên', bin: 'Nhị phân (0-1)', cont: 'Liên tục' };
const isTypeRow = (r) => /lo[aạ]i|type/i.test(String(r[0]));

export default {
	id: 'ip',
	name: 'Quy hoạch nguyên & hỗn hợp',
	group: 'Tối ưu hoá',
	keywords: 'integer mixed binary branch and bound quy hoach nguyen nhanh can nhi phan',
	models: [{ id: 'ip', name: 'Quy hoạch nguyên / hỗn hợp / nhị phân (nhánh cận)', params: [
		{ id: 'sense', label: 'Mục tiêu', type: 'select', default: 'max', options: [['max', 'Cực đại (Max)'], ['min', 'Cực tiểu (Min)']] },
	] }],
	dims: [{ id: 'vars', label: 'Số biến', default: 2, min: 1, max: 30 }, { id: 'cons', label: 'Số ràng buộc', default: 2, min: 1, max: 60 }],
	inputTable(dims, model, sample) {
		// Harrison Electric (Render, Stair & Hanna): max 7x1 + 6x2
		const vars = sample ? ['Đèn chùm (x1)', 'Quạt trần (x2)'] : Array.from({ length: dims.vars }, (_, j) => `x${j + 1}`);
		const rows = sample
			? [['Hàm mục tiêu', 7, 6, '', ''], ['Giờ đi dây', 2, 3, '<=', 12], ['Giờ lắp ráp', 6, 5, '<=', 30], ['Loại biến', 'Nguyên', 'Nguyên', '', '']]
			: [['Hàm mục tiêu', ...vars.map(() => ''), '', ''], ...Array.from({ length: dims.cons }, (_, i) => [`R${i + 1}`, ...vars.map(() => ''), '<=', '']), ['Loại biến', ...vars.map(() => 'Nguyên'), '', '']];
		return {
			title: 'Quy hoạch nguyên – dữ liệu',
			hint: 'Như bài QHTT, thêm dòng cuối “Loại biến”: Nguyên, Nhị phân hoặc Liên tục cho từng biến.',
			columns: [{ label: 'Tên', fmt: 'text' }, ...vars.map((v) => ({ label: v, fmt: 'num' })), { label: 'Dấu', fmt: 'text', list: ['<=', '>=', '='] }, { label: 'Vế phải', fmt: 'num' }],
			rows, firstInputCol: 1,
		};
	},
	parse(table, model, p) {
		const rows = table.rows;
		const ti = rows.findIndex(isTypeRow);
		const nv = table.header.length - 3;
		let types = Array(nv).fill('int');
		if (ti >= 0) {
			types = rows[ti].slice(1, 1 + nv).map((v, j) => {
				if (isBlank(v)) return 'int';
				const t = TYPES[String(v).trim().toLowerCase()];
				if (!t) throw new InputError(`Loại biến của cột ${j + 1} phải là Nguyên, Nhị phân hoặc Liên tục.`, ti, 1 + j);
				return t;
			});
		}
		const lpTable = { ...table, rows: rows.map((r, i) => (i === ti ? r.map(() => '') : r)) };
		return { ...LP.parse(lpTable, model, p), types };
	},
	solve(input, model, p) {
		return solveIP({ sense: p.sense, c: input.c, constraints: input.constraints, types: input.types });
	},
	summary(res, model, p) {
		if (res.status !== 'optimal') return [{ label: 'Trạng thái', value: res.status === 'infeasible' ? 'Không có nghiệm nguyên khả thi' : 'Không giới nội', strong: true }];
		return [
			{ label: p.sense === 'max' ? 'Giá trị cực đại' : 'Giá trị cực tiểu', value: res.objective, fmt: 'num', strong: true },
			...res.x.slice(0, 6).map((x, j) => ({ label: res._names[j], value: x, fmt: 'num' })),
			{ label: 'Số nút nhánh cận', value: res.nodes.length, fmt: 'int' },
			{ label: 'Nới lỏng LP', value: res.relaxation?.objective ?? null, fmt: 'num' },
		];
	},
	report(input, res, model, p) {
		const nodeTable = { type: 'table', id: 'bb', title: 'Các bước nhánh cận', columns: [
			{ key: 'id', label: 'Nút', fmt: 'int', role: 'label' }, { key: 'parent', label: 'Nút cha', fmt: 'int', role: 'label' }, { key: 'label', label: 'Ràng buộc thêm', fmt: 'text', role: 'label' },
			{ key: 'z', label: 'Mục tiêu LP', fmt: 'num' }, ...input.names.map((n, j) => ({ key: 'x' + j, label: n, fmt: 'num' })), { key: 'note', label: 'Kết luận', fmt: 'text' },
		], rows: res.nodes.map((n) => ({ highlight: !!n.incumbent && res.x && n.x && n.x.every((v, j) => Math.abs(Math.round(v) - res.x[j]) < 1e-6 || input.types[j] === 'cont'), cells: {
			id: n.id, parent: n.parent ?? '', label: n.label, z: n.z ?? '', ...Object.fromEntries(input.names.map((_, j) => ['x' + j, n.x ? n.x[j] : ''])), note: n.note || (n.status === 'infeasible' ? 'Vô nghiệm' : ''),
		} })) };
		if (res.status !== 'optimal') return { title: 'Quy hoạch nguyên', subtitle: 'Không có nghiệm nguyên tối ưu.', blocks: [nodeTable] };
		const nv = input.names.length;
		return {
			title: 'Quy hoạch nguyên – kết quả', subtitle: 'Nhánh cận theo chiều sâu, phân nhánh trên biến có phần lẻ lớn nhất.',
			blocks: [
				{ type: 'table', id: 'sol', title: 'Nghiệm tối ưu', columns: [
					{ key: 'name', label: 'Biến', fmt: 'text', role: 'label' }, { key: 'type', label: 'Loại', fmt: 'text', role: 'label' },
					{ key: 'x', label: 'Giá trị', fmt: 'num' }, { key: 'c', label: 'Hệ số mục tiêu', fmt: 'num', role: 'input' }, { key: 'contrib', label: 'Đóng góp', fmt: 'num' },
				], rows: input.names.map((n, j) => ({ cells: { name: n, type: TYPE_LABEL[input.types[j]], x: res.x[j], c: input.c[j], contrib: { f: (R) => `=${R.cell('sol', j, 'x')}*${R.cell('sol', j, 'c')}` } } })) },
				{ type: 'kv', id: 'obj', items: [
					{ key: 'z', label: p.sense === 'max' ? 'Giá trị cực đại' : 'Giá trị cực tiểu', value: { f: (R) => `=SUM(${R.col('sol', 'contrib')})`, v: res.objective }, fmt: 'num' },
					{ key: 'lp', label: 'Giá trị nới lỏng LP (cận)', value: res.relaxation.objective, fmt: 'num' },
				] },
				{ type: 'table', id: 'cons', title: 'Ràng buộc', columns: [
					{ key: 'name', label: 'Ràng buộc', fmt: 'text', role: 'label' }, ...input.names.map((n, j) => ({ key: 'v' + j, label: n, fmt: 'num', role: 'input' })),
					{ key: 'op', label: 'Dấu', fmt: 'text', role: 'input' }, { key: 'b', label: 'Vế phải', fmt: 'num', role: 'input' }, { key: 'lhs', label: 'Vế trái', fmt: 'num' }, { key: 'slack', label: 'Slack / Surplus', fmt: 'num' },
				], rows: input.constraints.map((k, i) => ({ cells: {
					name: k.name, ...Object.fromEntries(k.a.map((v, j) => ['v' + j, v])), op: k.op, b: k.b,
					lhs: { f: (R) => `=MMULT(${R.row('cons', i, 'v0', 'v' + (nv - 1))},${R.col('sol', 'x')})`, v: res.lhs[i] },
					slack: { f: (R) => (k.op === '<=' ? `=${R.cell('cons', i, 'b')}-${R.cell('cons', i, 'lhs')}` : k.op === '>=' ? `=${R.cell('cons', i, 'lhs')}-${R.cell('cons', i, 'b')}` : '=0') },
				} })) },
				nodeTable,
			],
		};
	},
};
