// Static HTTPS server for the add-in (Office requires https). Usage: node server.mjs
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.OMQM_PORT) || 3000;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.xml': 'text/xml', '.css': 'text/css; charset=utf-8' };
const opts = { key: fs.readFileSync(path.join(root, 'certs/localhost.key')), cert: fs.readFileSync(path.join(root, 'certs/localhost.crt')) };

https.createServer(opts, (req, res) => {
	if (process.env.OMQM_LOG) console.log(new Date().toISOString(), req.method, req.url);
	const url = new URL(req.url, `https://localhost:${PORT}`);
	let p = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
	if (p === '/' || p === path.sep) p = '/taskpane.html';
	// Development self-test: enabled only while a ".selftest" file exists next to this server.
	if (url.pathname === '/__selftest') { const f = path.join(root, '.selftest'); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end(fs.readFileSync(f, 'utf8')); }
	if (url.pathname === '/__log') {
		if (fs.existsSync(path.join(root, '.selftest'))) fs.appendFileSync(path.join(root, 'selftest.log'), decodeURIComponent(url.search.slice(1)) + '\n');
		res.writeHead(204); return res.end();
	}
	const file = path.join(root, p);
	if (!file.startsWith(root) || /^\/(certs|test|node_modules|docs)(\/|$)|^\/\.|\.(sh|log|md)$/.test(p)) { res.writeHead(403); return res.end('Forbidden'); }
	fs.readFile(file, (err, data) => {
		if (err) { res.writeHead(404); return res.end('Not found'); }
		res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
		res.end(data);
	});
}).listen(PORT, '127.0.0.1', () => console.log(`OM/QM Lite add-in: https://localhost:${PORT}/taskpane.html`));
