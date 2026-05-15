const ordersEl = document.getElementById("orders");
const threadEl = document.getElementById("thread");
const adminStatus = document.getElementById("adminStatus");
let currentOrderId = null;

async function loadOrders() {
  const res = await fetch("/api/orders");
  const orders = await res.json();
  ordersEl.innerHTML = "";

  for (const o of orders) {
    const item = document.createElement("div");
    item.className = "order-item";
    item.innerHTML = `
      <strong>#${o.id} - ${o.product_name}</strong>
      <div class="muted">${o.client_name} | ${o.phone}</div>
      <div class="muted">${o.email}</div>
      <div class="muted">${o.address}</div>
      <div class="muted">Size: ${o.selected_size} | Color: ${o.selected_color} | Qty: ${o.quantity}</div>
      <div class="muted">Status: ${o.status}</div>
      <img src="${o.product_image}" alt="${o.product_name}" style="width:70px;height:70px;object-fit:cover;border-radius:8px;margin-top:6px;" />
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

document.getElementById("adminMessageForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  adminStatus.textContent = "";
  if (!currentOrderId) {
    adminStatus.textContent = "Open an order first.";
    return;
  }
  const payload = {
    sender_role: "admin",
    sender_name: document.getElementById("adminName").value,
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

loadOrders();
