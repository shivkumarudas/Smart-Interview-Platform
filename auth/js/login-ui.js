document.addEventListener("DOMContentLoaded", () => {
  const passwordInput = document.getElementById("password");
  const passwordToggle = document.getElementById("togglePassword");
  const apiStatusText = document.getElementById("apiStatusText");
  const apiStatusDot = document.getElementById("apiStatusDot");

  function setStatus(state, message) {
    if (!apiStatusText || !apiStatusDot) return;
    apiStatusText.textContent = message;
    apiStatusDot.classList.remove("checking", "online", "offline");
    apiStatusDot.classList.add(state);
  }

  function resolveDisplayEndpoint(api) {
    const base = String(api?.baseUrl || "").trim();
    if (base) return base;
    if (window.location?.protocol === "file:") return "http://127.0.0.1:5000";
    return window.location.origin || "same origin";
  }

  if (passwordToggle && passwordInput) {
    passwordToggle.addEventListener("click", () => {
      const isHidden = passwordInput.type === "password";
      passwordInput.type = isHidden ? "text" : "password";
      passwordToggle.textContent = isHidden ? "Hide" : "Show";
      passwordToggle.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
    });
  }

  (async () => {
    const api = window.InterviewAI?.api;
    if (!api?.ready || typeof api.fetch !== "function") {
      setStatus("offline", "API client unavailable");
      return;
    }

    setStatus("checking", "Checking backend...");

    try {
      await api.ready;
      const res = await api.fetch("/ping", { method: "GET", cache: "no-store" });
      const text = (await res.text()).trim().toLowerCase();

      if (res.ok && text === "pong") {
        const endpoint = resolveDisplayEndpoint(api);
        setStatus("online", `Connected to ${endpoint}`);
        return;
      }

      setStatus("offline", "Backend returned an unexpected response");
    } catch {
      setStatus("offline", "Backend unreachable. Start interview-ai-backend on port 5000.");
    }
  })();
});
