const db = require('../db');
const { requireRole } = require('../middleware/requireRole');

function publicItem(m) {
  return {
    id: m.id, branchId: m.branch_id, name: m.name, nameAr: m.name_ar,
    category: m.category, categoryAr: m.category_ar, priceCents: m.price_cents,
    available: !!m.available,
  };
}

function canSeeBranch(user, branchId) {
  if (user.role === 'admin' || user.role === 'agent') return true;
  if (user.role === 'branch') return user.branchId === branchId;
  return false;
}

function register(app) {
  app.get('/api/branches/:id/menu', requireRole('agent', 'admin', 'branch'), (req, res) => {
    const branchId = Number(req.params.id);
    if (!canSeeBranch(req.session.user, branchId)) return res.status(403).json({ error: 'Not allowed for this branch' });
    const rows = db.prepare('SELECT * FROM menu_items WHERE branch_id = ? ORDER BY category, id').all(branchId);
    res.json({ items: rows.map(publicItem) });
  });

  app.post('/api/branches/:id/menu', requireRole('admin'), (req, res) => {
    const branchId = Number(req.params.id);
    const branch = db.prepare('SELECT id FROM branches WHERE id = ?').get(branchId);
    if (!branch) return res.status(404).json({ error: 'Branch not found' });
    const { name, nameAr, category, categoryAr, priceCents } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Item needs a name' });
    const price = Number(priceCents);
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'Item needs a valid price' });
    const info = db.prepare(`
      INSERT INTO menu_items (branch_id, name, name_ar, category, category_ar, price_cents, available)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(branchId, String(name).trim(), nameAr || '', category || 'Misc', categoryAr || '', Math.round(price));
    const row = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ item: publicItem(row) });
  });

  app.put('/api/menu/:itemId', requireRole('admin'), (req, res) => {
    const id = Number(req.params.itemId);
    const existing = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Item not found' });
    const { name, nameAr, category, categoryAr, priceCents, available } = req.body || {};
    db.prepare(`
      UPDATE menu_items SET name = ?, name_ar = ?, category = ?, category_ar = ?, price_cents = ?, available = ? WHERE id = ?
    `).run(
      name !== undefined ? String(name).trim() : existing.name,
      nameAr !== undefined ? nameAr : existing.name_ar,
      category !== undefined ? category : existing.category,
      categoryAr !== undefined ? categoryAr : existing.category_ar,
      priceCents !== undefined ? Math.round(Number(priceCents)) : existing.price_cents,
      available !== undefined ? (available ? 1 : 0) : existing.available,
      id
    );
    res.json({ item: publicItem(db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id)) });
  });

  app.delete('/api/menu/:itemId', requireRole('admin'), (req, res) => {
    const id = Number(req.params.itemId);
    const existing = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Item not found' });
    db.prepare('DELETE FROM menu_items WHERE id = ?').run(id);
    res.json({ ok: true });
  });
}

module.exports = { register };
