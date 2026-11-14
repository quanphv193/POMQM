import { solveGoal } from '../../lib/goal.js';
import { InputError } from '../core/errors.js';
import { toNum, isBlank } from './common.js';

const OPS = { '<=': '<=', '≤': '<=', '>=': '>=', '≥': '>=', '=': '=' };
const isGoal = (v) => /m[uụ]c\s*ti[eê]u|goal/i.test(String(v));

export default {
	id: 'goal',
	name: 'Quy hoạch mục tiêu',
	group: 'Tối ưu hoá',
	keywords: 'goal programming priority deviation quy hoach muc tieu uu tien do lech',
	models: [{ id: 'goal', name: 'Quy hoạch mục tiêu theo thứ tự ưu tiên', params: [] }],
	dims: [{ id: 'vars', label: 'Số biến', default: 2, min: 1, max: 30 }, { id: 'rows', label: 'Số dòng (ràng buộc + mục tiêu)', default: 4, min: 1, max: 60 }],
	inputTable(dims, model, sample) {
		const vars = sample ? ['x1', 'x2'] : Array.from({ length: dims.vars }, (_, j) => `x${j + 1}`);
		const rows = sample ? [
			['Giờ lắp ráp', 6, 5, '<=', 30, '', '', '', ''],
			['Lợi nhuận ≥ 30', 7, 6, 'Mục tiêu', 30, 1, 1, '', ''],
			['Dùng đủ 12 giờ đi dây', 2, 3, 'Mục tiêu', 12, 2, 1, 2, 1],
			['Ít nhất 7 quạt', 0, 1, 'Mục tiêu', 7, 3, 1, '', ''],
		] : Array.from({ length: dims.rows }, (_, i) => [`Dòng ${i + 1}`, ...vars.map(() => ''), 'Mục tiêu', '', '', '', '', '']);
		return {
			title: 'Quy hoạch mục tiêu – dữ liệu',
			hint: 'Dấu <=, >=, = là ràng buộc cứng. Dấu “Mục tiêu” là mục tiêu mềm: ghi mức ưu tiên (1 là cao nhất) và trọng số cho phần thiếu (d−) và/hoặc phần vượt (d+) cần tránh.',
			columns: [{ label: 'Tên', fmt: 'text' }, ...vars.map((v) => ({ label: v, fmt: 'num' })), { label: 'Dấu', fmt: 'text', list: ['<=', '>=', '=', 'Mục tiêu'] }, { label: 'Vế phải', fmt: 'num' },
				{ label: 'Ưu tiên d−', fmt: 'int' }, { label: 'Trọng số d−', fmt: 'num' }, { label: 'Ưu tiên d+', fmt: 'int' }, { label: 'Trọng số d+', fmt: 'num' }],
			rows, firstInputCol: 1,
		};
	},
	parse({ header, rows }) {
		const nv = header.length - 7;
		if (nv < 1) throw new InputError('Bảng cần ít nhất 1 cột biến.');
		const names = header.slice(1, 1 + nv).map((h, j) => (isBlank(h) ? `x${j + 1}` : String(h)));
		const hard = [], goals = [];
		rows.forEach((r, i) => {
			if (r.slice(1).every(isBlank)) return;
			const name = isBlank(r[0]) ? `Dòng ${i + 1}` : String(r[0]);
			const a = r.slice(1, 1 + nv).map((v, j) => toNum(isBlank(v) ? 0 : v, i, 1 + j, `Hệ số ${names[j]} ở “${name}”`));
			const b = toNum(r[2 + nv], i, 2 + nv, `Vế phải của “${name}”`);
			const sign = String(r[1 + nv]).trim();
			if (isGoal(sign)) {
				const pr = (col, what) => (isBlank(r[col]) ? null : toNum(r[col], i, col, `${what} của “${name}”`));
				const pu = pr(3 + nv, 'Ưu tiên d−'), wu = pr(4 + nv, 'Trọng số d−'), po = pr(5 + nv, 'Ưu tiên d+'), wo = pr(6 + nv, 'Trọng số d+');
				if (pu === null && po === null) throw new InputError(`Mục tiêu “${name}” chưa có mức ưu tiên cho d− hoặc d+.`, i, 3 + nv);
				goals.push({ name, a, b, under: pu === null ? null : { p: pu, w: wu ?? 1 }, over: po === null ? null : { p: po, w: wo ?? 1 } });
			} else {
				const op = OPS[sign];
				if (!op) throw new InputError(`“${name}”: cột Dấu phải là <=, >=, = hoặc Mục tiêu.`, i, 1 + nv);
				hard.push({ name, a, op, b });
			}
		});
		if (!goals.length) throw new InputError('Cần ít nhất một dòng có Dấu là “Mục tiêu”.');
		return { names, hard, goals };
	},
	solve(input) { return solveGoal({ n: input.names.length, hard: input.hard, goals: input.goals }); },
	summary(res) {
		if (res.status !== 'optimal') return [{ label: 'Trạng thái', value: res.status === 'infeasible' ? 'Ràng buộc cứng mâu thuẫn' : 'Không giới nội', strong: true }];
		return [...res.x.slice(0, 6).map((x, j) => ({ label: res._names[j], value: x, fmt: 'num', strong: j === 0 })),
			...res.achieved.map((a) => ({ label: `Độ lệch ưu tiên ${a.p}`, value: a.value, fmt: 'num' }))];
	},
	report(input, res) {
		if (res.status !== 'optimal') return { title: 'Quy hoạch mục tiêu', subtitle: 'Các ràng buộc cứng không có nghiệm chung.', blocks: [] };
		const nv = input.names.length;
		const vk = input.names.map((_, j) => 'v' + j);
		return {
			title: 'Quy hoạch mục tiêu – kết quả', subtitle: 'Giải lần lượt từng mức ưu tiên; mức sau không được làm xấu kết quả mức trước.',
			blocks: [
				{ type: 'table', id: 'sol', title: 'Nghiệm', columns: [{ key: 'name', label: 'Biến', fmt: 'text', role: 'label' }, { key: 'x', label: 'Giá trị', fmt: 'num' }],
					rows: input.names.map((n, j) => ({ cells: { name: n, x: res.x[j] } })) },
				{ type: 'table', id: 'goals', title: 'Mức đạt mục tiêu', columns: [
					{ key: 'name', label: 'Mục tiêu', fmt: 'text', role: 'label' }, ...input.names.map((n, j) => ({ key: vk[j], label: n, fmt: 'num', role: 'input' })),
					{ key: 'b', label: 'Mức mong muốn', fmt: 'num', role: 'input' }, { key: 'val', label: 'Đạt được', fmt: 'num' },
					{ key: 'dm', label: 'Thiếu (d−)', fmt: 'num' }, { key: 'dp', label: 'Vượt (d+)', fmt: 'num' }, { key: 'pr', label: 'Ưu tiên phạt', fmt: 'text', role: 'label' },
				], rows: input.goals.map((g, i) => ({ highlight: (g.under && res.goals[i].under > 1e-7) || (g.over && res.goals[i].over > 1e-7), cells: {
					name: g.name, ...Object.fromEntries(g.a.map((v, j) => [vk[j], v])), b: g.b,
					val: { f: (R) => `=MMULT(${R.row('goals', i, vk[0], vk[nv - 1])},${R.col('sol', 'x')})`, v: res.goals[i].value },
					dm: { f: (R) => `=MAX(0,${R.cell('goals', i, 'b')}-${R.cell('goals', i, 'val')})`, v: res.goals[i].under },
					dp: { f: (R) => `=MAX(0,${R.cell('goals', i, 'val')}-${R.cell('goals', i, 'b')})`, v: res.goals[i].over },
					pr: [g.under ? `d− P${g.under.p}${g.under.w !== 1 ? ` ×${g.under.w}` : ''}` : '', g.over ? `d+ P${g.over.p}${g.over.w !== 1 ? ` ×${g.over.w}` : ''}` : ''].filter(Boolean).join(', '),
				} })) },
				...(input.hard.length ? [{ type: 'table', id: 'hard', title: 'Ràng buộc cứng', columns: [
					{ key: 'name', label: 'Ràng buộc', fmt: 'text', role: 'label' }, ...input.names.map((n, j) => ({ key: vk[j], label: n, fmt: 'num', role: 'input' })),
					{ key: 'op', label: 'Dấu', fmt: 'text', role: 'input' }, { key: 'b', label: 'Vế phải', fmt: 'num', role: 'input' }, { key: 'lhs', label: 'Vế trái', fmt: 'num' },
				], rows: input.hard.map((k, i) => ({ cells: { name: k.name, ...Object.fromEntries(k.a.map((v, j) => [vk[j], v])), op: k.op, b: k.b,
					lhs: { f: (R) => `=MMULT(${R.row('hard', i, vk[0], vk[nv - 1])},${R.col('sol', 'x')})`, v: res.hard[i] } } })) }] : []),
				{ type: 'table', id: 'lv', title: 'Tổng độ lệch có trọng số theo mức ưu tiên', columns: [{ key: 'p', label: 'Mức ưu tiên', fmt: 'int', role: 'label' }, { key: 'v', label: 'Tổng độ lệch', fmt: 'num' }],
					rows: res.achieved.map((a) => ({ cells: { p: a.p, v: a.value } })) },
			],
		};
	},
};
