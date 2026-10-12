'use strict';
/* ---------- SETTINGS: edit these (public info only, never put secret keys here) ---------- */
const CONFIG = {
  WHATSAPP: '233554304847',   // your WhatsApp number, international format, no + or spaces
  GROUP_LINK: ''              // paste your WhatsApp group invite link here; the button stays hidden while empty
};
/* ------------------------------------------------------------------------------------------ */

const $ = id => document.getElementById(id);
const waLink = text => 'https://wa.me/' + CONFIG.WHATSAPP + (text ? '?text=' + encodeURIComponent(text) : '');
const phoneOk = p => /^0\d{9}$/.test(p.replace(/\s/g, ''));
const emailOk = e => /^\S+@\S+\.\S+$/.test(e);
const show = (id, on) => { $(id).style.display = on ? 'flex' : 'none'; };
const REF_RE = /^ORC_[A-F0-9]{16}$/;

const NETWORKS = {
  mtn:     { section: 'mtn-section',     label: 'MTN',        color: '#FFB100' },
  telecel: { section: 'telecel-section', label: 'Telecel',    color: '#E60000' },
  tigo:    { section: 'tigo-section',    label: 'AirtelTigo', color: '#0056FF' }
};

let catalog = null;          // loaded from the server: products + bundles
let testMode = false;
let current = null;          // product the customer is about to buy
const memory = {};           // reference -> { phone, email, secret } kept only in this tab's memory

$('wa-chat').href = waLink('');
if (CONFIG.GROUP_LINK) { $('wa-group').href = CONFIG.GROUP_LINK; $('wa-group').hidden = false; }

/* ---------- small helpers ---------- */
function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

async function api(path, opts) {
  const res = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts));
  let data = {};
  try { data = await res.json(); } catch (e) { /* no body */ }
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

/* ---------- catalog (prices come from the server) ---------- */
function renderBundles() {
  for (const [key, cfg] of Object.entries(NETWORKS)) {
    const box = $(cfg.section);
    box.textContent = '';
    for (const id of catalog.bundles[key]) {
      const p = catalog.products[id];
      const card = h('div', 'product-card');
      const left = h('div');
      const badge = h('div', 'network-badge');
      const dot = h('span', 'network-dot');
      dot.style.background = cfg.color;
      badge.append(dot, document.createTextNode(cfg.label));
      const pillWrap = h('div');
      pillWrap.append(h('span', 'data-pill', p.desc));
      left.append(badge, pillWrap, h('div', 'price-text', 'GHS ' + p.price + '.00'));
      const btn = h('button', 'buy-btn', 'Buy Now');
      btn.dataset.product = id;
      card.append(left, btn);
      box.append(card);
    }
  }
}

async function loadCatalog() {
  try {
    catalog = await api('/api/catalog');
    testMode = catalog.testMode;
    $('test-banner').hidden = !testMode;
    $('pm-test-hint').hidden = !testMode;
    renderBundles();
  } catch (e) {
    alert('Could not load prices. Please refresh the page.');
  }
}

/* ---------- network tabs ---------- */
document.querySelectorAll('.network-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.network-btn').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    const target = $(btn.dataset.target);
    target.classList.add('active');
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

/* ---------- buy flow ---------- */
document.addEventListener('click', e => {
  const btn = e.target.closest('.buy-btn[data-product]');
  if (!btn) return;
  const p = catalog && catalog.products[btn.dataset.product];
  if (!p) { alert('Prices are still loading. Please try again in a moment.'); return; }
  current = p;
  $('new-modal-service').textContent = p.service;
  $('new-modal-desc').textContent = p.desc;
  $('new-modal-price').textContent = 'GHS ' + p.price + '.00';
  $('pm-error').textContent = '';
  show('newPurchaseModal', true);
  $('new-modal-phone').focus();
});

function closePurchase() { show('newPurchaseModal', false); }
$('pm-close').addEventListener('click', closePurchase);
$('new-cancel').addEventListener('click', closePurchase);
$('ok-close').addEventListener('click', () => show('successModal', false));
['newPurchaseModal', 'successModal'].forEach(id => {
  $(id).addEventListener('click', e => { if (e.target === $(id)) show(id, false); });
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { show('newPurchaseModal', false); show('successModal', false); }
});

$('new-confirm').addEventListener('click', async () => {
  if (!current) return;
  const phone = $('new-modal-phone').value.replace(/\s/g, '');
  const email = $('new-modal-email').value.trim();
  if (!phoneOk(phone)) { $('pm-error').textContent = 'Enter a valid 10-digit phone number, like 0551234567.'; return; }
  if (!emailOk(email)) { $('pm-error').textContent = 'Enter a valid email address.'; return; }
  $('pm-error').textContent = '';
  const ok = await startPayment({ productId: current.id, phone, email }, $('pm-error'), $('new-confirm'));
  if (ok) closePurchase();
});

/* ---------- iShare registration ---------- */
$('alpha-buy').addEventListener('click', async () => {
  const v = id => $(id).value.trim();
  const err = $('alpha-error');
  if (!v('alpha-name') || !v('alpha-card') || !v('alpha-location') || !v('alpha-work')) { err.textContent = 'Please fill in every field.'; return; }
  if (!phoneOk(v('alpha-phone'))) { err.textContent = 'Enter a valid 10-digit phone number.'; return; }
  if (!emailOk(v('alpha-email'))) { err.textContent = 'Enter a valid email address.'; return; }
  err.textContent = '';
  await startPayment({
    productId: 'ishare-reg',
    phone: v('alpha-phone').replace(/\s/g, ''),
    email: v('alpha-email'),
    details: { fullName: v('alpha-name'), location: v('alpha-location'), work: v('alpha-work') },
    // The Ghana Card number never goes to our server or Paystack; it only goes into the WhatsApp message to you.
    secret: [['Ghana Card', v('alpha-card')]]
  }, err, $('alpha-buy'));
});

/* ---------- payment ---------- */
async function startPayment(opts, errEl, button) {
  const label = button.textContent;
  button.disabled = true; button.textContent = 'Please wait…';
  try {
    const body = { productId: opts.productId, phone: opts.phone, email: opts.email, details: opts.details };
    const o = await api('/api/orders', { method: 'POST', body: JSON.stringify(body) });
    memory[o.reference] = { phone: opts.phone, email: opts.email, secret: opts.secret || [] };
    openCheckout(o);
    return true;
  } catch (e) {
    errEl.textContent = e.message;
    return false;
  } finally {
    button.disabled = false; button.textContent = label;
  }
}

function openCheckout(o) {
  if (typeof PaystackPop === 'undefined') { window.location.href = o.authorizationUrl; return; }
  try {
    const popup = new PaystackPop();
    popup.resumeTransaction(o.accessCode, {
      onSuccess: () => confirmPayment(o.reference),
      onCancel: () => { /* customer closed the popup; nothing was charged */ },
      onError: () => { window.location.href = o.authorizationUrl; }
    });
  } catch (e) {
    window.location.href = o.authorizationUrl; // fall back to Paystack's hosted page
  }
}

function setResult(title, text, ref, showWa) {
  $('ok-title').textContent = title;
  $('ok-text').textContent = text;
  $('ok-ref').textContent = ref ? 'Reference: ' + ref : '';
  $('ok-ref').hidden = !ref;
  $('ok-wa').hidden = !showWa;
  $('ok-note').hidden = !showWa;
  show('successModal', true);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// The browser callback is NOT proof of payment: always ask our server, which asks Paystack.
async function confirmPayment(reference) {
  setResult('Confirming payment…', 'Please wait while we confirm your payment. Do not close this page.', reference, false);
  let last = null;
  for (let i = 0; i < 6; i++) {
    try {
      last = await api('/api/orders/' + reference + '/verify');
      if (last.status !== 'pending') break;
    } catch (e) { /* try again */ }
    await sleep(2000);
  }
  if (last && last.status === 'paid') return showPaid(last);
  if (last && last.status === 'failed') {
    return setResult('Payment not completed', 'The payment did not go through and you were not charged. Please try again.', reference, false);
  }
  setResult('Still confirming…', 'We could not confirm your payment yet. If money left your account, do not pay again. Send the reference below to us on WhatsApp and we will check it.', reference, false);
}

function showPaid(r) {
  const m = memory[r.reference] || {};
  const lines = [
    (r.testMode ? '[TEST] ' : '') + "New order from Oracle's Data Hub",
    'Service: ' + r.service,
    'Details: ' + r.description,
    'Amount: GHS ' + r.amount.toFixed(2),
    'Payment reference: ' + r.reference
  ];
  if (m.phone) lines.push('Phone: ' + m.phone);
  if (m.email) lines.push('Email: ' + m.email);
  if (r.productId === 'ishare-reg') {
    const card = (m.secret || []).find(s => s[0] === 'Ghana Card');
    lines.push('Ghana Card: ' + (card ? card[1] : '(please type your Ghana Card number here)'));
  }
  setResult('Payment received ✓',
    r.service + ' (' + r.description + '), GHS ' + r.amount.toFixed(2) + (r.testMode ? '. This was a TEST payment.' : '.'),
    r.reference, true);
  $('ok-wa').href = waLink(lines.join('\n'));
}

/* ---------- returning from Paystack's hosted page (redirect fallback / mobile) ---------- */
function checkReturn() {
  const params = new URLSearchParams(location.search);
  const ref = params.get('reference') || params.get('trxref');
  if (ref && REF_RE.test(ref)) {
    history.replaceState(null, '', location.pathname);
    confirmPayment(ref);
  }
}

/* ---------- top buttons ---------- */
$('btn-verify').addEventListener('click', () => {
  window.open(waLink("Hi, I paid on Oracle's Data Hub and want to verify my payment. My reference is: "), '_blank');
});
$('btn-track').addEventListener('click', () => {
  window.open(waLink("Hi, I want to track my order from Oracle's Data Hub. My reference is: "), '_blank');
});
$('btn-share').addEventListener('click', async () => {
  const data = { title: "Oracle's Data Hub", text: 'Buy data bundles, result checkers and more.', url: location.href };
  try {
    if (navigator.share) { await navigator.share(data); }
    else { await navigator.clipboard.writeText(location.href); alert('Link copied!'); }
  } catch (err) { /* share cancelled */ }
});

loadCatalog().then(checkReturn);
