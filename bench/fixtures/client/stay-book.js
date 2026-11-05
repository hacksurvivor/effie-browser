(function () {
  var form = document.getElementById('details');
  var status = document.getElementById('form-status');
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function setError(input, msg) {
    var err = document.getElementById(input.id + '-error');
    if (!err) return;
    if (msg) {
      err.textContent = msg;
      err.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      var ids = [input.id + '-error'];
      var hint = document.getElementById(input.id + '-hint');
      if (hint) ids.unshift(hint.id);
      input.setAttribute('aria-describedby', ids.join(' '));
    } else {
      err.hidden = true;
      err.textContent = '';
      input.removeAttribute('aria-invalid');
      var h = document.getElementById(input.id + '-hint');
      if (h) input.setAttribute('aria-describedby', h.id);
      else input.removeAttribute('aria-describedby');
    }
  }
  var rules = {
    name: function (v) { return v.trim() ? '' : 'Enter your full name.'; },
    email: function (v) { return EMAIL_RE.test(v.trim()) ? '' : 'Enter a valid email address, like name@example.com.'; },
    phone: function (v) { return v.trim() ? '' : 'Enter a phone number.'; },
    arrival: function (v) { return v ? '' : 'Choose your arrival time.'; }
  };
  Object.keys(rules).forEach(function (id) {
    var el = document.getElementById(id);
    el.addEventListener('input', function () { if (el.getAttribute('aria-invalid')) setError(el, rules[id](el.value)); });
    el.addEventListener('change', function () { if (el.getAttribute('aria-invalid')) setError(el, rules[id](el.value)); });
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var first = null;
    Object.keys(rules).forEach(function (id) {
      var el = document.getElementById(id);
      var msg = rules[id](el.value);
      setError(el, msg);
      if (msg && !first) first = el;
    });
    if (first) { first.focus(); return; }
    var btn = document.getElementById('continue');
    btn.disabled = true;
    status.textContent = 'Saving your details...';
    fetch('/stay/api/details', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        room: form.dataset.room,
        name: document.getElementById('name').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
        arrival: document.getElementById('arrival').value,
        requests: document.getElementById('requests').value
      })
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok) throw new Error('save failed');
        location.href = '/stay/pay?booking=' + encodeURIComponent(x.j.bookingId);
      })
      .catch(function () { btn.disabled = false; status.textContent = 'Something went wrong. Please try again.'; });
  });
})();
