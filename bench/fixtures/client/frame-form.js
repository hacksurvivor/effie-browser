(function () {
  var form = document.getElementById('ticket');
  function setError(id, msg) {
    var el = document.getElementById(id);
    var err = document.getElementById(id + '-error');
    if (msg) {
      err.textContent = msg; err.hidden = false;
      el.setAttribute('aria-invalid', 'true');
      var hint = document.getElementById(id + '-hint');
      el.setAttribute('aria-describedby', (hint ? hint.id + ' ' : '') + err.id);
    } else {
      err.hidden = true; err.textContent = '';
      el.removeAttribute('aria-invalid');
      el.removeAttribute('aria-describedby');
    }
  }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var topic = document.getElementById('topic').value;
    var order = document.getElementById('order').value.trim();
    var message = document.getElementById('message').value.trim();
    var bad = [];
    var tMsg = topic ? '' : 'Choose a topic.';
    var oMsg = topic === 'order-issue' && !order ? 'Enter your order number.' : '';
    var mMsg = message ? '' : 'Write a message.';
    setError('topic', tMsg); setError('order', oMsg); setError('message', mMsg);
    if (tMsg) bad.push('topic'); if (oMsg) bad.push('order'); if (mMsg) bad.push('message');
    if (bad.length) { document.getElementById(bad[0]).focus(); return; }
    document.getElementById('submit').disabled = true;
    fetch('/frame/api/ticket', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ topic: topic, order: order, message: message })
    })
      .then(function (r) { if (!r.ok) throw new Error('fail'); return r.json(); })
      .then(function (d) {
        form.hidden = true;
        var done = document.getElementById('done');
        done.hidden = false;
        done.innerHTML = '<h2>Ticket received</h2><p>Thanks, we have your message. Your reference is <strong>' + d.ticketId + '</strong>.</p>';
      })
      .catch(function () { document.getElementById('submit').disabled = false; });
  });
})();
