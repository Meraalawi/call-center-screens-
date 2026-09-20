// Dashboard: admin login, branch management (add/edit/deactivate/delete
// with an active-order guard), per-branch menu management (add/edit/remove,
// availability toggle), a live cross-branch order table with filters, and a
// Users section (add/edit/reset-password/deactivate agent accounts; branch
// credentials are listed read-only there since they already live in this
// same table — see src/routes/users.js for why).
// Polls orders every few seconds while the Orders tab is open.
(function () {
  'use strict';
  const { t, setLanguage, applyDocumentDir } = window.I18N;
  const { fmt, relTime, escapeHtml } = window.FMT;
  let LANG = window.I18N.LANG;

  const POLL_MS = 4000;
  let pollTimer = null;

  const state = {
    user: null,
    loginError: '',
    loginBusy: false,
    section: 'branches', // 'branches' | 'menu' | 'orders' | 'users'
    branches: [],
    orders: [],
    // branches tab
    addingBranch: false,
    editBranchId: null,
    pendingDeleteBranch: null,
    // menu tab
    menuBranchId: null,
    menuItems: [],
    addingItem: false,
    editItemId: null,
    // orders tab
    orderBranchFilter: 'all',
    orderStatusFilter: 'all',
    // users tab
    users: [],
    addingUser: false,
    editUserId: null,
    resetPasswordUserId: null,
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
      whoChip.innerHTML = `<span class="who-role">${t('tabDashboard')}</span> <b>${escapeHtml(state.user.displayName)}</b>`;
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
    document.getElementById('adminView').hidden = true;
    const root = document.getElementById('loginView');
    root.hidden = false;
    root.innerHTML = `
      <div class="login-wrap">
        <div class="login-card">
          <div><h2>${t('loginTitle')}</h2><div class="login-sub">${t('adminLoginSub')}</div></div>
          ${state.loginError ? `<div class="login-error">${escapeHtml(state.loginError)}</div>` : ''}
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
          <div class="login-hint">Demo: admin / vanilla123</div>
        </div>
      </div>`;
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('loginUser').value.trim();
      const password = document.getElementById('loginPass').value;
      state.loginBusy = true; state.loginError = ''; render();
      try {
        const res = await API.post('/api/auth/admin/login', { username, password });
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

  // ---------------- data ----------------
  async function loadBranches() {
    const res = await API.get('/api/branches');
    state.branches = res.branches;
    if (!state.menuBranchId && state.branches[0]) state.menuBranchId = state.branches[0].id;
  }
  async function loadMenuItems() {
    if (!state.menuBranchId) { state.menuItems = []; return; }
    const res = await API.get(`/api/branches/${state.menuBranchId}/menu`);
    state.menuItems = res.items;
  }
  async function loadOrders() {
    const qs = new URLSearchParams({ branchId: state.orderBranchFilter, status: state.orderStatusFilter });
    const res = await API.get(`/api/orders?${qs.toString()}`);
    state.orders = res.orders;
  }
  async function loadUsers() {
    const res = await API.get('/api/users');
    state.users = res.users;
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(async () => {
      try {
        if (state.section === 'orders') { await loadOrders(); renderDashboard(); }
      } catch (err) {
        if (err.status === 401) { state.user = null; stopPolling(); render(); }
      }
    }, POLL_MS);
  }
  function stopPolling() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }

  // ---------------- shell ----------------
  function renderDashboard() {
    document.getElementById('loginView').hidden = true;
    const root = document.getElementById('adminView');
    root.hidden = false;
    root.innerHTML = `
      <div class="dash-head">
        <div class="dash-nav">
          <button data-dashsec="branches" aria-pressed="${state.section === 'branches'}">${t('dashBranches')}</button>
          <button data-dashsec="menu" aria-pressed="${state.section === 'menu'}">${t('dashMenu')}</button>
          <button data-dashsec="orders" aria-pressed="${state.section === 'orders'}">${t('dashOrders')}</button>
          <button data-dashsec="users" aria-pressed="${state.section === 'users'}">${t('dashUsers')}</button>
        </div>
      </div>
      <div id="dashBody"></div>`;
    root.querySelectorAll('[data-dashsec]').forEach((el) => el.addEventListener('click', async () => {
      state.section = el.dataset.dashsec;
      if (state.section === 'menu') { await loadMenuItems().catch(() => {}); }
      if (state.section === 'orders') { await loadOrders().catch(() => {}); }
      if (state.section === 'users') { await loadUsers().catch(() => {}); }
      renderDashboard();
    }));
    if (state.section === 'branches') renderBranchesTab();
    else if (state.section === 'menu') renderMenuTab();
    else if (state.section === 'orders') renderOrdersTab();
    else renderUsersTab();
  }

  // ---------------- branches tab ----------------
  function renderBranchesTab() {
    const body = document.getElementById('dashBody');
    const addFormHtml = state.addingBranch ? `
      <div class="add-form">
        <div class="field"><label>${t('nameLbl')}</label><input id="newBranchName" type="text" placeholder="${t('branchNamePh')}"></div>
        <div class="field"><label>${t('addressAreaLbl')}</label><input id="newBranchCity" type="text" placeholder="${t('branchAreaPh')}"></div>
        <button class="btn" id="saveBranchBtn">${t('addBranchSave')}</button>
        <button class="btn-ghost" id="cancelBranchBtn">${t('cancel')}</button>
      </div>` : `<button class="btn-ghost" id="addBranchBtn" style="margin-bottom:14px;">${t('addBranch')}</button>`;

    const rows = state.branches.map((b) => {
      if (state.editBranchId === b.id) {
        return `<tr>
          <td><input value="${escapeHtml(b.name)}" id="editName_${b.id}"></td>
          <td><input value="${escapeHtml(b.city)}" id="editCity_${b.id}"></td>
          <td class="num">${b.code}</td>
          <td class="num">${b.menuItemCount ?? '—'}</td>
          <td>
            <div class="row-actions">
              <button class="btn-text" data-save-branch="${b.id}">${LANG === 'ar' ? 'حفظ' : 'Save'}</button>
              <button class="btn-text" data-cancel-edit-branch="${b.id}">${t('cancel')}</button>
            </div>
          </td>
        </tr>`;
      }
      const activeOrders = state.orders.filter((o) => o.branchId === b.id && ['new', 'preparing', 'ready'].includes(o.status)).length;
      const deleteCell = state.pendingDeleteBranch === b.id
        ? `<button class="btn-text" data-confirm-delete-branch="${b.id}">${t('confirmDelete')}</button><button class="btn-text" data-cancel-delete-branch="${b.id}">${t('cancel')}</button>`
        : `<div class="row-actions">
             <button class="btn-text" data-toggle-active="${b.id}" data-active="${b.active}">${b.active ? t('deactivate') : t('activate')}</button>
             <button class="btn-text" data-edit-branch="${b.id}">${t('edit')}</button>
             <button class="btn-text" data-delete-branch="${b.id}">${t('del')}</button>
           </div>`;
      return `<tr>
        <td>${escapeHtml(bName(b))}</td>
        <td>${escapeHtml(bCity(b))}</td>
        <td class="num">${b.code}</td>
        <td class="num">${b.menuItemCount ?? '—'}</td>
        <td><span class="status-pill ${b.active ? '' : 'off'}">${b.active ? t('active') : t('inactive')}</span></td>
        <td>${deleteCell}</td>
      </tr>`;
    }).join('');

    body.innerHTML = `
      ${addFormHtml}
      <div class="table-wrap"><table class="data">
        <thead><tr><th>${t('thName')}</th><th>${t('thAddress')}</th><th>${t('thCode')}</th><th>${t('thItems')}</th><th>${t('thStatus')}</th><th></th></tr></thead>
        <tbody>${rows || `<tr><td colspan="6"><div class="empty-state">${t('noBranchesYet')}</div></td></tr>`}</tbody>
      </table></div>`;

    const addBtn = document.getElementById('addBranchBtn');
    if (addBtn) addBtn.addEventListener('click', () => { state.addingBranch = true; renderBranchesTab(); });
    const cancelBtn = document.getElementById('cancelBranchBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', () => { state.addingBranch = false; renderBranchesTab(); });
    const saveBtn = document.getElementById('saveBranchBtn');
    if (saveBtn) saveBtn.addEventListener('click', async () => {
      const name = document.getElementById('newBranchName').value.trim();
      const city = document.getElementById('newBranchCity').value.trim();
      if (!name) { toast(t('toastItemNeedsName')); return; }
      try {
        await API.post('/api/branches', { name, nameAr: name, city: city || '—', cityAr: city || '—' });
        state.addingBranch = false;
        toast(t('toastBranchAdded', name));
        await loadBranches();
        renderBranchesTab();
      } catch (err) { toast(err.message || t('networkError')); }
    });

    body.querySelectorAll('[data-toggle-active]').forEach((el) => el.addEventListener('click', async () => {
      const id = Number(el.dataset.toggleActive);
      const active = el.dataset.active === 'true';
      try {
        await API.put(`/api/branches/${id}`, { active: !active });
        await loadBranches();
        renderBranchesTab();
      } catch (err) { toast(err.message || t('networkError')); }
    }));
    body.querySelectorAll('[data-edit-branch]').forEach((el) => el.addEventListener('click', () => { state.editBranchId = Number(el.dataset.editBranch); renderBranchesTab(); }));
    body.querySelectorAll('[data-cancel-edit-branch]').forEach((el) => el.addEventListener('click', () => { state.editBranchId = null; renderBranchesTab(); }));
    body.querySelectorAll('[data-save-branch]').forEach((el) => el.addEventListener('click', async () => {
      const id = Number(el.dataset.saveBranch);
      const name = document.getElementById('editName_' + id).value.trim();
      const city = document.getElementById('editCity_' + id).value.trim();
      try {
        await API.put(`/api/branches/${id}`, { name: name || undefined, nameAr: name || undefined, city: city || undefined, cityAr: city || undefined });
        state.editBranchId = null;
        await loadBranches();
        renderBranchesTab();
      } catch (err) { toast(err.message || t('networkError')); }
    }));
    body.querySelectorAll('[data-delete-branch]').forEach((el) => el.addEventListener('click', () => { state.pendingDeleteBranch = Number(el.dataset.deleteBranch); renderBranchesTab(); }));
    body.querySelectorAll('[data-cancel-delete-branch]').forEach((el) => el.addEventListener('click', () => { state.pendingDeleteBranch = null; renderBranchesTab(); }));
    body.querySelectorAll('[data-confirm-delete-branch]').forEach((el) => el.addEventListener('click', async () => {
      const id = Number(el.dataset.confirmDeleteBranch);
      const b = state.branches.find((x) => x.id === id);
      try {
        await API.del(`/api/branches/${id}`);
        state.pendingDeleteBranch = null;
        if (state.menuBranchId === id) state.menuBranchId = null;
        toast(t('toastBranchRemoved', bName(b)));
        await loadBranches();
        renderBranchesTab();
      } catch (err) {
        // active-order guard: server returns 409 with a count
        if (err.status === 409) toast(t('cantDelete', (err.data && err.data.activeOrders) || 0));
        else toast(err.message || t('networkError'));
        state.pendingDeleteBranch = null;
        renderBranchesTab();
      }
    }));
  }

  // ---------------- menu tab ----------------
  function renderMenuTab() {
    const body = document.getElementById('dashBody');
    if (!state.menuBranchId) { body.innerHTML = `<div class="empty-state">${t('noBranchesYet')}</div>`; return; }
    const branch = state.branches.find((b) => b.id === state.menuBranchId);
    if (!branch) { body.innerHTML = `<div class="empty-state">${t('noBranchesYet')}</div>`; return; }
    const cats = Array.from(new Set(state.menuItems.map((i) => i.category)));

    const branchSelect = `<select id="menuBranchSelect">${state.branches.map((b) => `<option value="${b.id}" ${b.id === state.menuBranchId ? 'selected' : ''}>${escapeHtml(bName(b))}</option>`).join('')}</select>`;

    const addFormHtml = state.addingItem ? `
      <div class="add-form">
        <div class="field"><label>${t('itemNameLbl')}</label><input id="newItemName" type="text" placeholder="${t('itemNamePh')}"></div>
        <div class="field"><label>${t('categoryLbl')}</label><input id="newItemCat" type="text" list="catList" placeholder="${t('categoryPh')}"></div>
        <datalist id="catList">${cats.map((c) => `<option value="${escapeHtml(c)}">`).join('')}</datalist>
        <div class="field" style="max-width:110px;"><label>${t('priceLbl')}</label><input id="newItemPrice" type="number" min="0" step="0.5" placeholder="0.00"></div>
        <button class="btn" id="saveItemBtn">${t('addItemSave')}</button>
        <button class="btn-ghost" id="cancelItemBtn">${t('cancel')}</button>
      </div>` : `<button class="btn-ghost" id="addItemBtn" style="margin-bottom:14px;">${t('addItem')}</button>`;

    const rows = state.menuItems.map((m) => {
      if (state.editItemId === m.id) {
        return `<tr>
          <td><input value="${escapeHtml(m.name)}" id="editItemName_${m.id}"></td>
          <td><input value="${escapeHtml(m.category)}" id="editItemCat_${m.id}"></td>
          <td class="num"><input value="${(m.priceCents / 100).toFixed(2)}" id="editItemPrice_${m.id}" type="number" step="0.5" min="0"></td>
          <td>
            <div class="row-actions">
              <button class="btn-text" data-save-item="${m.id}">${LANG === 'ar' ? 'حفظ' : 'Save'}</button>
              <button class="btn-text" data-cancel-edit-item="${m.id}">${t('cancel')}</button>
            </div>
          </td>
        </tr>`;
      }
      return `<tr>
        <td>${escapeHtml(iName(m))}</td>
        <td>${escapeHtml(LANG === 'ar' ? m.categoryAr : m.category)}</td>
        <td class="num">${fmt(m.priceCents)}</td>
        <td>
          <div class="row-actions">
            <button class="btn-text" data-toggle-avail="${m.id}" data-avail="${m.available}">${m.available ? t('markUnavail') : t('markAvail')}</button>
            <button class="btn-text" data-edit-item="${m.id}">${t('edit')}</button>
            <button class="btn-text" data-remove-item="${m.id}">${t('remove')}</button>
          </div>
        </td>
      </tr>`;
    }).join('');

    body.innerHTML = `
      <div class="dash-toolbar">
        <div class="field" style="min-width:220px;"><label>${t('editingMenuFor')}</label>${branchSelect}</div>
        <span class="eyebrow">${t('itemsCountLbl', state.menuItems.length)}</span>
      </div>
      ${addFormHtml}
      <div class="table-wrap"><table class="data">
        <thead><tr><th>${t('thItem')}</th><th>${t('thCategory')}</th><th>${t('thPrice')}</th><th></th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4"><div class="empty-state">${t('noItemsMenu')}</div></td></tr>`}</tbody>
      </table></div>`;

    document.getElementById('menuBranchSelect').addEventListener('change', async (e) => {
      state.menuBranchId = Number(e.target.value);
      state.addingItem = false; state.editItemId = null;
      await loadMenuItems();
      renderMenuTab();
    });
    const addBtn = document.getElementById('addItemBtn');
    if (addBtn) addBtn.addEventListener('click', () => { state.addingItem = true; renderMenuTab(); });
    const cancelBtn = document.getElementById('cancelItemBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', () => { state.addingItem = false; renderMenuTab(); });
    const saveBtn = document.getElementById('saveItemBtn');
    if (saveBtn) saveBtn.addEventListener('click', async () => {
      const name = document.getElementById('newItemName').value.trim();
      const cat = document.getElementById('newItemCat').value.trim() || 'Other';
      const priceCents = Math.round(parseFloat(document.getElementById('newItemPrice').value || '0') * 100);
      if (!name) { toast(t('toastItemNeedsName')); return; }
      try {
        await API.post(`/api/branches/${state.menuBranchId}/menu`, { name, nameAr: name, category: cat, categoryAr: cat, priceCents: isNaN(priceCents) ? 0 : priceCents });
        state.addingItem = false;
        toast(t('toastItemAdded', name, bName(branch)));
        await loadMenuItems();
        renderMenuTab();
      } catch (err) { toast(err.message || t('networkError')); }
    });

    body.querySelectorAll('[data-toggle-avail]').forEach((el) => el.addEventListener('click', async () => {
      const id = Number(el.dataset.toggleAvail);
      const available = el.dataset.avail === 'true';
      try {
        await API.put(`/api/menu/${id}`, { available: !available });
        await loadMenuItems();
        renderMenuTab();
      } catch (err) { toast(err.message || t('networkError')); }
    }));
    body.querySelectorAll('[data-edit-item]').forEach((el) => el.addEventListener('click', () => { state.editItemId = Number(el.dataset.editItem); renderMenuTab(); }));
    body.querySelectorAll('[data-cancel-edit-item]').forEach((el) => el.addEventListener('click', () => { state.editItemId = null; renderMenuTab(); }));
    body.querySelectorAll('[data-save-item]').forEach((el) => el.addEventListener('click', async () => {
      const id = Number(el.dataset.saveItem);
      const name = document.getElementById('editItemName_' + id).value.trim();
      const cat = document.getElementById('editItemCat_' + id).value.trim();
      const priceCents = Math.round(parseFloat(document.getElementById('editItemPrice_' + id).value || '0') * 100);
      try {
        await API.put(`/api/menu/${id}`, { name: name || undefined, category: cat || undefined, priceCents: isNaN(priceCents) ? undefined : priceCents });
        state.editItemId = null;
        await loadMenuItems();
        renderMenuTab();
      } catch (err) { toast(err.message || t('networkError')); }
    }));
    body.querySelectorAll('[data-remove-item]').forEach((el) => el.addEventListener('click', async () => {
      const id = Number(el.dataset.removeItem);
      const removed = state.menuItems.find((x) => x.id === id);
      try {
        await API.del(`/api/menu/${id}`);
        toast(t('toastItemRemoved', iName(removed)));
        await loadMenuItems();
        renderMenuTab();
      } catch (err) { toast(err.message || t('networkError')); }
    }));
  }

  // ---------------- users tab ----------------
  function renderUsersTab() {
    const body = document.getElementById('dashBody');
    const roleLabel = { agent: t('roleAgent'), admin: t('roleAdmin'), branch: t('roleBranch') };

    const addFormHtml = state.addingUser ? `
      <div class="add-form">
        <div class="field"><label>${t('usernameLbl')}</label><input id="newUserUsername" type="text" placeholder="${t('usernamePh')}"></div>
        <div class="field"><label>${t('displayNameLbl')}</label><input id="newUserDisplayName" type="text" placeholder="${t('displayNamePh')}"></div>
        <div class="field"><label>${t('passwordLbl')}</label><input id="newUserPassword" type="password" placeholder="${t('passwordPh')}" autocomplete="new-password"></div>
        <button class="btn" id="saveUserBtn">${t('addUserSave')}</button>
        <button class="btn-ghost" id="cancelUserBtn">${t('cancel')}</button>
      </div>` : `<button class="btn-ghost" id="addUserBtn" style="margin-bottom:14px;">${t('addUser')}</button>`;

    const rows = state.users.map((u) => {
      if (state.editUserId === u.id) {
        return `<tr>
          <td>${escapeHtml(u.username)}</td>
          <td><input value="${escapeHtml(u.displayName)}" id="editUserName_${u.id}"></td>
          <td>${roleLabel[u.role] || u.role}</td>
          <td class="num">${escapeHtml((u.createdAt || '').slice(0, 10))}</td>
          <td><span class="status-pill ${u.active ? '' : 'off'}">${u.active ? t('active') : t('inactive')}</span></td>
          <td>
            <div class="row-actions">
              <button class="btn-text" data-save-user="${u.id}">${LANG === 'ar' ? 'حفظ' : 'Save'}</button>
              <button class="btn-text" data-cancel-edit-user="${u.id}">${t('cancel')}</button>
            </div>
          </td>
        </tr>`;
      }
      if (state.resetPasswordUserId === u.id) {
        return `<tr>
          <td>${escapeHtml(u.username)}</td>
          <td>${escapeHtml(u.displayName)}</td>
          <td>${roleLabel[u.role] || u.role}</td>
          <td class="num">${escapeHtml((u.createdAt || '').slice(0, 10))}</td>
          <td><span class="status-pill ${u.active ? '' : 'off'}">${u.active ? t('active') : t('inactive')}</span></td>
          <td>
            <div class="row-actions">
              <input type="password" id="resetPass_${u.id}" placeholder="${t('newPasswordPh')}" autocomplete="new-password" style="max-width:180px;">
              <button class="btn-text" data-save-reset="${u.id}">${t('savePassword')}</button>
              <button class="btn-text" data-cancel-reset="${u.id}">${t('cancel')}</button>
            </div>
          </td>
        </tr>`;
      }
      const actions = u.role === 'agent'
        ? `<div class="row-actions">
             <button class="btn-text" data-toggle-user-active="${u.id}" data-active="${u.active}">${u.active ? t('deactivate') : t('activate')}</button>
             <button class="btn-text" data-edit-user="${u.id}">${t('edit')}</button>
             <button class="btn-text" data-reset-user="${u.id}">${t('resetPassword')}</button>
           </div>`
        : u.role === 'branch'
          ? `<span class="eyebrow">${t('branchRowNote')}</span>`
          : '';
      return `<tr>
        <td>${escapeHtml(u.username)}</td>
        <td>${escapeHtml(u.displayName)}</td>
        <td>${roleLabel[u.role] || u.role}</td>
        <td class="num">${escapeHtml((u.createdAt || '').slice(0, 10))}</td>
        <td><span class="status-pill ${u.active ? '' : 'off'}">${u.active ? t('active') : t('inactive')}</span></td>
        <td>${actions}</td>
      </tr>`;
    }).join('');

    body.innerHTML = `
      ${addFormHtml}
      <div class="table-wrap"><table class="data">
        <thead><tr><th>${t('thUsername')}</th><th>${t('thDisplayName')}</th><th>${t('thRole')}</th><th>${t('thCreated')}</th><th>${t('thActive')}</th><th></th></tr></thead>
        <tbody>${rows || `<tr><td colspan="6"><div class="empty-state">${t('noUsersYet')}</div></td></tr>`}</tbody>
      </table></div>`;

    const addBtn = document.getElementById('addUserBtn');
    if (addBtn) addBtn.addEventListener('click', () => { state.addingUser = true; renderUsersTab(); });
    const cancelBtn = document.getElementById('cancelUserBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', () => { state.addingUser = false; renderUsersTab(); });
    const saveBtn = document.getElementById('saveUserBtn');
    if (saveBtn) saveBtn.addEventListener('click', async () => {
      const username = document.getElementById('newUserUsername').value.trim();
      const displayName = document.getElementById('newUserDisplayName').value.trim();
      const password = document.getElementById('newUserPassword').value;
      if (!username || !displayName) { toast(t('toastItemNeedsName')); return; }
      try {
        await API.post('/api/users', { username, displayName, password });
        state.addingUser = false;
        toast(t('toastUserAdded', displayName));
        await loadUsers();
        renderUsersTab();
      } catch (err) {
        if (err.status === 409) toast(t('toastUsernameTaken'));
        else toast(err.message || t('networkError'));
      }
    });

    body.querySelectorAll('[data-toggle-user-active]').forEach((el) => el.addEventListener('click', async () => {
      const id = Number(el.dataset.toggleUserActive);
      const active = el.dataset.active === 'true';
      const u = state.users.find((x) => x.id === id);
      try {
        await API.patch(`/api/users/${id}/active`, { active: !active });
        toast(active ? t('toastUserDeactivated', u.displayName) : t('toastUserActivated', u.displayName));
        await loadUsers();
        renderUsersTab();
      } catch (err) { toast(err.message || t('networkError')); }
    }));
    body.querySelectorAll('[data-edit-user]').forEach((el) => el.addEventListener('click', () => { state.editUserId = Number(el.dataset.editUser); state.resetPasswordUserId = null; renderUsersTab(); }));
    body.querySelectorAll('[data-cancel-edit-user]').forEach((el) => el.addEventListener('click', () => { state.editUserId = null; renderUsersTab(); }));
    body.querySelectorAll('[data-save-user]').forEach((el) => el.addEventListener('click', async () => {
      const id = Number(el.dataset.saveUser);
      const displayName = document.getElementById('editUserName_' + id).value.trim();
      try {
        await API.put(`/api/users/${id}`, { displayName });
        state.editUserId = null;
        toast(t('toastUserUpdated'));
        await loadUsers();
        renderUsersTab();
      } catch (err) { toast(err.message || t('networkError')); }
    }));
    body.querySelectorAll('[data-reset-user]').forEach((el) => el.addEventListener('click', () => { state.resetPasswordUserId = Number(el.dataset.resetUser); state.editUserId = null; renderUsersTab(); }));
    body.querySelectorAll('[data-cancel-reset]').forEach((el) => el.addEventListener('click', () => { state.resetPasswordUserId = null; renderUsersTab(); }));
    body.querySelectorAll('[data-save-reset]').forEach((el) => el.addEventListener('click', async () => {
      const id = Number(el.dataset.saveReset);
      const password = document.getElementById('resetPass_' + id).value;
      const u = state.users.find((x) => x.id === id);
      try {
        await API.patch(`/api/users/${id}/password`, { password });
        state.resetPasswordUserId = null;
        toast(t('toastPasswordReset', u.displayName));
        renderUsersTab();
      } catch (err) { toast(err.message || t('networkError')); }
    }));
  }

  // ---------------- orders tab ----------------
  function renderOrdersTab() {
    const body = document.getElementById('dashBody');
    const branchOpts = [`<option value="all">${t('allBranchesOpt')}</option>`]
      .concat(state.branches.map((b) => `<option value="${b.id}" ${String(state.orderBranchFilter) === String(b.id) ? 'selected' : ''}>${escapeHtml(bName(b))}</option>`))
      .join('');
    const list = state.orders.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const statusLabel = { new: t('statusNew'), preparing: t('statusPrep'), ready: t('statusReady'), completed: LANG === 'ar' ? 'مكتمل' : 'Completed', cancelled: LANG === 'ar' ? 'ملغى' : 'Cancelled' };

    const rows = list.map((o) => {
      const b = state.branches.find((bb) => bb.id === o.branchId);
      const itemsSummary = o.items.map((i) => `${i.qty}×${escapeHtml(LANG === 'ar' ? (i.nameAr || i.name) : i.name)}`).join(', ');
      return `<tr>
        <td class="num">${escapeHtml(o.code)}</td>
        <td>${b ? escapeHtml(bName(b)) : '—'}</td>
        <td>${escapeHtml(o.customerName || t('phoneOrder'))}</td>
        <td>${o.orderType === 'delivery' ? t('delivery') + (o.address ? ' — ' + escapeHtml(o.address) : '') : t('pickup')}</td>
        <td>${itemsSummary}</td>
        <td class="num">${fmt(o.totalCents)}</td>
        <td><span class="status-pill">${statusLabel[o.status] || o.status}</span></td>
        <td><button type="button" class="status-pill ${o.rungIn ? '' : 'off'}" data-toggle-register-admin="${o.id}" data-rung="${o.rungIn}" style="cursor:pointer;border-style:${o.rungIn ? 'solid' : 'dashed'};">${o.rungIn ? t('regYes') : t('regNo')}</button></td>
        <td>${o.notes ? escapeHtml(o.notes) : t('noNote')}</td>
        <td>${relTime(o.createdAt, LANG)}</td>
      </tr>`;
    }).join('');

    body.innerHTML = `
      <div class="dash-toolbar">
        <div class="filters">
          <select id="ordersBranchFilter">${branchOpts}</select>
          <select id="ordersStatusFilter">
            <option value="all" ${state.orderStatusFilter === 'all' ? 'selected' : ''}>${t('allStatusesOpt')}</option>
            <option value="new" ${state.orderStatusFilter === 'new' ? 'selected' : ''}>${t('statusNew')}</option>
            <option value="preparing" ${state.orderStatusFilter === 'preparing' ? 'selected' : ''}>${t('statusPrep')}</option>
            <option value="ready" ${state.orderStatusFilter === 'ready' ? 'selected' : ''}>${t('statusReady')}</option>
            <option value="completed" ${state.orderStatusFilter === 'completed' ? 'selected' : ''}>${LANG === 'ar' ? 'مكتمل' : 'Completed'}</option>
            <option value="cancelled" ${state.orderStatusFilter === 'cancelled' ? 'selected' : ''}>${LANG === 'ar' ? 'ملغى' : 'Cancelled'}</option>
          </select>
        </div>
        <span class="eyebrow">${t('activeOrdersAcross', list.length, state.branches.length)}</span>
      </div>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>${t('thOrder')}</th><th>${t('thBranch')}</th><th>${t('thCustomer')}</th><th>${t('thFulfillment')}</th><th>${t('thItemsCol')}</th><th>${t('thTotal')}</th><th>${t('thStatusCol')}</th><th>${t('thRegister')}</th><th>${t('thNote')}</th><th>${t('thAge')}</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="10"><div class="empty-state">${t('noOrdersMatch')}</div></td></tr>`}</tbody>
      </table></div>`;

    document.getElementById('ordersBranchFilter').addEventListener('change', async (e) => { state.orderBranchFilter = e.target.value; await loadOrders(); renderOrdersTab(); });
    document.getElementById('ordersStatusFilter').addEventListener('change', async (e) => { state.orderStatusFilter = e.target.value; await loadOrders(); renderOrdersTab(); });
    body.querySelectorAll('[data-toggle-register-admin]').forEach((el) => el.addEventListener('click', async () => {
      const id = Number(el.dataset.toggleRegisterAdmin);
      const rung = el.dataset.rung === 'true';
      try {
        await API.patch(`/api/orders/${id}/rung-in`, { rungIn: !rung });
        await loadOrders();
        renderOrdersTab();
      } catch (err) { toast(err.message || t('networkError')); }
    }));
  }

  // ---------------- boot ----------------
  function render() {
    renderHeader();
    if (!state.user) renderLogin();
    else renderDashboard();
  }

  document.getElementById('langEnBtn').addEventListener('click', () => { setLanguage('en'); LANG = window.I18N.LANG; render(); });
  document.getElementById('langArBtn').addEventListener('click', () => { setLanguage('ar'); LANG = window.I18N.LANG; render(); });
  document.getElementById('logoutBtn').addEventListener('click', doLogout);

  applyDocumentDir();

  (async function init() {
    render();
    try {
      const me = await API.get('/api/auth/me');
      if (me.user && me.user.role === 'admin') {
        state.user = me.user;
        await loadBranches();
        render();
        startPolling();
      }
    } catch (_) { /* not signed in */ }
  })();
})();
