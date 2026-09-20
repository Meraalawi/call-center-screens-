// Branch Screen: shared branch-level login (pick a branch, enter its shared
// password — the session is "this branch", not an individual), then the
// New/Preparing/Ready kanban board for that branch's orders. Polls orders
// every few seconds so it reflects what the call center just sent in.
(function () {
  'use strict';
  const { t, setLanguage, applyDocumentDir } = window.I18N;
  const { fmt, relTime } = window.FMT;
  let LANG = window.I18N.LANG;

  const POLL_MS = 3500;
  let pollTimer = null;

  const state = {
    user: null,
    branch: null,
    publicBranches: [],
    pickedBranchId: null,
    loginError: '',
    loginBusy: false,
    orders: [],
  };

  function toast(msg) {
    const el = document.getElementById('toast');
    document.getElementById('toastText').textContent = msg;
    document.getElementById('toastAction').innerHTML = '';
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function bName(b) { return LANG === 'ar' ? (b.nameAr || b.name) : b.name; }
  function bCity(b) { return LANG === 'ar' ? (b.cityAr || b.city) : b.city; }

  function renderHeader() {
    document.getElementById('brandTag').textContent = t('brandTag');
    document.getElementById('langEnBtn').setAttribute('aria-pressed', LANG === 'en');
    document.getElementById('langArBtn').setAttribute('aria-pressed', LANG === 'ar');
    const whoChip = document.getElementById('whoChip');
    const logoutBtn = document.getElementById('logoutBtn');
    if (state.user && state.branch) {
      whoChip.hidden = false;
      whoChip.innerHTML = `<span class="who-role">${t('tabBranch')}</span> <b>${window.FMT.escapeHtml(bName(state.branch))}</b>`;
      logoutBtn.hidden = false;
      logoutBtn.textContent = t('switchBranch');
    } else {
      whoChip.hidden = true;
      logoutBtn.hidden = true;
    }
  }

  async function doLogout() {
    try { await API.post('/api/auth/logout'); } catch (_) { /* ignore */ }
    state.user = null; state.branch = null; state.pickedBranchId = null;
    stopPolling();
    render();
  }

  // ---------------- login: pick branch, then password ----------------
  async function loadPublicBranches() {
    const res = await API.get('/api/branches/public');
    state.publicBranches = res.branches;
  }

  function renderLogin() {
    document.getElementById('cashView').hidden = true;
    const root = document.getElementById('loginView');
    root.hidden = false;

    if (!state.pickedBranchId) {
      const grid = state.publicBranches.map((b) => `
        <button type="button" class="branch-pick-btn" data-pick="${b.id}">${window.FMT.escapeHtml(bName(b))}<br><span style="font-weight:400;color:var(--ink-3);">${window.FMT.escapeHtml(bCity(b))}</span></button>
      `).join('');
      root.innerHTML = `
        <div class="login-wrap">
          <div class="login-card">
            <div><h2>${t('pickYourBranch')}</h2><div class="login-sub">${t('pickYourBranchSub')}</div></div>
            <div class="branch-pick-grid">${grid || `<div class="empty-state">${t('noActiveBranches')}</div>`}</div>
          </div>
        </div>`;
      root.querySelectorAll('[data-pick]').forEach((el) => el.addEventListener('click', () => {
        state.pickedBranchId = Number(el.dataset.pick);
        state.loginError = '';
        render();
      }));
      return;
    }

    const picked = state.publicBranches.find((b) => b.id === state.pickedBranchId);
    root.innerHTML = `
      <div class="login-wrap">
        <div class="login-card">
          <div>
            <h2>${window.FMT.escapeHtml(bName(picked))}</h2>
            <div class="login-sub">${t('branchLoginSub', window.FMT.escapeHtml(bCity(picked)))}</div>
          </div>
          ${state.loginError ? `<div class="login-error">${window.FMT.escapeHtml(state.loginError)}</div>` : ''}
          <form id="loginForm">
            <div class="field" style="margin-bottom:14px;">
              <label for="branchPass">${t('loginPassword')}</label>
              <input id="branchPass" type="password" autocomplete="current-password" required autofocus>
            </div>
            <button class="btn" type="submit" style="width:100%;" ${state.loginBusy ? 'disabled' : ''}>${t('loginBtn')}</button>
          </form>
          <div class="login-hint">Demo password for every branch: "vanilla123" (username is the branch code, e.g. "tr")</div>
          <button class="btn-text" id="backBtn" type="button">${t('changeBranch')}</button>
        </div>
      </div>`;
    document.getElementById('backBtn').addEventListener('click', () => { state.pickedBranchId = null; render(); });
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const password = document.getElementById('branchPass').value;
      state.loginBusy = true; state.loginError = ''; render();
      try {
        const res = await API.post('/api/auth/branch/login', { branchId: state.pickedBranchId, password });
        state.user = res.user;
        state.branch = res.branch;
        await loadOrders();
      } catch (err) {
        state.loginError = err.network ? t('networkError') : t('loginErrorBranch');
      }
      state.loginBusy = false;
      render();
      if (state.user) startPolling();
    });
  }

  // ---------------- data ----------------
  async function loadOrders() {
    const res = await API.get('/api/orders');
    state.orders = res.orders;
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(async () => {
      try { await loadOrders(); renderCashView(); } catch (err) {
        if (err.status === 401) { state.user = null; state.branch = null; stopPolling(); render(); }
      }
    }, POLL_MS);
  }
  function stopPolling() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }

  // ---------------- kanban board ----------------
  function renderCashView() {
    document.getElementById('loginView').hidden = true;
    const root = document.getElementById('cashView');
    root.hidden = false;

    const all = state.orders;
    const cols = {
      new: all.filter((o) => o.status === 'new'),
      preparing: all.filter((o) => o.status === 'preparing'),
      ready: all.filter((o) => o.status === 'ready'),
    };
    const completedToday = all.filter((o) => o.status === 'completed' && isToday(o.createdAt)).length;

    const statusMeta = {
      new: { label: t('statusNew'), icon: '●' },
      preparing: { label: t('statusPrep'), icon: '◐' },
      ready: { label: t('statusReady'), icon: '✓' },
    };

    const ETA_OPTIONS = [5, 10, 15, 20, 30, 45, 60];
    function etaControl(o) {
      if (o.status !== 'new' && o.status !== 'preparing') return '';
      const opts = [`<option value=""${o.etaMinutes ? '' : ' selected'}>${t('etaNone')}</option>`]
        .concat(ETA_OPTIONS.map((n) => `<option value="${n}"${o.etaMinutes === n ? ' selected' : ''}>${t('etaMinutesFmt', n)}</option>`))
        .join('');
      return `<div class="oc-eta">
        <label>${t('etaLbl')}</label>
        <select data-eta="${o.id}">${opts}</select>
      </div>`;
    }

    function card(o, nextLabel, nextStatus, cancelable) {
      const itemsHtml = o.items.map((it) => `<div class="oc-item"><span>${it.qty} × ${window.FMT.escapeHtml(LANG === 'ar' ? (it.nameAr || it.name) : it.name)}</span></div>`).join('');
      const sm = statusMeta[o.status];
      return `<div class="order-card status-${o.status}">
        <div class="oc-head"><span class="oc-id mono">${window.FMT.escapeHtml(o.code)}</span><span class="oc-time">${relTime(o.createdAt, LANG)}</span></div>
        <div class="oc-status">${sm.icon} ${sm.label}</div>
        <div class="oc-customer">${window.FMT.escapeHtml(o.customerName || t('phoneOrder'))}</div>
        <div class="oc-fulfil">${o.orderType === 'delivery' ? t('delivery') : t('pickup')}</div>
        ${o.orderType === 'delivery' && o.address ? `<div class="oc-address">${window.FMT.escapeHtml(o.address)}</div>` : ''}
        ${o.notes ? `<div class="oc-note"><span class="oc-note-tag">${t('noteLbl')}:</span><span>${window.FMT.escapeHtml(o.notes)}</span></div>` : ''}
        <div class="oc-items">${itemsHtml}</div>
        <div class="oc-total"><span>${t('total')}</span><span class="mono">${fmt(o.totalCents)}</span></div>
        ${etaControl(o)}
        <button type="button" class="oc-register ${o.rungIn ? 'checked' : ''}" data-toggle-register="${o.id}" aria-pressed="${!!o.rungIn}">
          <span class="box">${o.rungIn ? '✓' : ''}</span><span>${o.rungIn ? t('rungInYes') : t('rungInToggle')}</span>
        </button>
        <div class="oc-actions">
          <button class="oc-advance" data-advance="${o.id}" data-next="${nextStatus}">${nextLabel}</button>
          ${cancelable ? `<button class="oc-cancel" data-cancel="${o.id}">${t('actCancel')}</button>` : ''}
        </div>
      </div>`;
    }
    const colHtml = (list, empty, nextLabel, nextStatus, cancelable) =>
      list.length ? list.map((o) => card(o, nextLabel, nextStatus, cancelable)).join('') : `<div class="col-empty">${empty}</div>`;

    root.innerHTML = `
      <div class="cash-head">
        <div class="cash-stats"><span>${t('activeCount', cols.new.length + cols.preparing.length + cols.ready.length)}</span><span>${t('completedTodayN', completedToday)}</span></div>
      </div>
      <div class="board">
        <div class="col col-new">
          <div class="col-head"><h3>${t('colNew')}</h3><span class="col-count">${cols.new.length}</span></div>
          <div class="col-body">${colHtml(cols.new, t('emptyNew'), t('actAccept'), 'preparing', true)}</div>
        </div>
        <div class="col col-prep">
          <div class="col-head"><h3>${t('colPrep')}</h3><span class="col-count">${cols.preparing.length}</span></div>
          <div class="col-body">${colHtml(cols.preparing, t('emptyPrep'), t('actReady'), 'ready', true)}</div>
        </div>
        <div class="col col-ready">
          <div class="col-head"><h3>${t('colReady')}</h3><span class="col-count">${cols.ready.length}</span></div>
          <div class="col-body">${colHtml(cols.ready, t('emptyReady'), t('actComplete'), 'completed', false)}</div>
        </div>
      </div>`;

    root.querySelectorAll('[data-advance]').forEach((el) => el.addEventListener('click', async () => {
      const id = Number(el.dataset.advance);
      const next = el.dataset.next;
      try {
        await API.patch(`/api/orders/${id}/status`, { status: next });
        if (next === 'completed') toast(t('toastCompleted', findCode(id)));
        await loadOrders();
        renderCashView();
      } catch (err) { toast(err.message || t('networkError')); }
    }));
    root.querySelectorAll('[data-cancel]').forEach((el) => el.addEventListener('click', async () => {
      const id = Number(el.dataset.cancel);
      try {
        await API.patch(`/api/orders/${id}/status`, { status: 'cancelled' });
        toast(t('toastCancelled', findCode(id)));
        await loadOrders();
        renderCashView();
      } catch (err) { toast(err.message || t('networkError')); }
    }));
    root.querySelectorAll('[data-toggle-register]').forEach((el) => el.addEventListener('click', async () => {
      const id = Number(el.dataset.toggleRegister);
      const o = state.orders.find((oo) => oo.id === id);
      try {
        await API.patch(`/api/orders/${id}/rung-in`, { rungIn: !o.rungIn });
        await loadOrders();
        renderCashView();
      } catch (err) { toast(err.message || t('networkError')); }
    }));
    root.querySelectorAll('[data-eta]').forEach((el) => el.addEventListener('change', async () => {
      const id = Number(el.dataset.eta);
      const val = el.value ? Number(el.value) : null;
      try {
        await API.patch(`/api/orders/${id}/eta`, { etaMinutes: val });
        await loadOrders();
        renderCashView();
      } catch (err) { toast(err.message || t('networkError')); }
    }));
  }

  function findCode(id) { const o = state.orders.find((oo) => oo.id === id); return o ? o.code : id; }
  function isToday(iso) {
    const d = new Date(iso);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  }

  // ---------------- boot ----------------
  function render() {
    renderHeader();
    if (!state.user) renderLogin();
    else renderCashView();
  }

  document.getElementById('langEnBtn').addEventListener('click', () => { setLanguage('en'); LANG = window.I18N.LANG; render(); });
  document.getElementById('langArBtn').addEventListener('click', () => { setLanguage('ar'); LANG = window.I18N.LANG; render(); });
  document.getElementById('logoutBtn').addEventListener('click', doLogout);

  applyDocumentDir();

  (async function init() {
    try { await loadPublicBranches(); } catch (_) { /* ignore */ }
    render();
    try {
      const me = await API.get('/api/auth/me');
      if (me.user && me.user.role === 'branch') {
        state.user = me.user;
        state.branch = me.branch;
        await loadOrders();
        render();
        startPolling();
      }
    } catch (_) { /* not signed in */ }
  })();
})();
