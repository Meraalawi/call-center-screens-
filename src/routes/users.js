// Admin-only user management for the Dashboard's "Users" section.
//
// Scope, deliberately: this only manages named individual accounts
// (agent + admin rows in `users`). Branch credentials are also rows in this
// same table (role='branch'), so they're included read-only in the list for
// visibility, but their password is reset from the Branches section
// (PUT /api/branches/:id already does that) — building a second edit path
// here would just be a redundant, easy-to-desync way to do the same thing.
//
// Self-service admin creation is out of scope on purpose: this form can only
// create 'agent' accounts. Promoting someone to admin is a bigger trust
// decision than a routine "add an agent" action, so it's left to whoever can
// already reach the database/seed script directly, the same way it works
// today. See README.md for this call.
const db = require('../db');
const { requireRole } = require('../middleware/requireRole');
const { hashPassword } = require('../lib/password');

const MIN_PASSWORD_LENGTH = 6; // no length is enforced elsewhere in this app; this is a reasonable, documented floor

function publicUserRow(u) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    role: u.role,
    active: !!u.active,
    branchId: u.branch_id || null,
    createdAt: u.created_at,
  };
}

function userRow(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function register(app) {
  // Lists every account — agents, admins, and (read-only) branch credentials
  // — so the admin has one place to see who can sign in at all.
  app.get('/api/users', requireRole('admin'), (req, res) => {
    const rows = db.prepare('SELECT * FROM users ORDER BY role, display_name').all();
    res.json({ users: rows.map(publicUserRow) });
  });

  // Create a new agent account. Role is always 'agent' here — see the note
  // at the top of this file for why admin creation isn't exposed.
  app.post('/api/users', requireRole('admin'), (req, res) => {
    const { username, displayName, password } = req.body || {};
    const uname = String(username || '').trim();
    const dname = String(displayName || '').trim();
    if (!uname) return res.status(400).json({ error: 'Username is required' });
    if (!dname) return res.status(400).json({ error: 'Display name is required' });
    if (!password || String(password).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }
    const dupe = db.prepare('SELECT 1 FROM users WHERE username = ?').get(uname);
    if (dupe) return res.status(409).json({ error: 'That username is already taken' });

    const info = db.prepare(`
      INSERT INTO users (username, password_hash, role, display_name, branch_id, active)
      VALUES (?, ?, 'agent', ?, NULL, 1)
    `).run(uname, hashPassword(String(password)), dname);
    res.status(201).json({ user: publicUserRow(userRow(info.lastInsertRowid)) });
  });

  // Edit an agent's display name. Deliberately restricted to role='agent':
  // branch credentials are edited from the Branches section, and admin
  // accounts aren't self-service-editable here either (same reasoning as
  // create — keep this form's blast radius to "agents").
  app.put('/api/users/:id', requireRole('admin'), (req, res) => {
    const id = Number(req.params.id);
    const existing = userRow(id);
    if (!existing) return res.status(404).json({ error: 'User not found' });
    if (existing.role !== 'agent') return res.status(400).json({ error: 'Only agent accounts can be edited here' });
    const { displayName } = req.body || {};
    const dname = displayName !== undefined ? String(displayName).trim() : existing.display_name;
    if (!dname) return res.status(400).json({ error: 'Display name is required' });
    db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(dname, id);
    res.json({ user: publicUserRow(userRow(id)) });
  });

  // Reset an agent's password — a separate action from the display-name
  // edit above, same as branches' password reset is separate from its
  // name/city edit.
  app.patch('/api/users/:id/password', requireRole('admin'), (req, res) => {
    const id = Number(req.params.id);
    const existing = userRow(id);
    if (!existing) return res.status(404).json({ error: 'User not found' });
    if (existing.role !== 'agent') return res.status(400).json({ error: "Only agents' passwords can be reset here" });
    const { password } = req.body || {};
    if (!password || String(password).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(String(password)), id);
    res.json({ ok: true });
  });

  // Deactivate/reactivate an agent — soft delete. There is no hard-delete
  // route: this is the guard against removing a user who has orders
  // attached via orders.agent_id (same guard-rail spirit as the
  // active-order check on branch delete, just structural here instead of a
  // count check, since the row is never actually removed).
  app.patch('/api/users/:id/active', requireRole('admin'), (req, res) => {
    const id = Number(req.params.id);
    const existing = userRow(id);
    if (!existing) return res.status(404).json({ error: 'User not found' });
    if (existing.role !== 'agent') return res.status(400).json({ error: 'Only agent accounts can be deactivated here' });
    const active = req.body && typeof req.body.active === 'boolean' ? req.body.active : !existing.active;
    db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
    res.json({ user: publicUserRow(userRow(id)) });
  });
}

module.exports = { register };
