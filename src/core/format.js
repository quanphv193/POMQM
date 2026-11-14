// Excel number-format codes (en-US syntax; Excel shows them in the user's locale).
export function numFmt(fmt, decimals = 2) {
	const d = Math.max(0, Math.min(6, decimals | 0));
	const dec = d ? '.' + '0'.repeat(d) : '';
	switch (fmt) {
		case 'int': return '0';
		case 'money': return '#,##0';
		case 'pct': return '0.' + '0'.repeat(Math.max(1, d - 1)) + '%';
		case 'num': return '#,##0' + dec;
		case 'prob': return '0.0000';
		default: return 'General';
	}
}

// Same formats for the task pane (vi-VN).
export function fmtValue(v, fmt, decimals = 2) {
	if (v === null || v === undefined || v === '') return '–';
	if (typeof v !== 'number') return String(v);
	if (!Number.isFinite(v)) return '–';
	const nf = (min, max) => v.toLocaleString('vi-VN', { minimumFractionDigits: min, maximumFractionDigits: max });
	switch (fmt) {
		case 'int': return nf(0, 0);
		case 'money': return nf(0, 0);
		case 'pct': return (v * 100).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: Math.max(1, decimals - 1) }) + ' %';
		case 'prob': return nf(4, 4);
		default: return nf(0, decimals);
	}
}

export function colLetter(c) {
	let s = '';
	c += 1;
	while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); }
	return s;
}
export const addr = (r, c) => colLetter(c) + (r + 1);
