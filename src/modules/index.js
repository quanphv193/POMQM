import forecast from './forecast.js';
import lp from './lp.js';
import decision from './decision.js';
import pert from './pert.js';
import ip from './ip.js';
import goal from './goal.js';
import inventory from './inventory.js';
import queue from './queue.js';
import breakeven from './breakeven.js';
import transport, { assignModule as assign } from './transport.js';
import location from './location.js';
import quality from './quality.js';
import stats from './stats.js';
import finance from './finance.js';
import { aggregate, mrpModule, simulation } from './ops_c.js';
import { networks, lotsizing, scheduling, linebalance, layout } from './ops_b.js';
import { invest, gameModule, markovModule, productivity, reliability, learning, worktime } from './ops_a.js';

export const MODULES = { forecast, lp, ip, goal, transport, assign, decision, breakeven, pert, inventory, queue, location, quality, stats, invest, game: gameModule, markov: markovModule, productivity, reliability, learning, worktime, networks, lotsizing, scheduling, linebalance, layout, aggregate, mrp: mrpModule, simulation, finance };

// The full catalogue of the original Excel OM/QM v5, grouped by course chapter.
// `id` points to an implemented module; the rest show as "Sắp có".
export const CATALOG = [
	{ group: 'Hoạch định & dự báo', items: [{ id: 'forecast' }, { id: 'aggregate' }] },
	{ group: 'Tối ưu hoá', items: [{ id: 'lp' }, { id: 'ip' }, { id: 'goal' }, { id: 'transport' }, { id: 'assign' }, { id: 'networks' }] },
	{ group: 'Ra quyết định', items: [{ id: 'decision' }, { id: 'game' }, { id: 'markov' }] },
	{ group: 'Tài chính', items: [{ id: 'breakeven' }, { id: 'finance' }, { id: 'invest' }] },
	{ group: 'Dự án', items: [{ id: 'pert' }] },
	{ group: 'Tồn kho & vận hành', items: [{ id: 'inventory' }, { id: 'lotsizing' }, { id: 'mrp' }, { id: 'queue' }, { id: 'scheduling' }, { id: 'linebalance' }, { id: 'layout' }, { id: 'location' }, { id: 'learning' }, { id: 'productivity' }, { id: 'worktime' }] },
	{ group: 'Chất lượng', items: [{ id: 'quality' }, { id: 'reliability' }] },
	{ group: 'Thống kê', items: [{ id: 'stats' }, { id: 'simulation' }] },
];

// Which course menu a module belongs to (approximation of POM-QM's POM / QM / both menus). Unlisted modules appear in both.
export const EDITION = { game: 'qm', goal: 'qm', ip: 'qm', markov: 'qm', networks: 'qm', aggregate: 'pom', linebalance: 'pom', lotsizing: 'pom', mrp: 'pom', layout: 'pom', learning: 'pom', productivity: 'pom', worktime: 'pom', reliability: 'pom', scheduling: 'pom', location: 'pom', quality: 'pom', inventory: 'pom' };
export const inMenu = (modId, menu) => menu === 'all' || !EDITION[modId] || EDITION[modId] === menu;
