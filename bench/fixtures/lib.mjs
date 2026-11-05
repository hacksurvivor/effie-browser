import { setTimeout as sleep } from 'node:timers/promises';
export { sleep };

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 1_000_000) throw new Error('body too large');
    chunks.push(c);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  const ct = req.headers['content-type'] || '';
  if (ct.includes('application/x-www-form-urlencoded')) {
    const o = {};
    for (const [k, v] of new URLSearchParams(raw)) o[k] = k in o ? [].concat(o[k], v) : v;
    return o;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const NO_STORE = { 'cache-control': 'no-store' };
export function sendJson(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...NO_STORE });
  res.end(JSON.stringify(obj));
}
export function sendHtml(res, html, status = 200) {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', ...NO_STORE });
  res.end(html);
}
export function sendText(res, status, text, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, ...NO_STORE });
  res.end(text);
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const mk = (base, items) =>
  items.map((i) => (Array.isArray(i) ? i : [i, `${base}/p/${slug(i)}`]));

const COMPANY = ['About us', 'Careers', 'Press', 'Sustainability', 'Partners'];
const SUPPORT = ['Help centre', 'Contact us', 'Accessibility', 'Sitemap', 'System status'];
const LEGAL = ['Terms of service', 'Privacy policy', 'Cookie policy', 'Imprint', 'Licences'];

export const SITES = {
  stay: {
    name: 'Palm House', base: '/stay', tag: 'Boutique hotel, Chiang Mai',
    nav: mk('/stay', [['Rooms', '/stay/'], 'Dining', 'Spa and wellness', 'Offers', 'Gallery', 'Events', 'Getting here', 'Contact']),
    explore: ['Rooms and suites', 'Restaurant', 'Cooking classes', 'Weddings', 'Gift vouchers'],
  },
  shop: {
    name: 'Voltcart', base: '/shop', tag: 'Electronics for everyone',
    nav: mk('/shop', [['Laptops', '/shop/'], 'Desktops', 'Tablets', 'Phones', 'Audio', 'Gaming', 'Deals', 'Support']),
    explore: ['New arrivals', 'Best sellers', 'Student discount', 'Trade-in', 'Gift cards'],
  },
  app: {
    name: 'Acme', base: '/app', tag: 'Project dashboard',
    nav: mk('/app', [['Overview', '/app/'], ['Projects', '/app/projects'], ['Settings', '/app/settings'], 'Docs', 'Changelog', 'Status', 'Billing', 'Support']),
    explore: ['Integrations', 'API reference', 'Roadmap', 'Community', 'Templates'],
  },
  frame: {
    name: 'Parcelwise', base: '/frame', tag: 'Customer support',
    nav: mk('/frame', [['Support', '/frame/'], 'Orders and delivery', 'Returns', 'Billing', 'Account', 'Shipping rates', 'Product guides', 'Store locator']),
    explore: ['Track an order', 'Start a return', 'Warranty', 'Repairs', 'Recalls'],
  },
  table: {
    name: 'Ledgerly', base: '/table', tag: 'Invoicing for small teams',
    nav: mk('/table', [['Invoices', '/table/'], 'Customers', 'Payments', 'Reports', 'Products', 'Tax', 'Integrations', 'Settings']),
    explore: ['Templates', 'Recurring billing', 'Expenses', 'Payroll', 'Mobile app'],
  },
  form: {
    name: 'Fernwood Careers', base: '/form', tag: 'Work with us',
    nav: mk('/form', [['Apply', '/form/'], 'Open roles', 'Teams', 'Life at Fernwood', 'Benefits', 'Locations', 'Interview process', 'FAQ']),
    explore: ['Engineering', 'Design', 'Operations', 'Graduate programme', 'Internships'],
  },
};

function footer(site) {
  const b = site.base;
  const cols = [
    ['Explore', site.explore],
    ['Company', COMPANY],
    ['Support', SUPPORT],
    ['Legal', LEGAL],
  ];
  return `<footer class="site-footer">
  <div class="wrap footer-grid">
${cols
  .map(
    ([h, links], i) => `    <nav aria-labelledby="f${i}"><h2 id="f${i}">${esc(h)}</h2><ul>${links
      .map((l) => `<li><a href="${b}/p/${slug(l)}">${esc(l)}</a></li>`)
      .join('')}</ul></nav>`,
  )
  .join('\n')}
  </div>
  <div class="wrap fine"><p>&copy; 2026 ${esc(site.name)}. All rights reserved. Prices include applicable taxes.</p></div>
</footer>`;
}

export function page({ app, title, main, head = '', scripts = '', headerExtra = '', after = '', active = '', bare = false }) {
  const s = SITES[app];
  const nav = s.nav
    .map(([label, href]) => {
      const cur = label === active ? ' aria-current="page"' : '';
      const spa = app === 'app' ? ' data-spa' : '';
      return `<li><a href="${href}"${cur}${spa}>${esc(label)}</a></li>`;
    })
    .join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="stylesheet" href="/_static/base.css">
${head}
</head>
<body class="app-${app}">
<a class="skip" href="#main">Skip to main content</a>
<header class="site-header">
  <div class="wrap bar">
    <a class="brand" href="${s.base}/"${app === 'app' ? ' data-spa' : ''}>
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true" focusable="false"><rect width="28" height="28" rx="7" fill="var(--accent)"/><circle cx="14" cy="14" r="6" fill="none" stroke="#fff" stroke-width="2.5"/></svg>
      <span>${esc(s.name)}</span>
    </a>
    <nav aria-label="Main"><ul class="nav">${nav}</ul></nav>
    ${headerExtra}
  </div>
</header>
<main id="main" tabindex="-1" class="wrap">
${main}
</main>
${footer(s)}
${after}
${scripts}
</body>
</html>`;
}

export function stubPage(app, rawSlug) {
  const s = SITES[app];
  const label = rawSlug.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
  return page({
    app,
    title: `${label} - ${s.name}`,
    main: `<nav aria-label="Breadcrumb" class="crumbs"><ol><li><a href="${s.base}/">${esc(s.name)}</a></li><li aria-current="page">${esc(label)}</li></ol></nav>
<h1>${esc(label)}</h1>
<p>This section is not part of the demo. Head back to the <a href="${s.base}/">${esc(s.name)} home page</a> to continue.</p>`,
  });
}
