// Helper for "scalar" models: a handful of numbers in, a handful of results out.
// The input table is two columns (Tham số | Giá trị); results are written with live formulas where given.
import { InputError } from '../core/errors.js';
import { toNum, isBlank } from './common.js';

// spec: { items:[{key,label,default,fmt,min,max}], compute(v,p)->out, outputs:[{key,label,fmt,f?,strong?,hide?(out)}], sheet, title, hint, tables?(v,out,p)->blocks, validate?(v,p) }
export function scalarModel(spec) {
	return {
		inputTable(d, m, sample) {
			return {
				title: spec.title, sheet: spec.sheet, hint: spec.hint || 'Điền giá trị vào cột màu vàng.',
				columns: [{ label: 'Tham số', fmt: 'text' }, { label: 'Giá trị', fmt: 'num' }],
				rows: spec.items.map((it) => [it.label, sample ? it.default : '']), firstInputCol: 1,
			};
		},
		parse({ rows }, m, p) {
			const v = {};
			spec.items.forEach((it, i) => {
				const r = rows[i];
				if (!r || isBlank(r[1])) {
					if (it.optional) { v[it.key] = it.fallback ?? null; return; }
					throw new InputError(`Chưa nhập “${it.label}”.`, i, 1);
				}
				const x = toNum(r[1], i, 1, it.label);
				if (it.min !== undefined && x < it.min) throw new InputError(`“${it.label}” phải ≥ ${it.min}.`, i, 1);
				if (it.max !== undefined && x > it.max) throw new InputError(`“${it.label}” phải ≤ ${it.max}.`, i, 1);
				if (it.positive && !(x > 0)) throw new InputError(`“${it.label}” phải lớn hơn 0.`, i, 1);
				v[it.key] = x;
			});
			if (spec.validate) { const bad = spec.validate(v, p); if (bad) throw new InputError(bad.message, bad.row ?? null, 1); }
			return { v };
		},
		solve(inp, m, p) {
			try { return spec.compute(inp.v, p); } catch (e) { if (e instanceof InputError) throw e; throw new InputError(e.message); }
		},
		summary(res) {
			return spec.outputs.filter((o) => !(o.hide && o.hide(res)) && (res[o.key] !== undefined && res[o.key] !== null)).filter((o) => o.strong || o.show !== false).slice(0, 8)
				.map((o) => ({ label: o.label, value: res[o.key], fmt: o.fmt, strong: !!o.strong }));
		},
		report(inp, res, m, p) {
			const I = (R, k) => R.kv('in', k), O = (R, k) => R.kv('out', k);
			const outs = spec.outputs.filter((o) => !(o.hide && o.hide(res)) && res[o.key] !== undefined && res[o.key] !== null);
			const allLive = outs.every((o) => o.f);
			return {
				title: spec.title.replace(/ – dữ liệu$/, '') + ' – kết quả',
				subtitle: allLive ? 'Ô vàng là dữ liệu; ô xanh là công thức Excel, sửa ô vàng là tự tính lại.' : 'Ô vàng là dữ liệu. Ô xanh có công thức tính lại khi sửa dữ liệu; các ô còn lại là giá trị tính sẵn, hãy bấm Giải lại sau khi sửa.',
				blocks: [
					{ type: 'kv', id: 'in', title: 'Dữ liệu', items: spec.items.map((it) => ({ key: it.key, label: it.label, value: inp.v[it.key] ?? '', fmt: it.fmt || 'num', role: 'input' })) },
					{ type: 'kv', id: 'out', title: 'Kết quả', items: outs.map((o) => ({ key: o.key, label: o.label, fmt: o.fmt || 'num', value: o.f ? { f: (R) => o.f((k) => I(R, k), (k) => O(R, k), R), v: typeof res[o.key] === 'number' ? res[o.key] : undefined } : res[o.key] })) },
					...(spec.tables ? spec.tables(inp.v, res, p) : []),
				],
			};
		},
	};
}
