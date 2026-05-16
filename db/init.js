const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required for PostgreSQL connection.");
}

const pool = new Pool({
  connectionString,
  ssl: process.env.PG_SSL === "true" ? { rejectUnauthorized: false } : false
});

async function query(text, params = []) {
  return pool.query(text, params);
}

async function initDb() {
  await query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('male', 'female')),
      price NUMERIC(12,2) NOT NULL,
      color TEXT NOT NULL,
      size_options TEXT NOT NULL,
      image_url TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id),
      client_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT NOT NULL,
      selected_size TEXT NOT NULL,
      selected_color TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      note TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'new',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      sender_role TEXT NOT NULL CHECK(sender_role IN ('client', 'admin')),
      sender_name TEXT NOT NULL,
      body TEXT NOT NULL,
      attachment_url TEXT,
      attachment_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      created_by INTEGER REFERENCES admins(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS product_name_snapshot TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS product_image_snapshot TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS product_price_snapshot NUMERIC(12,2);
  `);

  const countRes = await query("SELECT COUNT(*)::int AS count FROM products");
  if (countRes.rows[0].count > 0) return;

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

  for (const row of initial) {
    await query(
      `INSERT INTO products(name, category, price, color, size_options, image_url, description)
       VALUES($1, $2, $3, $4, $5, $6, $7)`,
      [row.name, row.category, row.price, row.color, row.size_options, row.image_url, row.description]
    );
  }
}

module.exports = { pool, query, initDb };
