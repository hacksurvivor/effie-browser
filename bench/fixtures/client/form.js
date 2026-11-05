(function () {
  var form = document.getElementById('apply');
  var summary = document.getElementById('error-summary');
  var list = document.getElementById('error-list');
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function $(id) { return document.getElementById(id); }
  function val(id) { return $(id).value.trim(); }
  function radio(name) { var r = form.querySelector('input[name="' + name + '"]:checked'); return r ? r.value : ''; }

  // [fieldId (focus target), label for summary, check -> message or '']
  var checks = [
    ['first-name', function () { return val('first-name') ? '' : 'Enter your first name'; }],
    ['last-name', function () { return val('last-name') ? '' : 'Enter your last name'; }],
    ['dob', function () { return val('dob') ? '' : 'Enter your date of birth'; }],
    ['email', function () { return EMAIL_RE.test(val('email')) ? '' : 'Enter a valid email address'; }],
    ['phone', function () { return val('phone') ? '' : 'Enter your phone number'; }],
    ['street', function () { return val('street') ? '' : 'Enter your street address'; }],
    ['city', function () { return val('city') ? '' : 'Enter your city'; }],
    ['postcode', function () { return val('postcode') ? '' : 'Enter your postcode'; }],
    ['country', function () { return val('country') ? '' : 'Select your country'; }],
    ['company', function () { return val('company') ? '' : 'Enter your current company'; }],
    ['role', function () { return val('role') ? '' : 'Enter your current role'; }],
    ['years', function () { var v = val('years'); return v !== '' && Number(v) >= 0 ? '' : 'Enter your years of experience'; }],
    ['emp-full-time', function () { return radio('employmentType') ? '' : 'Choose an employment type'; }, 'employmentType'],
    ['start-date', function () { return val('start-date') ? '' : 'Enter your earliest start date'; }],
    ['cm-email', function () { return radio('contactMethod') ? '' : 'Choose a contact method'; }, 'contactMethod'],
    ['consent', function () { return $('consent').checked ? '' : 'Confirm that you agree to the data consent'; }]
  ];
  function setErr(key, msg, firstControl) {
    var err = $(key + '-error');
    var ctl = firstControl;
    if (!err) return;
    if (msg) {
      err.textContent = msg; err.hidden = false;
      if (ctl.type === 'radio') form.querySelectorAll('input[name="' + key + '"]').forEach(function (r) { r.setAttribute('aria-invalid', 'true'); });
      else { ctl.setAttribute('aria-invalid', 'true'); ctl.setAttribute('aria-describedby', err.id); }
    } else {
      err.hidden = true; err.textContent = '';
      if (ctl.type === 'radio') form.querySelectorAll('input[name="' + key + '"]').forEach(function (r) { r.removeAttribute('aria-invalid'); });
      else { ctl.removeAttribute('aria-invalid'); var h = $(key + '-hint'); if (h) ctl.setAttribute('aria-describedby', h.id); else ctl.removeAttribute('aria-describedby'); }
    }
  }
  function validate() {
    var problems = [];
    checks.forEach(function (c) {
      var id = c[0], msg = c[1](), key = c[2] || id;
      setErr(key, msg, $(id));
      if (msg) problems.push({ id: id, msg: msg });
    });
    return problems;
  }
  function showSummary(problems) {
    list.innerHTML = '';
    problems.forEach(function (p) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = '#' + p.id; a.textContent = p.msg; a.dataset.target = p.id;
      li.appendChild(a); list.appendChild(li);
    });
    summary.hidden = problems.length === 0;
    if (problems.length) { summary.focus(); summary.scrollIntoView(); }
  }
  list.addEventListener('click', function (e) {
    var a = e.target.closest('a[data-target]');
    if (!a) return;
    e.preventDefault();
    var el = $(a.dataset.target);
    el.focus(); el.scrollIntoView({ block: 'center' });
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var problems = validate();
    showSummary(problems);
    if (problems.length) return;
    var btn = $('submit');
    btn.disabled = true;
    var body = {
      firstName: val('first-name'), lastName: val('last-name'), dob: val('dob'), email: val('email'), phone: val('phone'),
      street: val('street'), city: val('city'), postcode: val('postcode'), country: val('country'),
      company: val('company'), role: val('role'), years: val('years'), employmentType: radio('employmentType'), startDate: val('start-date'),
      newsletter: $('newsletter').checked, contactMethod: radio('contactMethod'),
      interests: Array.prototype.map.call(form.querySelectorAll('input[name=interests]:checked'), function (i) { return i.value; }),
      notes: $('notes').value.trim(), consent: $('consent').checked
    };
    fetch('/form/api/apply', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok) throw new Error('fail');
        location.href = '/form/thanks?ref=' + encodeURIComponent(x.j.ref);
      })
      .catch(function () { btn.disabled = false; showSummary([{ id: 'submit', msg: 'We could not submit your application. Try again.' }]); });
  });
})();
