import { InputError } from '../core/errors.js';

export const isBlank = (v) => v === '' || v === null || v === undefined;
export function toNum(v, row, col, what) {
	if (typeof v === 'number' && Number.isFinite(v)) return v;
	if (typeof v === 'string' && v.trim() !== '') {
		const n = Number(v.trim().replace(/\s/g, '').replace(',', '.'));
		if (Number.isFinite(n)) return n;
	}
	throw new InputError(`${what} phải là số.`, row, col);
}
export const dropBlankRows = (rows) => rows.map((r, i) => ({ r, i })).filter(({ r }) => r.some((v) => !isBlank(v)));
