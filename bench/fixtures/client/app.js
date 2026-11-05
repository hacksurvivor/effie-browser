(function () {
  var view = document.getElementById('view');
  var toastEl = document.getElementById('toast');
  var token = 0;
  var TITLES = { overview: 'Overview', projects: 'Projects', settings: 'Settings' };

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function routeOf(path) {
    var p = path.replace(/^\/app\/?/, '').replace(/\/+$/, '');
    if (p === '' || p === 'overview') return { name: 'overview' };
    if (p === 'projects' || p === 'settings') return { name: p };
    if (p.indexOf('p/') === 0) return { name: 'stub', slug: p.slice(2) };
    return { name: 'notfound' };
  }
  function skeleton(title) {
    return '<div class="skeleton" role="status" aria-busy="true"><span class="sr-only">Loading ' + esc(title) + '...</span>' +
      '<div class="sk h"></div><div class="sk b"></div><div class="sk b"></div><div class="sk"></div><div class="sk"></div></div>';
  }
  function setNav(name) {
    var map = { overview: 'Overview', projects: 'Projects', settings: 'Settings' };
    document.querySelectorAll('header nav a').forEach(function (a) {
      if (map[name] && a.textContent.trim() === map[name]) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }
  function done(title) {
    document.title = title + ' - Acme dashboard';
    var h = view.querySelector('h1');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }
  var renderers = {
    overview: function (d) {
      return '<h1>Overview</h1><section aria-labelledby="st-h"><h2 id="st-h">This month</h2><div class="stats">' +
        d.stats.map(function (s) { return '<div class="card stat"><span>' + esc(s.label) + '</span><b>' + esc(s.value) + '</b></div>'; }).join('') +
        '</div></section><section aria-labelledby="ac-h"><h2 id="ac-h">Recent activity</h2><ul>' +
        d.activity.map(function (a) { return '<li><strong>' + esc(a.who) + '</strong> ' + esc(a.what) + ' <span class="hint">- ' + esc(a.when) + '</span></li>'; }).join('') +
        '</ul></section>';
    },
    projects: function (d) {
      return '<h1>Projects</h1><table><caption class="sr-only">All projects</caption><thead><tr><th scope="col">Project</th><th scope="col">Owner</th><th scope="col">Status</th><th scope="col">Last updated</th></tr></thead><tbody>' +
        d.projects.map(function (p) { return '<tr><th scope="row">' + esc(p.name) + '</th><td>' + esc(p.owner) + '</td><td>' + esc(p.status) + '</td><td>' + esc(p.updated) + '</td></tr>'; }).join('') +
        '</tbody></table>';
    },
    settings: function (d) {
      return '<h1>Settings</h1><form id="settings-form" novalidate>' +
        '<section aria-labelledby="pf-h"><h2 id="pf-h">Profile</h2>' +
        '<div class="field"><label for="profile-name">Name</label><input type="text" id="profile-name" name="profileName" autocomplete="name" value="' + esc(d.profileName) + '"></div></section>' +
        '<section aria-labelledby="nt-h"><h2 id="nt-h">Notifications</h2>' +
        '<div class="field"><label for="notification-email">Notification email</label><input type="email" id="notification-email" name="notificationEmail" autocomplete="email" value="' + esc(d.notificationEmail) + '"></div>' +
        '<fieldset class="plain"><legend class="sr-only">Email preferences</legend>' +
        '<div class="choice"><input type="checkbox" id="weekly-summary" name="weeklySummary"' + (d.weeklySummary ? ' checked' : '') + '><label for="weekly-summary">Weekly summary</label></div>' +
        '<div class="choice"><input type="checkbox" id="product-news" name="productNews"' + (d.productNews ? ' checked' : '') + '><label for="product-news">Product news</label></div>' +
        '</fieldset></section>' +
        '<button type="submit" class="btn" id="save">Save</button></form>';
    },
    stub: function (_d, r) {
      var label = r.slug.replace(/-/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); });
      return '<h1>' + esc(label) + '</h1><p>This section is not part of the demo. <a href="/app/" data-spa>Back to the overview</a>.</p>';
    },
    notfound: function () {
      return '<h1>Page not found</h1><p>We could not find that page. <a href="/app/" data-spa>Back to the overview</a>.</p>';
    }
  };

  function toast(msg) {
    toastEl.textContent = msg;
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { toastEl.textContent = ''; }, 3000);
  }
  function bindSettings() {
    var form = document.getElementById('settings-form');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = document.getElementById('save');
      btn.disabled = true;
      fetch('/app/api/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          profileName: document.getElementById('profile-name').value,
          notificationEmail: document.getElementById('notification-email').value,
          weeklySummary: document.getElementById('weekly-summary').checked,
          productNews: document.getElementById('product-news').checked
        })
      })
        .then(function (r) { if (!r.ok) throw new Error('save'); return r.json(); })
        .then(function () { toast('Saved'); })
        .catch(function () { toast('Could not save. Try again.'); })
        .then(function () { btn.disabled = false; });
    });
  }

  function render() {
    var r = routeOf(location.pathname);
    var my = ++token;
    setNav(r.name);
    if (TITLES[r.name]) {
      view.innerHTML = skeleton(TITLES[r.name]);
      document.title = 'Loading - Acme dashboard';
      fetch('/app/api/' + r.name)
        .then(function (res) { if (!res.ok) throw new Error('load'); return res.json(); })
        .then(function (data) {
          if (my !== token) return;
          view.innerHTML = renderers[r.name](data, r);
          if (r.name === 'settings') bindSettings();
          done(TITLES[r.name]);
        })
        .catch(function () {
          if (my !== token) return;
          view.innerHTML = '<div role="alert"><h1>Something went wrong</h1><p>We could not load this page. <a href="' + location.pathname + '" data-spa>Try again</a>.</p></div>';
        });
    } else {
      view.innerHTML = renderers[r.name]({}, r);
      done(r.name === 'stub' ? r.slug : 'Not found');
    }
  }
  function go(path) {
    history.pushState({}, '', path);
    render();
    window.scrollTo(0, 0);
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href]');
    if (!a || a.getAttribute('href').charAt(0) === '#' || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var u = new URL(a.href, location.href);
    if (u.origin !== location.origin || u.pathname.indexOf('/app') !== 0 || u.pathname.indexOf('/app/api/') === 0) return;
    e.preventDefault();
    go(u.pathname);
  });
  window.addEventListener('popstate', render);
  render();
})();
