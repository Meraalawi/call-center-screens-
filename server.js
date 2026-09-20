// Vanilla Console — call center desk, branch kanban screen, and admin
// dashboard for Vanilla Cake & Coffee, as three separate pages sharing one
// Node backend + SQLite database.
const path = require('path');
const fs = require('fs');
const { createApp, serveStatic } = require('./src/lib/miniweb');
const { makeSessionMiddleware } = require('./src/lib/session');
const db = require('./src/db');
const authRoutes = require('./src/routes/auth');
const branchRoutes = require('./src/routes/branches');
const menuRoutes = require('./src/routes/menu');
const orderRoutes = require('./src/routes/orders');
const userRoutes = require('./src/routes/users');

const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'vanilla-console-dev-secret-change-me';

// first run: seed the DB automatically if it has no branches yet, so
// `npm install && npm start` alone is enough to get a working app.
const branchCount = db.prepare('SELECT count(*) c FROM branches').get().c;
if (branchCount === 0) {
  console.log('No data found — seeding database...');
  require('./src/db/seed').seed();
}

const app = createApp();

app.use(makeSessionMiddleware(SESSION_SECRET));

authRoutes.register(app);
branchRoutes.register(app);
menuRoutes.register(app);
orderRoutes.register(app);
userRoutes.register(app);

app.use(serveStatic(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  const branches = db.prepare('SELECT count(*) c FROM branches').get().c;
  const menuItems = db.prepare('SELECT count(*) c FROM menu_items').get().c;
  const orders = db.prepare('SELECT count(*) c FROM orders').get().c;
  console.log('');
  console.log('  Vanilla Console is running');
  console.log(`  http://localhost:${PORT}`);
  console.log('');
  console.log(`  ${branches} branches, ${menuItems} menu items, ${orders} orders in the database`);
  console.log('');
  console.log('  Call Center Desk : http://localhost:' + PORT + '/call-center.html');
  console.log('  Branch Screen    : http://localhost:' + PORT + '/branch.html');
  console.log('  Dashboard        : http://localhost:' + PORT + '/dashboard.html');
  console.log('');
  console.log('  Demo credentials are documented in README.md');
  console.log('');
});
