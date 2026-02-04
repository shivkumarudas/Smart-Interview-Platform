console.log("feedback.js loaded");

document.addEventListener("DOMContentLoaded", () => {

  const form = document.getElementById("feedbackForm");
  const statusMsg = document.getElementById("statusMsg");

  const user = JSON.parse(localStorage.getItem("user"));
  if (!user || !user.id) {
    window.location.href = "../auth/login.html";
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const feedbackData = {
      userId: user.id,
      positive: document.getElementById("positive").value.trim(),
      improvement: document.getElementById("improvement").value.trim(),
      recommend: document.getElementById("recommend").value
    };

    for (let key in feedbackData) {
      if (!feedbackData[key]) {
        alert("Please fill all fields");
        return;
      }
    }

    try {
      const res = await fetch("http://127.0.0.1:5000/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(feedbackData)
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Feedback submission failed");
        return;
      }

      statusMsg.style.display = "block";
      statusMsg.innerText = "Thank you for your feedback!";
      form.reset();

      setTimeout(() => {
        window.location.href = "../dashboard/dashboard.html";
      }, 1500);

    } catch (err) {
      console.error("FEEDBACK SAVE FAILED:", err);
      alert("Backend not reachable");
    }
  });

});
