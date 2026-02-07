console.log("signup.js loaded");

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("signupForm");
  const errorMsg = document.getElementById("errorMsg");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    errorMsg.innerText = "";

    if (!name || !email || !password) {
      errorMsg.innerText = "All fields required";
      return;
    }

    if (password !== confirmPassword) {
      errorMsg.innerText = "Passwords do not match";
      return;
    }

    try {
      const res = await window.InterviewAI.api.fetch("/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"   // 🔥 THIS IS CRITICAL
        },
        body: JSON.stringify({
          name,
          email,
          password
        })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        errorMsg.innerText = data.error || "Signup failed";
        return;
      }

      alert("Signup successful");
      window.location.href = "login.html";

    } catch (err) {
      console.error(err);
      errorMsg.innerText = "Server not reachable";
    }
  });
});
