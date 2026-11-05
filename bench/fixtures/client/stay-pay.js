(function () {
  var btn = document.getElementById('pay');
  var status = document.getElementById('pay-status');
  btn.addEventListener('click', function () {
    btn.disabled = true;
    status.textContent = 'Processing payment...';
    var id = btn.dataset.booking;
    fetch('/stay/api/pay', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bookingId: id })
    })
      .then(function (r) { if (!r.ok) throw new Error('pay failed'); return r.json(); })
      .then(function () { location.href = '/stay/confirmation?booking=' + encodeURIComponent(id); })
      .catch(function () { btn.disabled = false; status.textContent = 'Payment failed. Please try again.'; });
  });
})();
