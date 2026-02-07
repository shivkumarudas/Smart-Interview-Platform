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

const qaList = document.getElementById("qaList");
const emptyState = document.getElementById("emptyState");

const candidateName = document.getElementById("candidateName");
const configBadges = document.getElementById("configBadges");
const startedAt = document.getElementById("startedAt");
const endedAt = document.getElementById("endedAt");
const duration = document.getElementById("duration");

const totalQuestions = document.getElementById("totalQuestions");
const answeredQuestions = document.getElementById("answeredQuestions");
const avgAnswerLength = document.getElementById("avgAnswerLength");
const feedbackCount = document.getElementById("feedbackCount");
const avgScore = document.getElementById("avgScore");

const downloadReport = document.getElementById("downloadReport");
const printReport = document.getElementById("printReport");
const startNewInterview = document.getElementById("startNewInterview");
const sessionSelect = document.getElementById("sessionSelect");

const formatDate = (value) => {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString();
};

const formatDuration = (startValue, endValue) => {
  if (!startValue || !endValue) return "--";
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "--";
  const diffMs = Math.max(0, end - start);
  const minutes = Math.floor(diffMs / 60000);
  const seconds = Math.floor((diffMs % 60000) / 1000);
  if (minutes === 0 && seconds === 0) return "< 1 min";
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
};

function formatEvaluation(rawText, parsedJson) {
  const raw = String(rawText || "").trim();
  if (!parsedJson || typeof parsedJson !== "object") return raw;

  const score = parsedJson.score ?? parsedJson.rating ?? null;
  const overallFeedback = parsedJson.overallFeedback || parsedJson.summary || "";

  const strengths = Array.isArray(parsedJson.strengths)
    ? parsedJson.strengths.filter(Boolean).join("; ")
    : parsedJson.strengths;
  const improvements = Array.isArray(parsedJson.improvements)
    ? parsedJson.improvements.filter(Boolean).join("; ")
    : parsedJson.improvements;
  const communication = Array.isArray(parsedJson.communication)
    ? parsedJson.communication.filter(Boolean).join("; ")
    : parsedJson.communication;
  const betterAnswer = parsedJson.betterAnswer || "";
  const followUpQuestion = parsedJson.followUpQuestion || "";

  const lines = [];
  if (score !== null && score !== undefined && String(score).trim() !== "") {
    lines.push(`Score: ${score}/10`);
  }
  if (overallFeedback) lines.push(`Overall: ${overallFeedback}`);
  if (strengths) lines.push(`Strengths: ${strengths}`);
  if (improvements) lines.push(`Improvements: ${improvements}`);
  if (communication) lines.push(`Communication: ${communication}`);
  if (betterAnswer) lines.push(`Better Answer: ${betterAnswer}`);
  if (followUpQuestion) lines.push(`Follow-up: ${followUpQuestion}`);

  return lines.length ? lines.join("\n") : raw;
}

let interviewConfig = safeParseJson(localStorage.getItem("interviewConfig")) || {};
let summary =
  safeParseJson(sessionStorage.getItem("interviewSummary")) ||
  safeParseJson(localStorage.getItem("lastInterviewSummary")) ||
  [];

if (!Array.isArray(summary)) summary = [];

let startedAtRaw = interviewConfig.startedAt || null;
let endedAtRaw =
  sessionStorage.getItem("interviewEndedAt") ||
  localStorage.getItem("lastInterviewEndedAt") ||
  null;

const localFallback = {
  interviewConfig: { ...(interviewConfig || {}) },
  summary: summary.map((entry) => ({ ...entry })),
  startedAtRaw,
  endedAtRaw
};

let activeSessionId = null;
let loadedSession = null;

function getCandidateDisplayName() {
  const fromSession = loadedSession?.profileSnapshot?.name;
  return String(fromSession || user.name || user.email || "Candidate").trim();
}

function renderBadges() {
  if (!configBadges) return;
  configBadges.innerHTML = "";
  const items = [];

  if (interviewConfig.interviewType) {
    items.push(`Type: ${interviewConfig.interviewType}`);
  }
  if (interviewConfig.difficulty) {
    items.push(`Difficulty: ${interviewConfig.difficulty}`);
  }
  if (interviewConfig.duration) {
    items.push(`Duration: ${interviewConfig.duration} min`);
  }

  items.forEach((text) => {
    const span = document.createElement("span");
    span.className = "badge";
    span.textContent = text;
    configBadges.appendChild(span);
  });
}

function renderStats() {
  const total = summary.length;
  const answered = summary.filter((item) => item.answer && String(item.answer).trim()).length;
  const feedbackTotal = summary.filter((item) => item.feedback && String(item.feedback).trim()).length;

  const wordCounts = summary
    .map((item) => String(item.answer || "").trim().split(/\s+/).filter(Boolean).length)
    .filter((count) => count > 0);

  const avgWords = wordCounts.length
    ? Math.round(wordCounts.reduce((sum, count) => sum + count, 0) / wordCounts.length)
    : 0;

  const scores = summary
    .map((item) => Number(item.score))
    .filter((value) => Number.isFinite(value));

  const avgScoreValue = scores.length
    ? Math.round((scores.reduce((sum, value) => sum + value, 0) / scores.length) * 10) / 10
    : null;

  if (totalQuestions) totalQuestions.textContent = total;
  if (answeredQuestions) answeredQuestions.textContent = answered;
  if (feedbackCount) feedbackCount.textContent = feedbackTotal;
  if (avgAnswerLength) avgAnswerLength.textContent = `${avgWords} words`;
  if (avgScore) avgScore.textContent = avgScoreValue === null ? "--" : `${avgScoreValue}/10`;
}

function renderList() {
  if (!qaList) return;
  qaList.innerHTML = "";

  if (!summary.length) {
    if (emptyState) emptyState.style.display = "block";
    return;
  }

  if (emptyState) emptyState.style.display = "none";

  summary.forEach((entry, index) => {
    const card = document.createElement("div");
    card.className = "qa-card";

    const title = document.createElement("h4");
    const scoreText = Number.isFinite(Number(entry.score)) ? ` | Score ${entry.score}/10` : "";
    title.textContent = `Question ${index + 1}${scoreText}`;
    card.appendChild(title);

    const question = document.createElement("div");
    question.className = "qa-item";
    question.innerHTML = `<span class="label">Question</span><p></p>`;
    question.querySelector("p").textContent = entry.question || "Question not available.";
    card.appendChild(question);

    const answer = document.createElement("div");
    answer.className = "qa-item";
    answer.innerHTML = `<span class="label">Answer</span><p></p>`;
    answer.querySelector("p").textContent = entry.answer || "No answer recorded.";
    card.appendChild(answer);

    const feedback = document.createElement("div");
    feedback.className = "qa-item";
    feedback.innerHTML = `<span class="label">Feedback</span><p></p>`;
    feedback.querySelector("p").textContent = entry.feedback || "No feedback recorded.";
    card.appendChild(feedback);

    qaList.appendChild(card);
  });
}

function renderAll() {
  if (candidateName) candidateName.textContent = getCandidateDisplayName();
  if (startedAt) startedAt.textContent = formatDate(startedAtRaw);
  if (endedAt) endedAt.textContent = formatDate(endedAtRaw);
  if (duration) duration.textContent = formatDuration(startedAtRaw, endedAtRaw);

  renderBadges();
  renderStats();
  renderList();
}

function mapSessionToSummary(session) {
  const entries = Array.isArray(session?.entries) ? session.entries.slice() : [];
  entries.sort((a, b) => (Number(a?.index) || 0) - (Number(b?.index) || 0));

  return entries.map((entry) => {
    const evaluationText = String(entry?.evaluation || "").trim();
    const evaluationJson = entry?.evaluationJson && typeof entry.evaluationJson === "object"
      ? entry.evaluationJson
      : null;

    const feedback = formatEvaluation(evaluationText, evaluationJson) || evaluationText;
    const scoreValue = entry?.score ?? evaluationJson?.score ?? null;

    return {
      question: String(entry?.question || "").trim(),
      answer: String(entry?.answer || "").trim(),
      feedback: feedback || "",
      score: Number.isFinite(Number(scoreValue)) ? Number(scoreValue) : null
    };
  });
}

function getSessionIdFromUrl() {
  try {
    return new URLSearchParams(window.location.search).get("sessionId");
  } catch {
    return null;
  }
}

function setSessionIdInUrl(sessionId) {
  try {
    const url = new URL(window.location.href);
    if (sessionId) url.searchParams.set("sessionId", sessionId);
    else url.searchParams.delete("sessionId");
    window.history.replaceState({}, "", url.toString());
  } catch {
    // ignore
  }
}

async function hydrateFromBackendSession(sessionId) {
  if (!api || !sessionId) return false;

  try {
    const res = await api.fetch(`/interview/session/${sessionId}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.session) return false;

    loadedSession = data.session;
    activeSessionId = sessionId;

    localStorage.setItem("lastInterviewSessionId", sessionId);
    setSessionIdInUrl(sessionId);

    interviewConfig =
      loadedSession.config && typeof loadedSession.config === "object"
        ? loadedSession.config
        : {};

    summary = mapSessionToSummary(loadedSession);
    startedAtRaw = loadedSession.startedAt || localFallback.startedAtRaw;
    endedAtRaw = loadedSession.endedAt || localFallback.endedAtRaw;

    // Also update local fallbacks so the report still works offline later.
    localStorage.setItem("interviewConfig", JSON.stringify(interviewConfig));
    localStorage.setItem("lastInterviewSummary", JSON.stringify(summary));
    if (startedAtRaw) {
      localStorage.setItem(
        "interviewConfig",
        JSON.stringify({ ...(interviewConfig || {}), startedAt: startedAtRaw })
      );
    }
    if (endedAtRaw) {
      localStorage.setItem("lastInterviewEndedAt", String(endedAtRaw));
    }

    renderAll();
    return true;
  } catch {
    return false;
  }
}

function restoreLocalFallback() {
  loadedSession = null;
  activeSessionId = null;
  setSessionIdInUrl(null);

  interviewConfig = { ...(localFallback.interviewConfig || {}) };
  summary = Array.isArray(localFallback.summary)
    ? localFallback.summary.map((entry) => ({ ...entry }))
    : [];
  startedAtRaw = localFallback.startedAtRaw;
  endedAtRaw = localFallback.endedAtRaw;

  renderAll();
}

async function populateSessionSelect() {
  if (!sessionSelect) return;

  sessionSelect.innerHTML = "";
  sessionSelect.disabled = true;

  const loading = document.createElement("option");
  loading.value = "";
  loading.textContent = "Loading saved sessions...";
  sessionSelect.appendChild(loading);

  if (!api) {
    loading.textContent = "Saved sessions unavailable";
    return;
  }

  try {
    const res = await api.fetch(`/interview/sessions?userId=${encodeURIComponent(user.id)}`);
    const data = await res.json().catch(() => ({}));
    const sessions = Array.isArray(data?.sessions) ? data.sessions : [];

    sessionSelect.innerHTML = "";

    const localOption = document.createElement("option");
    localOption.value = "";
    localOption.textContent = "Latest (local)";
    sessionSelect.appendChild(localOption);

    sessions.forEach((session) => {
      const option = document.createElement("option");
      option.value = session?._id || "";
      const type = session?.config?.interviewType || "Interview";
      const difficulty = session?.config?.difficulty ? ` | ${session.config.difficulty}` : "";
      const status = session?.endedAt ? "" : " | In progress";
      option.textContent = `${formatDate(session?.startedAt)} | ${type}${difficulty}${status}`;
      sessionSelect.appendChild(option);
    });

    if (!sessions.length) {
      sessionSelect.disabled = true;
      localOption.textContent = "No saved sessions (showing local)";
      return;
    }

    const preferred =
      activeSessionId ||
      getSessionIdFromUrl() ||
      localStorage.getItem("lastInterviewSessionId") ||
      "";

    sessionSelect.value = preferred;
    sessionSelect.disabled = false;
  } catch {
    sessionSelect.innerHTML = "";
    const unavailable = document.createElement("option");
    unavailable.value = "";
    unavailable.textContent = "Saved sessions unavailable (showing local)";
    sessionSelect.appendChild(unavailable);
    sessionSelect.disabled = true;
  }
}

if (sessionSelect) {
  sessionSelect.addEventListener("change", async () => {
    const selected = String(sessionSelect.value || "").trim();
    if (!selected) {
      restoreLocalFallback();
      return;
    }

    const ok = await hydrateFromBackendSession(selected);
    if (!ok) {
      restoreLocalFallback();
    }
  });
}

if (downloadReport) {
  downloadReport.addEventListener("click", () => {
    const payload = {
      user: { id: user.id, name: user?.name || "Candidate", email: user?.email || "" },
      activeSessionId: activeSessionId || null,
      interviewConfig,
      startedAt: startedAtRaw || null,
      endedAt: endedAtRaw || null,
      summary,
      serverSession: loadedSession || null
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "interview-report.json";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  });
}

if (printReport) {
  printReport.addEventListener("click", () => window.print());
}

if (startNewInterview) {
  startNewInterview.addEventListener("click", () => {
    window.location.href = "../interview/interview-setup.html";
  });
}

async function init() {
  renderAll();

  const preferredSessionId =
    getSessionIdFromUrl() ||
    localStorage.getItem("lastInterviewSessionId") ||
    null;

  if (preferredSessionId) {
    await hydrateFromBackendSession(preferredSessionId);
  }

  await populateSessionSelect();
}

init();
