console.log("index.js loaded");

const user = JSON.parse(localStorage.getItem("user"));

const navBtn = document.getElementById("navBtn");
const primaryBtn = document.getElementById("primaryBtn");
const ctaBtn = document.getElementById("ctaBtn");

if (user && user.id) {
  navBtn.innerText = "Dashboard";
  navBtn.onclick = () => window.location.href = "dashboard/dashboard.html";

  primaryBtn.innerText = "Go to Dashboard";
  primaryBtn.onclick = () => window.location.href = "dashboard/dashboard.html";

  ctaBtn.onclick = () => window.location.href = "dashboard/dashboard.html";

} else {
  navBtn.innerText = "Login";
  navBtn.onclick = () => window.location.href = "auth/login.html";

  primaryBtn.onclick = () => window.location.href = "auth/signup.html";
  ctaBtn.onclick = () => window.location.href = "auth/signup.html";
}
/* ================= FAQ ACCORDION ================= */
document.querySelectorAll(".faq-question").forEach(item => {
  item.addEventListener("click", () => {
    const parent = item.parentElement;
    parent.classList.toggle("active");
  });
});
