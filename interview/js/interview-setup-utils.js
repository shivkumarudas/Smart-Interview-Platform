window.InterviewAISetup = window.InterviewAISetup || {};

window.InterviewAISetup.safeParseJson = function safeParseJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

window.InterviewAISetup.getTemplateIdFromUrl = function getTemplateIdFromUrl() {
  try {
    return new URLSearchParams(window.location.search).get("templateId") || "";
  } catch {
    return "";
  }
};

window.InterviewAISetup.setStatus = function setStatus(statusEl, message, isError) {
  if (!statusEl) return;
  statusEl.textContent = message || "";
  statusEl.style.color = isError ? "#fca5a5" : "#93c5fd";
};

window.InterviewAISetup.readConfigFromFields = function readConfigFromFields(fields) {
  return {
    interviewType: fields?.interviewTypeInput?.value || "",
    difficulty: fields?.difficultyInput?.value || "",
    duration: fields?.durationInput?.value || ""
  };
};

window.InterviewAISetup.applyConfigToFields = function applyConfigToFields(config, fields) {
  if (!config || typeof config !== "object") return;
  if (config.interviewType && fields?.interviewTypeInput) {
    fields.interviewTypeInput.value = config.interviewType;
  }
  if (config.difficulty && fields?.difficultyInput) {
    fields.difficultyInput.value = config.difficulty;
  }
  if (config.duration && fields?.durationInput) {
    fields.durationInput.value = String(config.duration);
  }
};
