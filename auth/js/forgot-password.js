console.log("forgot-password.js loaded");

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("forgotForm");
  const errorMsg = document.getElementById("errorMsg");
  const successMsg = document.getElementById("successMsg");
  const createAccountBtn = document.getElementById("createAccountBtn");

  let pendingCreateData = null;

  function resetMessages() {
    errorMsg.innerText = "";
    successMsg.innerText = "";
    if (createAccountBtn) createAccountBtn.style.display = "none";
    pendingCreateData = null;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    resetMessages();

    const email = document.getElementById("email").value.trim();
    const newPassword = document.getElementById("newPassword").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    if (!email || !newPassword || !confirmPassword) {
      errorMsg.innerText = "All fields required";
      return;
    }

    if (newPassword.length < 6) {
      errorMsg.innerText = "Password must be at least 6 characters";
      return;
    }

    if (newPassword !== confirmPassword) {
      errorMsg.innerText = "Passwords do not match";
      return;
    }

    try {
      const res = await window.InterviewAI.api.fetch("/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, newPassword })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const hint = data.hint ? ` ${data.hint}` : "";
        const isMissingAccount = data.error === "Account not found";
        const guidance = isMissingAccount
          ? " You can create a new account with this email below."
          : "";
        errorMsg.innerText = (data.error || "Reset failed") + hint + guidance;

        if (isMissingAccount && createAccountBtn) {
          pendingCreateData = { email, newPassword };
          createAccountBtn.style.display = "block";
        }

        return;
      }

      successMsg.innerText = "Password reset successful. Redirecting to login...";
      form.reset();

      setTimeout(() => {
        window.location.href = "login.html";
      }, 1300);
    } catch (err) {
      console.error(err);
      errorMsg.innerText = "Server not reachable";
    }
  });

  if (createAccountBtn) {
    createAccountBtn.addEventListener("click", async () => {
      if (!pendingCreateData) return;

      errorMsg.innerText = "";
      successMsg.innerText = "";

      const { email, newPassword } = pendingCreateData;
      const nameFallback = String(email.split("@")[0] || "User")
        .replace(/[^a-zA-Z0-9._-]/g, " ")
        .trim() || "User";

      try {
        const res = await window.InterviewAI.api.fetch("/signup", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            name: nameFallback,
            email,
            password: newPassword
          })
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          errorMsg.innerText = data.error || "Unable to create account";
          return;
        }

        successMsg.innerText = "Account created successfully. Redirecting to login...";
        form.reset();
        createAccountBtn.style.display = "none";
        pendingCreateData = null;

        setTimeout(() => {
          window.location.href = "login.html";
        }, 1300);
      } catch (err) {
        console.error(err);
        errorMsg.innerText = "Server not reachable";
      }
    });
  }
});
