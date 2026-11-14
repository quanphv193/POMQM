import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULES } from '../src/modules/index.js';
import { runModel } from './phase1-forecast.test.js';
import * as inv from '../lib/inventory.js';
import * as Q from '../lib/queue.js';
import * as T from '../lib/transport.js';
import { assign } from '../lib/assign.js';
import { normInv, Phi, binomCdf, describe } from '../lib/stats.js';

const close = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
const val = (res, key) => res[key];

test('every model of every module runs on its sample and produces clean formulas', () => {
	let count = 0;
	for (const [id, mod] of Object.entries(MODULES)) for (const model of mod.models) {
		const m = runModel(id, model.id);
		assert.ok(m.summary.length > 0, `${id}.${model.id}: empty summary`);
		assert.ok(m.lay.ops.length > 3, `${id}.${model.id}: empty report`);
		count++;
	}
	assert.ok(count >= 60, `only ${count} models`);
});

test('inventory: EOQ, POQ, shortage, discount, kanban, ROP', () => {
	let m = runModel('inventory', 'eoq'); close(val(m.res, 'Q'), 200); close(m.res.N, 5); close(m.res.T, 50); close(m.res.total, 100);
	assert.ok(m.formulas.some((f) => f.startsWith('=SQRT(2*')));
	m = runModel('inventory', 'poq'); close(m.res.Q, Math.sqrt(80000)); close(m.res.Imax, Math.sqrt(80000) / 2);
	m = runModel('inventory', 'shortage'); close(m.res.Q, Math.sqrt(50000)); close(m.res.Smax, Math.sqrt(50000) * 0.8); close(m.res.back + m.res.Smax, m.res.Q);
	m = runModel('inventory', 'discount'); close(m.res.best.Q, 1000); close(m.res.best.price, 4.8); close(m.res.best.total, 24725);
	m = runModel('inventory', 'kanban'); close(m.res.N, 500 * 0.12 * 1.1 / 22); assert.equal(m.res.Nup, 3);
	m = runModel('inventory', 'ropNormal'); close(m.res.z, 1.6448536, 1e-6); close(m.res.rop, 350 + 1.6448536 * 10, 1e-4);
});

test('inventory: ABC classes and discrete ROP minimise cost', () => {
	const m = runModel('inventory', 'abc');
	close(m.res.rows.reduce((s, r) => s + r.share, 0), 1);
	assert.equal(m.res.rows[0].cls, 'A'); assert.equal(m.res.rows[m.res.rows.length - 1].cls, 'C');
	assert.ok(m.res.rows.every((r, i, a) => i === 0 || a[i - 1].vol >= r.vol));
	const d = runModel('inventory', 'ropDiscrete');
	assert.equal(d.res.best.total, Math.min(...d.res.rows.map((r) => r.total)));
	const mean = 30 * 0.2 + 40 * 0.2 + 50 * 0.3 + 60 * 0.2 + 70 * 0.1;
	close(d.res.mean, mean);
	const r60 = d.res.rows.find((r) => r.rop === 60); close(r60.expShort, 0.1 * 10); close(r60.stockCost, 1 * 40 * 6);
});

test('queues: textbook M/M/1, M/M/s, M/D/1, M/G/1, M/Ek/1', () => {
	const a = Q.mm1(2, 3); close(a.L, 2); close(a.Lq, 4 / 3); close(a.W, 1); close(a.Wq, 2 / 3); close(a.rho, 2 / 3);
	const b = Q.mms(2, 3, 2); close(b.P0, 0.5); close(b.Lq, 1 / 12); close(b.L, 1 / 12 + 2 / 3); close(b.Wq, 1 / 24);
	close(Q.md1(2, 3).Lq, 2 / 3); close(Q.mek1(2, 3, 2).Lq, 1); close(Q.mg1(2, 3, 0.2).Lq, (4 * 0.04 + 4 / 9) / (2 / 3));
	close(Q.mg1(2, 3, 1 / 3).Lq, Q.mm1(2, 3).Lq, 1e-9); // sigma = 1/mu is the exponential case
	assert.throws(() => Q.mm1(3, 3)); assert.throws(() => Q.mms(7, 3, 2));
});

test('finite queues agree with closed forms', () => {
	close(Q.finiteQueue(2, 3, 1, 400).L, Q.mm1(2, 3).L, 1e-6);
	close(Q.finiteQueue(2, 3, 2, 400).Lq, Q.mms(2, 3, 2).Lq, 1e-6);
	const k1 = Q.finiteQueue(2, 3, 1, 1); close(k1.P0, 0.6); close(k1.Pblock, 0.4); close(k1.lamEff, 1.2);
	const p1 = Q.finitePop(0.1, 0.5, 1, 1); close(p1.P0, 1 / 1.2);
	// sample uses mu = 3: expected number in service equals lamEff / mu
	for (const id of ['mm1k', 'mmsk', 'mm1n', 'mmsn']) { const m = runModel('queue', id); close(m.res.L - m.res.Lq, m.res.lamEff / 3, 1e-9); assert.ok(m.res.W > 0 && m.res.Wq >= 0); }
});

test('transportation (Heizer): NW 4200, min-cost 4100, Vogel 3900, optimum 3900', () => {
	const c = [[5, 4, 3], [8, 4, 3], [9, 7, 5]], s = [100, 300, 300], d = [300, 200, 200];
	close(T.northwest(c, s, d).cost, 4200); close(T.minCost(c, s, d).cost, 4100); close(T.vogel(c, s, d).cost, 3900); close(T.optimalTransport(c, s, d).cost, 3900);
	const m = runModel('transport', 'trans', { method: 'nw' }); close(m.res.opt.cost, 3900); close(m.res.init.cost, 4200);
	const u = T.balance(c, [100, 300, 300], [300, 200, 100]); assert.equal(u.dummy, 'col'); assert.equal(u.demand.length, 4);
	const un = T.optimalTransport(u.cost, u.supply, u.demand); close(un.x.reduce((a, r) => a + r.reduce((b, v) => b + v, 0), 0), 700);
	const mx = T.optimalTransport([[4, 6], [5, 3]], [10, 10], [10, 10], 'max'); close(mx.cost, 4 * 0 + 6 * 10 + 5 * 10);
});

test('assignment: Hungarian equals brute force (min and max, rectangular)', () => {
	const brute = (a, sense) => {
		const n = a.length, m = a[0].length, best = { v: sense === 'max' ? -Infinity : Infinity };
		const go = (i, used, sum) => { if (i === n) { if (sense === 'max' ? sum > best.v : sum < best.v) best.v = sum; return; } for (let j = 0; j < m; j++) if (!(used & (1 << j))) go(i + 1, used | (1 << j), sum + a[i][j]); };
		go(0, 0, 0); return best.v;
	};
	const cases = [[[11, 14, 6], [8, 10, 11], [9, 12, 7]], [[9, 2, 7, 8], [6, 4, 3, 7], [5, 8, 1, 8], [7, 6, 9, 4]], [[3, 8, 2, 10, 3], [8, 7, 2, 9, 7], [6, 4, 2, 7, 5], [8, 4, 2, 3, 5], [9, 10, 6, 9, 10]], [[4, 2, 8], [3, 7, 5]]];
	for (const a of cases) for (const sense of ['min', 'max']) close(assign(a, sense).cost, brute(a, sense), 1e-9);
	close(assign(cases[0]).cost, 25);
	const m = runModel('assign', 'assign'); close(m.res.cost, 25); assert.ok(m.formulas.some((f) => f.startsWith('=SUMPRODUCT(')));
});

test('breakeven, crossover and multiproduct', () => {
	let m = runModel('breakeven', 'cost'); close(m.res.bq, 2000); close(m.res.brev, 17000); close(m.res.profit, 5000);
	m = runModel('breakeven', 'cross'); close(m.res.cross[0].q, 300); assert.equal(m.res._names[m.res.best], 'Tự sản xuất');
	m = runModel('breakeven', 'multi'); close(m.res.wc, 0.5 * (1 - 3.2 / 6.9) + 0.3 * (1 - 0.5 / 1.5) + 0.2 * (1 - 1.6 / 3)); close(m.res.rev, 15000 / m.res.wc);
});

test('location: factor rating, center of gravity, cost-volume', () => {
	let m = runModel('location', 'cog'); close(m.res.cx, 1400); close(m.res.cy, 6400000 / 9000, 1e-6);
	m = runModel('location', 'factor');
	const w = [0.25, 0.2, 0.2, 0.15, 0.2], sc = [[70, 60, 85], [80, 90, 50], [85, 80, 60], [90, 75, 55], [40, 85, 80]];
	[0, 1, 2].forEach((j) => close(m.res.total[j], w.reduce((a, x, i) => a + x * sc[i][j], 0)));
	assert.equal(m.res._sites[m.res.best], 'Địa điểm B');
	m = runModel('location', 'costvol'); close(m.res.cross[0].q, 300);
});

test('quality: charts, capability, sampling', () => {
	let m = runModel('quality', 'xbar'); assert.equal(m.res.n, 5); close(m.res.A2, 0.577); close(m.res.xbar.ucl - m.res.xx, 0.577 * m.res.rbar);
	m = runModel('quality', 'p', { n: 100, z: 3 }); close(m.res.pbar, 71 / 2000, 1e-9); close(m.res.ucl, m.res.pbar + 3 * Math.sqrt(m.res.pbar * (1 - m.res.pbar) / 100));
	m = runModel('quality', 'c'); close(m.res.cbar, 155 / 15, 1e-9); close(m.res.lcl, Math.max(0, m.res.cbar - 3 * Math.sqrt(m.res.cbar)));
	m = runModel('quality', 'cp'); close(m.res.cp, 1); close(m.res.cpk, 0.5 / 0.6, 1e-9); close(m.res.cpl, 0.7 / 0.6, 1e-9);
	m = runModel('quality', 'plan'); close(m.res.alpha, 1 - binomCdf(98, 4, 0.02), 1e-9); close(m.res.beta, binomCdf(98, 4, 0.08), 1e-9);
	assert.ok(m.res.alpha <= 0.05 && m.res.beta <= 0.10); // the sample plan meets the usual 5% / 10% risks
	m = runModel('quality', 'oc'); close(m.res.pts[0].pa, 1); assert.ok(m.res.aoql > 0 && m.res.aoql < 0.05);
});

test('statistics: normal, inverse normal, binomial, Poisson, exponential, descriptive', () => {
	let m = runModel('stats', 'normal'); close(m.res.pBelow1, Phi(-1)); close(m.res.pBetween, Phi(20 / 15) - Phi(-1), 1e-12); close(m.res.pBelow1, 0.1586553, 1e-6);
	m = runModel('stats', 'invnormal'); close(m.res.x, 100 + 15 * 1.6448536, 1e-4);
	close(Phi(normInv(0.123)), 0.123, 1e-12); close(normInv(0.975), 1.959964, 1e-5);
	m = runModel('stats', 'binom'); close(m.res.pmf, 210 * 0.3 ** 4 * 0.7 ** 6, 1e-12); close(m.res.mean, 3);
	m = runModel('stats', 'poisson'); close(m.res.pmf, Math.exp(-3) * 9 / 2, 1e-12);
	m = runModel('stats', 'expo'); close(m.res.cdf, 1 - Math.exp(-1), 1e-12);
	m = runModel('stats', 'raw'); close(m.res.mean, 15.5); close(m.res.median, 15.5); close(describe([1, 2, 3, 4]).varS, 5 / 3);
});
