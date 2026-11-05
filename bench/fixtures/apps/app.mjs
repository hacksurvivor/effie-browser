import { page, esc, readBody, sendJson, sendHtml, sleep } from '../lib.mjs';

const DEFAULT_SETTINGS = {
  profileName: 'Jordan Lee',
  notificationEmail: 'jordan@acme.test',
  weeklySummary: false,
  productNews: true,
};

const OVERVIEW = {
  stats: [
    { label: 'Active projects', value: '12' },
    { label: 'Open tasks', value: '248' },
    { label: 'Deploys this week', value: '31' },
    { label: 'Uptime (30 days)', value: '99.97%' },
  ],
  activity: [
    { who: 'Priya N.', what: 'merged "Fix login redirect" into web-app', when: '12 minutes ago' },
    { who: 'Marcus T.', what: 'created project "Billing revamp"', when: '1 hour ago' },
    { who: 'Dana K.', what: 'closed 6 tasks in mobile-api', when: '3 hours ago' },
    { who: 'Jordan L.', what: 'invited sam@acme.test to the workspace', when: 'Yesterday' },
    { who: 'Priya N.', what: 'deployed web-app v4.12.0 to production', when: 'Yesterday' },
  ],
};

const PROJECTS = [
  { name: 'web-app', owner: 'Priya N.', status: 'Active', updated: '12 minutes ago' },
  { name: 'mobile-api', owner: 'Dana K.', status: 'Active', updated: '3 hours ago' },
  { name: 'Billing revamp', owner: 'Marcus T.', status: 'Planning', updated: '1 hour ago' },
  { name: 'Design system', owner: 'Ola S.', status: 'Active', updated: '2 days ago' },
  { name: 'Data pipeline', owner: 'Chen W.', status: 'On hold', updated: '1 week ago' },
  { name: 'Internal tools', owner: 'Jordan L.', status: 'Active', updated: '4 days ago' },
  { name: 'Docs site', owner: 'Ola S.', status: 'Archived', updated: '3 months ago' },
  { name: 'Onboarding emails', owner: 'Marcus T.', status: 'Planning', updated: '5 days ago' },
];

export function appApp({ state }) {
  const current = () => ({ ...DEFAULT_SETTINGS, ...(state.settings.at(-1) || {}) });
  return async function handle(req, res, url) {
    const p = url.pathname;
    if (p.startsWith('/app/api/')) {
      const view = p.slice('/app/api/'.length);
      await sleep(300 + Math.floor(Math.random() * 900)); // random 300-1200 ms is fine here
      if (view === 'overview' && req.method === 'GET') return sendJson(res, 200, OVERVIEW), true;
      if (view === 'projects' && req.method === 'GET') return sendJson(res, 200, { projects: PROJECTS }), true;
      if (view === 'settings' && req.method === 'GET') return sendJson(res, 200, current()), true;
      if (view === 'settings' && req.method === 'PUT') {
        const b = await readBody(req);
        if (!b) return sendJson(res, 400, { error: 'invalid json' }), true;
        const rec = {
          notificationEmail: String(b.notificationEmail ?? ''),
          weeklySummary: !!b.weeklySummary,
          productNews: !!b.productNews,
          profileName: String(b.profileName ?? DEFAULT_SETTINGS.profileName),
        };
        state.settings.push(rec);
        return sendJson(res, 200, rec), true;
      }
      return sendJson(res, 404, { error: 'not found' }), true;
    }
    if (p === '/app' || p.startsWith('/app/')) {
      return sendHtml(res, shell()), true;
    }
    return false;
  };
}

function shell() {
  return page({
    app: 'app',
    title: 'Acme dashboard',
    head: '<style>.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin:12px 0}.stat b{display:block;font-size:26px}.sk-card{height:80px!important}</style>',
    main: `<div id="view" aria-live="off"></div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>`,
    scripts: '<script src="/_static/app.js" defer></script>',
  });
}
