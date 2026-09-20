// In-memory cookie session middleware, standing in for `express-session`
// (see the note in src/db/index.js — no package registry is reachable in
// this sandbox). Same shape: req.session is a plain mutable object that
// persists across requests for the same browser via a signed session-id
// cookie, and req.session.destroy() logs the session out.
const crypto = require('crypto');

const COOKIE_NAME = 'vc.sid';
const MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 hour shift-length session

function makeSessionMiddleware(secret) {
  const store = new Map(); // sid -> { data, expires }

  function sign(id) {
    const mac = crypto.createHmac('sha256', secret).update(id).digest('hex').slice(0, 16);
    return `${id}.${mac}`;
  }
  function verify(signed) {
    if (!signed || typeof signed !== 'string' || !signed.includes('.')) return null;
    const id = signed.slice(0, signed.lastIndexOf('.'));
    if (sign(id) === signed) return id;
    return null;
  }

  // periodic sweep of expired sessions so the in-memory Map doesn't grow forever
  setInterval(() => {
    const now = Date.now();
    for (const [id, entry] of store) if (entry.expires < now) store.delete(id);
  }, 10 * 60 * 1000).unref();

  return function sessionMiddleware(req, res, next) {
    const raw = req.cookies[COOKIE_NAME];
    let id = verify(raw);
    let entry = id ? store.get(id) : null;
    if (entry && entry.expires < Date.now()) { store.delete(id); entry = null; }

    if (!entry) {
      id = crypto.randomBytes(24).toString('hex');
      entry = { data: {}, expires: Date.now() + MAX_AGE_MS };
      store.set(id, entry);
      res.cookie(COOKIE_NAME, sign(id), { maxAge: MAX_AGE_MS });
    } else {
      // sliding expiry
      entry.expires = Date.now() + MAX_AGE_MS;
    }

    req.session = entry.data;
    req.session.destroy = () => {
      store.delete(id);
      res.clearCookie(COOKIE_NAME);
    };
    next();
  };
}

module.exports = { makeSessionMiddleware };
