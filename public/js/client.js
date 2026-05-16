let selectedProduct = null;

const productsEl = document.getElementById("products");
const selectedProductEl = document.getElementById("selectedProduct");
const formStatus = document.getElementById("formStatus");
const msgStatus = document.getElementById("msgStatus");
const liveClientNotice = document.getElementById("liveClientNotice");
let stream = null;

async function loadProducts(category = "all") {
  const q = category === "all" ? "" : `?category=${category}`;
  const res = await fetch(`/api/products${q}`);
  const products = await res.json();
  productsEl.innerHTML = "";

  for (const p of products) {
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `
      <img src="${p.image_url}" alt="${p.name}" />
      <div class="body">
        <h4>${p.name}</h4>
        <div class="meta">${p.category.toUpperCase()} | ${p.color}</div>
        <div class="price">NGN ${Number(p.price).toLocaleString()}</div>
        <div class="meta">Sizes: ${p.size_options.join(", ")}</div>
        <p class="meta">${p.description || ""}</p>
        <button data-id="${p.id}">Order This</button>
      </div>
    `;
    card.querySelector("button").addEventListener("click", () => {
      selectedProduct = p;
      selectedProductEl.value = `${p.name} (NGN ${Number(p.price).toLocaleString()})`;
      document.getElementById("size").value = p.size_options[0] || "";
      document.getElementById("color").value = p.color || "";
    });
    productsEl.appendChild(card);
  }
}

document.querySelectorAll("[data-filter]").forEach((btn) => {
  btn.addEventListener("click", () => loadProducts(btn.dataset.filter));
});

document.getElementById("orderForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  formStatus.textContent = "";
  if (!selectedProduct) {
    formStatus.textContent = "Please select an outfit first.";
    return;
  }

  const payload = {
    product_id: selectedProduct.id,
    client_name: document.getElementById("clientName").value,
    email: document.getElementById("email").value,
    phone: document.getElementById("phone").value,
    address: document.getElementById("address").value,
    selected_size: document.getElementById("size").value,
    selected_color: document.getElementById("color").value,
    quantity: Number(document.getElementById("quantity").value || 1),
    note: document.getElementById("note").value
  };

  const res = await fetch("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await res.json();
  if (!res.ok) {
    formStatus.textContent = body.error || "Unable to place order.";
    return;
  }
  formStatus.textContent = `Order placed successfully. Your order ID is ${body.id}.`;
  document.getElementById("msgOrderId").value = body.id;
  startClientNotifications(body.id);
});

document.getElementById("messageForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  msgStatus.textContent = "";
  const orderId = document.getElementById("msgOrderId").value;
  const payload = {
    sender_role: "client",
    sender_name: document.getElementById("msgName").value,
    body: document.getElementById("msgBody").value,
    attachment_url: document.getElementById("msgAttachmentUrl").value,
    attachment_name: document.getElementById("msgAttachmentName").value
  };
  const res = await fetch(`/api/orders/${orderId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await res.json();
  msgStatus.textContent = res.ok ? "Message sent to admin." : body.error || "Failed to send message.";
});

document.getElementById("msgOrderId").addEventListener("change", (e) => {
  const id = Number(e.target.value);
  if (id) startClientNotifications(id);
});

function startClientNotifications(orderId) {
  if (!orderId) return;
  if (stream) stream.close();
  stream = new EventSource(`/api/stream/client?orderId=${orderId}`);
  stream.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "new-admin-message") {
      liveClientNotice.textContent = `Admin replied on order #${data.orderId}.`;
    }
  };
}

loadProducts();
