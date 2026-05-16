const ordersEl = document.getElementById("orders");
const threadEl = document.getElementById("thread");
const adminStatus = document.getElementById("adminStatus");
const createAdminStatus = document.getElementById("createAdminStatus");
const resetPasswordStatus = document.getElementById("resetPasswordStatus");
const liveAdminNotice = document.getElementById("liveAdminNotice");
const productStatus = document.getElementById("productStatus");
const productList = document.getElementById("productList");
let currentOrderId = null;
let currentAdmin = null;

async function ensureAdminSession() {
  const res = await fetch("/api/admin/me");
  if (!res.ok) {
    window.location.href = "/admin-login";
    return false;
  }
  const data = await res.json();
  currentAdmin = data.admin;
  document.getElementById("adminIdentity").textContent = currentAdmin.email;
  document.getElementById("adminName").value = currentAdmin.full_name || "Hush Admin";
  return true;
}

async function loadOrders() {
  const res = await fetch("/api/orders");
  if (res.status === 401) {
    window.location.href = "/admin-login";
    return;
  }
  const orders = await res.json();
  ordersEl.innerHTML = "";

  for (const o of orders) {
    const productName = o.product_name_snapshot || o.product_name;
    const productImage = o.product_image_snapshot || o.product_image;
    const item = document.createElement("div");
    item.className = "order-item";
    item.innerHTML = `
      <strong>#${o.id} - ${productName}</strong>
      <div class="muted">${o.client_name} | ${o.phone}</div>
      <div class="muted">${o.email}</div>
      <div class="muted">${o.address}</div>
      <div class="muted">Size: ${o.selected_size} | Color: ${o.selected_color} | Qty: ${o.quantity}</div>
      <div class="muted">Status: ${o.status}</div>
      <img src="${productImage}" alt="${productName}" style="width:70px;height:70px;object-fit:cover;border-radius:8px;margin-top:6px;" />
      <div style="display:flex;gap:.4rem;margin-top:.5rem;">
        <button data-open="${o.id}">Open</button>
        <select data-status="${o.id}">
          <option value="new" ${o.status === "new" ? "selected" : ""}>new</option>
          <option value="contacted" ${o.status === "contacted" ? "selected" : ""}>contacted</option>
          <option value="fulfilled" ${o.status === "fulfilled" ? "selected" : ""}>fulfilled</option>
          <option value="cancelled" ${o.status === "cancelled" ? "selected" : ""}>cancelled</option>
        </select>
      </div>
    `;
    item.querySelector("[data-open]").addEventListener("click", async () => {
      currentOrderId = o.id;
      await loadThread(o.id);
    });
    item.querySelector("[data-status]").addEventListener("change", async (ev) => {
      await fetch(`/api/orders/${o.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: ev.target.value })
      });
      loadOrders();
    });
    ordersEl.appendChild(item);
  }
}

async function loadThread(orderId) {
  const res = await fetch(`/api/orders/${orderId}/messages`);
  const messages = await res.json();
  threadEl.innerHTML = messages.length ? "" : "<p class='muted'>No messages yet.</p>";
  for (const m of messages) {
    const box = document.createElement("div");
    box.className = `message ${m.sender_role === "admin" ? "admin" : ""}`;
    box.innerHTML = `
      <strong>${m.sender_name}</strong> <span class="muted">(${m.sender_role})</span>
      <div>${m.body}</div>
      ${m.attachment_url ? `<a href="${m.attachment_url}" target="_blank">Attachment: ${m.attachment_name || "view file"}</a>` : ""}
    `;
    threadEl.appendChild(box);
  }
}

function setProductFormMode(editing) {
  document.getElementById("productSubmitBtn").textContent = editing ? "Save Product" : "Create Product";
}

function resetProductForm() {
  document.getElementById("productId").value = "";
  document.getElementById("productName").value = "";
  document.getElementById("productCategory").value = "male";
  document.getElementById("productPrice").value = "";
  document.getElementById("productColor").value = "";
  document.getElementById("productSizes").value = "";
  document.getElementById("productImage").value = "";
  document.getElementById("productDescription").value = "";
  setProductFormMode(false);
}

async function loadProductsForAdmin() {
  const res = await fetch("/api/products");
  const products = await res.json();
  productList.innerHTML = "";
  for (const p of products) {
    const item = document.createElement("div");
    item.className = "order-item";
    item.innerHTML = `
      <strong>#${p.id} - ${p.name}</strong>
      <div class="muted">${p.category} | NGN ${Number(p.price).toLocaleString()}</div>
      <div class="muted">Color: ${p.color} | Sizes: ${p.size_options.join(", ")}</div>
      <img src="${p.image_url}" alt="${p.name}" style="width:70px;height:70px;object-fit:cover;border-radius:8px;margin-top:6px;" />
      <div style="display:flex;gap:.4rem;margin-top:.5rem;">
        <button data-edit="${p.id}">Edit</button>
        <button class="ghost" data-delete="${p.id}">Delete</button>
      </div>
    `;
    item.querySelector("[data-edit]").addEventListener("click", () => {
      document.getElementById("productId").value = p.id;
      document.getElementById("productName").value = p.name;
      document.getElementById("productCategory").value = p.category;
      document.getElementById("productPrice").value = p.price;
      document.getElementById("productColor").value = p.color;
      document.getElementById("productSizes").value = p.size_options.join(",");
      document.getElementById("productImage").value = p.image_url;
      document.getElementById("productDescription").value = p.description || "";
      setProductFormMode(true);
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    });
    item.querySelector("[data-delete]").addEventListener("click", async () => {
      productStatus.textContent = "";
      const ok = window.confirm(`Delete product "${p.name}"?`);
      if (!ok) return;
      const del = await fetch(`/api/admin/products/${p.id}`, { method: "DELETE" });
      const body = await del.json();
      productStatus.textContent = del.ok ? "Product deleted." : body.error || "Delete failed.";
      await loadProductsForAdmin();
    });
    productList.appendChild(item);
  }
}

document.getElementById("adminMessageForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  adminStatus.textContent = "";
  if (!currentOrderId) {
    adminStatus.textContent = "Open an order first.";
    return;
  }
  const payload = {
    sender_role: "admin",
    sender_name: currentAdmin?.full_name || document.getElementById("adminName").value,
    body: document.getElementById("adminBody").value,
    attachment_url: document.getElementById("adminAttachmentUrl").value,
    attachment_name: document.getElementById("adminAttachmentName").value
  };
  const res = await fetch(`/api/orders/${currentOrderId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await res.json();
  if (!res.ok) {
    adminStatus.textContent = body.error || "Failed to send reply.";
    return;
  }
  adminStatus.textContent = "Reply sent.";
  await loadThread(currentOrderId);
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await fetch("/api/admin/logout", { method: "POST" });
  window.location.href = "/admin-login";
});

document.getElementById("createAdminForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  createAdminStatus.textContent = "";
  const payload = {
    full_name: document.getElementById("newAdminName").value,
    email: document.getElementById("newAdminEmail").value,
    password: document.getElementById("newAdminPassword").value
  };
  const res = await fetch("/api/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await res.json();
  createAdminStatus.textContent = res.ok ? `Admin created: ${body.email}` : body.error || "Failed to create admin.";
});

document.getElementById("resetPasswordForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  resetPasswordStatus.textContent = "";
  const payload = {
    currentPassword: document.getElementById("currentPassword").value,
    newPassword: document.getElementById("newPassword").value
  };
  const res = await fetch("/api/admin/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await res.json();
  resetPasswordStatus.textContent = res.ok ? "Password reset successful." : body.error || "Failed to reset password.";
});

document.getElementById("productForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  productStatus.textContent = "";
  const productId = document.getElementById("productId").value;
  const payload = {
    name: document.getElementById("productName").value,
    category: document.getElementById("productCategory").value,
    price: Number(document.getElementById("productPrice").value),
    color: document.getElementById("productColor").value,
    size_options: document.getElementById("productSizes").value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    image_url: document.getElementById("productImage").value,
    description: document.getElementById("productDescription").value
  };
  const endpoint = productId ? `/api/admin/products/${productId}` : "/api/admin/products";
  const method = productId ? "PATCH" : "POST";
  const res = await fetch(endpoint, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await res.json();
  if (!res.ok) {
    productStatus.textContent = body.error || "Unable to save product.";
    return;
  }
  productStatus.textContent = productId ? "Product updated." : "Product created.";
  resetProductForm();
  await loadProductsForAdmin();
});

document.getElementById("productCancelEditBtn").addEventListener("click", () => {
  resetProductForm();
  productStatus.textContent = "";
});

function startAdminNotifications() {
  const es = new EventSource("/api/stream/admin");
  es.onmessage = async (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "new-order") {
      liveAdminNotice.textContent = `New order #${data.orderId} from ${data.clientName}`;
      await loadOrders();
    }
    if (data.type === "new-client-message") {
      liveAdminNotice.textContent = `New client message on order #${data.orderId}`;
      if (currentOrderId === data.orderId) await loadThread(currentOrderId);
    }
  };
}

async function init() {
  const ok = await ensureAdminSession();
  if (!ok) return;
  await loadOrders();
  await loadProductsForAdmin();
  resetProductForm();
  startAdminNotifications();
}

init();
