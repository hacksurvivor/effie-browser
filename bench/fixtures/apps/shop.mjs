import { PRODUCTS, BRANDS, PAGE_SIZE, queryProducts } from '../data.mjs';
import { page, stubPage, esc, readBody, sendJson, sendHtml, sleep } from '../lib.mjs';

const safeJson = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

function indexPage(cookies) {
  const brandBoxes = BRANDS.map(
    (b) => `<div class="choice"><input type="checkbox" id="brand-${b.toLowerCase()}" name="brand" value="${b}"><label for="brand-${b.toLowerCase()}">${b}</label></div>`,
  ).join('');
  const first = PRODUCTS.slice(0, PAGE_SIZE);
  const banner = cookies[`bench_consent_${globalThis.benchEpoch}`]
    ? ''
    : `<div class="cookie" role="region" aria-label="Cookie consent" id="cookie-banner">
  <p>We use cookies to keep the cart working and to understand how the site is used. You can accept all cookies or reject the optional ones.</p>
  <button type="button" class="btn" data-consent="accepted">Accept all</button>
  <button type="button" class="btn secondary" data-consent="rejected">Reject</button>
</div>`;
  const after = `${banner}
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<dialog id="newsletter" aria-labelledby="nl-title" data-epoch="${globalThis.benchEpoch}">
  <form id="nl-form" novalidate>
    <h2 id="nl-title" style="margin-top:0">Get 10% off your first order</h2>
    <p>Join our newsletter for deals and new arrivals. No spam, unsubscribe any time.</p>
    <div class="field"><label for="nl-email">Email address</label><input type="email" id="nl-email" name="email" autocomplete="email">
      <p class="error" id="nl-error" hidden></p></div>
    <p><button type="submit" class="btn">Subscribe</button> <button type="button" class="btn secondary" id="nl-close">Close</button></p>
  </form>
</dialog>`;
  return page({
    app: 'shop',
    title: 'Laptops - Voltcart',
    active: 'Laptops',
    headerExtra: '<a class="cart-link" href="/shop/p/cart" id="cart-link">Cart (<span id="cart-count">0</span>)</a>',
    head: '<style>.toolbar{display:flex;gap:16px;align-items:center;flex-wrap:wrap;justify-content:space-between;margin-bottom:12px}.toolbar h2{margin:0}.toolbar .field{margin:0;display:flex;gap:8px;align-items:center}.toolbar .field label{margin:0}.toolbar .field select{width:auto}.spec{list-style:none;margin:6px 0;padding:0;font-size:14px;color:var(--muted)}#sentinel{height:1px}</style>',
    main: `<h1>Laptops</h1>
<p class="hint">Free delivery on orders over $500. 30-day returns.</p>
<div class="shop-layout">
  <aside aria-label="Filters">
    <form id="filters" onsubmit="return false">
      <fieldset class="plain"><legend>Brand</legend>${brandBoxes}</fieldset>
      <div class="field"><label for="memory">Memory</label>
        <select id="memory" name="memory"><option value="">Any</option><option value="8">8 GB</option><option value="16">16 GB</option><option value="32">32 GB</option></select></div>
    </form>
  </aside>
  <section aria-labelledby="results-h">
    <div class="toolbar">
      <h2 id="results-h">All laptops</h2>
      <div class="field"><label for="sort">Sort by</label>
        <select id="sort" name="sort"><option value="featured">Featured</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option></select></div>
    </div>
    <p id="count" role="status" aria-live="polite" class="hint"></p>
    <ul class="grid" id="grid"></ul>
    <div id="sentinel" aria-hidden="true"></div>
    <p><button type="button" class="btn secondary" id="load-more">Load more</button></p>
  </section>
</div>
<script type="application/json" id="init">${safeJson({ products: first, total: PRODUCTS.length, hasMore: PRODUCTS.length > PAGE_SIZE })}</script>`,
    after,
    scripts: '<script src="/_static/shop.js" defer></script>',
  });
}

function parseCookies(h) {
  const o = {};
  String(h || '').split(';').forEach((kv) => {
    const i = kv.indexOf('=');
    if (i > 0) o[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  });
  return o;
}

export function shopApp({ state }) {
  return async function handle(req, res, url) {
    const p = url.pathname;
    if (p === '/shop' || p === '/shop/') return sendHtml(res, indexPage(parseCookies(req.headers.cookie))), true;
    if (p === '/shop/api/products' && req.method === 'GET') {
      await sleep(400);
      const q = url.searchParams;
      const list = queryProducts({ brand: q.get('brand'), memory: q.get('memory'), sort: q.get('sort') });
      if (q.has('page')) {
        const n = Math.max(1, parseInt(q.get('page'), 10) || 1);
        const slice = list.slice((n - 1) * PAGE_SIZE, n * PAGE_SIZE);
        return sendJson(res, 200, { products: slice, page: n, pageSize: PAGE_SIZE, total: list.length, hasMore: n * PAGE_SIZE < list.length }), true;
      }
      return sendJson(res, 200, { products: list, total: list.length, hasMore: false }), true;
    }
    if (p === '/shop/api/cart') {
      if (req.method === 'GET') return sendJson(res, 200, { count: state.cart.length }), true;
      if (req.method === 'POST') {
        const body = await readBody(req);
        if (!body || !PRODUCTS.some((x) => x.id === body.productId)) return sendJson(res, 400, { error: 'unknown product' }), true;
        state.cart.push({ productId: body.productId });
        return sendJson(res, 200, { count: state.cart.length }), true;
      }
    }
    const m = p.match(/^\/shop\/p\/([a-z0-9-]+)$/);
    if (m) return sendHtml(res, stubPage('shop', m[1])), true;
    return false;
  };
}
