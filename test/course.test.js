// Exercises from the course "Phân tích định lượng Marketing" (HUTECH), solved through the add-in's own modules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULES } from '../src/modules/index.js';
import { forecast } from '../lib/forecast.js';
import * as F from '../lib/finance.js';

const close = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
// run a module model on explicit table rows (like a student typing into the input table)
function solveWith(modId, modelId, header, rows, params = {}) {
	const mod = MODULES[modId], model = mod.models.find((m) => m.id === modelId);
	const p = { ...Object.fromEntries(model.params.map((x) => [x.id, x.default])), ...params };
	const inp = mod.parse({ header, rows }, model, p);
	const res = mod.solve(inp, model, p);
	return { inp, res, summary: mod.summary(res, model, p) };
}
const KV = ['Tham số', 'Giá trị'];

test('forecasting workbook (BÀI TẬP DỰ BÁO): exponential smoothing α=0.1 and 0.5', () => {
	const y = [405, 450, 440, 380, 370, 430, 450, 461, 410, 400, 450];
	let r = forecast(y, 'es', { alpha: 0.1 }); close(r.next, 418.16, 5e-3); close(r.mad, 32.17, 5e-3);
	r = forecast(y, 'es', { alpha: 0.5 }); close(r.next, 431.91, 5e-3); close(r.mad, 36.10, 5e-3);
});

test('finance exercises 1, 2, 3, 5, 8, 9, 10, 18, 24, 25', () => {
	close(F.effective(0.12, 2), 0.1236, 1e-6); close(F.effective(0.12, 4), 0.125509, 1e-6); close(F.effective(0.12, 12), 0.126825, 1e-6); close(F.effective(0.12, 365), 0.127475, 1e-6);
	close(F.pmtFromPV(450, 0.08, 25), 42.157, 1e-2);                            // bài 2
	close(F.pmtFromFV(500, 0.06, 10), 37.934, 1e-2);                            // bài 3
	close(F.pmtFromFV(30, 0.135, 10), 30 * 0.135 / (1.135 ** 10 - 1), 1e-9);    // bài 5
	close(F.fvFactor(0.14, 30, 1) * 0.5, 0.5 * 1.14 * (1.14 ** 30 - 1) / 0.14, 1e-6); // bài 8 (deposits at the start of each year, million)
	const nine = solveWith('finance', 'loan', KV, [['Số tiền vay', 500], ['Lãi suất', 0.12], ['Số kỳ', 5], ['Thời điểm', 0]]); close(nine.res.pmt, 138.7049, 1e-3); close(nine.res.rows[0].interest, 60);
	const due = solveWith('finance', 'loan', KV, [['Số tiền vay', 500], ['Lãi suất', 0.12], ['Số kỳ', 5], ['Thời điểm', 1]]); close(due.res.pmt, nine.res.pmt / 1.12, 1e-6); close(due.res.rows[4].close, 0, 1e-6);
	const ten = F.amortize(100, 0.10, 3), tenHalf = F.amortize(100, 0.05, 6);       // bài 10: annual vs half-yearly
	close(ten.pmt, 40.2115, 1e-3); close(tenHalf.pmt, 19.7017, 1e-3); assert.ok(ten.totalPaid > tenHalf.totalPaid);
	close(F.pmtFromPV(30000 * 0.75, 0.01, 24), 1059.153, 1e-2);                  // bài 18
	const lease = solveWith('finance', 'lease', KV, [['Giá mua', 110000], ['Chi phí hằng năm', 3000], ['Giá bán lại', 10000], ['Lãi suất', 0.14], ['Số năm', 8]]); close(lease.res.rentEnd, 25957, 1); close(lease.res.rentStart, 22769, 1); // bài 24
	close(F.amortize(5000, 0.12, 5).pmt, 1387.05, 1e-2);                         // bài 25
});

test('finance exercises 21, 22, 26, 27', () => {
	const e21 = solveWith('finance', 'equip', ['Phương án', 'Giá mua', 'Vận hành', 'Doanh thu', 'Tuổi thọ', 'Thanh lý'], [['Hãng A', 50, 37, 65, 5, 25]], { rate: 0.1 });
	close(e21.res.rows[0].npv, -50 + 28 * 3.790787 + 25 / 1.1 ** 5, 1e-3); assert.ok(e21.res.rows[0].npv > 0);       // bài 21: should buy
	const e22 = solveWith('finance', 'equip', ['Phương án', 'Giá mua', 'Vận hành', 'Doanh thu', 'Tuổi thọ', 'Thanh lý'], [['B', 150, 40, 70, 5, 30], ['C', 200, 45, 90, 10, 0]], { rate: 0.1 });
	assert.equal(e22.res.rows[e22.res.best].name, 'C'); assert.ok(e22.res.rows[0].eaa < e22.res.rows[1].eaa);          // bài 22: C wins on equivalent annual value
	const e23 = solveWith('finance', 'equip', ['Phương án', 'Giá mua', 'Vận hành', 'Doanh thu', 'Tuổi thọ', 'Thanh lý'], [['Khí', 8, 6, 0, 5, 0], ['Khô', 0, 13, 0, 5, 0]], { rate: 0.06 });
	assert.equal(e23.res.rows[e23.res.best].name, 'Khí');                                                              // bài 23: gas disinfectant is cheaper
	const flows = [-5, 0.352 + 1, 0.355 + 1, 0.258 + 1, 0.4 + 1, 0.42 + 1];                                            // bài 26 (profit + depreciation)
	close(F.payback(flows), 3 + (5 - (1.352 + 1.355 + 1.258)) / 1.4, 1e-9); // cumulative 3.965 after year 3, 5.365 after year 4 → 3.739 years
	const pr = solveWith('finance', 'projects', ['Kỳ', 'S', 'L'], [[0, -30, -30], [1, 20, 8], [2, 20, 8], [3, 0, 8], [4, 0, 8], [5, 0, 8], [6, 0, 8]], { rate: 0.1, maxRate: 0.2, step: 0.1 });
	close(pr.res.per[0].npv, -30 + 20 / 1.1 + 20 / 1.21, 1e-9); close(pr.res.per[1].npv, -30 + 8 * F.pvFactor(0.1, 6), 1e-9);
	close(pr.res.per[0].prof[0], 10, 1e-9);                                                                              // at 0%: NPV(S) = 10, NPV(L) = 18
	close(pr.res.per[1].prof[0], 18, 1e-9); assert.ok(pr.res.cross > 0 && pr.res.cross < 0.2);                           // Fisher crossover lies between 0% and 20%
});

test('finance exercise 28: both readings of the tax rule are available', () => {
	const hdr = KV, rows = [['Vốn đầu tư', 1250000], ['Tuổi thọ', 5], ['Thanh lý', 250000], ['Vốn lưu động', 100000], ['Doanh thu năm 1', 1000000], ['Tăng trưởng', 0.1], ['Biến phí', 0.5], ['Định phí', 150000], ['Thuế', 0.4], ['Lãi suất 1', 0.12], ['Lãi suất 2', 0.24]];
	const a = solveWith('finance', 'tax', hdr, rows, { salvageTax: 'none' }); close(a.res.npv1, 205727, 1500); close(a.res.npv2, -192370, 100); close(a.res.irrInterp, 0.182, 1e-3);
	const b = solveWith('finance', 'tax', hdr, rows, { salvageTax: 'all' }); close(b.res.npv1, 148109.57, 1); close(b.res.npv2, -226514.25, 1);
});

test('decision lecture (bài 3, ví dụ 2): posterior probabilities feed the tree', () => {
	const r = solveWith('decision', 'bayes', ['Trạng thái', 'Tiên nghiệm', 'T1', 'T2'], [['E1', 0.6, 0.7, 0.3], ['E2', 0.4, 0.2, 0.8]]);
	close(r.res.marg[0], 0.6 * 0.7 + 0.4 * 0.2); close(r.res.post[0][0], 0.42 / 0.5);
});

test('regression lecture example (income vs consumption): ANOVA, t, F, intervals', () => {
	const rows = [[80, 70], [100, 65], [120, 90], [140, 95], [160, 110], [180, 115], [200, 120], [220, 140], [240, 155], [260, 150]];
	const r = solveWith('forecast', 'linreg', ['Thu nhập X', 'Tiêu dùng Y'], rows, { xNext: 100, conf: 0.95 });
	close(r.res.b[0], 24.4545, 1e-4); close(r.res.b[1], 0.5091, 1e-4); close(r.res.F, 202.87, 1e-2); close(r.res.r2, 0.9621, 1e-4); assert.ok(r.res.sigF < 1e-5);
	close(r.res.elasticity, 0.5091 * 170 / 111, 1e-3); assert.ok(r.res.pint.predLo < 75.36 && r.res.pint.predHi > 75.36);
});
