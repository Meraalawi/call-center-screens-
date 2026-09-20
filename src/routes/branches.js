const db = require('../db');
const { requireRole } = require('../middleware/requireRole');
const { hashPassword } = require('../lib/password');

function branchRow(id) {
  return db.prepare('SELECT * FROM branches WHERE id = ?').get(id);
}

const BRANCH_STATUSES = ['normal', 'busy', 'very_busy'];

function publicBranch(b) {
  return {
    id: b.id, code: b.code, name: b.name, nameAr: b.name_ar,
    city: b.city, cityAr: b.city_ar, active: !!b.active,
    status: b.status || 'normal', statusNote: b.status_note || '',
  };
}

function genCode(name, exclude) {
  let letters = (name.match(/[A-Za-z]+/g) || []).map((w) => w[0]).join('').toUpperCase();
  if (letters.length < 2) letters = (name.replace(/[^A-Za-z]/g, '').toUpperCase() + 'XX').slice(0, 2);
  letters = letters.slice(0, 3) || 'BR';
  let code = letters;
  let n = 1;
  const taken = (c) => db.prepare('SELECT 1 FROM branches WHERE code = ? AND id != ?').get(c, exclude || -1);
  while (taken(code)) { n++; code = letters + n; }
  return code;
}

function register(app) {
  // No auth required: this is exactly what the branch-login picker needs to
  // show a list of branches before the operator has entered a password.
  // It deliberately leaks nothing beyond name/city/active.
  app.get('/api/branches/public', (req, res) => {
    const rows = db.prepare('SELECT * FROM branches WHERE active = 1 ORDER BY name').all();
    res.json({ branches: rows.map(publicBranch) });
  });

  // Any signed-in role can list branches: agents need it to build an order,
  // the dashboard needs it for management, a branch session gets just its own.
  app.get('/api/branches', requireRole('agent', 'admin', 'branch'), (req, res) => {
    const user = req.session.user;
    if (user.role === 'branch') {
      const b = branchRow(user.branchId);
      return res.json({ branches: b ? [publicBranch(b)] : [] });
    }
    const includeInactive = user.role === 'admin';
    const rows = includeInactive
      ? db.prepare('SELECT * FROM branches ORDER BY name').all()
      : db.prepare('SELECT * FROM branches WHERE active = 1 ORDER BY name').all();
    const withCounts = rows.map((b) => ({
      ...publicBranch(b),
      menuItemCount: db.prepare('SELECT count(*) c FROM menu_items WHERE branch_id = ?').get(b.id).c,
    }));
    res.json({ branches: withCounts });
  });

  app.post('/api/branches', requireRole('admin'), (req, res) => {
    const { name, nameAr, city, cityAr, password } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Name is required' });
    const code = genCode(name);
    const tx = db.transaction(() => {
      const info = db.prepare(
        'INSERT INTO branches (code, name, name_ar, city, city_ar, active) VALUES (?, ?, ?, ?, ?, 1)'
      ).run(code, String(name).trim(), nameAr || '', city || '', cityAr || '');
      const branchId = info.lastInsertRowid;
      db.prepare('INSERT INTO branch_counters (branch_id, next_number) VALUES (?, 1)').run(branchId);
      db.prepare('INSERT INTO users (username, password_hash, role, display_name, branch_id) VALUES (?, ?, \'branch\', ?, ?)')
        .run(code.toLowerCase(), hashPassword(password || 'vanilla123'), `${name} branch`, branchId);
      return branchId;
    });
    const branchId = tx();
    res.status(201).json({ branch: publicBranch(branchRow(branchId)) });
  });

  app.put('/api/branches/:id', requireRole('admin'), (req, res) => {
    const id = Number(req.params.id);
    const existing = branchRow(id);
    if (!existing) return res.status(404).json({ error: 'Branch not found' });
    const { name, nameAr, city, cityAr, active, password } = req.body || {};
    db.prepare(`
      UPDATE branches SET name = ?, name_ar = ?, city = ?, city_ar = ?, active = ? WHERE id = ?
    `).run(
      name !== undefined ? String(name).trim() : existing.name,
      nameAr !== undefined ? nameAr : existing.name_ar,
      city !== undefined ? city : existing.city,
      cityAr !== undefined ? cityAr : existing.city_ar,
      active !== undefined ? (active ? 1 : 0) : existing.active,
      id
    );
    if (password) {
      db.prepare(`UPDATE users SET password_hash = ? WHERE role = 'branch' AND branch_id = ?`).run(hashPassword(password), id);
    }
    res.json({ branch: publicBranch(branchRow(id)) });
  });

  // Branch load status ("crowded / running late" note) — set by the branch
  // itself so the Call Center Desk can warn the customer before sending an
  // order there. A branch session may only ever touch its own row; admin can
  // override any branch from the Dashboard the same way it manages
  // everything else about branches.
  app.patch('/api/branches/:id/status', requireRole('admin', 'branch'), (req, res) => {
    const id = Number(req.params.id);
    const existing = branchRow(id);
    if (!existing) return res.status(404).json({ error: 'Branch not found' });
    const user = req.session.user;
    if (user.role === 'branch' && user.branchId !== id) {
      return res.status(403).json({ error: 'Not allowed for this role' });
    }
    const { status, statusNote } = req.body || {};
    if (status !== undefined && !BRANCH_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of ${BRANCH_STATUSES.join(', ')}` });
    }
    db.prepare('UPDATE branches SET status = ?, status_note = ? WHERE id = ?').run(
      status !== undefined ? status : existing.status,
      statusNote !== undefined ? String(statusNote).slice(0, 200) : existing.status_note,
      id
    );
    res.json({ branch: publicBranch(branchRow(id)) });
  });

  app.delete('/api/branches/:id', requireRole('admin'), (req, res) => {
    const id = Number(req.params.id);
    const existing = branchRow(id);
    if (!existing) return res.status(404).json({ error: 'Branch not found' });
    const activeOrders = db.prepare(
      `SELECT count(*) c FROM orders WHERE branch_id = ? AND status IN ('new','preparing','ready')`
    ).get(id).c;
    if (activeOrders > 0) {
      return res.status(409).json({ error: `${activeOrders} active order(s) — can't delete`, activeOrders });
    }
    // No active orders remain, but completed/cancelled history may still
    // reference this branch — clear it out explicitly inside one transaction
    // (menu_items/users/branch_counters cascade via FK, orders do not).
    const tx = db.transaction(() => {
      const orderIds = db.prepare('SELECT id FROM orders WHERE branch_id = ?').all(id).map((o) => o.id);
      for (const oid of orderIds) db.prepare('DELETE FROM order_items WHERE order_id = ?').run(oid);
      db.prepare('DELETE FROM orders WHERE branch_id = ?').run(id);
      db.prepare('DELETE FROM branches WHERE id = ?').run(id);
    });
    tx();
    res.json({ ok: true });
  });
}

module.exports = { register, publicBranch };
