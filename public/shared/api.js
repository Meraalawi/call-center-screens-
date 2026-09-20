// Small fetch wrapper shared by all three pages. Always sends cookies
// (credentials: 'same-origin' is the default same-origin behavior but we're
// explicit) so the session cookie round-trips, and normalizes errors.
(function (global) {
  async function request(method, path, body) {
    const opts = {
      method,
      headers: {},
      credentials: 'same-origin',
    };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(path, opts);
    } catch (err) {
      const e = new Error('network');
      e.network = true;
      throw e;
    }
    let data = null;
    try { data = await res.json(); } catch (_) { data = null; }
    if (!res.ok) {
      const err = new Error((data && data.error) || `Request failed (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  global.API = {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body || {}),
    put: (path, body) => request('PUT', path, body || {}),
    patch: (path, body) => request('PATCH', path, body || {}),
    del: (path) => request('DELETE', path),
  };
})(window);
