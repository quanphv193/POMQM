// SVG drawing of a decision tree for the task pane. Colours come from CSS variables so both themes work.
const CW = 168, RH = 52, PAD = 24, R = 11;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nf = (v) => (typeof v === 'number' ? v.toLocaleString('vi-VN', { maximumFractionDigits: 2 }) : '');

export function treeSvg(layout) {
	const pos = new Map(layout.nodes.map((n) => [n.id, { x: PAD + n.x * CW, y: PAD + n.y * RH, n }]));
	const W = PAD * 2 + (layout.cols - 1) * CW + 80, H = PAD * 2 + (layout.rows - 1) * RH + 16;
	const edges = layout.edges.map((e) => {
		const a = pos.get(e.from), b = pos.get(e.to), mx = (a.x + R + b.x - R) / 2, my = (a.y + b.y) / 2;
		const cls = e.best ? 'best' : e.onPath ? 'path' : '';
		const label = [e.name, e.prob !== null && e.prob !== undefined ? `p=${nf(e.prob)}` : '', e.value ? nf(e.value) : ''].filter(Boolean).join(' · ');
		return `<path class="edge ${cls}" d="M${a.x + R},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x - R},${b.y}"/>` +
			`<text class="elabel ${cls}" x="${(a.x + R + 6)}" y="${(a.y + b.y) / 2 === a.y ? a.y - 5 : b.y - 5}" >${esc(label)}</text>`;
	}).join('');
	const nodes = layout.nodes.map((nd) => {
		const { x, y } = pos.get(nd.id);
		const shape = nd.type === 'decision' ? `<rect class="node dec" x="${x - R}" y="${y - R}" width="${R * 2}" height="${R * 2}" rx="2"/>` : nd.type === 'chance' ? `<circle class="node chance" cx="${x}" cy="${y}" r="${R}"/>` : `<rect class="node end" x="${x - 4}" y="${y - 4}" width="8" height="8" rx="4"/>`;
		const txt = nd.type === 'end' ? '' : `<text class="nlabel" x="${x}" y="${y - R - 4}" text-anchor="middle">${esc(nf(nd.ev))}</text>`;
		return `${shape}${txt}<title>${esc(nd.id)}: ${esc(nf(nd.ev))}</title>`;
	}).join('');
	return `<svg class="tree" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Cây quyết định">${edges}${nodes}</svg>`;
}
