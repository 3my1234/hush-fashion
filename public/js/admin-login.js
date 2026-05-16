const authForm = document.getElementById("authForm");
const authStatus = document.getElementById("authStatus");
const fullNameWrap = document.getElementById("fullNameWrap");
const titleEl = document.getElementById("loginTitle");
const descEl = document.getElementById("loginDesc");
const submitBtn = document.getElementById("submitBtn");

let bootstrapMode = false;

async function init() {
  const me = await fetch("/api/admin/me");
  if (me.ok) {
    window.location.href = "/admin";
    return;
  }
  const boot = await fetch("/api/admin/bootstrap-status").then((r) => r.json());
  bootstrapMode = !!boot.needsBootstrap;
  if (bootstrapMode) {
    titleEl.textContent = "Create First Admin";
    descEl.textContent = "First setup: create the initial admin account.";
    fullNameWrap.style.display = "block";
    submitBtn.textContent = "Create Admin";
  }
}

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  authStatus.textContent = "";
  const payload = {
    email: document.getElementById("email").value,
    password: document.getElementById("password").value
  };
  const endpoint = bootstrapMode ? "/api/admin/bootstrap" : "/api/admin/login";
  if (bootstrapMode) payload.full_name = document.getElementById("fullName").value;

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
  window.location.href = "/admin";
});

init();
