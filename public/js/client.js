let selectedProduct = null;
let currentUser = null;
let stream = null;
let signupMode = false;

const productsEl = document.getElementById("products");
const selectedProductEl = document.getElementById("selectedProduct");
const formStatus = document.getElementById("formStatus");
const liveClientNotice = document.getElementById("liveClientNotice");
const authStatus = document.getElementById("authStatus");
const userBar = document.getElementById("userBar");

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

function renderUserBar() {
  if (!currentUser) {
    userBar.textContent = "Not signed in";
    return;
  }
  userBar.innerHTML = `${currentUser.full_name} (${currentUser.email}) <button id="logoutUserBtn" class="ghost" style="margin-left:.4rem;">Logout</button>`;
  document.getElementById("logoutUserBtn").addEventListener("click", logoutUser);
}

function setAuthMode(isSignup) {
  signupMode = isSignup;
  document.getElementById("signupNameWrap").style.display = isSignup ? "block" : "none";
  document.getElementById("authTitle").textContent = isSignup ? "User Sign Up" : "User Sign In";
  document.getElementById("authHint").textContent = isSignup
    ? "Create your account with email/password."
    : "Use your existing account.";
  document.getElementById("authSubmitBtn").textContent = isSignup ? "Sign Up" : "Sign In";
  document.getElementById("authToggleBtn").textContent = isSignup ? "Switch to Sign In" : "Switch to Sign Up";
}

async function ensureUserSession() {
  const res = await fetch("/api/users/me");
  if (!res.ok) {
    currentUser = null;
    renderUserBar();
    return;
  }
  const data = await res.json();
  currentUser = data.user;
  renderUserBar();
}

async function logoutUser() {
  await fetch("/api/users/logout", { method: "POST" });
  currentUser = null;
  renderUserBar();
}

async function uploadAttachment(file) {
  if (!file) return { attachment_url: "", attachment_name: "" };
  const presign = await fetch("/api/uploads/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, contentType: file.type || "application/octet-stream" })
  });
  const signed = await presign.json();
  if (!presign.ok) throw new Error(signed.error || "Could not prepare file upload.");
  const upload = await fetch(signed.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file
  });
  if (!upload.ok) throw new Error("File upload failed.");
  return { attachment_url: signed.persistentUrl, attachment_name: file.name };
}

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

document.querySelectorAll("[data-filter]").forEach((btn) => {
  btn.addEventListener("click", () => loadProducts(btn.dataset.filter));
});

document.getElementById("authToggleBtn").addEventListener("click", () => {
  authStatus.textContent = "";
  setAuthMode(!signupMode);
});

document.getElementById("authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  authStatus.textContent = "";
  const payload = {
    email: document.getElementById("authEmail").value,
    password: document.getElementById("authPassword").value
  };
  let endpoint = "/api/users/login";
  if (signupMode) {
    payload.full_name = document.getElementById("signupName").value;
    endpoint = "/api/users/signup";
  }
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await res.json();
  if (!res.ok) {
    authStatus.textContent = body.error || "Authentication failed.";
    return;
  }
  currentUser = body.user;
  authStatus.textContent = signupMode ? "Account created and signed in." : "Signed in.";
  renderUserBar();
});

document.getElementById("orderForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  formStatus.textContent = "";
  if (!currentUser) {
    formStatus.textContent = "Please sign in first.";
    return;
  }
  if (!selectedProduct) {
    formStatus.textContent = "Please select an outfit first.";
    return;
  }

  try {
    const file = document.getElementById("attachmentFile").files[0];
    const uploaded = await uploadAttachment(file);
    const payload = {
      product_id: selectedProduct.id,
      phone: document.getElementById("phone").value,
      address: document.getElementById("address").value,
      selected_size: document.getElementById("size").value,
      selected_color: document.getElementById("color").value,
      quantity: Number(document.getElementById("quantity").value || 1),
      note: document.getElementById("note").value,
      initial_message: document.getElementById("initialMessage").value,
      attachment_url: uploaded.attachment_url,
      attachment_name: uploaded.attachment_name
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
    formStatus.textContent = `Order #${body.id} placed successfully.`;
    startClientNotifications(body.id);
  } catch (error) {
    formStatus.textContent = error.message || "Unable to place order.";
  }
});

setAuthMode(false);
ensureUserSession();
loadProducts();
