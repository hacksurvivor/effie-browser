import { page, stubPage, esc, readBody, sendJson, sendHtml } from '../lib.mjs';

const TOPICS = [
  ['order-issue', 'Order issue'],
  ['billing', 'Billing'],
  ['other', 'Other'],
];

function supportPage(port2) {
  return page({
    app: 'frame',
    title: 'Support - Parcelwise',
    active: 'Support',
    main: `<h1>Support</h1>
<p>Most questions about delivery, returns and invoices are answered below. If you still need a hand, send us a ticket and we will reply within one working day.</p>
<section aria-labelledby="faq-h"><h2 id="faq-h">Common questions</h2>
<ul>
<li><a href="/frame/p/track-an-order">Where is my parcel?</a></li>
<li><a href="/frame/p/start-a-return">How do I return an item?</a></li>
<li><a href="/frame/p/warranty">What does the warranty cover?</a></li>
<li><a href="/frame/p/shipping-rates">How much does shipping cost?</a></li>
</ul></section>
<section aria-labelledby="contact-h"><h2 id="contact-h">Contact us</h2>
<p>Use the form below. Have your order number ready if your question is about an order.</p>
<iframe class="embed" title="Support ticket form" src="http://localhost:${port2}/frame/form" loading="eager"></iframe>
</section>`,
  });
}

function formPage() {
  const opts = ['<option value="">Choose a topic</option>']
    .concat(TOPICS.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`))
    .join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Support ticket form</title>
<link rel="stylesheet" href="/_static/base.css">
</head>
<body class="app-frame frame-body">
<main id="main">
<h1 style="font-size:22px">Send us a message</h1>
<form id="ticket" novalidate>
  <div class="field"><label for="topic">Topic</label>
    <select id="topic" name="topic" required aria-required="true">${opts}</select>
    <p class="error" id="topic-error" hidden></p></div>
  <div class="field"><label for="order">Order number</label>
    <input type="text" id="order" name="order" inputmode="numeric" autocomplete="off">
    <p class="hint" id="order-hint">Required for order issues. You can find it in your confirmation email.</p>
    <p class="error" id="order-error" hidden></p></div>
  <div class="field"><label for="message">Message</label>
    <textarea id="message" name="message" required aria-required="true"></textarea>
    <p class="error" id="message-error" hidden></p></div>
  <button type="submit" class="btn" id="submit">Submit</button>
</form>
<div id="done" role="status" hidden></div>
</main>
<script src="/_static/frame-form.js" defer></script>
</body>
</html>`;
}

// Handler for the main origin.
export function frameApp({ port2 }) {
  return async function handle(req, res, url) {
    const p = url.pathname;
    if (p === '/frame' || p === '/frame/') return sendHtml(res, supportPage(port2)), true;
    const m = p.match(/^\/frame\/p\/([a-z0-9-]+)$/);
    if (m) return sendHtml(res, stubPage('frame', m[1])), true;
    return false;
  };
}

// Handler for the second origin (localhost): only the iframe page and its API.
export function frameSite({ state }) {
  return async function handle(req, res, url) {
    const p = url.pathname;
    if (p === '/frame/form') return sendHtml(res, formPage()), true;
    if (p === '/frame/api/ticket' && req.method === 'POST') {
      const b = await readBody(req);
      if (!b) return sendJson(res, 400, { error: 'invalid json' }), true;
      const topic = String(b.topic || '');
      const order = String(b.order || '').trim();
      const message = String(b.message || '').trim();
      const errors = {};
      if (!TOPICS.some(([v]) => v === topic)) errors.topic = 'required';
      if (topic === 'order-issue' && !order) errors.order = 'required';
      if (!message) errors.message = 'required';
      if (Object.keys(errors).length) return sendJson(res, 400, { errors }), true;
      const ticketId = 'TCK-' + (1001 + state.tickets.length);
      state.tickets.push({ topic, order, message, ticketId });
      return sendJson(res, 200, { ticketId }), true;
    }
    return false;
  };
}
