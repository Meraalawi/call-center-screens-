// Call Center Desk: agent login, branch picker, order-building UI, review
// modal, send. Polls the branch list / current branch's menu every few
// seconds so availability changes made from the Dashboard show up live.
(function () {
  'use strict';
  const { t, setLanguage, applyDocumentDir } = window.I18N;
  const { fmt } = window.FMT;
  let LANG = window.I18N.LANG;

  const POLL_MS = 4000;
  let pollTimer = null;

  const state = {
    user: null,
    loginError: '',
    loginBusy: false,
    branches: [],
    step: 'branch', // 'branch' | 'order'
    branchId: null,
    menu: [],
    category: 'All',
    cart: [], // {itemId, name, nameAr, priceCents, qty}
    customerName: '', customerPhone: '', orderType: 'pickup', deliveryAddress: '', notes: '',
    reviewOpen: false, sending: false,
    ticketOpen: false,
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
  function iName(m) { return LANG === 'ar' ? (m.nameAr || m.name) : m.name; }

  function renderHeader() {
    document.getElementById('brandTag').textContent = t('brandTag');
    document.getElementById('langEnBtn').setAttribute('aria-pressed', LANG === 'en');
    document.getElementById('langArBtn').setAttribute('aria-pressed', LANG === 'ar');
    const whoChip = document.getElementById('whoChip');
    const logoutBtn = document.getElementById('logoutBtn');
    if (state.user) {
      whoChip.hidden = false;
      whoChip.innerHTML = `<span class="who-role">${t('tabDesk')}</span> <b>${window.FMT.escapeHtml(state.user.displayName)}</b>`;
      logoutBtn.hidden = false;
      logoutBtn.textContent = t('logout');
    } else {
      whoChip.hidden = true;
      logoutBtn.hidden = true;
    }
  }

  async function doLogout() {
    try { await API.post('/api/auth/logout'); } catch (_) { /* ignore */ }
    state.user = null;
    stopPolling();
    render();
  }

  // ---------------- login ----------------
  function renderLogin() {
    document.getElementById('agentView').hidden = true;
    const root = document.getElementById('loginView');
    root.hidden = false;
    root.innerHTML = `
      <div class="login-wrap">
        <div class="login-card">
          <div>
            <h2>${t('loginTitle')}</h2>
            <div class="login-sub">${t('agentLoginSub')}</div>
          </div>
          ${state.loginError ? `<div class="login-error">${window.FMT.escapeHtml(state.loginError)}</div>` : ''}
          <form id="loginForm">
            <div class="field" style="margin-bottom:10px;">
              <label for="loginUser">${t('loginUsername')}</label>
              <input id="loginUser" type="text" autocomplete="username" required>
            </div>
            <div class="field" style="margin-bottom:14px;">
              <label for="loginPass">${t('loginPassword')}</label>
              <input id="loginPass" type="password" autocomplete="current-password" required>
            </div>
            <button class="btn" type="submit" style="width:100%;" ${state.loginBusy ? 'disabled' : ''}>${t('loginBtn')}</button>
          </form>
          <div class="login-hint">Demo: agent1 / agent2 / agent3, password "vanilla123"</div>
        </div>
      </div>`;
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('loginUser').value.trim();
      const password = document.getElementById('loginPass').value;
      state.loginBusy = true; state.loginError = ''; render();
      try {
        const res = await API.post('/api/auth/agent/login', { username, password });
        state.user = res.user;
        await loadBranches();
      } catch (err) {
        state.loginError = err.network ? t('networkError') : t('loginError');
      }
      state.loginBusy = false;
      render();
      if (state.user) startPolling();
    });
  }

  // ---------------- data loading ----------------
  async function loadBranches() {
    const res = await API.get('/api/branches');
    state.branches = res.branches.filter((b) => b.active);
    if (state.branchId && !state.branches.some((b) => b.id === state.branchId)) {
      state.branchId = null;
      state.step = 'branch';
    }
  }

  async function loadMenu(branchId) {
    const res = await API.get(`/api/branches/${branchId}/menu`);
    state.menu = res.items;
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(async () => {
      try {
        if (state.step === 'branch') {
          await loadBranches();
          if (state.step === 'branch') renderAgentView();
        } else if (state.step === 'order' && state.branchId) {
          // Also refresh the branch list here (not just the menu) so a
          // status change the branch makes mid-call — e.g. going from
          // normal to busy — shows up live in the review modal without a
          // second poll interval.
          await Promise.all([loadMenu(state.branchId), loadBranches()]);
          renderAgentView();
          if (state.reviewOpen) renderReviewModal();
        }
      } catch (err) {
        if (err.status === 401) { state.user = null; stopPolling(); render(); }
      }
    }, POLL_MS);
  }
  function stopPolling() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }

  // ---------------- agent view ----------------
  function renderAgentView() {
    document.getElementById('loginView').hidden = true;
    const root = document.getElementById('agentView');
    root.hidden = false;
    if (state.step === 'branch') renderBranchSelect(root);
    else renderOrderScreen(root);
  }

  function loadBadgeLabel(status) {
    return status === 'very_busy' ? t('bsStatusVeryBusy') : status === 'busy' ? t('bsStatusBusy') : t('bsStatusNormal');
  }

  function renderBranchSelect(root) {
    const cards = state.branches.map((b) => {
      const status = b.status || 'normal';
      return `
      <button class="bs-card" data-branch-select="${b.id}">
        <span class="bs-tag">${t('bsBranchTag')}</span>
        <span class="bs-name">${window.FMT.escapeHtml(bName(b))}</span>
        <span class="bs-city">${window.FMT.escapeHtml(bCity(b))}</span>
        <span class="status-load-badge load-${status}">${loadBadgeLabel(status)}</span>
        <span class="bs-meta">${t('bsItems', b.menuItemCount ?? '—')}</span>
        <span class="bs-cta">${t('bsCta')}</span>
      </button>`;
    }).join('');

    root.innerHTML = `
      <div class="branch-select-screen">
        <div class="bs-head">
          <h2>${t('bsTitle')}</h2>
          <div class="sub">${t('bsSub')}</div>
        </div>
        <div class="bs-grid">${cards}</div>
        ${state.branches.length === 0 ? `<div class="empty-state">${t('noActiveBranches')}</div>` : ''}
      </div>`;

    root.querySelectorAll('[data-branch-select]').forEach((el) => el.addEventListener('click', async () => {
      const id = Number(el.dataset.branchSelect);
      state.branchId = id;
      state.category = 'All';
      state.cart = [];
      state.step = 'order';
      try {
        await loadMenu(id);
      } catch (err) {
        toast(err.message || t('networkError'));
      }
      renderAgentView();
    }));
  }

  function renderOrderScreen(root) {
    const branch = state.branches.find((b) => b.id === state.branchId);
    if (!branch) { state.step = 'branch'; return renderAgentView(); }

    const catMap = new Map();
    state.menu.forEach((m) => { if (!catMap.has(m.category)) catMap.set(m.category, m.categoryAr); });
    const cats = [{ key: 'All', label: t('allCat') }, ...Array.from(catMap, ([key, ar]) => ({ key, label: LANG === 'ar' ? ar : key }))];
    const items = state.menu.filter((m) => state.category === 'All' || m.category === state.category);
    const cartTotal = state.cart.reduce((s, l) => s + l.priceCents * l.qty, 0);
    const cartCount = state.cart.reduce((s, l) => s + l.qty, 0);

    const catRow = cats.map((c) => `<button class="cat-btn" aria-pressed="${c.key === state.category}" data-cat="${window.FMT.escapeHtml(c.key)}">${window.FMT.escapeHtml(c.label)}</button>`).join('');

    const menuGrid = items.map((m) => {
      const line = state.cart.find((l) => l.itemId === m.id);
      const qty = line ? line.qty : 0;
      const control = !m.available
        ? `<span class="unavail-tag">${LANG === 'ar' ? 'غير متوفر' : 'Unavailable'}</span>`
        : qty > 0
          ? `<span class="stepper"><button data-dec="${m.id}" aria-label="Remove one">−</button><span class="qty">${qty}</span><button data-inc="${m.id}" aria-label="Add one">+</button></span>`
          : `<button class="add-btn" data-inc="${m.id}">${LANG === 'ar' ? 'إضافة' : 'Add'}</button>`;
      return `<div class="item-card ${!m.available ? 'unavailable' : ''}">
          <div><div class="item-name">${window.FMT.escapeHtml(iName(m))}</div><div class="item-cat">${window.FMT.escapeHtml(LANG === 'ar' ? m.categoryAr : m.category)}</div></div>
          <div class="item-row"><span class="item-price mono">${fmt(m.priceCents)}</span>${control}</div>
        </div>`;
    }).join('') || `<div class="empty-state">${t('noItemsInCat')}</div>`;

    const ticketLines = state.cart.length ? state.cart.map((l) => `
      <div class="ticket-line">
        <div class="ln-main"><span class="ln-name">${window.FMT.escapeHtml(LANG === 'ar' ? (l.nameAr || l.name) : l.name)}</span><span class="ln-unit mono">${l.qty} × ${fmt(l.priceCents)}</span></div>
        <div class="ln-right"><span class="ln-total mono">${fmt(l.priceCents * l.qty)}</span><button class="ln-remove" data-remove="${l.itemId}" aria-label="Remove">×</button></div>
      </div>`).join('') : `<div class="ticket-empty">${t('noItemsYet')}</div>`;

    root.innerHTML = `
      <div class="agent-grid">
        <div class="panel menu-panel">
          <button class="back-branch" id="changeBranchBtn">${t('changeBranch')}</button>
          <div class="menu-head">
            <div><h2>${window.FMT.escapeHtml(bName(branch))}</h2><div class="sub">${window.FMT.escapeHtml(bCity(branch))}</div></div>
            <div class="sub">${t('pricesNote')}</div>
          </div>
          <div class="cat-row">${catRow}</div>
          <div class="menu-grid">${menuGrid}</div>
        </div>

        <div class="panel ticket-panel ${state.ticketOpen ? 'open' : ''}" id="ticketPanel">
          <div class="mobile-bar" id="mobileBar">
            <span class="mb-label">${t('ticketCount', cartCount)}</span>
            <span class="mb-total mono">${fmt(cartTotal)}</span>
          </div>
          <div class="ticket-body">
            <div class="ticket-dest">${t('sendingTo', window.FMT.escapeHtml(bName(branch)), window.FMT.escapeHtml(bCity(branch)))}</div>
            <div class="field"><label for="custName">${t('custName')}</label><input id="custName" type="text" placeholder="${t('custNamePh')}" value="${window.FMT.escapeHtml(state.customerName)}"></div>
            <div class="field"><label for="custPhone">${t('custPhone')}</label><input id="custPhone" type="tel" placeholder="${t('custPhonePh')}" value="${window.FMT.escapeHtml(state.customerPhone)}"></div>
            <div class="field">
              <label>${t('fulfillment')}</label>
              <div class="type-toggle">
                <button type="button" class="type-btn" data-order-type="pickup" aria-pressed="${state.orderType === 'pickup'}">${t('pickup')}</button>
                <button type="button" class="type-btn" data-order-type="delivery" aria-pressed="${state.orderType === 'delivery'}">${t('delivery')}</button>
              </div>
            </div>
            ${state.orderType === 'delivery' ? `<div class="field"><label for="custAddress">${t('addressLbl')}</label><input id="custAddress" type="text" placeholder="${t('addressPh')}" value="${window.FMT.escapeHtml(state.deliveryAddress)}"></div>` : ''}
            <div class="field"><label for="custNotes">${t('orderNoteLbl')}</label><textarea id="custNotes" rows="2" placeholder="${t('orderNotePh')}">${window.FMT.escapeHtml(state.notes)}</textarea></div>
            <div class="ticket-divider"></div>
            <div class="ticket-lines">${ticketLines}</div>
            <div class="ticket-divider"></div>
            <div class="ticket-totals"><div class="row grand"><span>${t('total')}</span><span class="mono">${fmt(cartTotal)}</span></div></div>
            <button class="send-btn" id="reviewBtn" ${state.cart.length === 0 ? 'disabled' : ''}>${t('reviewBtn')}</button>
            <div class="send-hint">${t('sendHint')}</div>
          </div>
        </div>
      </div>`;

    document.getElementById('changeBranchBtn').addEventListener('click', () => { state.step = 'branch'; loadBranches().then(renderAgentView).catch(() => renderAgentView()); });
    root.querySelectorAll('[data-cat]').forEach((el) => el.addEventListener('click', () => { state.category = el.dataset.cat; renderAgentView(); }));
    root.querySelectorAll('[data-inc]').forEach((el) => el.addEventListener('click', () => {
      const id = Number(el.dataset.inc);
      const m = state.menu.find((mm) => mm.id === id);
      const line = state.cart.find((l) => l.itemId === id);
      if (line) line.qty++;
      else state.cart.push({ itemId: id, name: m.name, nameAr: m.nameAr, priceCents: m.priceCents, qty: 1 });
      renderAgentView();
    }));
    root.querySelectorAll('[data-dec]').forEach((el) => el.addEventListener('click', () => {
      const id = Number(el.dataset.dec);
      const line = state.cart.find((l) => l.itemId === id);
      if (line) { line.qty--; if (line.qty <= 0) state.cart = state.cart.filter((l) => l.itemId !== id); }
      renderAgentView();
    }));
    root.querySelectorAll('[data-remove]').forEach((el) => el.addEventListener('click', () => { state.cart = state.cart.filter((l) => l.itemId !== Number(el.dataset.remove)); renderAgentView(); }));
    root.querySelectorAll('[data-order-type]').forEach((el) => el.addEventListener('click', () => { state.orderType = el.dataset.orderType; renderAgentView(); }));

    const bind = (id, key) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', (e) => { state[key] = e.target.value; });
    };
    bind('custName', 'customerName'); bind('custPhone', 'customerPhone'); bind('custAddress', 'deliveryAddress'); bind('custNotes', 'notes');

    const mobileBar = document.getElementById('mobileBar');
    if (mobileBar) mobileBar.addEventListener('click', () => { state.ticketOpen = !state.ticketOpen; renderAgentView(); });
    const reviewBtn = document.getElementById('reviewBtn');
    if (reviewBtn) reviewBtn.addEventListener('click', () => { if (state.cart.length) { state.reviewOpen = true; renderReviewModal(); } });
  }

  function renderReviewModal() {
    const modalRoot = document.getElementById('modalRoot');
    if (!state.reviewOpen) { modalRoot.innerHTML = ''; return; }
    const branch = state.branches.find((b) => b.id === state.branchId);
    const total = state.cart.reduce((s, l) => s + l.priceCents * l.qty, 0);
    const addressMissing = state.orderType === 'delivery' && !state.deliveryAddress.trim();

    // Crowding/lateness note: reads back literally to the customer, same
    // red/yellow/green language as the branch picker badge and the Branch
    // Screen's kanban columns. Normal status stays quiet — no need to
    // clutter the modal when nothing's wrong.
    const status = (branch && branch.status) || 'normal';
    const loadNoteText = status === 'very_busy' ? t('reviewNoteVeryBusy', window.FMT.escapeHtml(bName(branch)))
      : status === 'busy' ? t('reviewNoteBusy', window.FMT.escapeHtml(bName(branch)))
      : '';
    const loadNoteHtml = loadNoteText ? `
      <div class="review-load-note load-${status}">
        ${loadNoteText}
        ${branch && branch.statusNote ? `<span class="rn-extra">${t('reviewBranchNoteLbl')}: ${window.FMT.escapeHtml(branch.statusNote)}</span>` : ''}
      </div>` : '';

    modalRoot.innerHTML = `
      <div class="overlay" id="reviewOverlay">
        <div class="review-card" role="dialog" aria-label="Confirm order">
          <div>
            <h2>${t('reviewTitle')}</h2>
            <div class="review-sub">${t('reviewSub', window.FMT.escapeHtml(bName(branch)))}</div>
          </div>
          ${loadNoteHtml}
          <div class="review-block">
            ${state.cart.map((l) => `<div class="review-row"><span>${l.qty} × ${window.FMT.escapeHtml(LANG === 'ar' ? (l.nameAr || l.name) : l.name)}</span><span class="mono">${fmt(l.priceCents * l.qty)}</span></div>`).join('')}
            <div class="review-row" style="border-top:1px solid var(--border);padding-top:8px;font-weight:700;"><span>${t('total')}</span><span class="mono">${fmt(total)}</span></div>
          </div>
          <div class="review-block">
            <div class="review-row"><span class="rl">${t('customerLbl')}</span><span>${window.FMT.escapeHtml(state.customerName.trim() || t('notEntered'))}</span></div>
            <div class="review-row"><span class="rl">${t('phoneLbl')}</span><span>${window.FMT.escapeHtml(state.customerPhone.trim() || t('notEntered'))}</span></div>
            <div class="review-row"><span class="rl">${t('branchLbl')}</span><span>${window.FMT.escapeHtml(bName(branch))}</span></div>
            <div class="review-row"><span class="rl">${t('fulfillment')}</span><span>${state.orderType === 'delivery' ? t('delivery') : t('pickup')}</span></div>
            ${state.orderType === 'delivery' ? `<div class="review-row"><span class="rl">${t('addressLbl')}</span><span>${window.FMT.escapeHtml(state.deliveryAddress.trim() || t('notEntered'))}</span></div>` : ''}
          </div>
          ${state.notes.trim() ? `<div class="review-block"><div class="review-row"><span class="rl">${t('noteLbl')}</span><span>${window.FMT.escapeHtml(state.notes.trim())}</span></div></div>` : ''}
          ${addressMissing ? `<div class="review-warn">${t('addressWarn')}</div>` : ''}
          <div class="review-actions">
            <button class="btn" id="confirmSendBtn" ${addressMissing || state.sending ? 'disabled' : ''}>${t('confirmSend', window.FMT.escapeHtml(bName(branch)))}</button>
            <button class="btn-text" id="backToEditBtn">${t('backToEdit')}</button>
          </div>
        </div>
      </div>`;

    document.getElementById('reviewOverlay').addEventListener('click', (e) => { if (e.target.id === 'reviewOverlay') { state.reviewOpen = false; renderReviewModal(); } });
    document.getElementById('backToEditBtn').addEventListener('click', () => { state.reviewOpen = false; renderReviewModal(); });
    const confirmBtn = document.getElementById('confirmSendBtn');
    if (!addressMissing) confirmBtn.addEventListener('click', async () => {
      state.sending = true; renderReviewModal();
      try {
        const res = await API.post('/api/orders', {
          branchId: state.branchId,
          customerName: state.customerName.trim(),
          customerPhone: state.customerPhone.trim(),
          orderType: state.orderType,
          address: state.orderType === 'delivery' ? state.deliveryAddress.trim() : '',
          notes: state.notes.trim(),
          items: state.cart.map((l) => ({ itemId: l.itemId, qty: l.qty })),
        });
        toast(t('toastSent', res.order.code, bName(branch)));
        state.cart = []; state.customerName = ''; state.customerPhone = ''; state.orderType = 'pickup';
        state.deliveryAddress = ''; state.notes = ''; state.reviewOpen = false; state.ticketOpen = false;
      } catch (err) {
        toast(err.message || t('networkError'));
      }
      state.sending = false;
      renderReviewModal();
      renderAgentView();
    });
  }

  // ---------------- boot ----------------
  function render() {
    renderHeader();
    if (!state.user) renderLogin();
    else renderAgentView();
  }

  document.getElementById('langEnBtn').addEventListener('click', () => { setLanguage('en'); LANG = window.I18N.LANG; render(); if (state.reviewOpen) renderReviewModal(); });
  document.getElementById('langArBtn').addEventListener('click', () => { setLanguage('ar'); LANG = window.I18N.LANG; render(); if (state.reviewOpen) renderReviewModal(); });
  document.getElementById('logoutBtn').addEventListener('click', doLogout);

  applyDocumentDir();

  (async function init() {
    render();
    try {
      const me = await API.get('/api/auth/me');
      if (me.user && me.user.role === 'agent') {
        state.user = me.user;
        await loadBranches();
        render();
        startPolling();
      }
    } catch (_) { /* not signed in, show login */ }
  })();
})();
