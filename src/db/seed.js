// Seeds the SQLite DB with the 6 branches + full per-branch menus ported
// faithfully from the original static prototype (call-center-screens-vanilla),
// plus demo login accounts for every role and a few starter orders so the
// app isn't empty on first run.
//
// Safe to re-run: it wipes and rebuilds all tables (this is a dev/demo seed
// script, not a migration tool).
const { hashPassword } = require('../lib/password');
const db = require('./index');

// Product photos scraped from the live site (vanilla.ps) for the items that
// are identical across every branch — Drinks & Desserts. Keyed by the English
// name used below; items with no confident match on the live site (Vanilla
// Milkshake, Fresh Orange Juice, Macaron) are simply left without one.
const MENU_IMAGES = {
  'Espresso': 'espresso', 'Cappuccino': 'cappuccino', 'Caffé Latte': 'caffe-latte',
  'Spanish Latte': 'spanish-latte', 'Caffé Mocha': 'caffe-mocha', 'Caffé Americano': 'caffe-americano',
  'Iced Latte': 'iced-latte', 'Ice Americano': 'ice-americano', 'Tea': 'tea',
  'Hot Chocolate': 'hot-chocolate', 'Iced Tea Peach': 'iced-tea-peach',
  'Baked Cheesecake': 'baked-cheesecake', 'Red Velvet': 'red-velvet', 'Tiramisu Cake Box': 'tiramisu-cake-box',
  'Carrot Cake': 'carrot-cake', 'Chocolate Fudge': 'chocolate-fudge', 'Lotus Baked Cheesecake': 'lotus-baked-cheesecake',
  'San Sebastian Cheesecake': 'san-sebastian-cheesecake', 'Crème Brûlée': 'creme-brulee',
  'Nutella Croissant': 'nutella-croissant', 'Chocolate Chip Cookie': 'chocolate-chip-cookie',
  'Om Ali': 'om-ali', 'Dream Kunafa': 'dream-kunafa', 'Apple Pie': 'apple-pie', 'Honey Cake': 'honey-cake',
};

function mk(groups) {
  const out = [];
  groups.forEach(([catEn, catAr, items]) => {
    items.forEach(([nameEn, nameAr, price]) => {
      const slug = MENU_IMAGES[nameEn];
      out.push({
        name: nameEn, nameAr, category: catEn, categoryAr: catAr, priceCents: price * 100,
        imageUrl: slug ? `/images/menu/${slug}.jpg` : null,
      });
    });
  });
  return out;
}

const DRINKS = ['Drinks', 'مشروبات', [
  ['Espresso', 'إسبريسو', 8], ['Cappuccino', 'كابتشينو', 12], ['Caffé Latte', 'كافيه لاتيه', 12],
  ['Spanish Latte', 'لاتيه إسباني', 15], ['Caffé Mocha', 'كافيه موكا', 15], ['Caffé Americano', 'كافيه أمريكانو', 10],
  ['Iced Latte', 'لاتيه مثلج', 15], ['Ice Americano', 'أمريكانو مثلج', 15], ['Tea', 'شاي', 10],
  ['Hot Chocolate', 'شوكولاتة ساخنة', 15], ['Vanilla Milkshake', 'ميلك شيك فانيلا', 25],
  ['Fresh Orange Juice', 'عصير برتقال طازج', 20], ['Iced Tea Peach', 'آيس تي خوخ', 17],
]];
const DESSERTS = ['Desserts', 'حلويات', [
  ['Baked Cheesecake', 'تشيز كيك مخبوز', 25], ['Red Velvet', 'ريد فيلفيت', 30], ['Tiramisu Cake Box', 'علبة كيك تيراميسو', 25],
  ['Carrot Cake', 'كيك الجزر', 20], ['Chocolate Fudge', 'فادج شوكولاتة', 25], ['Lotus Baked Cheesecake', 'تشيز كيك لوتس مخبوز', 25],
  ['San Sebastian Cheesecake', 'تشيز كيك سان سيباستيان', 30], ['Crème Brûlée', 'كريم بروليه', 25],
  ['Nutella Croissant', 'كرواسون نوتيلا', 12], ['Chocolate Chip Cookie', 'كوكيز شوكولاتة تشيب', 5],
  ['Om Ali', 'أم علي', 20], ['Dream Kunafa', 'كنافة دريم', 20], ['Apple Pie', 'فطيرة التفاح', 25],
  ['Honey Cake', 'كيك العسل', 25], ['Macaron', 'ماكرون', 6],
]];

const MENU_ALTIREH = mk([
  ['Breakfast', 'فطور', [['Vanilla Breakfast', 'فطور فانيلا', 58], ['Palestinian Breakfast', 'فطور فلسطيني', 39], ['French Toast', 'فرنش توست', 38], ['Salmon Bagel', 'بيغل سلمون', 39], ['Pancake', 'بان كيك', 36], ['Bagel Omelette', 'بيغل أومليت', 30]]],
  ['Starters', 'مقبلات', [["Vanilla's Special Platter", 'طبق فانيلا الخاص', 79], ['Dynamite Chicken', 'دجاج دايناميت', 45], ['Hummos with Fillet Meat', 'حمص بفيليه اللحم', 43], ['Nachos', 'ناتشوز', 56], ['Curly Texas Fries', 'بطاطا تكساس الملتوية', 44], ['French Fries', 'بطاطا مقلية', 15]]],
  ['Salads', 'سلطات', [['Vanilla Salad', 'سلطة فانيلا', 43], ['Caesar Salad', 'سلطة سيزر', 44], ['Greek Salad', 'سلطة يونانية', 42], ['Fattoush', 'فتوش', 42], ['Quinoa Salad', 'سلطة الكينوا', 42]]],
  ['Burger', 'برغر', [['Double Burger', 'برغر دبل', 60], ['Buffalo (Spicy) Chicken Burger', 'برغر دجاج بافلو حار', 48], ['Cheese Burger', 'تشيز برغر', 49], ['Chicken Burger', 'برغر دجاج', 46]]],
  ['Pasta', 'باستا', [['Fettuccine Alfredo', 'فيتوتشيني ألفريدو', 53], ['Penne Rosa', 'بيني روزا', 50], ['Broccoli Penne Pesto', 'بيني بروكلي بيستو', 55]]],
  ['Pizza', 'بيتزا', [['BBQ Chicken Pizza', 'بيتزا دجاج باربكيو', 55], ['Margherita Pizza', 'بيتزا مارغريتا', 39], ['Pepperoni Pizza', 'بيتزا ببروني', 48]]],
  ['International', 'أطباق عالمية', [['Butter Chicken', 'دجاج بالزبدة', 65], ['Mongolian Beef', 'لحم منغولي', 70], ['Shish Tawook', 'شيش طاووق', 45], ['Fillet Sandwich', 'ساندويش فيليه', 55]]],
  ['Meats', 'لحوم', [['Antrikot Black Angus', 'أنتريكوت بلاك أنغوس', 130], ['Fillet', 'فيليه', 94], ['Grilled Chicken', 'دجاج مشوي', 69], ['Salmon Fillet', 'فيليه سلمون', 89]]],
  ['Hookah', 'أرجيلة', [['Shisha', 'أرجيلة', 45]]],
  DRINKS, DESSERTS,
]);
const MENU_ALMASYOON = mk([
  ['Breakfast', 'فطور', [['Vanilla Breakfast', 'فطور فانيلا', 35], ['French Toast', 'فرنش توست', 35], ['Vanilla Omelette', 'أومليت فانيلا', 32], ['Pancake', 'بان كيك', 35], ['Sausage & Eggs with Gouda Cheese Mankosheh', 'منقوشة نقانق وبيض بجبنة الغودا', 35]]],
  ['Bagel Sandwich', 'ساندويش بيغل', [['Bagel Avocado', 'بيغل أفوكادو', 25], ['Club Bagel Sandwich', 'ساندويش بيغل كلوب', 30]]],
  ['Appetizer', 'مقبلات', [['Dynamite Chicken', 'دجاج دايناميت', 45], ['Nachos', 'ناتشوز', 40], ['Chicken Wings', 'أجنحة دجاج', 35], ['French Fries', 'بطاطا مقلية', 15]]],
  ['Healthy Meal', 'وجبة صحية', [['Chicken Healthy Meal', 'وجبة دجاج صحية', 45], ['Meat Healthy Meal', 'وجبة لحمة صحية', 60]]],
  ['Healthy Salads', 'سلطات صحية', [['Healthy Caesar Salad', 'سيزر صحي', 30], ['Grilled Halloumi Salad', 'سلطة حلوم مشوي', 30], ['Quinoa Beet Salad', 'سلطة كينوا وشمندر', 32]]],
  ['Salads', 'سلطات', [['Caesar Salad', 'سلطة سيزر', 30], ['Pesto Salad', 'سلطة بيستو', 35]]],
  ['Burger', 'برغر', [['Double Burger', 'برغر دبل', 50], ['Cheese Burger', 'تشيز برغر', 39], ['Jalapeño Chicken Burger', 'برغر دجاج بالهالبينو', 33]]],
  ['Pizza', 'بيتزا', [['Alfredo Pizza', 'بيتزا ألفريدو', 55], ['Margherita Pizza', 'بيتزا مارغريتا', 40], ['Pepperoni Pizza', 'بيتزا ببروني', 45]]],
  ['Pasta', 'باستا', [['Lasagna Puff Pastry', 'لازانيا بعجينة البف باستري', 60], ['Penna Alfredo', 'بيني ألفريدو', 40]]],
  ['Sandwiches', 'ساندويشات', [['Beef Cheese Steak', 'تشيز ستيك لحم', 38], ['Caesar Sandwich', 'ساندويش سيزر', 30], ['Tuna Sandwich', 'ساندويش تونا', 20]]],
  DRINKS, DESSERTS,
]);
const MENU_ALIRSAL = mk([
  ['Breakfast', 'فطور', [['Vanilla Breakfast', 'فطور فانيلا', 35], ['French Toast', 'فرنش توست', 35], ['Georgian Pastry (Khachapuri)', 'خاتشابوري جورجي', 25], ['Vanilla Omelette', 'أومليت فانيلا', 32]]],
  ['Bagel Sandwich', 'ساندويش بيغل', [['Bagel Avocado', 'بيغل أفوكادو', 25], ['Club Bagel Sandwich', 'ساندويش بيغل كلوب', 30]]],
  ['Salads', 'سلطات', [['Vanilla Salad', 'سلطة فانيلا', 35], ['Caesar Salad', 'سلطة سيزر', 30], ['Santa Fe Salad', 'سلطة سانتا في', 35]]],
  ['Healthy Meal', 'وجبة صحية', [['Chicken Healthy Meal', 'وجبة دجاج صحية', 45], ['Meat Healthy Meal', 'وجبة لحمة صحية', 60]]],
  ['Noodles', 'نودلز', [['Chicken Noodles', 'نودلز دجاج', 35], ['Veggie Noodles', 'نودلز خضار', 30]]],
  ['Appetizer', 'مقبلات', [['Dynamite Chicken', 'دجاج دايناميت', 45], ['Dynamite Shrimp', 'جمبري دايناميت', 45], ['French Fries', 'بطاطا مقلية', 15]]],
  ['Sandwiches', 'ساندويشات', [['Shawarma Roll', 'لفة شاورما', 30], ['Halloumi Wrap', 'راب حلوم', 25], ['Chicken Burrito', 'بوريتو دجاج', 32]]],
  ['Burger', 'برغر', [['Double Burger', 'برغر دبل', 50], ['Cheese Burger', 'تشيز برغر', 39]]],
  ['Pasta', 'باستا', [['Fettuccine Alfredo', 'فيتوتشيني ألفريدو', 35], ['Penne Rosa', 'بيني روزا', 40]]],
  ['Pizza', 'بيتزا', [['Margherita Pizza', 'بيتزا مارغريتا', 35], ['Roast Beef Pizza', 'بيتزا روست بيف', 40]]],
  DRINKS, DESSERTS,
]);
const MENU_NABLUS = mk([
  ['Breakfast', 'فطور', [['Vanilla Breakfast', 'فطور فانيلا', 35], ['French Toast', 'فرنش توست', 35], ['Club Bagel', 'بيغل كلوب', 35], ['Burrito Breakfast', 'بوريتو فطور', 32]]],
  ['Mankosha', 'منقوشة', [['Focaccia Pesto Chicken', 'فوكاتشيا دجاج بيستو', 35], ["Za'atar Mankosheh", 'منقوشة زعتر', 18]]],
  ['Starters', 'مقبلات', [['Dynamite Chicken', 'دجاج دايناميت', 45], ['Nachos', 'ناتشوز', 40], ['Gravy Fries', 'بطاطا بصوص الغريفي', 30], ['French Fries', 'بطاطا مقلية', 15]]],
  ['Healthy Meal', 'وجبة صحية', [['Chicken Healthy Meal', 'وجبة دجاج صحية', 50]]],
  ['Salads', 'سلطات', [['Vanilla Salad', 'سلطة فانيلا', 35], ['Caesar Salad (Grilled Chicken)', 'سيزر بدجاج مشوي', 35], ['Crab Salad', 'سلطة سلطعون', 35], ['Greek Salad', 'سلطة يونانية', 30]]],
  ['Pasta', 'باستا', [['Penne Rosa', 'بيني روزا', 40], ['Fettuccine Alfredo', 'فيتوتشيني ألفريدو', 35]]],
  ['Pizza', 'بيتزا', [['Alfredo Pizza', 'بيتزا ألفريدو', 45], ['Margherita Pizza', 'بيتزا مارغريتا', 30], ['Buffalo Pizza', 'بيتزا بافلو', 40]]],
  ['International', 'أطباق عالمية', [['Butter Chicken', 'دجاج بالزبدة', 45], ['Mongolian Beef', 'لحم منغولي', 55], ['Chicken Tikka Masala', 'دجاج تيكا مسالا', 45]]],
  ['Sandwiches', 'ساندويشات', [['Shawarma Roll', 'لفة شاورما', 30], ['Caesar Sandwich', 'ساندويش سيزر', 37], ['Fillet Cheese Steak', 'تشيز ستيك فيليه', 40]]],
  ['Burger', 'برغر', [['Double Burger', 'برغر دبل', 50], ['Cheese Burger', 'تشيز برغر', 38]]],
  ['Meats', 'لحوم', [['Fillet Steak', 'ستيك فيليه', 90], ['Zurich Beef', 'لحم زيوريخ', 60], ['Chicken Parmesan', 'دجاج بارميزان', 50]]],
  ['Hookah', 'أرجيلة', [['Shisha', 'أرجيلة', 40]]],
  DRINKS, DESSERTS,
]);
const MENU_ALMANARA = mk([
  ['Breakfast', 'فطور', [['Cinnabon French Toast', 'فرنش توست سينابون', 35], ['Club Bagel Sandwich', 'ساندويش بيغل كلوب', 35], ['Bagel Avocado', 'بيغل أفوكادو', 30]]],
  ['Appetizers', 'مقبلات', [['Dynamite Chicken', 'دجاج دايناميت', 45], ['Dynamite Shrimp', 'جمبري دايناميت', 45], ['Onion Rings', 'حلقات بصل', 20], ['French Fries', 'بطاطا مقلية', 15]]],
  ['Sandwiches', 'ساندويشات', [['Fillet Cheese Steak', 'تشيز ستيك فيليه', 42], ['Chicken Pesto', 'دجاج بيستو', 33], ['Healthy Chicken Avocado Sandwich', 'ساندويش دجاج وأفوكادو صحي', 33]]],
  ['Salads', 'سلطات', [['Vanilla Salad', 'سلطة فانيلا', 35], ['Caesar Salad', 'سلطة سيزر', 30], ['Greek Salad', 'سلطة يونانية', 30]]],
  ['Burgers', 'برغر', [['Double Burger', 'برغر دبل', 50], ['Shrimp Burger', 'برغر جمبري', 45], ['Cheese Burger', 'تشيز برغر', 39]]],
  ['Pasta', 'باستا', [['Fettuccine Alfredo', 'فيتوتشيني ألفريدو', 35], ['Chicken Noodles', 'نودلز دجاج', 45]]],
  ['Pizza', 'بيتزا', [['BBQ Chicken Pizza', 'بيتزا دجاج باربكيو', 40], ['Margherita Pizza', 'بيتزا مارغريتا', 35]]],
  ['Healthy Meals', 'وجبات صحية', [['Meat Healthy Meal', 'وجبة لحمة صحية', 60], ['Chicken Healthy Meal', 'وجبة دجاج صحية', 45]]],
  ['Hookah', 'أرجيلة', [['Shisha', 'أرجيلة', 40]]],
  DRINKS, DESSERTS,
]);
// Icon Mall's page only exposed Breakfast on fetch (menu loads dynamically on the live site) —
// everything else there is a placeholder until the real list is uploaded (ported verbatim from prototype).
const MENU_ICONMALL = mk([
  ['Breakfast', 'فطور', [['French Toast', 'فرنش توست', 35], ['Tiramisu French Toast', 'فرنش توست تيراميسو', 35], ['Apple Custard French Toast', 'فرنش توست تفاح وكاسترد', 35]]],
  DRINKS, DESSERTS,
]);

const BRANCHES = [
  { code: 'TR', name: 'Al-Tireh', nameAr: 'الطيرة', city: 'Al-Tireh, Ramallah', cityAr: 'الطيرة، رام الله', menu: MENU_ALTIREH, startCounter: 143 },
  { code: 'MY', name: 'Al-Masyoon', nameAr: 'الماصيون', city: 'Al-Masyoon, Ramallah', cityAr: 'الماصيون، رام الله', menu: MENU_ALMASYOON, startCounter: 87 },
  { code: 'IR', name: 'Al-Irsal', nameAr: 'الإرسال', city: 'Al-Irsal St, Ramallah', cityAr: 'شارع الإرسال، رام الله', menu: MENU_ALIRSAL, startCounter: 35 },
  { code: 'NB', name: 'Nablus', nameAr: 'نابلس', city: 'Nablus', cityAr: 'نابلس', menu: MENU_NABLUS, startCounter: 21 },
  { code: 'IC', name: 'Icon Mall', nameAr: 'آيكون مول', city: 'Icon Mall, Ramallah', cityAr: 'آيكون مول، رام الله', menu: MENU_ICONMALL, startCounter: 59 },
  { code: 'MN', name: 'Al-Manara', nameAr: 'المنارة', city: 'Al-Manara Square, Ramallah', cityAr: 'ميدان المنارة، رام الله', menu: MENU_ALMANARA, startCounter: 14 },
];

// Demo login credentials — internal ops tool, documented plainly (see README).
const DEMO_PASSWORD = 'vanilla123';
const AGENTS = [
  { username: 'agent1', displayName: 'Lina Odeh' },
  { username: 'agent2', displayName: 'Yousef Amro' },
  { username: 'agent3', displayName: 'Dana Khalil' },
];
const ADMIN = { username: 'admin', displayName: 'Ops Admin' };

function seed() {
  const hash = (pw) => hashPassword(pw);

  const tx = db.transaction(() => {
    // wipe existing data (dev/demo seed — not a migration)
    db.exec(`
      DELETE FROM order_items;
      DELETE FROM orders;
      DELETE FROM branch_counters;
      DELETE FROM menu_items;
      DELETE FROM users;
      DELETE FROM branches;
      DELETE FROM sqlite_sequence WHERE name IN ('order_items','orders','menu_items','users','branches');
    `);

    const insertBranch = db.prepare(`
      INSERT INTO branches (code, name, name_ar, city, city_ar, active) VALUES (?, ?, ?, ?, ?, 1)
    `);
    const insertMenuItem = db.prepare(`
      INSERT INTO menu_items (branch_id, name, name_ar, category, category_ar, price_cents, available, image_url)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `);
    const insertCounter = db.prepare(`INSERT INTO branch_counters (branch_id, next_number) VALUES (?, ?)`);
    const insertUser = db.prepare(`
      INSERT INTO users (username, password_hash, role, display_name, branch_id) VALUES (?, ?, ?, ?, ?)
    `);

    const branchIds = {};
    for (const b of BRANCHES) {
      const info = insertBranch.run(b.code, b.name, b.nameAr, b.city, b.cityAr);
      const branchId = info.lastInsertRowid;
      branchIds[b.code] = branchId;
      for (const item of b.menu) {
        insertMenuItem.run(branchId, item.name, item.nameAr, item.category, item.categoryAr, item.priceCents, item.imageUrl || null);
      }
      insertCounter.run(branchId, b.startCounter);

      // one shared branch-level credential per branch: username = lowercase code
      insertUser.run(b.code.toLowerCase(), hash(DEMO_PASSWORD), 'branch', `${b.name} branch`, branchId);
    }

    for (const a of AGENTS) {
      insertUser.run(a.username, hash(DEMO_PASSWORD), 'agent', a.displayName, null);
    }
    insertUser.run(ADMIN.username, hash(DEMO_PASSWORD), 'admin', ADMIN.displayName, null);

    // a few seed orders, ported from the prototype, so the board/dashboard aren't empty
    const agent1 = db.prepare(`SELECT id FROM users WHERE username = 'agent1'`).get().id;
    const mins = (m) => new Date(Date.now() - m * 60000).toISOString();

    const insertOrder = db.prepare(`
      INSERT INTO orders (code, branch_id, agent_id, customer_name, customer_phone, order_type, address, notes, status, rung_in, total_cents, created_at)
      VALUES (@code, @branchId, @agentId, @customerName, @customerPhone, @orderType, @address, @notes, @status, @rungIn, @totalCents, @createdAt)
    `);
    const insertOrderItem = db.prepare(`
      INSERT INTO order_items (order_id, name, name_ar, qty, price_cents) VALUES (?, ?, ?, ?, ?)
    `);

    const seedOrders = [
      {
        code: 'TR-0140', branchId: branchIds.TR, agentId: agent1, customerName: 'A. Novak', customerPhone: '',
        orderType: 'pickup', address: '', notes: '', status: 'ready', rungIn: 1, createdAt: mins(11),
        items: [{ name: 'Caesar Salad', nameAr: 'سلطة سيزر', qty: 1, price: 4400 }, { name: 'Fresh Orange Juice', nameAr: 'عصير برتقال طازج', qty: 1, price: 2000 }],
      },
      {
        code: 'TR-0141', branchId: branchIds.TR, agentId: agent1, customerName: 'R. Haddad', customerPhone: '',
        orderType: 'delivery', address: 'Al-Tireh, Bldg 12, near the pharmacy', notes: 'No onions, please', status: 'preparing', rungIn: 1, createdAt: mins(6),
        items: [{ name: 'Double Burger', nameAr: 'برغر دبل', qty: 2, price: 6000 }, { name: 'Cappuccino', nameAr: 'كابتشينو', qty: 2, price: 1200 }],
      },
      {
        code: 'TR-0142', branchId: branchIds.TR, agentId: agent1, customerName: 'J. Kim', customerPhone: '',
        orderType: 'pickup', address: '', notes: '', status: 'new', rungIn: 0, createdAt: mins(1),
        items: [{ name: 'Om Ali', nameAr: 'أم علي', qty: 1, price: 2000 }, { name: 'Ice Americano', nameAr: 'أمريكانو مثلج', qty: 1, price: 1500 }],
      },
      {
        code: 'MY-0086', branchId: branchIds.MY, agentId: agent1, customerName: 'S. Lund', customerPhone: '',
        orderType: 'pickup', address: '', notes: 'Extra dressing on the side', status: 'preparing', rungIn: 0, createdAt: mins(4),
        items: [{ name: 'Pesto Salad', nameAr: 'سلطة بيستو', qty: 1, price: 3500 }, { name: 'Spanish Latte', nameAr: 'لاتيه إسباني', qty: 2, price: 1500 }],
      },
    ];

    for (const o of seedOrders) {
      const total = o.items.reduce((s, it) => s + it.price * it.qty, 0);
      const info = insertOrder.run({
        code: o.code, branchId: o.branchId, agentId: o.agentId, customerName: o.customerName, customerPhone: o.customerPhone,
        orderType: o.orderType, address: o.address, notes: o.notes, status: o.status, rungIn: o.rungIn,
        totalCents: total, createdAt: o.createdAt,
      });
      for (const it of o.items) insertOrderItem.run(info.lastInsertRowid, it.name, it.nameAr, it.qty, it.price);
    }
  });

  tx();

  console.log('Database seeded.');
  console.log(`  Branches: ${BRANCHES.map((b) => b.code).join(', ')}`);
  console.log(`  Demo password for every seeded account: "${DEMO_PASSWORD}"`);
}

if (require.main === module) {
  seed();
  process.exit(0);
}

module.exports = { seed, DEMO_PASSWORD, AGENTS, ADMIN, BRANCHES };
