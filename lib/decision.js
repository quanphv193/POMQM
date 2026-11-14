// Decision analysis on a payoff table. payoff[i][j] = outcome of alternative i under state j.
export function decide({ payoff, probs, alpha = 0.5, sense = 'profit' }) {
	const m = payoff.length, n = payoff[0].length;
	if (payoff.some((r) => r.length !== n)) throw new Error('Các dòng phải có cùng số cột.');
	const better = sense === 'cost' ? Math.min : Math.max;
	const worse = sense === 'cost' ? Math.max : Math.min;
	const pickBest = (vals) => vals.indexOf(better(...vals));

	const maximax = payoff.map((r) => better(...r));
	const maximin = payoff.map((r) => worse(...r));
	const hurwicz = payoff.map((r) => alpha * better(...r) + (1 - alpha) * worse(...r));
	const laplace = payoff.map((r) => r.reduce((a, b) => a + b, 0) / n);
	const bestPerState = Array.from({ length: n }, (_, j) => better(...payoff.map((r) => r[j])));
	const regret = payoff.map((r) => r.map((v, j) => Math.abs(bestPerState[j] - v)));
	const maxRegret = regret.map((r) => Math.max(...r));
	const minimaxRegret = pickBest(maxRegret.map((v) => -v)); // smallest max regret
	const out = {
		criteria: [
			{ name: sense === 'cost' ? 'Minimin (lạc quan)' : 'Maximax (lạc quan)', values: maximax, best: pickBest(maximax) },
			{ name: sense === 'cost' ? 'Minimax (bi quan)' : 'Maximin (bi quan)', values: maximin, best: pickBest(maximin) },
			{ name: `Hurwicz (α=${alpha})`, values: hurwicz, best: pickBest(hurwicz) },
			{ name: 'Laplace (đồng xác suất)', values: laplace, best: pickBest(laplace) },
			{ name: 'Minimax regret (max tiếc nuối)', values: maxRegret, best: minimaxRegret },
		],
		regret,
	};
	if (probs) {
		if (probs.length !== n) throw new Error('Số xác suất phải bằng số trạng thái.');
		const sp = probs.reduce((a, b) => a + b, 0);
		if (Math.abs(sp - 1) > 1e-6) throw new Error('Tổng xác suất phải bằng 1 (hiện là ' + sp + ').');
		const emv = payoff.map((r) => r.reduce((s, v, j) => s + v * probs[j], 0));
		const best = pickBest(emv);
		const evwpi = bestPerState.reduce((s, v, j) => s + v * probs[j], 0);
		out.emv = { values: emv, best, evwpi, evpi: Math.abs(evwpi - emv[best]) };
	}
	return out;
}
