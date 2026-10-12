'use strict';
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const catalog = require('./catalog');
const store = require('./db');
const paystack = require('./paystack');
const { notifyPaid, support } = require('./notify');

const router = express.Router();

const PHONE_RE = /^0\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REF_RE = /^ORC_[A-F0-9]{16}$/;
const clean = (v, max = 100) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');
const isTestMode = () => String(process.env.PAYSTACK_SECRET_KEY || '').startsWith('sk_test_');

const limiter = (windowMs, max) => rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please wait a moment and try again.' }
});

/* ---------- public catalog ---------- */
router.get('/catalog', (req, res) => {
    const products = {};
    for (const [id, p] of Object.entries(catalog.products)) {
        products[id] = { id, type: p.type, service: p.service, desc: p.desc, price: p.price };
    }
    res.json({ testMode: isTestMode(), products, bundles: catalog.bundles });
});

/* ---------- create order + initialise Paystack transaction ---------- */
router.post('/orders', limiter(60 * 1000, 10), async(req, res) => {
    const b = req.body || {};
    const product = catalog.getProduct(b.productId);
    if (!product) return res.status(400).json({ error: 'Unknown product.' });

    const phone = clean(b.phone, 20).replace(/\s/g, '');
    const email = clean(b.email, 254).toLowerCase();
    if (!PHONE_RE.test(phone)) return res.status(400).json({ error: 'Enter a valid 10-digit phone number, like 0551234567.' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });

    let details = null;
    if (product.type === 'ishare') {
        const d = b.details || {};
        details = { fullName: clean(d.fullName), location: clean(d.location), work: clean(d.work) };
        if (!details.fullName || !details.location || !details.work) {
            return res.status(400).json({ error: 'Please fill in every field.' });
        }
    }

    const reference = 'ORC_' + crypto.randomBytes(8).toString('hex').toUpperCase();
    const amount = Math.round(product.price * 100); // pesewas, always from the server catalog

    store.insertOrder({
        reference,
        product_id: product.id,
        service: product.service,
        description: product.desc,
        amount,
        currency: 'GHS',
        phone,
        email,
        details: details ? JSON.stringify(details) : null
    });

    const fields = [
        { display_name: 'Service', variable_name: 'service', value: product.service },
        { display_name: 'Details', variable_name: 'details', value: product.desc },
        { display_name: 'Phone to receive', variable_name: 'phone', value: phone }
    ];
    if (details) {
        fields.push({ display_name: 'Full name', variable_name: 'full_name', value: details.fullName });
        fields.push({ display_name: 'Location', variable_name: 'location', value: details.location });
        fields.push({ display_name: 'Work', variable_name: 'work', value: details.work });
    }

    try {
        const init = await paystack.initialize({
            email,
            amount,
            currency: 'GHS',
            reference,
            callback_url: `${process.env.BASE_URL || ''}/`,
            metadata: { custom_fields: fields }
        });
        res.json({ reference, accessCode: init.access_code, authorizationUrl: init.authorization_url });
    } catch (err) {
        console.error('Paystack initialize failed:', err.message);
        store.markFailed(reference);
        res.status(502).json({ error: 'Could not start the payment. Please try again in a moment.' });
    }
});

/* ---------- confirm payment with Paystack (source of truth) ---------- */
function paidMatchesOrder(order, data) {
    return data && data.status === 'success' && data.currency === order.currency && Number(data.amount) === order.amount;
}

function summary(order) {
    return {
        status: order.status,
        reference: order.reference,
        productId: order.product_id,
        service: order.service,
        description: order.description,
        amount: order.amount / 100,
        testMode: isTestMode()
    };
}

router.get('/orders/:reference/verify', limiter(60 * 1000, 40), async(req, res) => {
    const ref = req.params.reference;
    if (!REF_RE.test(ref)) return res.status(400).json({ error: 'Invalid reference.' });
    let order = store.getOrder(ref);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.status === 'paid') return res.json(summary(order));

    try {
        const data = await paystack.verify(ref);
        if (data.status === 'success') {
            if (paidMatchesOrder(order, data)) {
                if (store.markPaid(ref, data.id, data.paid_at ? String(data.paid_at).replace('T', ' ').slice(0, 19) : null)) {
                    notifyPaid(store.getOrder(ref)); // first time only: alert owner + email customer
                }
            } else {
                console.error(`AMOUNT/CURRENCY MISMATCH for ${ref}: expected ${order.amount} ${order.currency}, got ${data.amount} ${data.currency}`);
                store.markFailed(ref);
            }
        } else if (data.status === 'failed') {
            store.markFailed(ref);
        } // abandoned / ongoing / pending -> stays pending
        order = store.getOrder(ref);
        res.json(summary(order));
    } catch (err) {
        console.error('Paystack verify failed:', err.message);
        res.status(502).json({ error: 'Could not confirm the payment right now. Please try again shortly.' });
    }
});

/* ---------- order tracking (customer enters reference + the phone they ordered with) ---------- */
router.get('/support', (req, res) => res.json(support()));

router.get('/track', limiter(60 * 1000, 10), (req, res) => {
    const ref = clean(req.query.reference, 40).toUpperCase();
    const phone = clean(req.query.phone, 20).replace(/\s/g, '');
    const notFound = () => res.status(404).json({ error: 'No order found. Check the reference and phone number.' });
    if (!REF_RE.test(ref) || !PHONE_RE.test(phone)) return notFound();
    const order = store.getOrder(ref);
    if (!order || order.phone !== phone) return notFound(); // same answer either way: nothing leaks

    let stage, label;
    if (order.status === 'paid') {
        stage = order.fulfilled ? 'delivered' : 'processing';
        label = order.fulfilled ? 'Delivered' : 'Payment received - being processed';
    } else if (order.status === 'failed') { stage = 'failed';
        label = 'Payment failed'; } else { stage = 'pending';
        label = 'Waiting for payment confirmation'; }

    res.set('Cache-Control', 'no-store').json({
        reference: order.reference,
        service: order.service,
        description: order.description,
        amount: order.amount / 100,
        created_at: order.created_at,
        stage,
        label,
        support: support()
    });
});

/* ---------- Paystack webhook (mounted with a raw body parser in server.js) ---------- */
function webhookHandler(req, res) {
    const sig = String(req.headers['x-paystack-signature'] || '');
    const raw = req.body; // Buffer
    if (!Buffer.isBuffer(raw) || !sig) return res.sendStatus(401);

    const expected = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(raw).digest('hex');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(sig, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.sendStatus(401);

    let event;
    try { event = JSON.parse(raw.toString('utf8')); } catch { return res.sendStatus(400); }

    if (event.event === 'charge.success' && event.data && REF_RE.test(String(event.data.reference))) {
        const order = store.getOrder(event.data.reference);
        if (!order) {
            console.warn('Webhook for unknown reference', event.data.reference);
        } else if (paidMatchesOrder(order, event.data)) {
            if (store.markPaid(order.reference, event.data.id, null)) {
                console.log('Webhook: marked paid', order.reference);
                notifyPaid(store.getOrder(order.reference));
            }
        } else {
            console.error('Webhook amount/currency mismatch for', order.reference);
        }
    }
    res.sendStatus(200); // always 200 on a valid signature so Paystack doesn't keep retrying
}

module.exports = { router, webhookHandler };