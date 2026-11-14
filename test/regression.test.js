import test from 'node:test';
import assert from 'node:assert/strict';
import { runModel } from './phase1-forecast.test.js';
import { regression } from '../lib/forecast2.js';
const close = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);

import { coefCI, predictInterval } from '../lib/forecast2.js';
import { tCrit, tTwoSided, fRightTail } from '../lib/stats.js';

test('regression inference matches the classic income–consumption example (ANOVA, t, p, CI, prediction interval)', () => {
	const X = [80, 100, 120, 140, 160, 180, 200, 220, 240, 260].map((v) => [v]), Y = [70, 65, 90, 95, 110, 115, 120, 140, 155, 150];
	const r = regression(X, Y);
	close(r.b[0], 24.4545, 1e-4); close(r.b[1], 0.5091, 1e-4); close(r.r2, 0.9621, 1e-4);
	close(r.seb[0], 6.4138, 1e-4); close(r.seb[1], 0.0357, 1e-4); close(r.t[1], 14.243, 1e-3); close(r.F, 202.87, 1e-2); close(r.F, r.t[1] ** 2, 1e-9);
	close(r.ssr + r.sse, r.sst, 1e-9); close(r.sigF, r.p[1], 1e-12); assert.ok(r.sigF < 1e-5);
	const ci = coefCI(r, 0.95); close(ci[1].lo, 0.4268, 2e-4); close(ci[1].hi, 0.5914, 2e-4);
	const pi = predictInterval(r, [100], 0.95); close(pi.yhat, 24.4545 + 50.91, 0.01); assert.ok(pi.predLo < pi.meanLo && pi.predHi > pi.meanHi);
	close(tCrit(0.05, 8), 2.3060, 1e-4); close(tCrit(0.05, 4), 2.7764, 1e-4); close(fRightTail(7.7086, 1, 4), 0.05, 2e-4); close(tTwoSided(4.1633, 4), 0.0141, 1e-4);
	// Heizer's Nodel example (also in the course): F = r²/(1−r²)·(n−2)
	const n = regression([[1], [3], [4], [2], [1], [7]], [2, 3, 2.5, 2, 2, 3.5]); close(n.F, n.r2 / (1 - n.r2) * 4, 1e-9);
});

test('regression modules expose ANOVA, coefficient tests, intervals and elasticity as live formulas', () => {
	const s = runModel('forecast', 'linreg', { xNext: 6, conf: 0.95 });
	assert.ok(s.formulas.some((f) => f.startsWith('=F.DIST.RT(')) && s.formulas.some((f) => f.startsWith('=T.DIST.2T(')) && s.formulas.some((f) => f.includes('T.INV.2T(')) && s.formulas.some((f) => f.startsWith('=DEVSQ(')));
	close(s.res.elasticity, s.res.b[1] * 3 / 2.5, 1e-6); close(s.res.conf, 0.95); assert.ok(s.res.pint.predHi > s.res.pint.meanHi);
	const m = runModel('forecast', 'multreg', { xNew: '1900; 35', conf: 0.9 });
	assert.ok(m.formulas.some((f) => f.startsWith('=F.DIST.RT(')) && m.formulas.some((f) => f.startsWith('=T.DIST.2T('))); close(m.res.conf, 0.9);
	close(m.res.ssr + m.res.sse, m.res.sst, 1e-3); assert.equal(m.res.df, 11);
});
