require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const db = require("./db/init");
const { createUploadUrl, createDownloadUrl } = require("./s3");

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/api/products", (req, res) => {
  const category = req.query.category;
  if (category && !["male", "female"].includes(category)) {
    return res.status(400).json({ error: "Invalid category" });
  }
  const rows = category
    ? db.prepare("SELECT * FROM products WHERE category = ? ORDER BY id DESC").all(category)
    : db.prepare("SELECT * FROM products ORDER BY id DESC").all();
  const products = rows.map((r) => ({ ...r, size_options: r.size_options.split(",") }));
  res.json(products);
});

app.get("/api/orders", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT o.*, p.name as product_name, p.image_url as product_image, p.price as product_price
       FROM orders o
       JOIN products p ON p.id = o.product_id
       ORDER BY o.id DESC`
    )
    .all();
  res.json(rows);
});

app.post("/api/orders", (req, res) => {
  const {
    product_id,
    client_name,
    email,
    phone,
    address,
    selected_size,
    selected_color,
    quantity,
    note
  } = req.body;
  if (
    !product_id ||
    !client_name ||
    !email ||
    !phone ||
    !address ||
    !selected_size ||
    !selected_color
  ) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  const product = db.prepare("SELECT id FROM products WHERE id = ?").get(product_id);
  if (!product) return res.status(404).json({ error: "Product not found" });

  const info = db
    .prepare(
      `INSERT INTO orders (
        product_id, client_name, email, phone, address, selected_size, selected_color, quantity, note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      product_id,
      client_name.trim(),
      email.trim(),
      phone.trim(),
      address.trim(),
      selected_size.trim(),
      selected_color.trim(),
      Number(quantity) || 1,
      (note || "").trim()
    );
  res.status(201).json({ id: info.lastInsertRowid });
});

app.patch("/api/orders/:orderId/status", (req, res) => {
  const orderId = Number(req.params.orderId);
  const status = req.body.status;
  if (!["new", "contacted", "fulfilled", "cancelled"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  const info = db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, orderId);
  if (!info.changes) return res.status(404).json({ error: "Order not found" });
  res.json({ ok: true });
});

app.get("/api/orders/:orderId/messages", async (req, res) => {
  const orderId = Number(req.params.orderId);
  const order = db.prepare("SELECT id FROM orders WHERE id = ?").get(orderId);
  if (!order) return res.status(404).json({ error: "Order not found" });

  const rows = db
    .prepare("SELECT * FROM messages WHERE order_id = ? ORDER BY id ASC")
    .all(orderId);
  const messages = await Promise.all(
    rows.map(async (m) => ({
      ...m,
      attachment_url:
        m.attachment_url && m.attachment_url.startsWith("s3://")
          ? await createDownloadUrl(m.attachment_url.replace("s3://", ""))
          : m.attachment_url
    }))
  );
  res.json(messages);
});

app.post("/api/orders/:orderId/messages", (req, res) => {
  const orderId = Number(req.params.orderId);
  const { sender_role, sender_name, body, attachment_url, attachment_name } = req.body;
  if (!["client", "admin"].includes(sender_role) || !sender_name || !body) {
    return res.status(400).json({ error: "Missing required message fields" });
  }
  const order = db.prepare("SELECT id FROM orders WHERE id = ?").get(orderId);
  if (!order) return res.status(404).json({ error: "Order not found" });

  const info = db
    .prepare(
      `INSERT INTO messages (
      order_id, sender_role, sender_name, body, attachment_url, attachment_name
    ) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      orderId,
      sender_role,
      sender_name.trim(),
      body.trim(),
      (attachment_url || "").trim() || null,
      (attachment_name || "").trim() || null
    );
  res.status(201).json({ id: info.lastInsertRowid });
});

app.post("/api/uploads/presign", async (req, res) => {
  try {
    const { fileName, contentType } = req.body;
    if (!fileName) return res.status(400).json({ error: "fileName is required" });
    const signed = await createUploadUrl({ fileName, contentType });
    if (!signed) {
      return res.status(400).json({
        error: "S3 is not configured. Set AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET_NAME."
      });
    }
    res.json({ ...signed, persistentUrl: `s3://${signed.key}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/admin", (_req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));

app.listen(port, () => {
  console.log(`Hush app running on http://localhost:${port}`);
});
