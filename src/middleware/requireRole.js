// Route guard: checks req.session.user.role against the role(s) a route
// needs. Returns 401 (not a redirect) since these are JSON API routes; the
// front-end pages decide what to do with a 401 (usually: show the login form).
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const user = req.session && req.session.user;
    if (!user) return res.status(401).json({ error: 'Not signed in' });
    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({ error: 'Not allowed for this role' });
    }
    next();
  };
}

module.exports = { requireRole };
