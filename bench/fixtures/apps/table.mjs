import { INVOICES, fmtDate, fmtUsd } from '../data.mjs';
import { page, stubPage, sendHtml } from '../lib.mjs';

const rows = INVOICES.map((r) => ({
  number: r.number,
  customer: r.customer,
  issued: r.issued,
  due: r.due,
  issuedText: fmtDate(r.issued),
  dueText: fmtDate(r.due),
  cents: r.amountCents,
  amountText: fmtUsd(r.amountCents),
  status: r.status,
}));

function indexPage() {
  const cols = [
    ['number', 'Invoice', ''],
    ['customer', 'Customer', ''],
    ['issued', 'Issued', ''],
    ['due', 'Due', ''],
    ['cents', 'Amount', 'num'],
    ['status', 'Status', ''],
  ];
  const head = cols
    .map(([k, l, c]) => `<th scope="col" class="${c}" aria-sort="none" data-key="${k}"><button type="button">${l}</button></th>`)
    .join('');
  return page({
    app: 'table',
    title: 'Invoices - Ledgerly',
    active: 'Invoices',
    main: `<h1>Invoices</h1>
<p class="hint">All invoices issued in 2026. Amounts are in US dollars.</p>
<form role="search" aria-label="Invoice search" onsubmit="return false">
  <div class="field"><label for="q">Search by customer</label><input type="search" id="q" name="q" autocomplete="off"></div>
</form>
<p id="summary" role="status" aria-live="polite"></p>
<table id="inv">
  <caption class="sr-only">Invoices</caption>
  <thead><tr>${head}</tr></thead>
  <tbody id="tbody"></tbody>
</table>
<nav aria-label="Pagination" class="pager" id="pager"></nav>
<script type="application/json" id="rows">${JSON.stringify(rows)}</script>`,
    scripts: '<script src="/_static/table.js" defer></script>',
  });
}

export function tableApp() {
  return async function handle(req, res, url) {
    const p = url.pathname;
    if (p === '/table' || p === '/table/') return sendHtml(res, indexPage()), true;
    const m = p.match(/^\/table\/p\/([a-z0-9-]+)$/);
    if (m) return sendHtml(res, stubPage('table', m[1])), true;
    return false;
  };
}
