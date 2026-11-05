(function () {
  var ALL = JSON.parse(document.getElementById('rows').textContent);
  var PER = 20;
  var st = { q: '', key: null, dir: 'asc', page: 1 };
  var tbody = document.getElementById('tbody');
  var pager = document.getElementById('pager');
  var summary = document.getElementById('summary');
  var q = document.getElementById('q');
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function filtered() {
    var t = st.q.trim().toLowerCase();
    var list = ALL.filter(function (r) { return !t || r.customer.toLowerCase().indexOf(t) >= 0; });
    if (st.key) {
      var k = st.key, d = st.dir === 'asc' ? 1 : -1;
      list = list.slice().sort(function (a, b) {
        var x = a[k], y = b[k];
        var c = typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'en', { numeric: true });
        return c * d || (a.number < b.number ? -1 : 1);
      });
    }
    return list;
  }
  function render(focusPager) {
    var list = filtered();
    var pages = Math.max(1, Math.ceil(list.length / PER));
    if (st.page > pages) st.page = pages;
    var start = (st.page - 1) * PER;
    var slice = list.slice(start, start + PER);
    tbody.innerHTML = slice.map(function (r) {
      return '<tr><th scope="row">' + esc(r.number) + '</th><td>' + esc(r.customer) + '</td><td>' + esc(r.issuedText) + '</td><td>' + esc(r.dueText) +
        '</td><td class="num">' + esc(r.amountText) + '</td><td><span class="badge ' + r.status.toLowerCase() + '">' + esc(r.status) + '</span></td></tr>';
    }).join('') || '<tr><td colspan="6">No invoices match your search.</td></tr>';
    summary.textContent = list.length
      ? 'Showing ' + (start + 1) + '-' + (start + slice.length) + ' of ' + list.length + ' invoices'
      : 'Showing 0 invoices';
    document.querySelectorAll('#inv thead th').forEach(function (th) {
      th.setAttribute('aria-sort', th.dataset.key === st.key ? (st.dir === 'asc' ? 'ascending' : 'descending') : 'none');
    });
    var h = '<button type="button" data-p="' + (st.page - 1) + '"' + (st.page === 1 ? ' disabled' : '') + '>Previous</button>';
    for (var i = 1; i <= pages; i++) {
      h += '<button type="button" data-p="' + i + '"' + (i === st.page ? ' aria-current="page"' : '') + ' aria-label="Page ' + i + '">' + i + '</button>';
    }
    h += '<button type="button" data-p="' + (st.page + 1) + '"' + (st.page === pages ? ' disabled' : '') + '>Next</button>';
    pager.innerHTML = h;
    if (focusPager) {
      var cur = pager.querySelector('[aria-current=page]');
      if (cur) cur.focus();
    }
  }
  q.addEventListener('input', function () { st.q = q.value; st.page = 1; render(false); });
  pager.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-p]');
    if (!b || b.disabled) return;
    st.page = parseInt(b.dataset.p, 10);
    render(true);
  });
  document.querySelector('#inv thead').addEventListener('click', function (e) {
    var th = e.target.closest('th[data-key]');
    if (!th) return;
    var k = th.dataset.key;
    if (st.key === k) st.dir = st.dir === 'asc' ? 'desc' : 'asc';
    else { st.key = k; st.dir = 'asc'; }
    st.page = 1;
    render(false);
    var again = document.querySelector('#inv thead th[data-key="' + k + '"] button');
    if (again) again.focus();
  });
  render(false);
})();
