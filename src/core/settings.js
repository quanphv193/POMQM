// Per-machine preferences (decimals, recent models, last params). Never required for correctness.
const KEY = 'omqm.settings.v1';
const DEFAULTS = { decimals: 2, recent: [], params: {}, dims: {}, sample: true, menu: 'all' };

export function loadSettings() {
	try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}
export function saveSettings(s) {
	try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable: keep in memory only */ }
}
export function pushRecent(s, moduleId, modelId) {
	s.recent = [{ moduleId, modelId }, ...s.recent.filter((x) => !(x.moduleId === moduleId && x.modelId === modelId))].slice(0, 4);
}
