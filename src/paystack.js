'use strict';
const API = 'https://api.paystack.co';

function secret() {
  const k = process.env.PAYSTACK_SECRET_KEY;
  if (!k) throw new Error('PAYSTACK_SECRET_KEY is not set');
  return k;
}

async function call(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${secret()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000)
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok || !json || json.status !== true) {
    const msg = (json && json.message) || `Paystack error (HTTP ${res.status})`;
    const err = new Error(msg);
    err.httpStatus = res.status;
    throw err;
  }
  return json.data;
}

module.exports = {
  initialize: payload => call('POST', '/transaction/initialize', payload),
  verify: reference => call('GET', `/transaction/verify/${encodeURIComponent(reference)}`)
};
