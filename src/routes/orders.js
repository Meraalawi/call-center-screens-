const db = require('../db');
const { requireRole } = require('../middleware/requireRole');

const STATUS_FLOW = { new: 'preparing', preparing: 'ready', ready: 'completed' };

function orderWithItems(orderRow) {
  const items = db.prepare('SELECT name, name_ar, qty, price_cents FROM order_items WHERE order_id = ?').all(orderRow.id);
  return {
    id: orderRow.id,
    code: orderRow.code,
    branchId: orderRow.branch_id,
    agentId: orderRow.agent_id,
    customerName: orderRow.customer_name,
    customerPhone: orderRow.customer_phone,
    orderType: orderRow.order_type,
    address: orderRow.address,
    notes: orderRow.notes,
    status: orderRow.status,
    rungIn: !!orderRow.rung_in,
    totalCents: orderRow.total_cents,
    createdAt: orderRow.created_at,
    items: items.map((it) => ({ name: it.name, nameAr: it.name_ar, qty: it.qty, priceCents: it.price_cents })),
  };
}

function nextOrderCode(branch) {
  const row = db.prepare('SELECT next_number FROM branch_counters WHERE branch_id = ?').get(branch.id);
  const n = row ? row.next_number : 1;
  db.prepare(`
    INSERT INTO branch_counters (branch_id, next_number) VALUES (?, ?)
    ON CONFLICT(branch_id) DO UPDATE SET next_number = excluded.next_number
  `).run(branch.id, n + 1);
  return `${branch.code}-${String(n).padStart(4, '0')}`;
}

function register(app) {
  // Listing serves the branch kanban board, the dashboard's cross-branch
  // table, and an agent's own "Order Status" tab. An agent only ever sees
  // orders they personally took (so they can answer a customer's follow-up
  // call) — never another agent's or a full branch feed.
  app.get('/api/orders', requireRole('admin', 'branch', 'agent'), (req, res) => {
    const user = req.session.user;
    let sql = 'SELECT * FROM orders WHERE 1=1';
    const params = [];

    if (user.role === 'branch') {
      sql += ' AND branch_id = ?';
      params.push(user.branchId);
    } else if (user.role === 'agent') {
      sql += ' AND agent_id = ?';
      params.push(user.id);
    } else if (req.query.branchId && req.query.branchId !== 'all') {
      sql += ' AND branch_id = ?';
      params.push(Number(req.query.branchId));
    }

    if (req.query.status && req.query.status !== 'all') {
      sql += ' AND status = ?';
      params.push(req.query.status);
    }

    sql += ' ORDER BY created_at DESC';
    const rows = db.prepare(sql).all(...params);
    res.json({ orders: rows.map(orderWithItems) });
  });

  app.get('/api/orders/:id', requireRole('admin', 'branch', 'agent'), (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Order not found' });
    const user = req.session.user;
    if (user.role === 'branch' && row.branch_id !== user.branchId) return res.status(403).json({ error: 'Not allowed' });
    if (user.role === 'agent' && row.agent_id !== user.id) return res.status(403).json({ error: 'Not allowed' });
    res.json({ order: orderWithItems(row) });
  });

  // Only an agent (or admin, e.g. testing/backfill) may create an order —
  // enforced here, not just hidden in the UI.
  app.post('/api/orders', requireRole('agent', 'admin'), (req, res) => {
    const { branchId, customerName, customerPhone, orderType, address, notes, items } = req.body || {};
    const branch = db.prepare('SELECT * FROM branches WHERE id = ?').get(Number(branchId));
    if (!branch || !branch.active) return res.status(400).json({ error: 'Branch is not available' });
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Order needs at least one item' });
    if (orderType === 'delivery' && !(address && String(address).trim())) {
      return res.status(400).json({ error: 'Delivery address is required for delivery orders' });
    }

    // snapshot menu items by id so the order carries name/price at order
    // time, independent of later menu edits — but only allow real, currently
    // sellable items from this branch.
    const menuById = new Map(
      db.prepare('SELECT * FROM menu_items WHERE branch_id = ?').all(branch.id).map((m) => [m.id, m])
    );
    const lines = [];
    for (const it of items) {
      const menuItem = menuById.get(Number(it.itemId));
      const qty = Number(it.qty);
      if (!menuItem || !menuItem.available || !Number.isFinite(qty) || qty <= 0) {
        return res.status(400).json({ error: 'Order contains an invalid or unavailable item' });
      }
      lines.push({ name: menuItem.name, nameAr: menuItem.name_ar, qty, priceCents: menuItem.price_cents });
    }
    const totalCents = lines.reduce((s, l) => s + l.priceCents * l.qty, 0);

    const tx = db.transaction(() => {
      const code = nextOrderCode(branch);
      const info = db.prepare(`
        INSERT INTO orders (code, branch_id, agent_id, customer_name, customer_phone, order_type, address, notes, status, rung_in, total_cents)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', 0, ?)
      `).run(
        code, branch.id, req.session.user.role === 'agent' ? req.session.user.id : null,
        (customerName || '').trim(), (customerPhone || '').trim(),
        orderType === 'delivery' ? 'delivery' : 'pickup',
        orderType === 'delivery' ? String(address).trim() : '',
        (notes || '').trim(), totalCents
      );
      const orderId = info.lastInsertRowid;
      for (const l of lines) {
        db.prepare('INSERT INTO order_items (order_id, name, name_ar, qty, price_cents) VALUES (?, ?, ?, ?, ?)')
          .run(orderId, l.name, l.nameAr, l.qty, l.priceCents);
      }
      return orderId;
    });

    const orderId = tx();
    res.status(201).json({ order: orderWithItems(db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId)) });
  });

  // Only the owning branch (or admin) may advance/cancel status — a branch
  // session may only touch its own orders.
  app.patch('/api/orders/:id/status', requireRole('admin', 'branch'), (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Order not found' });
    const user = req.session.user;
    if (user.role === 'branch' && row.branch_id !== user.branchId) return res.status(403).json({ error: 'Not allowed for this branch' });

    const { status } = req.body || {};
    if (status === 'cancelled') {
      if (row.status === 'completed' || row.status === 'cancelled') {
        return res.status(409).json({ error: `Order is already ${row.status}` });
      }
      db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").run(id);
    } else {
      const expectedNext = STATUS_FLOW[row.status];
      if (!expectedNext || status !== expectedNext) {
        return res.status(409).json({ error: `Order is ${row.status}; expected next status is ${expectedNext || 'none'}` });
      }
      db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, id);
    }
    res.json({ order: orderWithItems(db.prepare('SELECT * FROM orders WHERE id = ?').get(id)) });
  });

  app.patch('/api/orders/:id/rung-in', requireRole('admin', 'branch'), (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Order not found' });
    const user = req.session.user;
    if (user.role === 'branch' && row.branch_id !== user.branchId) return res.status(403).json({ error: 'Not allowed for this branch' });
    const rungIn = req.body && typeof req.body.rungIn === 'boolean' ? req.body.rungIn : !row.rung_in;
    db.prepare('UPDATE orders SET rung_in = ? WHERE id = ?').run(rungIn ? 1 : 0, id);
    res.json({ order: orderWithItems(db.prepare('SELECT * FROM orders WHERE id = ?').get(id)) });
  });
}

module.exports = { register };
