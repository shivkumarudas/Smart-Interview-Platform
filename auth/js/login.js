console.log("login.js loaded");

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const errorMsg = document.getElementById("errorMsg");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    errorMsg.innerText = "";

    if (!email || !password) {
      errorMsg.innerText = "All fields required";
      return;
    }

    try {
      const res = await window.InterviewAI.api.fetch("/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        errorMsg.innerText = data.error || "Login failed";
        return;
      }

      // ✅ SAVE USER SESSION
      localStorage.setItem("user", JSON.stringify(data.user));

      // ✅ REDIRECT
      window.location.href = "../dashboard/dashboard.html";

    } catch (err) {
      console.error(err);
      errorMsg.innerText = "Server not reachable";
    }
  });
});
