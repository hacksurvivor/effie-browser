import { STAY, ARRIVAL_TIMES, fmtBaht } from '../data.mjs';
import { page, stubPage, esc, readBody, sendJson, sendHtml } from '../lib.mjs';

const roomById = (id) => STAY.rooms.find((r) => r.id === id);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const stayBox = `<dl class="kv"><dt>Check-in</dt><dd>Thu 12 Nov 2026, from 14:00</dd><dt>Check-out</dt><dd>Sat 14 Nov 2026, until 11:00</dd><dt>Guests</dt><dd>2 adults</dd><dt>Length of stay</dt><dd>2 nights</dd></dl>`;

function notFound(msg) {
  return page({
    app: 'stay',
    title: 'Not found - Palm House',
    main: `<h1>We could not find that</h1><p>${esc(msg)}</p><p><a href="/stay/">Back to rooms</a></p>`,
  });
}

function indexPage() {
  const cards = STAY.rooms
    .map(
      (r) => `<li><article class="card" aria-labelledby="room-${r.id}">
  <div class="pic" role="img" aria-label="Photo of ${esc(r.name)}"></div>
  <div>
    <h3 id="room-${r.id}">${esc(r.name)}</h3>
    <p>${esc(r.desc)}</p>
    <ul class="inline">${r.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
  </div>
  <div>
    <p class="price">${fmtBaht(r.total)}</p>
    <p class="hint">total for 2 nights, taxes included</p>
    <a class="btn" href="/stay/book?room=${r.id}" aria-label="Book ${esc(r.name)}">Book</a>
  </div>
</article></li>`,
    )
    .join('\n');
  return page({
    app: 'stay',
    title: 'Rooms - Palm House',
    active: 'Rooms',
    head: '<style>ul.inline{display:flex;gap:14px;list-style:none;padding:0;margin:6px 0;font-size:14px;color:var(--muted)}</style>',
    main: `<h1>Rooms and suites</h1>
<section aria-labelledby="stay-h" class="note"><h2 id="stay-h" style="margin-top:0">Your stay</h2>${stayBox}</section>
<h2>Available rooms</h2>
<ul class="rooms">${cards}</ul>
<section aria-labelledby="direct-h"><h2 id="direct-h">Why book direct</h2>
<div class="cols">
  <div class="card"><h3>Free cancellation</h3><p>Cancel up to 7 days before arrival at no cost.</p></div>
  <div class="card"><h3>Breakfast included</h3><p>Fresh fruit, eggs any style and northern Thai specialities.</p></div>
  <div class="card"><h3>Late check-out</h3><p>Complimentary until 13:00, subject to availability.</p></div>
</div></section>
<section aria-labelledby="rev-h"><h2 id="rev-h">Guest reviews</h2>
<ul><li>"Quiet, leafy, and the staff remembered our names." Maya, Singapore</li>
<li>"Best pool in the old town." Jonas, Hamburg</li>
<li>"Breakfast alone is worth the trip." Priya, Mumbai</li></ul></section>`,
  });
}

function bookPage(roomId) {
  const r = roomById(roomId);
  if (!r) return notFound('That room does not exist.');
  const opts = ['<option value="">Choose a time</option>']
    .concat(ARRIVAL_TIMES.map((t) => `<option value="${t}">${t}</option>`))
    .join('');
  return page({
    app: 'stay',
    title: `Your details - ${r.name} - Palm House`,
    active: 'Rooms',
    main: `<nav aria-label="Breadcrumb" class="crumbs"><ol><li><a href="/stay/">Rooms</a></li><li aria-current="page">Your details</li></ol></nav>
<h1>Your details</h1>
<div class="cols">
<section aria-labelledby="sum-h" class="note"><h2 id="sum-h" style="margin-top:0">Booking summary</h2>
<dl class="kv"><dt>Room</dt><dd>${esc(r.name)}</dd><dt>Dates</dt><dd>12 - 14 Nov 2026 (2 nights)</dd><dt>Total</dt><dd><strong>${fmtBaht(r.total)}</strong></dd></dl></section>
<form id="details" method="post" action="/stay/api/details" novalidate data-room="${r.id}">
  <div class="field"><label for="name">Full name</label>
    <input type="text" id="name" name="name" autocomplete="name" required aria-required="true">
    <p class="error" id="name-error" hidden></p></div>
  <div class="field"><label for="email">Email</label>
    <input type="email" id="email" name="email" autocomplete="email" required aria-required="true">
    <p class="error" id="email-error" hidden></p></div>
  <div class="field"><label for="phone">Phone</label>
    <input type="tel" id="phone" name="phone" autocomplete="tel" required aria-required="true">
    <p class="hint" id="phone-hint">Include the country code.</p>
    <p class="error" id="phone-error" hidden></p></div>
  <div class="field"><label for="arrival">Arrival time</label>
    <select id="arrival" name="arrival" required aria-required="true">${opts}</select>
    <p class="error" id="arrival-error" hidden></p></div>
  <div class="field"><label for="requests">Special requests</label>
    <textarea id="requests" name="requests"></textarea>
    <p class="hint">Optional. We will do our best but cannot guarantee requests.</p></div>
  <button type="submit" class="btn" id="continue">Continue to payment</button>
  <p role="status" id="form-status" class="hint"></p>
</form>
</div>`,
    scripts: '<script src="/_static/stay-book.js" defer></script>',
  });
}

function payPage(b) {
  const r = roomById(b.room);
  return page({
    app: 'stay',
    title: 'Review and pay - Palm House',
    active: 'Rooms',
    main: `<nav aria-label="Breadcrumb" class="crumbs"><ol><li><a href="/stay/">Rooms</a></li><li>Your details</li><li aria-current="page">Payment</li></ol></nav>
<h1>Review and pay</h1>
<section aria-labelledby="rev-h" class="note"><h2 id="rev-h" style="margin-top:0">Your booking</h2>
<dl class="kv">
<dt>Reference</dt><dd>${esc(b.bookingId)}</dd>
<dt>Room</dt><dd>${esc(r.name)}</dd>
<dt>Dates</dt><dd>12 - 14 Nov 2026 (2 nights)</dd>
<dt>Guest</dt><dd>${esc(b.name)}</dd>
<dt>Email</dt><dd>${esc(b.email)}</dd>
<dt>Phone</dt><dd>${esc(b.phone)}</dd>
<dt>Arrival time</dt><dd>${esc(b.arrival)}</dd>
<dt>Special requests</dt><dd>${esc(b.requests || 'None')}</dd>
<dt>Total due</dt><dd><strong>${fmtBaht(r.total)}</strong></dd>
</dl></section>
<p><button type="button" class="btn" id="pay" data-booking="${esc(b.bookingId)}">Pay ${fmtBaht(r.total)}</button></p>
<p role="status" id="pay-status" class="hint"></p>
<p class="hint">Payments are processed over an encrypted connection.</p>`,
    scripts: '<script src="/_static/stay-pay.js" defer></script>',
  });
}

function confirmPage(b) {
  const r = roomById(b.room);
  return page({
    app: 'stay',
    title: 'Booking confirmed - Palm House',
    main: `<h1>Booking confirmed</h1>
<p role="status">Thank you, ${esc(b.name)}. Your ${esc(r.name)} is reserved for 12 - 14 Nov 2026.</p>
<p>Booking reference: <strong>${esc(b.bookingId)}</strong>. A confirmation has been sent to ${esc(b.email)}.</p>
<p><a href="/stay/">Back to rooms</a></p>`,
  });
}

export function stayApp({ state }) {
  return async function handle(req, res, url) {
    const p = url.pathname;
    if (p === '/stay' || p === '/stay/') return sendHtml(res, indexPage()), true;
    if (p === '/stay/book') return sendHtml(res, bookPage(url.searchParams.get('room'))), true;
    if (p === '/stay/pay' || p === '/stay/confirmation') {
      const b = state.stayDetails.find((d) => d.bookingId === url.searchParams.get('booking'));
      if (!b) return sendHtml(res, notFound('We could not find that booking.'), 404), true;
      if (p === '/stay/pay') return sendHtml(res, payPage(b)), true;
      if (!state.stayPayments.some((x) => x.bookingId === b.bookingId))
        return sendHtml(res, notFound('This booking has not been paid yet.'), 404), true;
      return sendHtml(res, confirmPage(b)), true;
    }
    if (p === '/stay/api/details' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body) return sendJson(res, 400, { error: 'invalid json' }), true;
      const errors = {};
      if (!roomById(body.room)) errors.room = 'unknown room';
      if (!String(body.name || '').trim()) errors.name = 'required';
      if (!EMAIL_RE.test(String(body.email || '').trim())) errors.email = 'invalid';
      if (!String(body.phone || '').trim()) errors.phone = 'required';
      if (!ARRIVAL_TIMES.includes(body.arrival)) errors.arrival = 'required';
      if (Object.keys(errors).length) return sendJson(res, 400, { errors }), true;
      const bookingId = 'PH-' + (1001 + state.stayDetails.length);
      const rec = {
        room: body.room,
        name: String(body.name).trim(),
        email: String(body.email).trim(),
        phone: String(body.phone).trim(),
        arrival: body.arrival,
        requests: String(body.requests || '').trim(),
        bookingId,
      };
      state.stayDetails.push(rec);
      return sendJson(res, 200, { bookingId }), true;
    }
    if (p === '/stay/api/pay' && req.method === 'POST') {
      const body = await readBody(req);
      const b = body && state.stayDetails.find((d) => d.bookingId === body.bookingId);
      if (!b) return sendJson(res, 404, { error: 'unknown booking' }), true;
      if (!state.stayPayments.some((x) => x.bookingId === b.bookingId)) state.stayPayments.push({ bookingId: b.bookingId, paid: true });
      return sendJson(res, 200, { ok: true, bookingId: b.bookingId }), true;
    }
    const m = p.match(/^\/stay\/p\/([a-z0-9-]+)$/);
    if (m) return sendHtml(res, stubPage('stay', m[1])), true;
    return false;
  };
}
