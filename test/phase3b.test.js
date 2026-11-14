import test from 'node:test';
import assert from 'node:assert/strict';
import * as B from '../lib/ops_b.js';
import { runModel } from './phase1-forecast.test.js';

const close = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
const perms = (n) => { const out = []; const go = (a, k) => { if (k === n) { out.push(a.slice()); return; } for (let i = k; i < n; i++) { [a[k], a[i]] = [a[i], a[k]]; go(a, k + 1); [a[k], a[i]] = [a[i], a[k]]; } }; go(Array.from({ length: n }, (_, i) => i), 0); return out; };
const E = (arr) => arr.map(([a, b, w]) => ({ a, b, w }));

test('networks: MST, shortest path, max flow', () => {
	const m = runModel('networks', 'mst'); close(m.res.total, 3 + 4 + 5 + 7); assert.equal(m.res.chosen.length, 4);
	const sp = runModel('networks', 'path', { source: 'A', sink: 'E', directed: false }); close(sp.res.distance, 5 + 10 + 6); assert.deepEqual(sp.res.path, ['A', 'C', 'D', 'E']);
	const f = runModel('networks', 'flow', { source: 's', sink: 't' }); close(f.res.total, 15);
	// capacity respected and conservation at inner nodes
	const edges = E([['s', 'a', 10], ['s', 'b', 5], ['a', 'b', 15], ['a', 't', 10], ['b', 't', 10]]);
	const r = B.maxFlow(edges, 's', 't');
	edges.forEach((e, i) => assert.ok(r.flows[i] <= e.w + 1e-9));
	for (const n of ['a', 'b']) close(edges.reduce((s, e, i) => s + (e.b === n ? r.flows[i] : 0) - (e.a === n ? r.flows[i] : 0), 0), 0);
	assert.throws(() => B.mst(E([['1', '2', 1], ['3', '4', 1]]))); assert.throws(() => B.shortestPath(E([['A', 'B', 1]]), 'A', 'Z'));
	// MST total equals brute force over all spanning subsets for a small graph
	const g = E([['1', '2', 6], ['1', '3', 4], ['2', '3', 5], ['2', '4', 8], ['3', '4', 7]]);
	let best = Infinity; for (let mask = 0; mask < 1 << g.length; mask++) { const sel = g.filter((_, i) => mask & (1 << i)); if (sel.length !== 3) continue; try { const t = B.mst(sel); if (t.nodes.length === 4) best = Math.min(best, sel.reduce((s, e) => s + e.w, 0)); } catch { /* not spanning */ }}
	close(B.mst(g).total, best);
});

test('lot sizing: Wagner-Whitin equals exhaustive search and beats the heuristics', () => {
	const d = [10, 10, 15, 20, 70, 180, 250, 270, 230, 40, 0, 10], S = 100, H = 1;
	const exhaustive = (dd) => { let best = Infinity; const n = dd.length; for (let mask = 0; mask < 1 << (n - 1); mask++) { const starts = [0]; for (let i = 1; i < n; i++) if (mask & (1 << (i - 1))) starts.push(i); const o = new Array(n).fill(0); starts.forEach((s, k) => { const e = k + 1 < starts.length ? starts[k + 1] : n; o[s] = dd.slice(s, e).reduce((a, b) => a + b, 0); }); best = Math.min(best, B.lotCost(dd, o, S, H).total); } return best; };
	close(B.lotSizing('ww', d, S, H).total, exhaustive(d)); close(B.lotSizing('ww', [5, 40, 0, 25, 60, 10], S, 2).total, exhaustive.call(null, [5, 40, 0, 25, 60, 10]) * 0 + (() => { let b = Infinity; const dd = [5, 40, 0, 25, 60, 10], n = 6; for (let mask = 0; mask < 32; mask++) { const st = [0]; for (let i = 1; i < n; i++) if (mask & (1 << (i - 1))) st.push(i); const o = new Array(n).fill(0); st.forEach((s, k) => { const e = k + 1 < st.length ? st[k + 1] : n; o[s] = dd.slice(s, e).reduce((a, c) => a + c, 0); }); b = Math.min(b, B.lotCost(dd, o, S, 2).total); } return b; })());
	const all = Object.fromEntries(['l4l', 'eoq', 'poq', 'sm', 'ww'].map((k) => [k, B.lotSizing(k, d, S, H).total]));
	for (const k of ['l4l', 'eoq', 'poq', 'sm']) assert.ok(all.ww <= all[k] + 1e-9, k);
	close(all.l4l, 11 * 100);
	const m = runModel('lotsizing', 'lot'); close(m.res.total, all.ww); assert.ok(m.formulas.some((f) => f.includes('IF(') && f.includes('>0')));
});

test('scheduling: SPT minimises mean flow time, Moore minimises tardy jobs, Johnson minimises makespan', () => {
	const jobs = [{ p: 6, due: 8 }, { p: 2, due: 6 }, { p: 8, due: 18 }, { p: 3, due: 15 }, { p: 9, due: 23 }];
	const all = perms(5).map((o) => B.evaluate(jobs, o));
	close(B.evaluate(jobs, B.sequence(jobs, 'spt')).avgFlow, Math.min(...all.map((e) => e.avgFlow)));
	assert.equal(B.evaluate(jobs, B.sequence(jobs, 'moore')).nTardy, Math.min(...all.map((e) => e.nTardy)));
	close(B.evaluate(jobs, B.sequence(jobs, 'edd')).maxLate, Math.min(...all.map((e) => e.maxLate)));
	const fs = [{ a: 5, b: 2 }, { a: 1, b: 6 }, { a: 9, b: 7 }, { a: 3, b: 8 }, { a: 10, b: 4 }];
	close(B.flowShop(fs, B.johnson(fs)).makespan, Math.min(...perms(5).map((o) => B.flowShop(fs, o).makespan)));
	close(runModel('scheduling', 'two').res.makespan, B.flowShop(fs, B.johnson(fs)).makespan);
	const one = runModel('scheduling', 'one', { rule: 'spt' }); close(one.res.avgFlow, 13);
	for (const rule of ['spt', 'fcfs', 'edd', 'slack', 'lpt', 'cr', 'moore']) assert.equal(runModel('scheduling', 'one', { rule }).res.order.length, 5);
});

test('line balancing: precedence and cycle time are respected for every rule', () => {
	for (const rule of ['lot', 'mft', 'rpw', 'sot', 'lft']) {
		const m = runModel('linebalance', 'alb', { cycle: 20, rule });
		const tasks = [['A', 10, []], ['B', 11, ['A']], ['C', 5, ['B']], ['D', 4, ['B']], ['E', 12, ['A']], ['F', 3, ['C', 'D']], ['G', 7, ['F']], ['H', 11, ['E']], ['I', 3, ['G', 'H']]];
		const st = Object.fromEntries(tasks.map(([id], i) => [id, m.res.station[i]]));
		for (const [id, , pre] of tasks) for (const p of pre) assert.ok(st[p] <= st[id], `${rule}: ${p} after ${id}`);
		m.res.stations.forEach((s) => assert.ok(s.used <= 20 + 1e-9));
		assert.ok(m.res.stations.length >= m.res.minStations); close(m.res.total, 66);
	}
	assert.throws(() => B.lineBalance([{ id: 'A', time: 30, pre: [] }], 20, 'lot'));
});

test('layout: enumeration is optimal and pairwise exchange never worsens the layout', () => {
	const flow = [[0, 10, 5, 0], [10, 0, 2, 6], [5, 2, 0, 1], [0, 6, 1, 0]], dist = [[0, 1, 2, 3], [1, 0, 1, 2], [2, 1, 0, 1], [3, 2, 1, 0]];
	const e = B.layoutEnumerate(flow, dist); assert.equal(e.evaluated, 24);
	const all = perms(4).map((loc) => flow.reduce((s, row, i) => s + row.reduce((t, f, j) => t + f * dist[loc[i]][loc[j]], 0), 0));
	close(e.cost, Math.min(...all));
	const p = B.layoutPairwise(flow, dist); assert.ok(p.cost <= p.initial + 1e-9 && p.cost >= e.cost - 1e-9);
	close(runModel('layout', 'layout', { method: 'enum' }).res.cost, e.cost); runModel('layout', 'layout', { method: 'pair' });
});
