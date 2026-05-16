require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser");
const { query, initDb } = require("./db/init");
const { createUploadUrl, createDownloadUrl } = require("./s3");

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

const JWT_SECRET = process.env.JWT_SECRET || "change-this-in-production";
const ADMIN_COOKIE = "hush_admin_session";
const USER_COOKIE = "hush_user_session";
const adminStreams = new Set();
const clientStreamsByOrder = new Map();

function setSessionCookie(res, name, token) {
  res.cookie(name, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });
}

function emitAdminEvent(payload) {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of adminStreams) res.write(data);
}

function emitClientEvent(orderId, payload) {
  const streamSet = clientStreamsByOrder.get(orderId);
  if (!streamSet) return;
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of streamSet) res.write(data);
}

function authFromCookie(req, name) {
  try {
    const token = req.cookies[name];
    if (!token) return null;
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function requireAdmin(req, res, next) {
  const admin = authFromCookie(req, ADMIN_COOKIE);
  if (!admin) return res.status(401).json({ error: "Unauthorized" });
  req.admin = admin;
  next();
}

function requireUser(req, res, next) {
  const user = authFromCookie(req, USER_COOKIE);
  if (!user) return res.status(401).json({ error: "Please sign in." });
  req.user = user;
  next();
}

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/api/users/signup", async (req, res) => {
  const { email, password, full_name } = req.body;
  if (!email || !password || !full_name) {
    return res.status(400).json({ error: "full_name, email and password are required." });
  }
  if (String(password).length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
  const passwordHash = bcrypt.hashSync(password, 12);
  try {
    const result = await query(
      `INSERT INTO users(email, password_hash, full_name)
       VALUES ($1, $2, $3) RETURNING id, email, full_name`,
      [String(email).trim().toLowerCase(), passwordHash, String(full_name).trim()]
    );
    const user = result.rows[0];
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: "7d" });
    setSessionCookie(res, USER_COOKIE, token);
    res.status(201).json({ user });
  } catch (error) {
    if (String(error.message).toLowerCase().includes("unique")) {
      return res.status(409).json({ error: "Email already exists." });
    }
    return res.status(500).json({ error: "Unable to create account." });
  }
});

app.post("/api/users/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "email and password are required." });
  const found = await query("SELECT id, email, full_name, password_hash FROM users WHERE email = $1", [
    String(email).trim().toLowerCase()
  ]);
  const user = found.rows[0];
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid credentials." });
  }
  const token = jwt.sign({ id: user.id, email: user.email, full_name: user.full_name }, JWT_SECRET, { expiresIn: "7d" });
  setSessionCookie(res, USER_COOKIE, token);
  res.json({ user: { id: user.id, email: user.email, full_name: user.full_name } });
});

app.post("/api/users/logout", (_req, res) => {
  res.clearCookie(USER_COOKIE);
  res.json({ ok: true });
});

app.get("/api/users/me", (req, res) => {
  const user = authFromCookie(req, USER_COOKIE);
  if (!user) return res.status(401).json({ error: "No active session." });
  res.json({ user });
});

app.get("/api/admin/bootstrap-status", async (_req, res) => {
  const result = await query("SELECT COUNT(*)::int AS c FROM admins");
  res.json({ needsBootstrap: result.rows[0].c === 0 });
});

app.post("/api/admin/bootstrap", async (req, res) => {
  const result = await query("SELECT COUNT(*)::int AS c FROM admins");
  if (result.rows[0].c > 0) return res.status(400).json({ error: "Bootstrap already completed." });
  const { email, password, full_name } = req.body;
  if (!email || !password || !full_name) {
    return res.status(400).json({ error: "email, password, full_name are required" });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }
  const passwordHash = bcrypt.hashSync(password, 12);
  const insert = await query(
    "INSERT INTO admins(email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id, email, full_name",
    [String(email).trim().toLowerCase(), passwordHash, String(full_name).trim()]
  );
  const admin = insert.rows[0];
  const token = jwt.sign(admin, JWT_SECRET, { expiresIn: "7d" });
  setSessionCookie(res, ADMIN_COOKIE, token);
  res.status(201).json({ admin });
});

app.post("/api/admin/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "email and password required" });
  const q = await query(
    "SELECT id, email, full_name, password_hash FROM admins WHERE email = $1",
    [String(email).trim().toLowerCase()]
  );
  const admin = q.rows[0];
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const token = jwt.sign(
    { id: admin.id, email: admin.email, full_name: admin.full_name },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
  setSessionCookie(res, ADMIN_COOKIE, token);
  res.json({ admin: { id: admin.id, email: admin.email, full_name: admin.full_name } });
});

app.post("/api/admin/logout", (_req, res) => {
  res.clearCookie(ADMIN_COOKIE);
  res.json({ ok: true });
});

app.get("/api/admin/me", requireAdmin, (req, res) => {
  res.json({ admin: req.admin });
});

app.post("/api/admin/reset-password", requireAdmin, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "currentPassword and newPassword are required" });
  }
  if (String(newPassword).length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters." });
  }
  const result = await query("SELECT password_hash FROM admins WHERE id = $1", [req.admin.id]);
  const row = result.rows[0];
  if (!row || !bcrypt.compareSync(currentPassword, row.password_hash)) {
    return res.status(400).json({ error: "Current password is incorrect." });
  }
  const nextHash = bcrypt.hashSync(newPassword, 12);
  await query("UPDATE admins SET password_hash = $1 WHERE id = $2", [nextHash, req.admin.id]);
  res.json({ ok: true });
});

app.get("/api/admin/users", requireAdmin, async (_req, res) => {
  const rows = await query(
    `SELECT a.id, a.email, a.full_name, a.created_at, creator.full_name AS created_by_name
     FROM admins a
     LEFT JOIN admins creator ON creator.id = a.created_by
     ORDER BY a.id ASC`
  );
  res.json(rows.rows);
});

app.post("/api/admin/users", requireAdmin, async (req, res) => {
  const { email, password, full_name } = req.body;
  if (!email || !password || !full_name) {
    return res.status(400).json({ error: "email, password, full_name are required" });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }
  const passwordHash = bcrypt.hashSync(password, 12);
  try {
    const result = await query(
      `INSERT INTO admins(email, password_hash, full_name, created_by)
       VALUES ($1, $2, $3, $4) RETURNING id, email, full_name`,
      [String(email).trim().toLowerCase(), passwordHash, String(full_name).trim(), req.admin.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (String(error.message).toLowerCase().includes("unique")) {
      return res.status(409).json({ error: "Email is already in use." });
    }
    res.status(500).json({ error: "Unable to create admin." });
  }
});

app.get("/api/products", async (req, res) => {
  const category = req.query.category;
  if (category && !["male", "female"].includes(category)) {
    return res.status(400).json({ error: "Invalid category" });
  }
  const result = category
    ? await query("SELECT * FROM products WHERE category = $1 ORDER BY id DESC", [category])
    : await query("SELECT * FROM products ORDER BY id DESC");
  const products = await Promise.all(
    result.rows.map(async (r) => ({
      ...r,
      image_url:
        r.image_url && r.image_url.startsWith("s3://")
          ? await createDownloadUrl(r.image_url.replace("s3://", ""))
          : r.image_url,
      size_options: r.size_options.split(",")
    }))
  );
  res.json(products);
});

app.post("/api/admin/products", requireAdmin, async (req, res) => {
  const { name, category, price, color, size_options, image_url, description } = req.body;
  if (!name || !category || !price || !color || !size_options || !image_url) {
    return res.status(400).json({ error: "Missing required product fields." });
  }
  if (!["male", "female"].includes(category)) {
    return res.status(400).json({ error: "Invalid category." });
  }
  const sizes = Array.isArray(size_options) ? size_options.join(",") : String(size_options);
  const inserted = await query(
    `INSERT INTO products(name, category, price, color, size_options, image_url, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      String(name).trim(),
      category,
      Number(price),
      String(color).trim(),
      sizes,
      String(image_url).trim(),
      String(description || "").trim()
    ]
  );
  const p = inserted.rows[0];
  res.status(201).json({ ...p, size_options: p.size_options.split(",") });
});

app.patch("/api/admin/products/:productId", requireAdmin, async (req, res) => {
  const productId = Number(req.params.productId);
  const { name, category, price, color, size_options, image_url, description } = req.body;
  if (!name || !category || !price || !color || !size_options || !image_url) {
    return res.status(400).json({ error: "Missing required product fields." });
  }
  if (!["male", "female"].includes(category)) {
    return res.status(400).json({ error: "Invalid category." });
  }
  const sizes = Array.isArray(size_options) ? size_options.join(",") : String(size_options);
  const updated = await query(
    `UPDATE products
     SET name = $1, category = $2, price = $3, color = $4, size_options = $5, image_url = $6, description = $7
     WHERE id = $8 RETURNING *`,
    [
      String(name).trim(),
      category,
      Number(price),
      String(color).trim(),
      sizes,
      String(image_url).trim(),
      String(description || "").trim(),
      productId
    ]
  );
  if (!updated.rowCount) return res.status(404).json({ error: "Product not found." });
  const p = updated.rows[0];
  res.json({ ...p, size_options: p.size_options.split(",") });
});

app.delete("/api/admin/products/:productId", requireAdmin, async (req, res) => {
  const productId = Number(req.params.productId);
  const inUse = await query("SELECT COUNT(*)::int AS c FROM orders WHERE product_id = $1", [productId]);
  if (inUse.rows[0].c > 0) {
    return res.status(400).json({ error: "Cannot delete product already used in orders." });
  }
  const deleted = await query("DELETE FROM products WHERE id = $1", [productId]);
  if (!deleted.rowCount) return res.status(404).json({ error: "Product not found." });
  res.json({ ok: true });
});

app.get("/api/orders", requireAdmin, async (_req, res) => {
  const rows = await query(
    `SELECT o.*, p.name as product_name, p.image_url as product_image, p.price as product_price
     FROM orders o
     JOIN products p ON p.id = o.product_id
     ORDER BY o.id DESC`
  );
  const orders = await Promise.all(
    rows.rows.map(async (o) => ({
      ...o,
      product_image:
        o.product_image && o.product_image.startsWith("s3://")
          ? await createDownloadUrl(o.product_image.replace("s3://", ""))
          : o.product_image,
      product_image_snapshot:
        o.product_image_snapshot && o.product_image_snapshot.startsWith("s3://")
          ? await createDownloadUrl(o.product_image_snapshot.replace("s3://", ""))
          : o.product_image_snapshot
    }))
  );
  res.json(orders);
});

app.post("/api/orders", requireUser, async (req, res) => {
  const {
    product_id,
    phone,
    address,
    selected_size,
    selected_color,
    quantity,
    note,
    initial_message,
    attachment_url,
    attachment_name
  } = req.body;
  if (!product_id || !phone || !address || !selected_size || !selected_color) {
    return res.status(400).json({ error: "Missing required order fields." });
  }
  const productRes = await query("SELECT id, name, image_url, price FROM products WHERE id = $1", [product_id]);
  const product = productRes.rows[0];
  if (!product) return res.status(404).json({ error: "Product not found" });

  try {
    const inserted = await query(
      `INSERT INTO orders (
        product_id, user_id, client_name, email, phone, address, selected_size, selected_color, quantity, note,
        product_name_snapshot, product_image_snapshot, product_price_snapshot
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id`,
      [
        product_id,
        req.user.id,
        req.user.full_name,
        req.user.email,
        phone.trim(),
        address.trim(),
        selected_size.trim(),
        selected_color.trim(),
        Number(quantity) || 1,
        (note || "").trim(),
        product.name,
        product.image_url,
        product.price
      ]
    );
    const orderId = Number(inserted.rows[0].id);
    if ((initial_message || "").trim()) {
      await query(
        `INSERT INTO messages (order_id, sender_role, sender_name, body, attachment_url, attachment_name)
         VALUES($1, 'client', $2, $3, $4, $5)`,
        [
          orderId,
          req.user.full_name,
          initial_message.trim(),
          (attachment_url || "").trim() || null,
          (attachment_name || "").trim() || null
        ]
      );
    }
    emitAdminEvent({ type: "new-order", orderId, clientName: req.user.full_name });
    res.status(201).json({ id: orderId });
  } catch (_error) {
    res.status(500).json({ error: "Unable to place order." });
  }
});

app.patch("/api/orders/:orderId/status", requireAdmin, async (req, res) => {
  const orderId = Number(req.params.orderId);
  const status = req.body.status;
  if (!["new", "contacted", "fulfilled", "cancelled"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  const updated = await query("UPDATE orders SET status = $1 WHERE id = $2", [status, orderId]);
  if (!updated.rowCount) return res.status(404).json({ error: "Order not found" });
  res.json({ ok: true });
});

app.get("/api/orders/:orderId/messages", async (req, res) => {
  const orderId = Number(req.params.orderId);
  const admin = authFromCookie(req, ADMIN_COOKIE);
  const user = authFromCookie(req, USER_COOKIE);
  const order = await query("SELECT id, user_id FROM orders WHERE id = $1", [orderId]);
  if (!order.rows[0]) return res.status(404).json({ error: "Order not found" });
  if (!admin && (!user || Number(order.rows[0].user_id) !== Number(user.id))) {
    return res.status(403).json({ error: "Forbidden." });
  }

  const rows = await query("SELECT * FROM messages WHERE order_id = $1 ORDER BY id ASC", [orderId]);
  const messages = await Promise.all(
    rows.rows.map(async (m) => ({
      ...m,
      attachment_url:
        m.attachment_url && m.attachment_url.startsWith("s3://")
          ? await createDownloadUrl(m.attachment_url.replace("s3://", ""))
          : m.attachment_url
    }))
  );
  res.json(messages);
});

app.post("/api/orders/:orderId/messages", async (req, res) => {
  const orderId = Number(req.params.orderId);
  const admin = authFromCookie(req, ADMIN_COOKIE);
  const user = authFromCookie(req, USER_COOKIE);
  let { sender_role, sender_name, body, attachment_url, attachment_name } = req.body;
  if (!body) return res.status(400).json({ error: "Message body is required." });

  const order = await query("SELECT id, user_id FROM orders WHERE id = $1", [orderId]);
  if (!order.rows[0]) return res.status(404).json({ error: "Order not found" });

  if (sender_role === "admin") {
    if (!admin) return res.status(401).json({ error: "Unauthorized admin sender." });
    sender_name = admin.full_name;
  } else {
    sender_role = "client";
    if (!user || Number(order.rows[0].user_id) !== Number(user.id)) {
      return res.status(403).json({ error: "Forbidden." });
    }
    sender_name = user.full_name;
  }

  const inserted = await query(
    `INSERT INTO messages (order_id, sender_role, sender_name, body, attachment_url, attachment_name)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      orderId,
      sender_role,
      sender_name.trim(),
      body.trim(),
      (attachment_url || "").trim() || null,
      (attachment_name || "").trim() || null
    ]
  );
  if (sender_role === "client") {
    emitAdminEvent({ type: "new-client-message", orderId, senderName: sender_name });
  } else {
    emitClientEvent(orderId, { type: "new-admin-message", orderId, senderName: sender_name });
  }
  res.status(201).json({ id: Number(inserted.rows[0].id) });
});

app.get("/api/stream/admin", requireAdmin, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  adminStreams.add(res);
  res.write(`data: ${JSON.stringify({ type: "connected", ts: Date.now() })}\n\n`);
  req.on("close", () => adminStreams.delete(res));
});

app.get("/api/stream/client", requireUser, async (req, res) => {
  const orderId = Number(req.query.orderId);
  if (!orderId) return res.status(400).json({ error: "orderId is required" });
  const order = await query("SELECT id, user_id FROM orders WHERE id = $1", [orderId]);
  if (!order.rows[0] || Number(order.rows[0].user_id) !== Number(req.user.id)) {
    return res.status(403).json({ error: "Forbidden." });
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  const set = clientStreamsByOrder.get(orderId) || new Set();
  set.add(res);
  clientStreamsByOrder.set(orderId, set);
  res.write(`data: ${JSON.stringify({ type: "connected", orderId, ts: Date.now() })}\n\n`);
  req.on("close", () => {
    const bucket = clientStreamsByOrder.get(orderId);
    if (!bucket) return;
    bucket.delete(res);
    if (!bucket.size) clientStreamsByOrder.delete(orderId);
  });
});

app.post("/api/uploads/presign", async (req, res) => {
  try {
    const { fileName, contentType } = req.body;
    if (!fileName) return res.status(400).json({ error: "fileName is required" });
    const signed = await createUploadUrl({ fileName, contentType });
    if (!signed) {
      return res.status(400).json({
        error:
          "S3 is not configured. Set AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET_NAME."
      });
    }
    res.json({ ...signed, persistentUrl: `s3://${signed.key}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/admin-login", (_req, res) => res.sendFile(path.join(__dirname, "public", "admin-login.html")));
app.get("/admin", (req, res) => {
  const admin = authFromCookie(req, ADMIN_COOKIE);
  if (!admin) return res.redirect("/admin-login");
  return res.sendFile(path.join(__dirname, "public", "admin.html"));
});

async function start() {
  await initDb();
  app.listen(port, () => {
    console.log(`Hush app running on http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start app:", error);
  process.exit(1);
});
