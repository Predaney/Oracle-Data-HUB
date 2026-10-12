'use strict';
const crypto = require('crypto');
const path = require('path');
const express = require('express');
const rateLimit = require('express-rate-limit');
const store = require('./db');
const { notifyDelivered } = require('./notify');

const router = express.Router();
const sha = s => crypto.createHash('sha256').update(String(s)).digest();
const safeEq = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));

router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false }));

router.use((req, res, next) => {
    const pass = process.env.ADMIN_PASSWORD;
    if (!pass || pass.length < 8) return res.status(503).send('Admin is disabled. Set ADMIN_PASSWORD (8+ characters) in .env and restart.');
    const [scheme, b64] = String(req.headers.authorization || '').split(' ');
    if (scheme === 'Basic' && b64) {
        const decoded = Buffer.from(b64, 'base64').toString('utf8');
        const i = decoded.indexOf(':');
        const user = decoded.slice(0, i),
            pw = decoded.slice(i + 1);
        if (i >= 0 && safeEq(user, process.env.ADMIN_USER || 'admin') && safeEq(pw, pass)) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="Oracle Admin", charset="UTF-8"');
    res.status(401).send('Authentication required');
});

router.get('/api/orders', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(store.listOrders().map(o => ({...o, details: o.details ? JSON.parse(o.details) : null })));
});

// Browsers attach Basic-auth credentials automatically, so require a custom header
// (which cross-site pages can't send without a CORS preflight) to block CSRF.
router.post('/api/orders/:reference/fulfilled', express.json(), (req, res) => {
    if (req.get('X-Requested-With') !== 'oracle-admin') return res.sendStatus(403);
    const want = !!(req.body && req.body.fulfilled);
    const before = store.getOrder(req.params.reference);
    const ok = store.setFulfilled(req.params.reference, want);
    if (ok && want && before && !before.fulfilled) notifyDelivered(store.getOrder(req.params.reference));
    res.status(ok ? 200 : 404).json({ ok });
});

router.use(express.static(path.join(__dirname, '..', 'admin'), { index: 'index.html' }));

module.exports = router;