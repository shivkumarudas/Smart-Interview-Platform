const user = JSON.parse(localStorage.getItem("user"));
if (!user) {
  window.location.href = "../auth/login.html";
}

const interviewConfig = JSON.parse(localStorage.getItem("interviewConfig")) || {};
const summary =
  JSON.parse(sessionStorage.getItem("interviewSummary")) ||
  JSON.parse(localStorage.getItem("lastInterviewSummary")) ||
  [];

const startedAtRaw = interviewConfig.startedAt;
const endedAtRaw =
  sessionStorage.getItem("interviewEndedAt") ||
  localStorage.getItem("lastInterviewEndedAt");

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

const downloadReport = document.getElementById("downloadReport");
const printReport = document.getElementById("printReport");
const startNewInterview = document.getElementById("startNewInterview");

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

const renderBadges = () => {
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
};

const renderStats = () => {
  const total = summary.length;
  const answered = summary.filter((item) => item.answer && item.answer.trim()).length;
  const feedbackTotal = summary.filter((item) => item.feedback && item.feedback.trim()).length;
  const wordCounts = summary
    .map((item) => (item.answer || "").trim().split(/\s+/).filter(Boolean).length)
    .filter((count) => count > 0);
  const avgWords = wordCounts.length
    ? Math.round(wordCounts.reduce((sum, count) => sum + count, 0) / wordCounts.length)
    : 0;

  totalQuestions.textContent = total;
  answeredQuestions.textContent = answered;
  feedbackCount.textContent = feedbackTotal;
  avgAnswerLength.textContent = `${avgWords} words`;
};

const renderList = () => {
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
    title.textContent = `Question ${index + 1}`;
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
};

const init = () => {
  if (candidateName) candidateName.textContent = user?.name || "Candidate";
  if (startedAt) startedAt.textContent = formatDate(startedAtRaw);
  if (endedAt) endedAt.textContent = formatDate(endedAtRaw);
  if (duration) duration.textContent = formatDuration(startedAtRaw, endedAtRaw);

  renderBadges();
  renderStats();
  renderList();
};

if (downloadReport) {
  downloadReport.addEventListener("click", () => {
    const payload = {
      user: { name: user?.name || "Candidate", email: user?.email || "" },
      interviewConfig,
      startedAt: startedAtRaw || null,
      endedAt: endedAtRaw || null,
      summary
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

init();
