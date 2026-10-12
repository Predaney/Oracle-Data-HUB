'use strict';
require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const isProd = process.env.NODE_ENV === 'production';
const key = process.env.PAYSTACK_SECRET_KEY || '';

/* ---------- startup safety checks ---------- */
if (!/^sk_(test|live)_\w+/.test(key) || key.includes('PASTE_YOUR')) {
    console.error('\nPAYSTACK_SECRET_KEY is missing or invalid. Copy .env.example to .env and paste your sk_test_... key.\n');
    process.exit(1);
}
if (key.startsWith('sk_live_') && !isProd) {
    console.error('\nRefusing to start: a LIVE Paystack key was found while NODE_ENV is not "production".\nUse your sk_test_ key for local development.\n');
    process.exit(1);
}
if (isProd && !/^https:\/\//.test(process.env.BASE_URL || '')) {
    console.error('\nIn production, BASE_URL must start with https:// (e.g. https://yourdomain.com).\n');
    process.exit(1);
}

const { router: api, webhookHandler } = require('./routes');
const adminRouter = require('./admin');

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);

/* ---------- HTTPS enforcement (production only; local dev stays on plain http) ---------- */
if (isProd) {
    app.use((req, res, next) => {
        if (req.secure) return next();
        if (req.method === 'GET' || req.method === 'HEAD') return res.redirect(301, 'https://' + req.headers.host + req.originalUrl);
        res.status(400).send('HTTPS required');
    });
}

/* ---------- security headers ---------- */
app.use(helmet({
    contentSecurityPolicy: {
        useDefaults: true,
        directives: {
            'default-src': ["'self'"],
            'script-src': ["'self'", 'https://js.paystack.co'],
            'style-src': ["'self'", "'unsafe-inline'"],
            'img-src': ["'self'", 'data:', 'https:'],
            'font-src': ["'self'", 'data:'],
            'connect-src': ["'self'", 'https://api.paystack.co', 'https://*.paystack.co', 'https://*.paystack.com'],
            'frame-src': ['https://checkout.paystack.com', 'https://*.paystack.com', 'https://*.paystack.co'],
            'form-action': ["'self'", 'https://*.paystack.com', 'https://*.paystack.co'],
            'frame-ancestors': ["'self'"],
            'object-src': ["'none'"],
            // "upgrade-insecure-requests" would break plain-http localhost, so only send it in production
            'upgrade-insecure-requests': isProd ? [] : null
        }
    },
    strictTransportSecurity: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }
}));

/* ---------- webhook FIRST: it needs the raw body for signature checking ---------- */
app.post('/api/paystack/webhook', express.raw({ type: '*/*', limit: '100kb' }), webhookHandler);

/* ---------- admin + api + static site ---------- */
app.use('/admin', adminRouter);
app.use('/api', express.json({ limit: '10kb' }), rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false }), api);
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
    console.error(err);
    if (res.headersSent) return next(err);
    res.status(err.status || 500).json({ error: err.status && err.status < 500 ? 'Bad request.' : 'Server error.' });
});

if (isProd && !process.env.TRUST_PROXY) {
    console.warn('WARNING: NODE_ENV=production but TRUST_PROXY is not set. Behind Caddy/Nginx/a host proxy, set TRUST_PROXY=1 or HTTPS redirects will loop.');
}

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
    console.log(`\nOracle's Data Hub running at http://localhost:${port}`);
    console.log(`Mode: ${key.startsWith('sk_test_') ? 'PAYSTACK TEST MODE (no real money)' : 'LIVE (real money!)'}`);
    console.log(`Orders page: http://localhost:${port}/admin\n`);
});