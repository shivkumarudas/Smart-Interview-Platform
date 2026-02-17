function safeParseJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getCurrentUser() {
  return safeParseJson(localStorage.getItem("user"));
}

function requireAuth(redirectPath = "../auth/login.html") {
  const user = getCurrentUser();
  const token =
    String(localStorage.getItem("INTERVIEWAI_AUTH_TOKEN") || "").trim() ||
    String(localStorage.getItem("authToken") || "").trim();

  if (!user || !user.id || !token) {
    window.location.href = redirectPath;
    return null;
  }
  return user;
}

function logout() {
  localStorage.removeItem("user");
  localStorage.removeItem("INTERVIEWAI_AUTH_TOKEN");
  localStorage.removeItem("authToken");
  localStorage.removeItem("interviewConfig");
  localStorage.removeItem("lastInterviewSummary");
  localStorage.removeItem("lastInterviewEndedAt");

  sessionStorage.removeItem("interviewSummary");
  sessionStorage.removeItem("interviewEndedAt");

  window.location.href = "../index.html";
}

window.InterviewAI = window.InterviewAI || {};
window.InterviewAI.getCurrentUser = getCurrentUser;
window.InterviewAI.requireAuth = requireAuth;
window.logout = logout;
