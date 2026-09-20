// Three distinct login flows, one per role — this is the core requirement:
//   - agent login: named individual (username + password)
//   - branch login: shared branch-level credential, chosen by branch id
//   - admin login: named individual, admin role
// All three end up as the same shape of req.session.user so the rest of the
// app (requireRole, order writes) doesn't need to care which flow was used.
const db = require('../db');
const { verifyPassword } = require('../lib/password');

function publicUser(user) {
  return {
    id: user.id,
    role: user.role,
    displayName: user.display_name,
    branchId: user.branch_id || null,
  };
}

function register(app) {
  app.post('/api/auth/agent/login', (req, res) => {
    const { username, password } = req.body || {};
    const user = db.prepare(`SELECT * FROM users WHERE username = ? AND role = 'agent'`).get(String(username || '').trim());
    if (!user || !verifyPassword(password || '', user.password_hash)) {
      return res.status(401).json({ error: 'Invalid agent username or password' });
    }
    req.session.user = publicUser(user);
    res.json({ user: req.session.user });
  });

  app.post('/api/auth/admin/login', (req, res) => {
    const { username, password } = req.body || {};
    const user = db.prepare(`SELECT * FROM users WHERE username = ? AND role = 'admin'`).get(String(username || '').trim());
    if (!user || !verifyPassword(password || '', user.password_hash)) {
      return res.status(401).json({ error: 'Invalid admin username or password' });
    }
    req.session.user = publicUser(user);
    res.json({ user: req.session.user });
  });

  // Branch login: the operator picks a branch (by id) from a list, then
  // enters that branch's own shared password — there is no individual
  // username. The resulting session is "this branch", not a named person.
  app.post('/api/auth/branch/login', (req, res) => {
    const { branchId, password } = req.body || {};
    const id = Number(branchId);
    if (!id) return res.status(400).json({ error: 'branchId is required' });
    const user = db.prepare(`SELECT * FROM users WHERE role = 'branch' AND branch_id = ?`).get(id);
    if (!user || !verifyPassword(password || '', user.password_hash)) {
      return res.status(401).json({ error: 'Invalid branch password' });
    }
    const branch = db.prepare(`SELECT id, code, name, name_ar, city, city_ar, active FROM branches WHERE id = ?`).get(id);
    if (!branch || !branch.active) return res.status(403).json({ error: 'This branch is not active' });
    req.session.user = publicUser(user);
    res.json({ user: req.session.user, branch });
  });

  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req, res) => {
    const user = req.session && req.session.user;
    if (!user) return res.status(401).json({ error: 'Not signed in' });
    let branch = null;
    if (user.role === 'branch' && user.branchId) {
      branch = db.prepare(`SELECT id, code, name, name_ar, city, city_ar, active FROM branches WHERE id = ?`).get(user.branchId);
    }
    res.json({ user, branch });
  });
}

module.exports = { register };
