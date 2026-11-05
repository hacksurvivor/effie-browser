import { COUNTRIES, INTERESTS } from '../data.mjs';
import { page, stubPage, esc, readBody, sendJson, sendHtml } from '../lib.mjs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMP = [['full-time', 'Full-time'], ['part-time', 'Part-time'], ['contract', 'Contract']];
const CONTACT = [['email', 'Email'], ['phone', 'Phone']];

const text = (id, label, extra = '', type = 'text', hint = '') =>
  `<div class="field"><label for="${id}">${label}</label>
    <input type="${type}" id="${id}" name="${id}"${extra}>${hint ? `\n    <p class="hint" id="${id}-hint">${hint}</p>` : ''}
    <p class="error" id="${id}-error" hidden></p></div>`;

function radios(name, label, items, idPrefix) {
  return `<fieldset class="plain" id="${name}" aria-describedby="${name}-error"><legend>${label}</legend>
  ${items.map(([v, l]) => `<div class="choice"><input type="radio" id="${idPrefix}-${v}" name="${name}" value="${v}"><label for="${idPrefix}-${v}">${l}</label></div>`).join('\n  ')}
  <p class="error" id="${name}-error" hidden></p></fieldset>`;
}

function formHtml() {
  return `<h1>Product designer application</h1>
<p>Tell us a bit about yourself. Fields are required unless marked optional. It takes about five minutes.</p>
<div id="error-summary" class="summary-err" role="alert" tabindex="-1" hidden>
  <h2>There is a problem</h2><ul id="error-list"></ul>
</div>
<form id="apply" method="post" action="/form/api/apply" novalidate>
<fieldset><legend>Personal details</legend>
  ${text('first-name', 'First name', ' autocomplete="given-name" required aria-required="true"')}
  ${text('last-name', 'Last name', ' autocomplete="family-name" required aria-required="true"')}
  ${text('dob', 'Date of birth', ' autocomplete="bday" required aria-required="true"', 'date')}
  ${text('email', 'Email', ' autocomplete="email" required aria-required="true"', 'email')}
  ${text('phone', 'Phone', ' autocomplete="tel" required aria-required="true"', 'tel', 'Include the country code, for example +44.')}
</fieldset>
<fieldset><legend>Address</legend>
  ${text('street', 'Street address', ' autocomplete="street-address" required aria-required="true"')}
  ${text('city', 'City', ' autocomplete="address-level2" required aria-required="true"')}
  ${text('postcode', 'Postcode', ' autocomplete="postal-code" required aria-required="true"')}
  <div class="field"><label for="country">Country</label>
    <select id="country" name="country" autocomplete="country" required aria-required="true"><option value="">Select a country</option>${COUNTRIES.map(([c, n]) => `<option value="${c}">${esc(n)}</option>`).join('')}</select>
    <p class="error" id="country-error" hidden></p></div>
</fieldset>
<fieldset><legend>Work</legend>
  ${text('company', 'Current company', ' autocomplete="organization" required aria-required="true"')}
  ${text('role', 'Current role', ' autocomplete="organization-title" required aria-required="true"')}
  ${text('years', 'Years of experience', ' min="0" max="60" step="1" required aria-required="true"', 'number')}
  ${radios('employmentType', 'Employment type', EMP, 'emp')}
  ${text('start-date', 'Earliest start date', ' required aria-required="true"', 'date')}
</fieldset>
<fieldset><legend>Preferences</legend>
  <div class="choice"><input type="checkbox" id="newsletter" name="newsletter"><label for="newsletter">Send me the monthly Fernwood newsletter</label></div>
  ${radios('contactMethod', 'Preferred contact method', CONTACT, 'cm')}
  <fieldset class="plain"><legend>Interests (optional)</legend>
  ${INTERESTS.map(([v, l]) => `<div class="choice"><input type="checkbox" id="int-${v}" name="interests" value="${v}"><label for="int-${v}">${l}</label></div>`).join('\n  ')}
  </fieldset>
  <div class="field"><label for="notes">Notes (optional)</label><textarea id="notes" name="notes"></textarea></div>
</fieldset>
<fieldset class="plain"><legend class="sr-only">Consent</legend>
  <div class="choice"><input type="checkbox" id="consent" name="consent" required aria-required="true" aria-describedby="consent-error"><label for="consent">I agree that Fernwood may store my application data for recruitment purposes.</label></div>
  <p class="error" id="consent-error" hidden></p>
</fieldset>
<button type="submit" class="btn" id="submit">Submit application</button>
</form>`;
}

function thanksPage(ref) {
  return page({
    app: 'form',
    title: 'Application received - Fernwood Careers',
    main: `<h1>Application received</h1><p role="status">Thank you. Your reference is <strong>${esc(ref)}</strong>. We will be in touch within a week.</p><p><a href="/form/">Back to the careers page</a></p>`,
  });
}

export function formApp({ state }) {
  return async function handle(req, res, url) {
    const p = url.pathname;
    if (p === '/form' || p === '/form/')
      return sendHtml(res, page({ app: 'form', title: 'Apply - Fernwood Careers', active: 'Apply', main: formHtml(), scripts: '<script src="/_static/form.js" defer></script>' })), true;
    if (p === '/form/thanks') return sendHtml(res, thanksPage(url.searchParams.get('ref') || 'APP-0000')), true;
    if (p === '/form/api/apply' && req.method === 'POST') {
      const b = await readBody(req);
      if (!b) return sendJson(res, 400, { error: 'invalid json' }), true;
      const s = (k) => String(b[k] ?? '').trim();
      const errors = {};
      for (const k of ['firstName', 'lastName', 'dob', 'phone', 'street', 'city', 'postcode', 'country', 'company', 'role', 'startDate'])
        if (!s(k)) errors[k] = 'required';
      if (!EMAIL_RE.test(s('email'))) errors.email = 'invalid';
      if (s('years') === '' || Number.isNaN(Number(s('years'))) || Number(s('years')) < 0) errors.years = 'invalid';
      if (!EMP.some(([v]) => v === b.employmentType)) errors.employmentType = 'required';
      if (!CONTACT.some(([v]) => v === b.contactMethod)) errors.contactMethod = 'required';
      if (!COUNTRIES.some(([c]) => c === b.country)) errors.country = 'invalid';
      if (b.consent !== true && b.consent !== 'on' && b.consent !== 'true') errors.consent = 'required';
      if (Object.keys(errors).length) return sendJson(res, 400, { errors }), true;
      const interests = [].concat(b.interests ?? []).filter(Boolean).map(String);
      const rec = {
        firstName: s('firstName'), lastName: s('lastName'), dob: s('dob'), email: s('email'), phone: s('phone'),
        street: s('street'), city: s('city'), postcode: s('postcode'), country: s('country'),
        company: s('company'), role: s('role'), years: Number(s('years')), employmentType: b.employmentType, startDate: s('startDate'),
        newsletter: b.newsletter === true || b.newsletter === 'on' || b.newsletter === 'true',
        contactMethod: b.contactMethod, interests, notes: s('notes'), consent: true,
      };
      const ref = 'APP-' + (1001 + state.applications.length);
      state.applications.push({ ...rec, ref });
      return sendJson(res, 200, { ref }), true;
    }
    const m = p.match(/^\/form\/p\/([a-z0-9-]+)$/);
    if (m) return sendHtml(res, stubPage('form', m[1])), true;
    return false;
  };
}
