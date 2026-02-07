console.log("dashboard.js loaded");

/* ================= USER CHECK ================= */
const user = JSON.parse(localStorage.getItem("user") || "null");
if (!user || !user.id) {
  window.location.href = "../auth/login.html";
}

/* ================= WELCOME ================= */
document.getElementById("welcomeText").innerText =
  `Welcome, ${user.name || user.email || "Candidate"}`;

/* ================= FETCH PROFILE ================= */
async function loadDashboard() {
  try {
    const res = await window.InterviewAI.api.fetch(`/profile/${user.id}`);
    const profile = await res.json().catch(() => null);

    const statusEl = document.getElementById("profileStatus");
    const startBtn = document.getElementById("startInterviewBtn");

    if (!res.ok) {
      statusEl.innerText = profile?.error || "Unable to load profile";
      statusEl.style.color = "red";
      startBtn.disabled = true;
      return;
    }

    if (!profile) {
      statusEl.innerText = "❌ Profile Incomplete";
      statusEl.style.color = "red";
      startBtn.disabled = true;
      return;
    }

    // PROFILE STATUS
    statusEl.innerText = "✅ Profile Completed";
    statusEl.style.color = "green";
    startBtn.disabled = false;

    // PROFILE COMPLETION
    const fields = Object.values(profile).filter(v => v).length;
    const percent = Math.min(Math.round((fields / 14) * 100), 100);

    document.getElementById("profileProgress").style.width = percent + "%";
    document.getElementById("profilePercent").innerText =
      `${percent}% Completed`;

    // SKILLS
    const skillsBox = document.getElementById("skillsBox");
    skillsBox.innerHTML = "";
    profile.skills.split(",").forEach(skill => {
      const span = document.createElement("span");
      span.className = "skill";
      span.innerText = skill.trim();
      skillsBox.appendChild(span);
    });

    // READINESS
    const readiness =
      percent >= 80 ? "High" :
      percent >= 50 ? "Medium" : "Low";

    document.getElementById("readinessLevel").innerText = readiness;
    document.getElementById("readinessMsg").innerText =
      readiness === "High"
        ? "You're interview ready 🚀"
        : "Complete profile to improve readiness";

  } catch (err) {
    console.error("Dashboard load failed", err);
  }
}

loadDashboard();

/* ================= START INTERVIEW ================= */
const startInterviewBtn = document.getElementById("startInterviewBtn");
if (startInterviewBtn) {
  startInterviewBtn.addEventListener("click", () => {
    window.location.href = "../interview/interview-setup.html";
  });
}
