const db = require('../db');

// Route guard: checks req.session.user.role against the role(s) a route
// needs. Returns 401 (not a redirect) since these are JSON API routes; the
// front-end pages decide what to do with a 401 (usually: show the login form).
//
// Also re-checks the underlying user row on every request (not just at
// login): an account deactivated from the Dashboard's Users section must
// lose access on its very next request, even if it was already logged in
// with a live session cookie — a stale in-session flag would let a
// deactivated agent keep working until the session naturally expired.
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const sessionUser = req.session && req.session.user;
    if (!sessionUser) return res.status(401).json({ error: 'Not signed in' });
    const row = db.prepare('SELECT active FROM users WHERE id = ?').get(sessionUser.id);
    if (!row || !row.active) {
      req.session.destroy();
      return res.status(401).json({ error: 'This account has been deactivated' });
    }
    if (!allowedRoles.includes(sessionUser.role)) {
      return res.status(403).json({ error: 'Not allowed for this role' });
    }
    next();
  };
}

module.exports = { requireRole };
