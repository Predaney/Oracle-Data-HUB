# Oracle's Data Hub: backend + Paystack (Test Mode)

## What changed from your single HTML file
| Before | Now |
|---|---|
| Price sent from the browser (anyone could edit it) | Browser sends only a product id; **the server** looks up the price |
| "Payment received" shown when the popup said so | Shown only after the **server confirms with Paystack** (and amount + currency match) |
| No record of orders | Orders saved in `data/oracle.db` (SQLite); view them at `/admin` |
| No webhook | `/api/paystack/webhook` with signature check (backup if the customer closes the tab) |
| Public key in the page | Not needed; the server creates the transaction with your **secret** key |

The Ghana Card number still goes **only** into the WhatsApp message to you, never to the server or Paystack (as in your original design).

## Run it on Windows (VS Code)
1. Install **Node.js LTS** (v20 or v22) from nodejs.org. Check in a terminal: `node -v`
2. Open this folder in VS Code, then open the terminal (Ctrl+`).
3. `npm install`
4. Copy `.env.example` to `.env` (`copy .env.example .env`) and fill in:
   - `PAYSTACK_SECRET_KEY` = your **sk_test_...** key (Paystack dashboard > Settings > API Keys & Webhooks, with Test mode on)
   - `ADMIN_PASSWORD` = a long password
5. `npm run dev`, then open **http://localhost:3000**

No HTTPS is needed locally. The server refuses to start with a `sk_live_` key unless `NODE_ENV=production`, so you can't spend real money by accident.

### Test a payment
Use the banner's test card: `4084 0840 8408 4081`, any future expiry, CVV `408`. (Paystack also lists test Mobile Money numbers in its docs.) After paying, the page confirms with the server, and the order appears at **http://localhost:3000/admin** (login = `ADMIN_USER` / `ADMIN_PASSWORD`).

### Test the webhook without a public URL
Paystack's servers can't reach `localhost`, so simulate the call:
`npm run test-webhook -- ORC_XXXXXXXXXXXXXXXX` (reference from `/admin`; use an order that is still pending).
Optionally, to test real Paystack-to-you webhooks, run a tunnel such as `ngrok http 3000` and put `https://<tunnel>/api/paystack/webhook` in the Paystack dashboard's **Test Webhook URL**. Remove it when done.

## Project layout
```
src/server.js    app setup, security headers, startup safety checks
src/routes.js    catalog, create order, verify, webhook
src/catalog.js   ALL prices (edit prices here, not in the HTML)
src/db.js        SQLite orders table
src/admin.js     password-protected orders page
public/          the storefront (index.html, style.css, app.js)
admin/           orders dashboard
```

## Going live with HTTPS (when you are ready for real money)
**Why:** Paystack only sends live webhooks to `https://` URLs, browsers block mixed content, and customers' emails/phone numbers (and your admin password) must not travel in plain text.

1. **Get a domain** (e.g. oraclesdatahub.com or a .com.gh) and a host that runs Node:
   - *Easiest:* a platform like Render, Railway or Fly.io. They give you HTTPS automatically. You need a **persistent disk/volume** for `data/` (SQLite lives there) or must switch to a hosted database.
   - *Cheapest/most control:* a small Ubuntu VPS (DigitalOcean, Hetzner, etc.).
2. **VPS route (HTTPS with Caddy, free auto-renewing Let's Encrypt certificates):**
   - Point your domain's DNS **A record** to the server IP. Open ports **80 and 443** only (firewall); keep 3000 closed to the internet.
   - Install Node LTS and Caddy. Put the project in `/srv/oracle`, run `npm ci --omit=dev`.
   - Create `/etc/caddy/Caddyfile`:
     ```
     yourdomain.com, www.yourdomain.com {
         reverse_proxy 127.0.0.1:3000
     }
     ```
     Caddy gets the certificate and redirects HTTP to HTTPS by itself.
   - Run the app as a service (systemd or `pm2 start src/server.js`) so it restarts on crashes/reboots.
3. **Production `.env`:**
   ```
   NODE_ENV=production
   PORT=3000
   BASE_URL=https://yourdomain.com
   TRUST_PROXY=1
   PAYSTACK_SECRET_KEY=sk_live_...
   ADMIN_USER=...        (change it)
   ADMIN_PASSWORD=...    (new, long, unique)
   ```
   In production the app also sends HSTS and `upgrade-insecure-requests`, and redirects any HTTP request to HTTPS.
4. **Paystack dashboard:** complete business verification so you can go Live, switch to Live mode, copy the **live secret key** into `.env`, and set the **Live Webhook URL** to `https://yourdomain.com/api/paystack/webhook`. (Test and Live keys/webhook URLs are separate.)
5. **Before announcing:** do one small real payment end to end, confirm it shows as paid in `/admin`, and check your Paystack dashboard. Back up `data/oracle.db` regularly (copy the file nightly to another place). Never commit `.env`. Keep Node and packages updated (`npm audit`).
6. Prices in `src/catalog.js` are the only prices that count. If you change a price, restart the server.
7. Because you collect personal data (phones, emails, names, and Ghana Card numbers via WhatsApp), look into registering with Ghana's Data Protection Commission and add a short privacy notice to the site.
