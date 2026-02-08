console.log("dashboard.js loaded");

function safeParseJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

const user = safeParseJson(localStorage.getItem("user"));
if (!user || !user.id) {
  window.location.href = "../auth/login.html";
}

const api = window.InterviewAI?.api || null;
const practice = window.InterviewAI?.practice || null;

const welcomeEl = document.getElementById("welcomeText");
if (welcomeEl) {
  welcomeEl.innerText = `Welcome, ${user?.name || user?.email || "Candidate"}`;
}

const startInterviewBtn = document.getElementById("startInterviewBtn");
if (startInterviewBtn) {
  startInterviewBtn.addEventListener("click", () => {
    window.location.href = "../interview/interview-setup.html";
  });
}

const openPracticeHubBtn = document.getElementById("openPracticeHub");
if (openPracticeHubBtn) {
  openPracticeHubBtn.addEventListener("click", () => {
    window.location.href = "../practice/practice.html";
  });
}

async function loadDashboard() {
  try {
    const res = await api.fetch(`/profile/${user.id}`);
    const profile = await res.json().catch(() => null);

    const statusEl = document.getElementById("profileStatus");

    if (!res.ok || !profile) {
      statusEl.innerText = profile?.error || "Profile incomplete";
      statusEl.style.color = "red";
      if (startInterviewBtn) startInterviewBtn.disabled = true;
      return;
    }

    statusEl.innerText = "Profile completed";
    statusEl.style.color = "green";
    if (startInterviewBtn) startInterviewBtn.disabled = false;

    const completionFields = [
      "name",
      "email",
      "phone",
      "location",
      "education",
      "experienceYears",
      "experience",
      "role",
      "skills",
      "linkedin",
      "interviewType",
      "availability",
      "language"
    ];

    const completedCount = completionFields.filter((key) => {
      const value = profile[key];
      return value !== null && value !== undefined && String(value).trim() !== "";
    }).length;

    const percent = Math.round((completedCount / completionFields.length) * 100);

    const profileProgress = document.getElementById("profileProgress");
    const profilePercent = document.getElementById("profilePercent");
    if (profileProgress) profileProgress.style.width = `${percent}%`;
    if (profilePercent) profilePercent.innerText = `${percent}% Completed`;

    const skillsBox = document.getElementById("skillsBox");
    if (skillsBox) {
      const skills = String(profile.skills || "")
        .split(",")
        .map((skill) => skill.trim())
        .filter(Boolean);

      skillsBox.innerHTML = "";
      if (!skills.length) {
        const span = document.createElement("span");
        span.className = "skill";
        span.innerText = "-";
        skillsBox.appendChild(span);
      } else {
        skills.forEach((skill) => {
          const span = document.createElement("span");
          span.className = "skill";
          span.innerText = skill;
          skillsBox.appendChild(span);
        });
      }
    }

    const readiness = percent >= 80 ? "High" : percent >= 50 ? "Medium" : "Low";
    const readinessLevel = document.getElementById("readinessLevel");
    const readinessMsg = document.getElementById("readinessMsg");

    if (readinessLevel) readinessLevel.innerText = readiness;
    if (readinessMsg) {
      readinessMsg.innerText =
        readiness === "High"
          ? "You are interview ready."
          : "Complete your profile to improve readiness.";
    }
  } catch (err) {
    console.error("Dashboard load failed", err);
  }
}

async function loadWeeklyGoal() {
  const weeklyGoalFill = document.getElementById("weeklyGoalFill");
  const weeklyGoalText = document.getElementById("weeklyGoalText");
  if (!weeklyGoalFill || !weeklyGoalText) return;

  if (!practice) {
    weeklyGoalText.innerText = "Practice tracking unavailable";
    return;
  }

  const goals = practice.getGoals();
  const events = practice.getPracticeEvents();
  let sessions = [];

  if (api) {
    try {
      const res = await api.fetch(`/interview/sessions?userId=${encodeURIComponent(user.id)}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data?.sessions)) {
        sessions = data.sessions;
      }
    } catch {
      // ignore and continue with local events only
    }
  }

  const progress = practice.calculateWeeklyProgress({
    sessions,
    events,
    goals
  });

  weeklyGoalFill.style.width = `${progress.interviewPercent}%`;
  weeklyGoalText.innerText =
    `${progress.interviewsThisWeek}/${progress.interviewGoal} interviews this week | ` +
    `${progress.streakDays} day streak`;
}

loadDashboard();
loadWeeklyGoal();
