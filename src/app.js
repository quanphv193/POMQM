/* global Office */
import { MODULES, CATALOG, inMenu } from './modules/index.js';
import { loadSettings, saveSettings, pushRecent } from './core/settings.js';
import { createInputTable, readInputTable, writeReport, selectInputCell, activateSheet, peekInputTable } from './core/excel.js';
import { InputError } from './core/errors.js';
import { fmtValue } from './core/format.js';

const app = document.getElementById('app');
const settings = loadSettings();
const state = { view: 'home', q: '', moduleId: null, modelId: null, result: null, error: null, busy: false, tableInfo: null, lastSheet: null, warnings: [], preview: null };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Diacritic-insensitive: "du an" finds "dự án".
const fold = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
const h = (strings, ...vals) => strings.reduce((a, s, i) => a + s + (i < vals.length ? vals[i] : ''), '');

Office.onReady(async () => {
	render();
	// Development only: the local server answers 200 here while a ".selftest" flag file exists.
	try {
		const flag = await fetch('/__selftest', { cache: 'no-store' });
		if (flag.ok) {
			const raw = await flag.text();
			const filter = raw.split(/\s+/).filter((t) => t && !t.startsWith('#'));
			// development only: reload the whole pane (fresh code) whenever the flag file's content changes
			setInterval(async () => { try { const r = await fetch('/__selftest', { cache: 'no-store' }); if (r.ok && (await r.text()) !== raw) location.reload(); } catch { /* server restarting */ } }, 4000);
			const { runSelfTest } = await import('./selftest.js');
			const r = await runSelfTest(filter);
			if (!r.skipped) { state.error = `Tự kiểm tra: ${r.pass} đạt, ${r.fail} lỗi (xem selftest.log).`; render(); }
		}
	} catch (e) { fetch('/__log?' + encodeURIComponent('self-test error: ' + (e && e.message))).catch(() => {}); }
});

function render() {
	app.innerHTML = state.view === 'home' ? homeView() : moduleView();
	bind();
}

// ---------- Home: searchable catalogue ----------
function homeView() {
	return h`<div class="scroll">
		<input class="search" id="q" type="search" placeholder="Tìm mô hình: dự báo, simplex, PERT…" value="${esc(state.q)}" aria-label="Tìm mô hình" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
		<div class="seg" role="group" aria-label="Bộ menu">${[['all', 'Tất cả'], ['pom', 'POM (vận hành)'], ['qm', 'QM (định lượng)']].map(([k, l]) => `<button class="segb" data-menu="${k}" aria-pressed="${settings.menu === k}">${l}</button>`).join('')}</div>
		<div id="results" style="display:grid;gap:4px">${homeResults()}</div>
	</div>
	<div class="foot settings"><span>Số chữ số thập phân</span>
		<select id="dec" aria-label="Số chữ số thập phân">${[0, 1, 2, 3, 4].map((d) => `<option ${d === settings.decimals ? 'selected' : ''}>${d}</option>`).join('')}</select></div>`;
}
function homeResults() {
	const q = fold(state.q.trim());
	const recent = settings.recent.filter((r) => MODULES[r.moduleId]?.models.some((m) => m.id === r.modelId));
	let body = '';
	if (q) {
		const hits = [];
		for (const mod of Object.values(MODULES)) for (const m of mod.models) {
			if (!inMenu(mod.id, settings.menu)) continue;
			if (fold(mod.name + ' ' + m.name + ' ' + mod.keywords).includes(q)) hits.push(modelButton(mod, m));
		}
		const soon = CATALOG.flatMap((g) => g.items).filter((it) => !it.id && fold(it.name).includes(q)).map(soonButton);
		body = hits.length || soon.length ? `<div class="list">${hits.join('')}${soon.join('')}</div>` : `<p class="empty">Không tìm thấy mô hình “${esc(state.q)}”.</p>`;
	} else {
		if (recent.length) body += `<div class="grp">Dùng gần đây</div><div class="list">${recent.map((r) => modelButton(MODULES[r.moduleId], MODULES[r.moduleId].models.find((m) => m.id === r.modelId))).join('')}</div>`;
		for (const g of CATALOG) {
			const items = g.items.filter((it) => !it.id || inMenu(it.id, settings.menu));
			if (items.length) body += `<div class="grp">${esc(g.group)}</div><div class="list">${items.map((it) => (it.id ? moduleButton(MODULES[it.id]) : soonButton(it))).join('')}</div>`;
		}
	}
	return body;
}
const moduleButton = (mod) => `<button class="item" data-mod="${mod.id}"><span>${esc(mod.name)}</span><small>${mod.models.length} mô hình</small></button>`;
const modelButton = (mod, m) => `<button class="item" data-mod="${mod.id}" data-model="${m.id}"><span>${esc(m.name)}<span class="sub">${esc(mod.name)}</span></span><small>›</small></button>`;
const soonButton = (it) => `<button class="item" disabled><span>${esc(it.name)}</span><span class="soon">Sắp có</span></button>`;

// ---------- Module view ----------
function current() {
	const mod = MODULES[state.moduleId];
	const model = mod.models.find((m) => m.id === state.modelId) || mod.models[0];
	return { mod, model };
}
function paramValues(mod, model) {
	const saved = settings.params[`${mod.id}.${model.id}`] || {};
	return Object.fromEntries(model.params.map((p) => [p.id, saved[p.id] ?? p.default]));
}
// Models that share an input layout share one table; `model.table` names the layout.
const tableKey = (mod, model) => `${mod.id}_${model.table || 'main'}`;
const dimsOf = (mod, model) => model.dims || mod.dims || [];
function dimValues(mod, model) {
	const saved = settings.dims[tableKey(mod, model)] || {};
	return Object.fromEntries(dimsOf(mod, model).map((d) => [d.id, saved[d.id] ?? d.default]));
}
function moduleView() {
	const { mod, model } = current();
	const pv = paramValues(mod, model), dv = dimValues(mod, model);
	const params = model.params.map((p) => field(p, pv[p.id])).join('');
	const dimList = dimsOf(mod, model);
	const dims = dimList.map((d) => `<div class="field"><label for="d_${d.id}">${esc(d.label)}</label><input id="d_${d.id}" data-dim="${d.id}" type="number" min="${d.min}" max="${d.max}" value="${dv[d.id]}" ${settings.sample ? 'disabled' : ''}></div>`).join('');
	const ti = state.tableInfo;
	let help = '';
	try { help = mod.inputTable(dv, model, true).hint || ''; } catch { /* no hint */ }
	return h`<div class="scroll">
		<div class="crumb"><button id="back">‹ Danh mục</button><span>/</span><b>${esc(mod.name)}</b></div>
		${mod.models.length > 1 ? `<div class="field"><label for="model">Mô hình</label><select id="model">${modelOptions(mod, model)}</select></div>` : ''}
		${model.hint ? `<p class="status">${esc(model.hint)}</p>` : ''}
		<section class="step"><h2><span class="n">1</span>Bảng nhập liệu</h2>
			${help ? `<p class="help">${esc(help)}</p>` : ''}
			<label class="check"><input type="checkbox" id="sample" ${settings.sample ? 'checked' : ''}> Điền sẵn ví dụ trong giáo trình</label>
			${dims ? `<div class="${dimList.length > 1 ? 'row2' : ''}">${dims}</div>` : ''}
			<button class="btn" id="create">Tạo bảng nhập trên sheet mới</button>
			<div class="status">${ti ? `Sẽ dùng bảng trên sheet <b>${esc(ti.sheet)}</b> (${ti.rows} dòng).` : 'Chưa có bảng nhập cho module này trong file.'}</div>
		</section>
		${params ? `<section class="step"><h2><span class="n">2</span>Tham số</h2>${params}</section>` : ''}
		${resultBlock()}
	</div>
	<div class="foot"><button class="btn p" id="solve" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Đang tính…' : 'Giải'}</button></div>`;
}
function modelOptions(mod, model) {
	const opt = (m) => `<option value="${m.id}" ${m.id === model.id ? 'selected' : ''}>${esc(m.name)}</option>`;
	const groups = [...new Set(mod.models.map((m) => m.group || ''))];
	if (groups.length < 2) return mod.models.map(opt).join('');
	return groups.map((g) => `<optgroup label="${esc(g)}">${mod.models.filter((m) => (m.group || '') === g).map(opt).join('')}</optgroup>`).join('');
}
function field(p, v) {
	const id = 'p_' + p.id;
	if (p.type === 'bool') return `<label class="check"><input type="checkbox" id="${id}" data-param="${p.id}" ${v ? 'checked' : ''}> ${esc(p.label)}</label>`;
	if (p.type === 'select') return `<div class="field"><label for="${id}">${esc(p.label)}</label><select id="${id}" data-param="${p.id}">${p.options.map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
	const type = p.type === 'list' ? 'text' : 'number';
	const attrs = p.type === 'list' ? '' : `step="${p.step ?? 1}" ${p.min !== undefined ? `min="${p.min}"` : ''} ${p.max !== undefined ? `max="${p.max}"` : ''}`;
	return `<div class="field"><label for="${id}">${esc(p.label)}</label><input id="${id}" data-param="${p.id}" type="${type}" ${attrs} value="${esc(v)}"></div>`;
}
function resultBlock() {
	if (state.error) return `<div class="err" role="alert">${esc(state.error)}</div>`;
	if (!state.result) return '';
	const { mod, model } = current();
	const rows = mod.summary(state.result, model, paramValues(mod, model)).map((s) =>
		`<div class="kv ${s.strong ? 'strong' : ''}"><span>${esc(s.label)}</span><b>${esc(fmtValue(s.value, s.fmt, settings.decimals))}</b></div>`).join('');
	return `<section class="card" aria-label="Kết quả">${rows}
		${state.preview ? `<div class="treebox">${state.preview}</div>` : ''}
		${state.lastSheet ? `<button class="link" id="open">Mở sheet “${esc(state.lastSheet)}” ›</button>` : ''}
		${state.warnings.map((w) => `<div class="warn">${esc(w)}</div>`).join('')}</section>`;
}

// ---------- Events ----------
function bind() {
	const q = document.getElementById('q');
	if (q) {
		// Only the result list is redrawn, never the input: replacing the input breaks IME (Telex/VNI) composition.
		// Results update while a Telex/VNI word is still being composed; the input itself is left alone.
		// Skipping no-op updates matters: blur ends composition, and redrawing then would swallow the click on a result.
		const update = () => { if (q.value === state.q) return; state.q = q.value; document.getElementById('results').innerHTML = homeResults(); bindItems(); };
		q.addEventListener('input', update);
		q.addEventListener('compositionend', update);
		// Keep focus in the search box while pressing a result: a blur would end IME composition,
		// redraw the list between mousedown and mouseup, and the click would be lost.
		// While a Telex/VNI word is still being composed, macOS gives the mousedown to the input method,
		// so the page only sees mouseup and no click. Open results on mouseup to cover that case.
		const res = document.getElementById('results');
		res.addEventListener('mousedown', (e) => { if (e.target.closest('[data-mod]')) e.preventDefault(); });
		res.addEventListener('mouseup', (e) => {
			const b = e.target.closest('[data-mod]');
			if (b && e.button === 0) openModule(b.dataset.mod, b.dataset.model);
		});
	}
	app.querySelectorAll('[data-menu]').forEach((b) => b.addEventListener('click', () => { settings.menu = b.dataset.menu; saveSettings(settings); render(); }));
	document.getElementById('dec')?.addEventListener('change', (e) => { settings.decimals = +e.target.value; saveSettings(settings); });
	bindItems();
	document.getElementById('back')?.addEventListener('click', () => { Object.assign(state, { view: 'home', result: null, error: null }); render(); });
	document.getElementById('model')?.addEventListener('change', async (e) => {
		const { mod } = current();
		state.modelId = e.target.value; state.result = null; state.preview = null; state.error = null; state.tableInfo = null; render();
		const { model } = current();
		state.tableInfo = await peekInputTable(tableKey(mod, model));
		render();
	});
	document.getElementById('sample')?.addEventListener('change', (e) => { settings.sample = e.target.checked; saveSettings(settings); render(); });
	app.querySelectorAll('[data-param]').forEach((el) => el.addEventListener('change', () => { storeParam(el.dataset.param, el); }));
	app.querySelectorAll('[data-dim]').forEach((el) => el.addEventListener('change', () => {
		const { mod, model } = current(); const k = tableKey(mod, model);
		settings.dims[k] = { ...(settings.dims[k] || {}), [el.dataset.dim]: +el.value }; saveSettings(settings);
	}));
	document.getElementById('create')?.addEventListener('click', createTable);
	document.getElementById('solve')?.addEventListener('click', solve);
	document.getElementById('open')?.addEventListener('click', () => activateSheet(state.lastSheet).catch(() => {}));
}
function bindItems() {
	app.querySelectorAll('[data-mod]').forEach((b) => b.addEventListener('click', () => openModule(b.dataset.mod, b.dataset.model)));
}
function storeParam(id, el) {
	const { mod, model } = current();
	const p = model.params.find((x) => x.id === id);
	const v = p.type === 'bool' ? el.checked : p.type === 'select' || p.type === 'list' ? el.value : el.value === '' ? '' : Number(el.value);
	const k = `${mod.id}.${model.id}`;
	settings.params[k] = { ...(settings.params[k] || {}), [id]: v };
	saveSettings(settings);
}
async function openModule(moduleId, modelId) {
	if (state.view === 'module' && state.moduleId === moduleId && (!modelId || state.modelId === modelId)) return;
	Object.assign(state, { view: 'module', moduleId, modelId: modelId || MODULES[moduleId].models[0].id, preview: null, result: null, error: null, tableInfo: null, lastSheet: null, warnings: [] });
	render();
	const { mod, model } = current();
	state.tableInfo = await peekInputTable(tableKey(mod, model));
	if (state.view === 'module' && state.moduleId === moduleId) render();
}
async function createTable() {
	const { mod, model } = current();
	try {
		const spec = mod.inputTable(dimValues(mod, model), model, settings.sample);
		const r = await createInputTable(tableKey(mod, model), spec.sheet || mod.name.split(' (')[0], spec, settings.decimals);
		state.tableInfo = { sheet: r.sheet, rows: spec.rows.length };
		state.error = null;
	} catch (e) { state.error = 'Không tạo được bảng: ' + (e.message || e); }
	render();
}
async function solve() {
	const { mod, model } = current();
	const p = paramValues(mod, model);
	state.busy = true; state.error = null; render();
	let table = null;
	try {
		table = await readInputTable(tableKey(mod, model));
		state.tableInfo = { sheet: table.sheet, rows: table.rows.length };
		const input = mod.parse(table, model, p);
		const res = mod.solve(input, model, p);
		res._names = res._names ?? input.names;
		state.preview = mod.preview ? mod.preview(input, res, model, p) : null;
		const spec = mod.report(input, res, model, p);
		const out = await writeReport('KQ ' + mod.name.split(' (')[0], spec, settings.decimals);
		Object.assign(state, { result: res, lastSheet: out.sheet, warnings: out.warnings });
		pushRecent(settings, mod.id, model.id); saveSettings(settings);
	} catch (e) {
		state.result = null; state.preview = null;
		if (e instanceof InputError) {
			state.error = e.message + (e.row !== null && table ? ' Ô lỗi đã được chọn trên sheet.' : '');
			if (table) await selectInputCell(table.table, e.row, e.col);
		} else state.error = (e && e.message) || String(e);
	}
	state.busy = false;
	render();
}
