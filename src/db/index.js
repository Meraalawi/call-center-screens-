// SQLite connection + schema setup for the Vanilla Console.
//
// NOTE ON DEPENDENCIES: this project was built in a sandbox with no route to
// any package registry (npmjs, pypi and jsr.io all reject with
// "host_not_allowed", direct and through the egress proxy). `npm install`
// simply cannot fetch anything here. So instead of better-sqlite3 this uses
// Node 22's built-in `node:sqlite` (DatabaseSync), which is synchronous and
// dependency-free, and gives the same call shape (prepare/run/get/all,
// {lastInsertRowid, changes}). If you run this on a machine with normal
// registry access and prefer better-sqlite3, swapping this file is the only
// change needed — every call site here uses the shared subset of both APIs.
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'vanilla.sqlite');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS branches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  city TEXT NOT NULL,
  city_ar TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_ar TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  category_ar TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL,
  available INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_menu_items_branch ON menu_items(branch_id);

-- role: 'agent' | 'admin' | 'branch'
-- branch_id is only set for role='branch' (a shared, branch-level credential,
-- not tied to an individual person).
-- active: soft-delete flag for agent/admin accounts managed from the
-- Dashboard's Users section (a deactivated user can't log in, and an
-- existing session for one is rejected on its next request). Branch rows
-- keep this at 1 always; branches are deactivated via branches.active instead.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('agent','admin','branch')),
  display_name TEXT NOT NULL,
  branch_id INTEGER REFERENCES branches(id) ON DELETE CASCADE,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  agent_id INTEGER REFERENCES users(id),
  customer_name TEXT NOT NULL DEFAULT '',
  customer_phone TEXT NOT NULL DEFAULT '',
  order_type TEXT NOT NULL CHECK(order_type IN ('pickup','delivery')) DEFAULT 'pickup',
  address TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK(status IN ('new','preparing','ready','completed','cancelled')) DEFAULT 'new',
  rung_in INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_branch ON orders(branch_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- order_items snapshot name/price at order time; never FK to menu_items,
-- since a menu item's price or name can change after the order was placed.
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_ar TEXT NOT NULL DEFAULT '',
  qty INTEGER NOT NULL,
  price_cents INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- per-branch order counters, so codes look like TR-0143 (matches the prototype)
CREATE TABLE IF NOT EXISTS branch_counters (
  branch_id INTEGER PRIMARY KEY REFERENCES branches(id) ON DELETE CASCADE,
  next_number INTEGER NOT NULL DEFAULT 1
);
`;

db.exec(SCHEMA);

// Migration: `active` was added to `users` after this table already shipped.
// CREATE TABLE IF NOT EXISTS above won't retrofit an existing table, so add
// the column by hand when it's missing (existing rows default to active=1,
// i.e. nobody already seeded gets silently locked out).
const userColumns = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
if (!userColumns.includes('active')) {
  db.exec('ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
}

// Migration: `eta_minutes` — the branch's own estimate of how many more
// minutes an order needs, shown to the call center so an agent can answer
// "is my order ready yet?" calls without guessing. NULL means no estimate
// has been set. Plain informational number (not a countdown/timestamp) —
// the branch re-sets it as things change, kept simple on purpose.
const orderColumns = db.prepare("PRAGMA table_info(orders)").all().map((c) => c.name);
if (!orderColumns.includes('eta_minutes')) {
  db.exec('ALTER TABLE orders ADD COLUMN eta_minutes INTEGER');
}

// node:sqlite's DatabaseSync has no built-in .transaction() helper (unlike
// better-sqlite3), so provide the same "run this function atomically" shape
// used throughout the routes/seed code.
db.transaction = function transaction(fn) {
  return function (...args) {
    db.exec('BEGIN');
    try {
      const result = fn(...args);
      db.exec('COMMIT');
      return result;
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch (_) { /* ignore */ }
      throw err;
    }
  };
};

module.exports = db;
