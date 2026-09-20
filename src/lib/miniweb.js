// A minimal Express-shaped HTTP framework, used instead of the `express`
// package because this sandbox cannot reach any package registry (see the
// note in src/db/index.js). Supports app.use(middleware), app.get/post/
// put/patch/delete(path, ...handlers), :param routes, req.query, req.body
// (JSON), req.cookies, res.json/res.status/res.send/res.cookie, and static
// file serving. It intentionally covers only what this app needs — it is
// not a general-purpose framework.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function matchRoute(routeSegments, urlSegments) {
  if (routeSegments.length !== urlSegments.length) return null;
  const params = {};
  for (let i = 0; i < routeSegments.length; i++) {
    const rs = routeSegments[i];
    const us = urlSegments[i];
    if (rs.startsWith(':')) params[rs.slice(1)] = decodeURIComponent(us);
    else if (rs !== us) return null;
  }
  return params;
}

class App {
  constructor() {
    this.middlewares = []; // { path, fn } path=null means global
    this.routes = []; // { method, segments, handlers }
  }

  use(pathOrFn, maybeFn) {
    if (typeof pathOrFn === 'function') this.middlewares.push({ path: null, fn: pathOrFn });
    else this.middlewares.push({ path: pathOrFn, fn: maybeFn });
  }

  _addRoute(method, routePath, handlers) {
    this.routes.push({ method, segments: routePath.split('/').filter(Boolean), handlers });
  }
  get(p, ...h) { this._addRoute('GET', p, h); }
  post(p, ...h) { this._addRoute('POST', p, h); }
  put(p, ...h) { this._addRoute('PUT', p, h); }
  patch(p, ...h) { this._addRoute('PATCH', p, h); }
  delete(p, ...h) { this._addRoute('DELETE', p, h); }

  async _handle(req, res) {
    const parsedUrl = new URL(req.url, 'http://localhost');
    req.path = parsedUrl.pathname;
    req.query = Object.fromEntries(parsedUrl.searchParams.entries());
    req.cookies = parseCookies(req.headers.cookie);
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (obj) => {
      const body = JSON.stringify(obj);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(body);
    };
    res.send = (body) => {
      if (typeof body === 'object') return res.json(body);
      res.end(String(body));
    };
    res._cookies = [];
    res.cookie = (name, value, opts = {}) => {
      let str = `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax`;
      if (opts.maxAge) str += `; Max-Age=${Math.floor(opts.maxAge / 1000)}`;
      res._cookies.push(str);
      res.setHeader('Set-Cookie', res._cookies);
    };
    res.clearCookie = (name) => {
      res._cookies.push(`${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
      res.setHeader('Set-Cookie', res._cookies);
    };

    // body parsing for JSON requests
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      req.body = await new Promise((resolve) => {
        let data = '';
        req.on('data', (chunk) => { data += chunk; });
        req.on('end', () => {
          if (!data) return resolve({});
          try { resolve(JSON.parse(data)); } catch (_) { resolve({}); }
        });
        req.on('error', () => resolve({}));
      });
    } else {
      req.body = {};
    }

    const urlSegments = req.path.split('/').filter(Boolean);

    // build the middleware + route handler chain
    const chain = [];
    for (const mw of this.middlewares) {
      if (mw.path === null || req.path === mw.path || req.path.startsWith(mw.path + '/') || req.path.startsWith(mw.path)) {
        chain.push(mw.fn);
      }
    }

    let matchedRoute = null;
    let params = {};
    for (const route of this.routes) {
      if (route.method !== req.method) continue;
      const m = matchRoute(route.segments, urlSegments);
      if (m) { matchedRoute = route; params = m; break; }
    }

    if (matchedRoute) {
      req.params = params;
      chain.push(...matchedRoute.handlers);
    }

    let i = 0;
    const next = (err) => {
      if (err) {
        console.error(err);
        if (!res.writableEnded) res.status(500).json({ error: 'Internal server error' });
        return;
      }
      const fn = chain[i++];
      if (!fn) {
        if (!res.writableEnded) res.status(404).json({ error: 'Not found' });
        return;
      }
      try {
        const maybePromise = fn(req, res, next);
        if (maybePromise && typeof maybePromise.catch === 'function') maybePromise.catch(next);
      } catch (e) {
        next(e);
      }
    };
    next();
  }

  listen(port, cb) {
    const server = http.createServer((req, res) => {
      this._handle(req, res).catch((e) => {
        console.error(e);
        if (!res.writableEnded) { res.statusCode = 500; res.end('Internal server error'); }
      });
    });
    server.listen(port, cb);
    return server;
  }
}

function createApp() {
  return new App();
}

// static file middleware, mounted with app.use(serveStatic(dir))
function serveStatic(rootDir) {
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    let reqPath = decodeURIComponent(req.path);
    if (reqPath === '/') reqPath = '/index.html';
    const filePath = path.normalize(path.join(rootDir, reqPath));
    if (!filePath.startsWith(path.normalize(rootDir))) return next();
    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) return next();
      const ext = path.extname(filePath).toLowerCase();
      res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
      fs.createReadStream(filePath).pipe(res);
    });
  };
}

module.exports = { createApp, serveStatic };
