import test from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../lib/finance.js';
import { MODULES } from '../src/modules/index.js';
import { runModel } from './phase1-forecast.test.js';

const close = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);

test('rates: effective rate 12% nominal compounded quarterly, FV of 3 million over 2 years', () => {
	const m = runModel('finance', 'rates'); close(m.res.eff, 0.12550881, 1e-7); close(m.res.fv, 3000000 * 1.03 ** 8, 1e-3); close(m.res.simple, 3000000 * 1.24);
	assert.ok(m.formulas.some((f) => f.includes('^(')));
	close(F.nominalOf(F.effective(0.12, 12), 12), 0.12, 1e-12);
});

test('FV / PV / rate / periods: exactly one blank is solved (bài 11: 1000 → 1311 in 4 years = 7%)', () => {
	close(runModel('finance', 'fvpv').res.rOut, 0.07, 1e-4);
	const mod = MODULES.finance, model = mod.models.find((x) => x.id === 'fvpv');
	const t = { header: ['Tham số', 'Giá trị'], rows: [['PV', 1000], ['FV', ''], ['r', 0.07], ['n', 4]] };
	close(mod.solve(mod.parse(t, model, {}), model, {}).fvOut, 1000 * 1.07 ** 4);
	t.rows[0][1] = 1000; t.rows[1][1] = 1311; t.rows[2][1] = 0.07; t.rows[3][1] = '';
	close(mod.solve(mod.parse(t, model, {}), model, {}).nOut, Math.log(1.311) / Math.log(1.07), 1e-9);
	assert.throws(() => { t.rows[3][1] = 4; mod.parse(t, model, {}); }, /đúng một/);
});

test('annuities and payments (bài 2: 450M at 8% over 25 years; bài 3: sinking fund 500M)', () => {
	const m = runModel('finance', 'payment'); close(m.res.pmtPV, 450e6 * 0.08 / (1 - 1.08 ** -25), 1e-3); close(m.res.pmtFV, 500e6 * 0.08 / (1.08 ** 25 - 1), 1e-3);
	close(F.pmtFromFV(500, 0.06, 10), 37.9340, 1e-4);
	close(F.pmtFromFV(500, 0.06, 10, 1), 37.9340 / 1.06, 1e-4);
	const a = runModel('finance', 'annuity'); close(a.res.fv, 500000 * (1.14 ** 30 - 1) / 0.14, 1e-3);
	close(F.fvFactor(0.14, 30, 1), F.fvFactor(0.14, 30, 0) * 1.14, 1e-9);
	assert.ok(a.formulas.some((f) => f.startsWith('=FV(')) && a.formulas.some((f) => f.startsWith('=PV(')));
});

test('loan schedule (bài 25: 5000 at 12% for 5 years → 1387.05; ends at zero for both timings)', () => {
	const a = F.amortize(5000, 0.12, 5); close(a.pmt, 1387.0485, 1e-3); close(a.rows[0].interest, 600); close(a.rows[0].principal, 787.0485, 1e-3); close(a.rows[4].close, 0, 1e-6);
	close(a.totalInterest, 5 * a.pmt - 5000, 1e-6);
	const d = F.amortize(500, 0.12, 5, 1); close(d.rows[4].close, 0, 1e-6); close(d.pmt, F.pmtFromPV(500, 0.12, 5, 1)); assert.ok(d.pmt < F.pmtFromPV(500, 0.12, 5, 0));
	const m = runModel('finance', 'loan'); close(m.res.pmt, 500e6 * 0.12 / (1 - 1.12 ** -5), 1e-2); assert.equal(m.res.rows.length, 5);
	close(F.pmtFromPV(30000 * 0.75, 0.01, 24), 1059.1531, 1e-3); // bài 18
});

test('solving for the rate of an instalment loan (bài 17 style, bài 13 daily instalments)', () => {
	const m = runModel('finance', 'rate'); close(m.res.r, 0.017082, 1e-5); close(m.res.nom, m.res.r * 12); close(m.res.eff, (1 + m.res.r) ** 12 - 1);
	close(65 * F.pvFactor(m.res.r, 18), 1000, 1e-6);
	const r = F.rateOfAnnuity(60, 108000, 6000000); close(108000 * F.pvFactor(r, 60), 6000000, 1e-4);
	assert.throws(() => F.rateOfAnnuity(10, 50, 1000));
});

test('projects: NPV, IRR, payback, Fisher crossover, per-project rates (bài 12, 27)', () => {
	const m = runModel('finance', 'projects', { rate: 0.1, maxRate: 0.25, step: 0.05 });
	const S = [-30, 20, 20, 0, 0, 0, 0], L = [-30, 8, 8, 8, 8, 8, 8];
	close(m.res.per[0].npv, F.npvOf(0.1, S)); close(m.res.per[1].npv, F.npvOf(0.1, L), 1e-9); close(F.npvOf(m.res.per[0].irr, S), 0, 1e-8);
	const x = m.res.cross; close(F.npvOf(x, S), F.npvOf(x, L), 1e-8); assert.equal(m.res.rates.length, 6);
	// bài 12: A = 200 for 10 years then 400 for 20 years at 6%, B = 800 for 11 years at 4%  → 4034 and 7008
	const mod = MODULES.finance, model = mod.models.find((y) => y.id === 'projects');
	const rows = [['Lãi suất riêng', 0.06, 0.04], [0, 0, 0]];
	for (let t = 1; t <= 30; t++) rows.push([t, t <= 10 ? 200 : 400, t <= 11 ? 800 : 0]);
	const res = mod.solve(mod.parse({ header: ['Kỳ', 'A', 'B'], rows }, model, {}), model, { rate: 0.1, maxRate: 0.1, step: 0.05 });
	close(res.per[0].npv, 4033.8, 0.2); close(res.per[1].npv, 7008.4, 0.2);
	close(F.payback([-5, 1.352, 1.355, 1.258, 1.4, 1.42]), 3.739, 1e-3); assert.equal(F.payback([-10, 1, 1]), null);
	assert.equal(F.irrOf([-10, -5]), null);
});

test('equipment, lease and the project with tax (bài 22, 24, 28)', () => {
	const e = runModel('finance', 'equip', { rate: 0.1 });
	close(e.res.rows[0].npv, -150 + 30 * F.pvFactor(0.1, 5) + 30 / 1.1 ** 5, 1e-9); close(e.res.rows[1].npv, -200 + 45 * F.pvFactor(0.1, 10), 1e-9); assert.equal(e.res.best, 1);
	close(e.res.rows[1].eaa, e.res.rows[1].npv / F.pvFactor(0.1, 10), 1e-9);
	const l = runModel('finance', 'lease'); close(l.res.pvCost, 120411, 1); close(l.res.rentEnd, 25957, 1); close(l.res.rentStart, l.res.rentEnd / 1.14, 1e-9);
	const t = runModel('finance', 'tax', { salvageTax: 'none' }); close(t.res.npv1, 204852, 1); close(t.res.npv2, -192403, 1); close(t.res.irrInterp, 0.1819, 5e-4); close(t.res.irr, 0.1745, 5e-4);
	// the book's answer (205,727 / -192,370 / IRR 18.2%) is reproduced within 0.5% by this reading
	close(t.res.npv1, 205727, 1500);
	const t2 = runModel('finance', 'tax', { salvageTax: 'all' }); close(t2.res.npv1, 148109.57, 1); close(t2.res.npv2, -226514.25, 1); // teacher's Excel (BAI 28)
});
