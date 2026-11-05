// Benchmark fixture server. Node 22, zero dependencies.
// Main origin  http://127.0.0.1:4300  (BENCH_PORT)
// Second site  http://localhost:4301  (BENCH_PORT2) - cross-site iframe target (different site: localhost vs 127.0.0.1)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { emptyState } from './data.mjs';
import { esc, page, sendJson, sendHtml, sendText } from './lib.mjs';
import { stayApp } from './apps/stay.mjs';
import { shopApp } from './apps/shop.mjs';
import { appApp } from './apps/app.mjs';
import { frameApp, frameSite } from './apps/frame.mjs';
import { tableApp } from './apps/table.mjs';
import { formApp } from './apps/form.mjs';
import { gatesApp, captchaSite } from './apps/gates.mjs';

const PORT = Number(process.env.BENCH_PORT || 4300);
const PORT2 = Number(process.env.BENCH_PORT2 || 4301);
const HOST = '127.0.0.1';
const CLIENT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'client');

let state = emptyState();
// Handlers receive a stable ctx; state is mutated in place (reset clears arrays) so references stay valid.
const ctx = {
  get state() { return state; },
  port2: PORT2,
};
// Cookies a fixture sets (consent, newsletter) are named per reset, so every run starts as a
// first visit in any browser profile without clearing the profile's cookies.
globalThis.benchEpoch = 1;

function resetState() {
  globalThis.benchEpoch += 1;
  const fresh = emptyState();
  for (const k of Object.keys(fresh)) state[k].length = 0;
}

const mainHandlers = [stayApp(ctx), shopApp(ctx), appApp(ctx), frameApp(ctx), tableApp(ctx), formApp(ctx), gatesApp(ctx)];
const siteHandlers = [frameSite(ctx), captchaSite(ctx)];

const MIME = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

function rootPage() {
  const apps = [
    ['/stay/', 'Palm House', 'Hotel booking: pick a room, enter details, pay.'],
    ['/shop/', 'Voltcart', 'Laptop shop with filters, infinite scroll, cookie banner and a newsletter modal.'],
    ['/app/', 'Acme dashboard', 'Single-page app with async views and a settings form.'],
    ['/frame/', 'Parcelwise support', 'Support page embedding a cross-site contact form iframe.'],
    ['/table/', 'Ledgerly invoices', 'Sortable, searchable, paginated invoice table.'],
    ['/form/', 'Fernwood Careers', 'Long job application form with validation summary.'],
  ];
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Benchmark fixtures</title>
<link rel="stylesheet" href="/_static/base.css"></head>
<body><main class="wrap" id="main"><h1>Benchmark fixtures</h1>
<p>Local test sites for browser-agent comparisons.</p>
<nav aria-label="Fixture apps"><ul>${apps.map(([h, n, d]) => `<li><a href="${h}">${esc(n)}</a> - ${esc(d)}</li>`).join('')}</ul></nav>
<p class="hint">Harness endpoints: <a href="/__state">/__state</a> (GET), /__reset (POST).</p></main></body></html>`;
}

async function serveStatic(res, name) {
  if (!/^[a-z0-9-]+\.(js|css)$/.test(name)) return sendText(res, 404, 'not found');
  try {
    const buf = await readFile(path.join(CLIENT_DIR, name));
    res.writeHead(200, { 'content-type': MIME[path.extname(name)], 'cache-control': 'no-store' });
    res.end(buf);
  } catch {
    sendText(res, 404, 'not found');
  }
}

function make(origin, handlers) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || HOST}`);
      const p = url.pathname;
      if (p === '/favicon.ico') { res.writeHead(204); return res.end(); }
      if (p.startsWith('/_static/')) return await serveStatic(res, p.slice('/_static/'.length));
      if (origin === 'main') {
        if (p === '/__state' && req.method === 'GET') return sendJson(res, 200, state);
        if (p === '/__reset' && req.method === 'POST') { resetState(); return sendJson(res, 200, { ok: true }); }
        if (p === '/' || p === '/index.html') return sendHtml(res, rootPage());
      }
      for (const h of handlers) if (await h(req, res, url)) return;
      sendHtml(res, page({
        app: 'shop', title: 'Not found',
        main: '<h1>Page not found</h1><p>Nothing here. <a href="/">Back to the fixtures index</a>.</p>',
      }), 404);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) sendJson(res, 500, { error: String(err && err.message) });
      else res.end();
    }
  });
}

const main = make('main', mainHandlers);
const second = make('second', siteHandlers);
let ready = 0;
const onListen = () => {
  if (++ready === 2) console.log(`fixtures ready ${PORT} ${PORT2}`);
};
main.listen(PORT, HOST, onListen);
second.listen(PORT2, HOST, onListen);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { main.close(); second.close(); process.exit(0); });
