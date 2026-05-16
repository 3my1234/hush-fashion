const Database = require("better-sqlite3");
const path = require("path");

const dbPath = path.join(__dirname, "hush.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('male', 'female')),
  price REAL NOT NULL,
  color TEXT NOT NULL,
  size_options TEXT NOT NULL,
  image_url TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  client_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  selected_size TEXT NOT NULL,
  selected_color TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  note TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  sender_role TEXT NOT NULL CHECK(sender_role IN ('client', 'admin')),
  sender_name TEXT NOT NULL,
  body TEXT NOT NULL,
  attachment_url TEXT,
  attachment_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (created_by) REFERENCES admins(id)
);
`);

const count = db.prepare("SELECT COUNT(*) AS count FROM products").get().count;
if (count === 0) {
  const seed = db.prepare(`
    INSERT INTO products(name, category, price, color, size_options, image_url, description)
    VALUES(@name, @category, @price, @color, @size_options, @image_url, @description)
  `);
  const initial = [
    {
      name: "Hush Urban Suit",
      category: "male",
      price: 95000,
      color: "Navy Blue",
      size_options: "S,M,L,XL",
      image_url:
        "https://images.unsplash.com/photo-1593030761757-71fae45fa0e7?auto=format&fit=crop&w=900&q=80",
      description: "Modern two-piece suit for premium occasions."
    },
    {
      name: "Hush Velvet Agbada",
      category: "male",
      price: 130000,
      color: "Emerald",
      size_options: "M,L,XL,XXL",
      image_url:
        "https://images.unsplash.com/photo-1610652492500-ded49ceeb378?auto=format&fit=crop&w=900&q=80",
      description: "Luxury agbada set with detailed embroidery."
    },
    {
      name: "Hush Silk Gown",
      category: "female",
      price: 120000,
      color: "Burgundy",
      size_options: "S,M,L",
      image_url:
        "https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=900&q=80",
      description: "Elegant evening gown with tailored silhouette."
    },
    {
      name: "Hush Ankara Set",
      category: "female",
      price: 78000,
      color: "Royal Print",
      size_options: "S,M,L,XL",
      image_url:
        "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=80",
      description: "Bold Ankara two-piece set for standout style."
    }
  ];
  const insertMany = db.transaction((rows) => {
    for (const row of rows) seed.run(row);
  });
  insertMany(initial);
}

module.exports = db;
