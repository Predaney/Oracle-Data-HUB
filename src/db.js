'use strict';
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dir, { recursive: true });
const db = new Database(path.join(dir, 'oracle.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS orders (
  reference       TEXT PRIMARY KEY,
  product_id      TEXT NOT NULL,
  service         TEXT NOT NULL,
  description     TEXT NOT NULL,
  amount          INTEGER NOT NULL,           -- pesewas (GHS x 100)
  currency        TEXT NOT NULL DEFAULT 'GHS',
  phone           TEXT NOT NULL,
  email           TEXT NOT NULL,
  details         TEXT,                       -- JSON (e.g. iShare name/location/work)
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | paid | failed
  fulfilled       INTEGER NOT NULL DEFAULT 0,
  paystack_txn_id TEXT,
  paid_at         TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at);
`);

const q = {
    insert: db.prepare(`INSERT INTO orders (reference, product_id, service, description, amount, currency, phone, email, details)
                      VALUES (@reference, @product_id, @service, @description, @amount, @currency, @phone, @email, @details)`),
    get: db.prepare('SELECT * FROM orders WHERE reference = ?'),
    markPaid: db.prepare(`UPDATE orders SET status='paid', paystack_txn_id=@txn, paid_at=COALESCE(@paid_at, datetime('now')), updated_at=datetime('now')
                        WHERE reference=@reference AND status != 'paid'`),
    markFailed: db.prepare(`UPDATE orders SET status='failed', updated_at=datetime('now') WHERE reference=? AND status='pending'`),
    list: db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 500'),
    setFulfilled: db.prepare(`UPDATE orders SET fulfilled=@v, updated_at=datetime('now') WHERE reference=@reference AND status='paid'`)
};

module.exports = {
    db,
    insertOrder: o => q.insert.run(o),
    getOrder: ref => q.get.get(ref),
    markPaid: (reference, txn, paid_at) => q.markPaid.run({ reference, txn: txn == null ? null : String(txn), paid_at: paid_at || null }).changes > 0,
    markFailed: ref => q.markFailed.run(ref).changes > 0,
    listOrders: () => q.list.all(),
    setFulfilled: (reference, v) => q.setFulfilled.run({ reference, v: v ? 1 : 0 }).changes > 0
};