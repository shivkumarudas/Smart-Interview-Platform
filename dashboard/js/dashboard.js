console.log("dashboard.js loaded");

function safeParseJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

const user = safeParseJson(localStorage.getItem("user"));
if (!user || !user.id) {
  window.location.href = "../auth/login.html";
}

const api = window.InterviewAI?.api || null;
const practice = window.InterviewAI?.practice || null;

const completionFieldConfig = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "location", label: "Location" },
  { key: "education", label: "Education" },
  { key: "experienceYears", label: "Experience Years" },
  { key: "experience", label: "Experience Summary" },
  { key: "role", label: "Target Role" },
  { key: "skills", label: "Skills" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "interviewType", label: "Interview Type" },
  { key: "availability", label: "Availability" },
  { key: "language", label: "Preferred Language" }
];

const welcomeEl = document.getElementById("welcomeText");
const dashboardSubtitleEl = document.getElementById("dashboardSubtitle");
const profileStatusEl = document.getElementById("profileStatus");
const profileProgressEl = document.getElementById("profileProgress");
const profilePercentEl = document.getElementById("profilePercent");
const skillsBoxEl = document.getElementById("skillsBox");
const readinessLevelEl = document.getElementById("readinessLevel");
const readinessMsgEl = document.getElementById("readinessMsg");
const profileGapsListEl = document.getElementById("profileGapsList");
const aiSuggestionsListEl = document.getElementById("aiSuggestionsList");

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

if (welcomeEl) {
  welcomeEl.innerText = `Welcome, ${user?.name || user?.email || "Candidate"}`;
}

if (dashboardSubtitleEl) {
  const now = new Date();
  const dateLabel = now.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
  dashboardSubtitleEl.innerText = `Track progress, close profile gaps, and stay interview-ready. ${dateLabel}`;
}

function updateQuickValue(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerText = value;
}

function setStatusBadge(status, text) {
  if (!profileStatusEl) return;

  profileStatusEl.classList.remove("status-success", "status-warning", "status-neutral");

  if (status === "success") {
    profileStatusEl.classList.add("status-success");
  } else if (status === "warning") {
    profileStatusEl.classList.add("status-warning");
  } else {
    profileStatusEl.classList.add("status-neutral");
  }

  profileStatusEl.innerText = text;
}

function setReadiness(readiness) {
  const value = readiness === "High" || readiness === "Medium" ? readiness : "Low";

  if (readinessLevelEl) {
    readinessLevelEl.innerText = value;
    readinessLevelEl.classList.remove("readiness-high", "readiness-medium", "readiness-low");
    readinessLevelEl.classList.add(`readiness-${value.toLowerCase()}`);
  }

  if (readinessMsgEl) {
    readinessMsgEl.innerText =
      value === "High"
        ? "You are interview ready. Keep your momentum with focused mocks."
        : value === "Medium"
          ? "You are close. Fill missing profile details and run a timed mock."
          : "Complete your profile basics to improve readiness and question quality.";
  }

  updateQuickValue("quickReadiness", value);
}

function extractSkills(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeText(item))
      .filter(Boolean);
  }

  return normalizeText(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function renderSkills(skills) {
  if (!skillsBoxEl) return;

  skillsBoxEl.innerHTML = "";

  if (!skills.length) {
    const fallback = document.createElement("span");
    fallback.className = "skill";
    fallback.innerText = "No skills added yet";
    skillsBoxEl.appendChild(fallback);
    return;
  }

  skills.forEach((skill) => {
    const chip = document.createElement("span");
    chip.className = "skill";
    chip.innerText = skill;
    skillsBoxEl.appendChild(chip);
  });
}

function renderProfileGaps(missingFields) {
  if (!profileGapsListEl) return;

  profileGapsListEl.innerHTML = "";

  if (!missingFields.length) {
    const item = document.createElement("li");
    item.innerText = "No critical gaps detected. Your profile looks complete.";
    profileGapsListEl.appendChild(item);
    return;
  }

  missingFields.slice(0, 5).forEach((label) => {
    const item = document.createElement("li");
    item.innerText = `Add ${label}`;
    profileGapsListEl.appendChild(item);
  });
}

function renderSuggestions(input) {
  if (!aiSuggestionsListEl) return;

  const { readiness, missingFields, hasSkills } = input;
  const suggestions = [];

  if (missingFields.length) {
    suggestions.push(`Complete ${missingFields.slice(0, 2).join(" and ")} for stronger interview personalization.`);
  }

  if (!hasSkills) {
    suggestions.push("Add at least 5 role-relevant skills so technical rounds match your target jobs.");
  }

  if (readiness === "High") {
    suggestions.push("Run one full mixed interview and review feedback before your next real application.");
  } else if (readiness === "Medium") {
    suggestions.push("Schedule two focused mock sessions this week to close your remaining gaps.");
  } else {
    suggestions.push("Start with a short practice session and improve one weak area each day.");
  }

  suggestions.push("Review your report trends weekly and track progress in the Practice Hub.");

  aiSuggestionsListEl.innerHTML = "";
  suggestions.slice(0, 4).forEach((text) => {
    const item = document.createElement("li");
    item.innerText = text;
    aiSuggestionsListEl.appendChild(item);
  });
}

function isFieldComplete(profile, key) {
  const value = profile?.[key];

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return normalizeText(value) !== "";
}

async function loadDashboard() {
  if (!api) {
    setStatusBadge("warning", "Backend unavailable");
    setReadiness("Low");
    if (startInterviewBtn) startInterviewBtn.disabled = true;
    renderProfileGaps(["Name", "Role", "Skills"]);
    renderSuggestions({ readiness: "Low", missingFields: ["Name", "Role", "Skills"], hasSkills: false });
    return;
  }

  try {
    const res = await api.fetch(`/profile/${user.id}`);
    const profile = await res.json().catch(() => null);

    if (!res.ok || !profile) {
      setStatusBadge("warning", profile?.error || "Profile incomplete");
      setReadiness("Low");
      if (startInterviewBtn) startInterviewBtn.disabled = true;
      renderProfileGaps(["Name", "Role", "Skills"]);
      renderSuggestions({ readiness: "Low", missingFields: ["Name", "Role", "Skills"], hasSkills: false });
      return;
    }

    const completedCount = completionFieldConfig.filter((field) => isFieldComplete(profile, field.key)).length;
    const percent = Math.round((completedCount / completionFieldConfig.length) * 100);

    if (profileProgressEl) profileProgressEl.style.width = `${percent}%`;
    if (profilePercentEl) profilePercentEl.innerText = `${percent}% Completed`;
    updateQuickValue("quickProfilePercent", `${percent}%`);

    setStatusBadge(percent >= 80 ? "success" : "neutral", percent >= 80 ? "Profile completed" : "Profile in progress");
    if (startInterviewBtn) startInterviewBtn.disabled = false;

    const skills = extractSkills(profile.skills);
    renderSkills(skills);

    const missingFields = completionFieldConfig
      .filter((field) => !isFieldComplete(profile, field.key))
      .map((field) => field.label);

    renderProfileGaps(missingFields);

    const readiness = percent >= 80 ? "High" : percent >= 50 ? "Medium" : "Low";
    setReadiness(readiness);

    renderSuggestions({
      readiness,
      missingFields,
      hasSkills: skills.length > 0
    });
  } catch (error) {
    console.error("Dashboard load failed", error);
    setStatusBadge("warning", "Could not load profile");
    setReadiness("Low");
    if (startInterviewBtn) startInterviewBtn.disabled = true;
  }
}

async function loadWeeklyGoal() {
  const weeklyGoalFill = document.getElementById("weeklyGoalFill");
  const weeklyGoalText = document.getElementById("weeklyGoalText");
  if (!weeklyGoalFill || !weeklyGoalText) return;

  if (!practice) {
    weeklyGoalText.innerText = "Practice tracking unavailable";
    updateQuickValue("quickWeeklyGoal", "--");
    updateQuickValue("quickStreak", "--");
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
      // Continue with local data only.
    }
  }

  const progress = practice.calculateWeeklyProgress({
    sessions,
    events,
    goals
  });

  weeklyGoalFill.style.width = `${progress.interviewPercent}%`;
  weeklyGoalText.innerText =
    `${progress.interviewsThisWeek}/${progress.interviewGoal} interviews, ` +
    `${progress.questionsThisWeek}/${progress.questionGoal} questions this week`;

  const streakLabel = `${progress.streakDays} day${progress.streakDays === 1 ? "" : "s"}`;
  updateQuickValue("quickWeeklyGoal", `${progress.interviewsThisWeek}/${progress.interviewGoal}`);
  updateQuickValue("quickStreak", streakLabel);
}

loadDashboard();
loadWeeklyGoal();
