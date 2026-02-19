console.log("forgot-password.js loaded");

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("forgotForm");
  const errorMsg = document.getElementById("errorMsg");
  const successMsg = document.getElementById("successMsg");
  const sendCodeBtn = document.getElementById("sendCodeBtn");
  const resetCodeInput = document.getElementById("resetCode");
  let requestedEmail = "";

  function resetMessages() {
    errorMsg.innerText = "";
    successMsg.innerText = "";
  }

  async function requestResetCode() {
    resetMessages();
    const email = document.getElementById("email").value.trim();
    if (!email) {
      errorMsg.innerText = "Email is required";
      return;
    }

    try {
      if (sendCodeBtn) sendCodeBtn.disabled = true;
      const res = await window.InterviewAI.api.fetch("/forgot-password/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const hint = data.hint ? ` ${data.hint}` : "";
        errorMsg.innerText = (data.error || "Could not request reset code") + hint;
        return;
      }

      requestedEmail = email.toLowerCase();
      let message = data.message || "Reset code sent if the account exists.";

      if (data?.devResetCode) {
        message += ` Dev code: ${data.devResetCode}`;
      }

      successMsg.innerText = message;
      if (resetCodeInput) resetCodeInput.focus();
    } catch (err) {
      console.error(err);
      errorMsg.innerText = "Server not reachable";
    } finally {
      if (sendCodeBtn) sendCodeBtn.disabled = false;
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    resetMessages();

    const email = document.getElementById("email").value.trim();
    const resetCode = String(document.getElementById("resetCode").value || "").trim();
    const newPassword = document.getElementById("newPassword").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    if (!email || !resetCode || !newPassword || !confirmPassword) {
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

    if (requestedEmail && requestedEmail !== email.toLowerCase()) {
      errorMsg.innerText = "Email changed. Request a new reset code for this email.";
      return;
    }

    try {
      const res = await window.InterviewAI.api.fetch("/forgot-password/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, resetCode, newPassword })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const hint = data.hint ? ` ${data.hint}` : "";
        errorMsg.innerText = (data.error || "Reset failed") + hint;
        return;
      }

      successMsg.innerText = "Password reset successful. Redirecting to login...";
      form.reset();
      requestedEmail = "";

      setTimeout(() => {
        window.location.href = "login.html";
      }, 1300);
    } catch (err) {
      console.error(err);
      errorMsg.innerText = "Server not reachable";
    }
  });

  if (sendCodeBtn) {
    sendCodeBtn.addEventListener("click", () => {
      requestResetCode();
    });
  }
});
