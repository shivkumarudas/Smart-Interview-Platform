document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const errorMsg = document.getElementById("errorMsg");
  const submitBtn = document.getElementById("loginSubmitBtn");
  let isSubmitting = false;

  function setSubmittingState(submitting) {
    isSubmitting = submitting;
    if (!submitBtn) return;
    submitBtn.disabled = submitting;
    submitBtn.classList.toggle("is-loading", submitting);
    submitBtn.textContent = submitting ? "Signing in..." : "Login";
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    errorMsg.innerText = "";

    if (!email || !password) {
      errorMsg.innerText = "All fields required";
      return;
    }

    try {
      setSubmittingState(true);
      const res = await window.InterviewAI.api.fetch("/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const hint = data.hint ? ` ${data.hint}` : "";
        errorMsg.innerText = (data.error || "Login failed") + hint;
        return;
      }

      localStorage.setItem("user", JSON.stringify(data.user));
      if (data?.token) {
        localStorage.setItem("INTERVIEWAI_AUTH_TOKEN", String(data.token));
      } else {
        localStorage.removeItem("INTERVIEWAI_AUTH_TOKEN");
      }
      localStorage.removeItem("authToken");
      window.location.href = "../dashboard/dashboard.html";
    } catch (err) {
      console.error(err);
      errorMsg.innerText = "Server not reachable";
    } finally {
      setSubmittingState(false);
    }
  });
});
