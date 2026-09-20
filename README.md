# Vanilla Console

A real full-stack call center console for Vanilla Cake & Coffee, built from
the static `call-center-screens-vanilla` prototype: three separate pages
(Call Center Desk, Branch Screen, Dashboard) backed by one Node server and a
SQLite database, with three distinct login models and server-enforced roles.

## Running it

```bash
npm install
npm start
```

Then open:

- `http://localhost:3000/call-center.html` — Call Center Desk (agent login)
- `http://localhost:3000/branch.html` — Branch Screen (branch login)
- `http://localhost:3000/dashboard.html` — Dashboard (admin login)
- `http://localhost:3000/` — a plain index linking all three

The database is created and seeded automatically on first run (6 branches
with their full real menus, demo accounts, a handful of starter orders). To
re-seed from scratch (wipes all data), run `npm run seed` or delete
`data/vanilla.sqlite*` and restart the server.

## Seeded demo credentials

Every seeded account uses the same demo password: **`vanilla123`**

| Role | How to sign in |
|---|---|
| Agent | username `agent1`, `agent2`, or `agent3` |
| Branch | pick the branch on the Branch Screen's login, then enter the password (username under the hood is the branch code lowercased, e.g. `tr`, `my`, `ir`, `nb`, `ic`, `mn`) |
| Admin | username `admin` |

These are printed in the server's startup log and shown as hints on each
login form. Change them (or add real accounts) before using this anywhere
beyond a demo.

## Important note on dependencies — read this first

**This project has zero npm dependencies, on purpose, not by choice.** The
sandbox this was built in has no route to any package registry at all:
`npm install express` (and `bcrypt`, `bcryptjs`, `better-sqlite3`,
`express-session`, everything tried) all fail with a `403
host_not_allowed` from `registry.npmjs.org`, both directly and through the
environment's own egress proxy — confirmed with `curl` before writing a
line of server code. `pypi.org` and `jsr.io` are blocked the same way, so
there was no alternate registry to fall back to either. Per this
environment's own guidance, a policy-level 403 like that is something to
work around structurally, not retry.

So instead of the requested `express` / `better-sqlite3` / `express-session`
/ `bcrypt` stack, this uses **only Node.js 22 built-ins**, structured to be a
drop-in-compatible shape so swapping in the real packages later (on a
machine with normal registry access) is a small, mechanical change:

| Requested | Used instead | Where |
|---|---|---|
| `better-sqlite3` | `node:sqlite` (`DatabaseSync`) — synchronous, built into Node 22.5+, same `prepare/run/get/all` shape | `src/db/index.js` |
| `express` | A ~180-line hand-rolled router (`app.use`, `app.get/post/put/patch/delete`, `:params`, JSON body parsing, static file serving) | `src/lib/miniweb.js` |
| `express-session` | A hand-rolled in-memory cookie session store with HMAC-signed session ids | `src/lib/session.js` |
| `bcrypt` | Node's built-in `crypto.scrypt` (memory-hard KDF) with per-password random salts and constant-time comparison | `src/lib/password.js` |

Every route file (`src/routes/*.js`) and the app's structure otherwise
matches exactly what an Express + express-session + bcrypt version would
look like — `req.session.user`, `requireRole()` middleware, etc. — so this
is a substitution of *implementation*, not of *architecture*. Requires
**Node.js 22.5+** for `node:sqlite` (tested on 22.22).

## Other calls made building this out

- **Branch-screen "switch branch"**: the prototype's Branch Screen had chips
  to flip between branches on one shared terminal. With real per-branch
  auth, a session is now tied to exactly one branch (as the brief asks for).
  "Switch branch" is now a button that logs the current branch out and
  returns to the branch-picker/login screen — you can still hop between
  branches on the same terminal, you just re-authenticate as the new one
  each time, which is the point of a shared branch credential.
- **Order codes** (`TR-0143` etc.) are generated server-side from a
  per-branch counter table, continuing the counters the prototype had
  already reached (Al-Tireh at 143, etc.), so new orders don't collide with
  the seeded ones.
- **Deleting a branch** only guards on orders that are still *active*
  (`new`/`preparing`/`ready`), per the spec. If the branch has old
  completed/cancelled order history, that history is deleted along with the
  branch (inside one transaction) rather than blocking the delete forever —
  the brief only asked for a guard against deleting a branch mid-service.
- **Sessions** last 8 hours (a shift) and slide forward on each request;
  there's no "remember me" — this is a shared-terminal ops tool.
- Menu categories/prices/items are ported verbatim from the prototype's
  `mk()`-built arrays, including its own documented placeholder for Icon
  Mall's food menu (only Breakfast + the shared Drinks/Desserts, matching a
  comment already in the prototype about that branch's page not exposing a
  full menu at fetch time).

## File structure

```
vanilla-console/
├── server.js                 # entry point: wires session, routes, static files
├── package.json               # zero dependencies (see note above)
├── src/
│   ├── db/
│   │   ├── index.js            # node:sqlite connection + schema (DDL)
│   │   └── seed.js             # 6 branches, full menus, demo users, starter orders
│   ├── lib/
│   │   ├── miniweb.js          # Express-shaped router + static file serving
│   │   ├── session.js          # express-session-shaped in-memory sessions
│   │   └── password.js         # bcrypt-shaped password hashing (scrypt)
│   ├── middleware/
│   │   └── requireRole.js      # req.session.user.role gate, 401/403 JSON
│   └── routes/
│       ├── auth.js              # /api/auth/{agent,branch,admin}/login, logout, me
│       ├── branches.js          # /api/branches (list/create/update/delete-with-guard)
│       ├── menu.js              # /api/branches/:id/menu, /api/menu/:itemId (CRUD)
│       └── orders.js            # /api/orders (create/list/status/rung-in)
├── public/
│   ├── index.html               # links to the three apps
│   ├── call-center.html + .js   # Call Center Desk (agent login)
│   ├── branch.html + .js        # Branch Screen (branch login, kanban board)
│   ├── dashboard.html + .js     # Dashboard (admin login)
│   └── shared/
│       ├── styles.css           # design tokens + all component styles (ported)
│       ├── i18n.js              # EN/AR string table + t() helper (ported)
│       ├── fmt.js                # fmt(), relTime(), escapeHtml()
│       └── api.js                # fetch wrapper used by all three pages
└── data/                       # created on first run; gitignored (not shipped)
```

## Data model (SQLite)

- `branches` — id, code, name/name_ar, city/city_ar, active
- `menu_items` — branch_id FK, name/name_ar, category/category_ar,
  price_cents, available
- `users` — username, password_hash, role (`agent` | `branch` | `admin`),
  display_name, branch_id (set only for `branch` role — a shared credential,
  not an individual)
- `orders` — code, branch_id FK, agent_id FK (nullable), customer info,
  order_type, address, notes, status, rung_in, total_cents, created_at
- `order_items` — order_id FK, name/name_ar/qty/price_cents **snapshotted**
  at order time (no FK to menu_items, since menu prices can change later)
- `branch_counters` — per-branch next order number, for `TR-0143`-style codes

## API summary

All routes are under `/api`. Every write route enforces its role
server-side via `requireRole()` — not just hidden in the UI.

- `POST /api/auth/agent/login`, `/api/auth/branch/login` (`{branchId,
  password}`), `/api/auth/admin/login`, `POST /api/auth/logout`, `GET
  /api/auth/me`
- `GET /api/branches/public` — no auth; active branches only, for the
  branch-login picker
- `GET /api/branches` — any signed-in role (a `branch` session only ever
  sees its own branch)
- `POST /api/branches`, `PUT /api/branches/:id`, `DELETE /api/branches/:id`
  — admin only; delete guards on active orders (409 with a count)
- `GET /api/branches/:id/menu` — agent/admin/own-branch
- `POST /api/branches/:id/menu`, `PUT /api/menu/:itemId`, `DELETE
  /api/menu/:itemId` — admin only
- `GET /api/orders` (filters: `branchId`, `status`) — admin/branch only
  (branch forced to its own branch)
- `POST /api/orders` — agent/admin only; snapshots menu item name+price,
  validates availability, generates the order code
- `PATCH /api/orders/:id/status`, `PATCH /api/orders/:id/rung-in` —
  admin/branch only, branch limited to its own orders

## Live updates

No WebSockets: each page polls its relevant endpoint(s) on an interval —
Call Center Desk polls the branch list / current branch's menu every 4s (so
availability changes from the Dashboard show up while building an order),
Branch Screen polls its orders every 3.5s, Dashboard polls orders every 4s
while the Orders tab is open.

## Verification performed

- `npm install && npm start` boots cleanly and auto-seeds on first run
  (confirmed from a clean `data/` directory).
- `curl` checks confirm: an unauthenticated request to `/api/orders` gets
  401; an agent session gets 403 on admin-only `POST /api/branches`; a
  branch session gets 403 on another branch's orders and on admin-only
  routes; a full agent→order→branch-accept→admin-view flow round-trips
  correctly.
- `git log` shows the commit history; `git status` is clean.
