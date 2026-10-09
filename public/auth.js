const STORAGE_KEY = "meeting-insights-auth";

let mode = "login";
let refreshInFlight = null;

function getSession() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

function saveSession(session, email) {
  const current = getSession();
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt ?? null,
      email: email || current?.email || "",
    })
  );
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

function showLoggedIn(email) {
  document.getElementById("gate")?.classList.add("hidden");
  document.getElementById("appSection")?.classList.remove("hidden");
  document.getElementById("sessionBar")?.classList.remove("hidden");
  const emailEl = document.getElementById("sessionEmail");
  if (emailEl) emailEl.textContent = email || "";
  window.dispatchEvent(new CustomEvent("auth:ready"));
}

function showLoggedOut() {
  document.getElementById("gate")?.classList.remove("hidden");
  document.getElementById("appSection")?.classList.add("hidden");
  document.getElementById("sessionBar")?.classList.add("hidden");
}

async function refreshSession() {
  const session = getSession();
  if (!session?.refreshToken) return null;

  if (!refreshInFlight) {
    refreshInFlight = fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = await res.json();
        if (!data.session) return null;
        saveSession(data.session, data.user?.email);
        return getSession();
      })
      .catch(() => null)
      .finally(() => {
        refreshInFlight = null;
      });
  }

  return refreshInFlight;
}

export async function authFetch(url, options = {}, retried = false) {
  const session = getSession();
  const headers = new Headers(options.headers || {});
  if (session?.accessToken) {
    headers.set("Authorization", `Bearer ${session.accessToken}`);
  }

  const res = await fetch(url, { ...options, headers });
  if (res.status !== 401 || retried || !session?.refreshToken) {
    return res;
  }

  const refreshed = await refreshSession();
  if (!refreshed?.accessToken) {
    clearSession();
    showLoggedOut();
    return res;
  }

  return authFetch(url, options, true);
}

export function initAuth() {
  const form = document.getElementById("authForm");
  const toggle = document.getElementById("authToggle");
  const signOut = document.getElementById("signOutBtn");
  const title = document.getElementById("authTitle");
  const submit = document.getElementById("authSubmit");
  const message = document.getElementById("authMessage");
  const password = document.getElementById("password");

  function setMessage(text, kind) {
    if (!message) return;
    message.textContent = text || "";
    message.hidden = !text;
    message.classList.toggle("success", kind === "success");
  }

  function setMode(next) {
    mode = next;
    const signingUp = mode === "signup";
    if (title) title.textContent = signingUp ? "Create an account" : "Log in";
    if (submit) submit.textContent = signingUp ? "Sign up" : "Log in";
    if (toggle) {
      toggle.textContent = signingUp
        ? "Already have an account? Log in"
        : "Need an account? Sign up";
    }
    if (password) password.autocomplete = signingUp ? "new-password" : "current-password";
    setMessage("");
  }

  toggle?.addEventListener("click", () => {
    setMode(mode === "login" ? "signup" : "login");
  });

  signOut?.addEventListener("click", () => {
    clearSession();
    form?.reset();
    setMode("login");
    if (location.pathname !== "/") history.replaceState({}, "", "/");
    showLoggedOut();
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.getElementById("email")?.value.trim() ?? "";
    const passwordValue = password?.value ?? "";
    const validationError = validateCredentials(email, passwordValue, mode === "signup");
    if (validationError) {
      setMessage(validationError);
      return;
    }

    setMessage("");
    if (submit) submit.disabled = true;

    try {
      const res = await fetch(mode === "signup" ? "/api/auth/signup" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: passwordValue }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error || "Something went wrong.");
        return;
      }
      if (!data.session) {
        setMessage(data.message || "Check your email to confirm your account, then log in.", "success");
        setMode("login");
        return;
      }
      saveSession(data.session, data.user?.email || email);
      form.reset();
      showLoggedIn(data.user?.email || email);
    } catch (err) {
      setMessage(err.message || "Something went wrong.");
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  setMode("login");
  restoreSession();
}

function validateCredentials(email, passwordValue, signingUp) {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Enter a valid email.";
  }
  if (!passwordValue) {
    return "Enter your password.";
  }
  if (signingUp && passwordValue.length < 6) {
    return "Password must be at least 6 characters.";
  }
  return "";
}

async function restoreSession() {
  const session = getSession();
  if (!session?.accessToken) {
    showLoggedOut();
    return;
  }

  const res = await authFetch("/api/auth/me");
  if (!res.ok) {
    clearSession();
    showLoggedOut();
    return;
  }

  const data = await res.json().catch(() => ({}));
  showLoggedIn(data.user?.email || session.email);
}
