'use strict';
// Simulates Paystack calling your webhook, so you can test it locally without a public URL.
// Usage:  npm run test-webhook -- ORC_XXXXXXXXXXXXXXXX
require('dotenv').config();
const crypto = require('crypto');
const store = require('../src/db');

const ref = process.argv[2];
if (!ref) { console.error('Usage: npm run test-webhook -- <order reference>'); process.exit(1); }
const order = store.getOrder(ref);
if (!order) { console.error('No order with that reference in data/oracle.db'); process.exit(1); }

const body = JSON.stringify({ event: 'charge.success', data: { id: 123456789, status: 'success', reference: ref, amount: order.amount, currency: order.currency } });
const sig = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(body).digest('hex');
const url = `http://localhost:${process.env.PORT || 3000}/api/paystack/webhook`;

fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-paystack-signature': sig }, body })
  .then(r => console.log('Webhook response:', r.status, '(200 = accepted)'))
  .catch(e => console.error('Could not reach the server. Is "npm run dev" running?', e.message));
