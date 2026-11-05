(function () {
  var init = JSON.parse(document.getElementById('init').textContent);
  var seq = new Map();
  var extra = new Map();
  init.products.forEach(function (p) { seq.set(p.id, p); });
  var st = { nextPage: 2, hasMore: init.hasMore, loading: false, token: 0, filterLoading: false };
  var grid = document.getElementById('grid');
  var countEl = document.getElementById('count');
  var memory = document.getElementById('memory');
  var sort = document.getElementById('sort');
  var loadMore = document.getElementById('load-more');
  var sentinel = document.getElementById('sentinel');
  var cartCount = document.getElementById('cart-count');
  var toastEl = document.getElementById('toast');

  function money(n) { return '$' + n.toLocaleString('en-US'); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function brands() { return Array.prototype.map.call(document.querySelectorAll('input[name=brand]:checked'), function (i) { return i.value; }); }
  function isDefault() { return !brands().length && !memory.value && sort.value === 'featured'; }
  function byId(a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; }
  function pool() {
    if (isDefault()) return Array.from(seq.values());
    var m = new Map(seq);
    extra.forEach(function (v, k) { m.set(k, v); });
    return Array.from(m.values());
  }
  function view() {
    var b = brands();
    var mem = memory.value;
    var list = pool().filter(function (p) {
      return (!b.length || b.indexOf(p.brand) >= 0) && (!mem || String(p.memory) === mem);
    });
    if (sort.value === 'price_asc') list.sort(function (x, y) { return x.price - y.price || byId(x, y); });
    else if (sort.value === 'price_desc') list.sort(function (x, y) { return y.price - x.price || byId(x, y); });
    else list.sort(byId);
    return list;
  }
  function card(p) {
    return '<li><article class="card" aria-labelledby="t-' + p.id + '">' +
      '<h3 id="t-' + p.id + '">' + esc(p.name) + '</h3>' +
      '<ul class="spec"><li>Brand: ' + esc(p.brand) + '</li><li>Memory: ' + p.memory + ' GB</li><li>Storage: ' + (p.storage >= 1024 ? p.storage / 1024 + ' TB' : p.storage + ' GB') + ' SSD</li><li>' + esc(p.cpu) + '</li></ul>' +
      '<p class="price">' + money(p.price) + '</p>' +
      '<button type="button" class="btn" data-id="' + p.id + '" data-name="' + esc(p.name) + '" aria-label="Add to cart: ' + esc(p.name) + '">Add to cart</button>' +
      '</article></li>';
  }
  function moreAvailable() { return isDefault() && st.hasMore; }
  function render() {
    var list = view();
    grid.innerHTML = list.map(card).join('');
    var txt = list.length + (list.length === 1 ? ' laptop' : ' laptops');
    if (st.filterLoading) txt += ' so far, loading all matching products...';
    else if (moreAvailable()) txt += ' shown, scroll or press Load more for the rest';
    countEl.textContent = txt;
    loadMore.hidden = !moreAvailable();
    sentinel.hidden = !moreAvailable();
  }
  function rewatch() { if (io) { io.unobserve(sentinel); if (moreAvailable()) io.observe(sentinel); } }

  function loadNext() {
    if (!isDefault() || st.loading || !st.hasMore) return;
    st.loading = true;
    loadMore.disabled = true;
    countEl.textContent = 'Loading more laptops...';
    fetch('/shop/api/products?page=' + st.nextPage)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        d.products.forEach(function (p) { seq.set(p.id, p); });
        st.nextPage++;
        st.hasMore = d.hasMore;
      })
      .catch(function () { countEl.textContent = 'Could not load more laptops.'; })
      .then(function () { st.loading = false; loadMore.disabled = false; render(); rewatch(); });
  }

  function fetchAll(tok) {
    var q = new URLSearchParams();
    var b = brands();
    if (b.length) q.set('brand', b.join(','));
    if (memory.value) q.set('memory', memory.value);
    if (sort.value !== 'featured') q.set('sort', sort.value);
    return fetch('/shop/api/products?' + q.toString())
      .then(function (r) { return r.json(); })
      .then(function (d) {
        d.products.forEach(function (p) { extra.set(p.id, p); });
        if (tok === st.token) st.filterLoading = false;
        render();
      })
      .catch(function () { if (tok === st.token) { st.filterLoading = false; render(); } });
  }
  function applyFilters() {
    st.token++;
    if (isDefault()) { st.filterLoading = false; render(); rewatch(); return; }
    st.filterLoading = true;
    render();
    fetchAll(st.token);
  }
  document.getElementById('filters').addEventListener('change', applyFilters);
  sort.addEventListener('change', applyFilters);
  loadMore.addEventListener('click', loadNext);

  var io = null;
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) loadNext();
    }, { rootMargin: '200px' });
  }

  var toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.textContent = ''; }, 3000);
  }
  grid.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-id]');
    if (!btn) return;
    fetch('/shop/api/cart', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: btn.dataset.id })
    })
      .then(function (r) { return r.json(); })
      .then(function (d) { cartCount.textContent = d.count; toast('Added ' + btn.dataset.name + ' to cart'); });
  });
  fetch('/shop/api/cart').then(function (r) { return r.json(); }).then(function (d) { cartCount.textContent = d.count; });

  function setCookie(k, v) { document.cookie = k + '=' + v + '; path=/shop; max-age=86400; samesite=lax'; }
  function hasCookie(k) { return document.cookie.split(';').some(function (c) { return c.trim().indexOf(k + '=') === 0; }); }
  var epoch = (document.getElementById('newsletter') || {}).dataset ? document.getElementById('newsletter').dataset.epoch : '';
  var banner = document.getElementById('cookie-banner');
  if (banner) {
    banner.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-consent]');
      if (!b) return;
      setCookie('bench_consent_' + epoch, b.dataset.consent);
      banner.remove();
    });
  }
  var dlg = document.getElementById('newsletter');
  if (!hasCookie('bench_nl_' + epoch) && dlg && dlg.showModal) {
    setTimeout(function () { if (!dlg.open) dlg.showModal(); }, 2000);
  }
  dlg.addEventListener('close', function () { setCookie('bench_nl_' + epoch, '1'); });
  document.getElementById('nl-close').addEventListener('click', function () { dlg.close(); });
  document.getElementById('nl-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var input = document.getElementById('nl-email');
    var err = document.getElementById('nl-error');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim())) {
      err.textContent = 'Enter a valid email address.';
      err.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', 'nl-error');
      input.focus();
      return;
    }
    dlg.close();
    toast('Thanks for subscribing');
  });

  render();
  rewatch();
})();
