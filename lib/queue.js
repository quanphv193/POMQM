// Queueing models. lambda = arrival rate, mu = service rate per server. Rates share one time unit.
const fact = (n) => { let f = 1; for (let i = 2; i <= n; i++) f *= i; return f; };
const finish = (L, Lq, W, Wq, extra) => ({ L, Lq, W, Wq, ...extra });

export function mm1(l, m) {
	if (l >= m) throw new Error('Hệ thống không ổn định: tốc độ đến phải nhỏ hơn tốc độ phục vụ (λ < μ).');
	const rho = l / m;
	return finish(l / (m - l), l * l / (m * (m - l)), 1 / (m - l), l / (m * (m - l)), { rho, P0: 1 - rho });
}
export function md1(l, m) {
	if (l >= m) throw new Error('Hệ thống không ổn định (λ < μ).');
	const rho = l / m, Lq = l * l / (2 * m * (m - l)), Wq = Lq / l;
	return finish(Lq + rho, Lq, Wq + 1 / m, Wq, { rho, P0: 1 - rho });
}
export function mg1(l, m, sd) {
	if (l >= m) throw new Error('Hệ thống không ổn định (λ < μ).');
	const rho = l / m, Lq = (l * l * sd * sd + rho * rho) / (2 * (1 - rho)), Wq = Lq / l;
	return finish(Lq + rho, Lq, Wq + 1 / m, Wq, { rho, P0: 1 - rho });
}
export function mek1(l, m, k) {
	if (l >= m) throw new Error('Hệ thống không ổn định (λ < μ).');
	const rho = l / m, Lq = (1 + k) / (2 * k) * l * l / (m * (m - l)), Wq = Lq / l;
	return finish(Lq + rho, Lq, Wq + 1 / m, Wq, { rho, P0: 1 - rho });
}
export function mms(l, m, s) {
	const a = l / m, rho = a / s;
	if (rho >= 1) throw new Error(`Hệ thống không ổn định: cần λ < s·μ (hiện ρ = ${rho.toFixed(3)}).`);
	let sum = 0;
	for (let n = 0; n < s; n++) sum += a ** n / fact(n);
	const P0 = 1 / (sum + a ** s / (fact(s) * (1 - rho)));
	const Pw = a ** s / (fact(s) * (1 - rho)) * P0;
	const Lq = Pw * rho / (1 - rho), Wq = Lq / l;
	return finish(Lq + a, Lq, Wq + 1 / m, Wq, { rho, P0, Pw });
}
// General birth-death solution for finite models. rates(n) -> [lambda_n, mu_{n+1}] for state n -> n+1.
function birthDeath(maxN, up, down, s, l) {
	const w = [1];
	for (let n = 1; n <= maxN; n++) w[n] = w[n - 1] * up(n - 1) / down(n);
	const tot = w.reduce((a, b) => a + b, 0);
	const P = w.map((v) => v / tot);
	const L = P.reduce((a, p, n) => a + n * p, 0), Lq = P.reduce((a, p, n) => a + Math.max(n - s, 0) * p, 0);
	const lamEff = P.reduce((a, p, n) => a + p * up(n), 0);
	return { P, L, Lq, lamEff, W: L / lamEff, Wq: Lq / lamEff, P0: P[0], rho: (L - Lq) / s, Pblock: P[maxN], util: (L - Lq) / s };
}
// Finite system capacity K (queue + service); s servers.
export function finiteQueue(l, m, s, K) {
	if (K < s) throw new Error('Sức chứa hệ thống K phải ≥ số quầy phục vụ.');
	const r = birthDeath(K, (n) => (n < K ? l : 0), (n) => Math.min(n, s) * m, s, l);
	return finish(r.L, r.Lq, r.W, r.Wq, { rho: r.util, P0: r.P0, Pblock: r.Pblock, lamEff: r.lamEff, P: r.P });
}
// Finite calling population N; each idle member arrives at rate l.
export function finitePop(l, m, s, N) {
	if (N < s) throw new Error('Số khách hàng tiềm năng N phải ≥ số quầy.');
	const r = birthDeath(N, (n) => (N - n) * l, (n) => Math.min(n, s) * m, s, l);
	return finish(r.L, r.Lq, r.W, r.Wq, { rho: r.util, P0: r.P0, lamEff: r.lamEff, P: r.P });
}
// Probability that n or more units are in an M/M/s system
export const probMoreThan = (l, m, s, n) => {
	const a = l / m, rho = a / s;
	let sum = 0; for (let k = 0; k < s; k++) sum += a ** k / fact(k);
	const P0 = 1 / (sum + a ** s / (fact(s) * (1 - rho)));
	let cum = 0;
	for (let k = 0; k <= n; k++) cum += k < s ? P0 * a ** k / fact(k) : P0 * a ** k / (fact(s) * s ** (k - s));
	return 1 - cum;
};
