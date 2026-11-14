// Layout of a rolled-back decision tree (see dtree.js rollback): leaves take consecutive rows,
// internal nodes sit at the mean row of their children, depth gives the column.
export function treeLayout(res, branches) {
	const { root, out, type, ev, depth, onPath } = res;
	const y = new Map();
	let leaf = 0;
	const place = (n) => {
		const kids = out.get(n) || [];
		if (!kids.length) { y.set(n, leaf++); return; }
		kids.forEach((b) => place(b.to));
		y.set(n, kids.reduce((s, b) => s + y.get(b.to), 0) / kids.length);
	};
	place(root);
	const nodes = [...type.keys()].map((id) => ({ id, type: type.get(id), x: depth.get(id), y: y.get(id), ev: ev.get(id) }));
	const edges = branches.map((b) => ({ from: b.from, to: b.to, name: b.name, prob: b.prob, value: b.value, best: onPath.has(b) && type.get(b.from) === 'decision', onPath: onPath.has(b) }));
	return { nodes, edges, cols: Math.max(...nodes.map((n) => n.x)) + 1, rows: Math.max(1, leaf), root };
}
