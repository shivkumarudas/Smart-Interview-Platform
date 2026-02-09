console.log("Interview setup loaded");

const setupUtils = window.InterviewAISetup || {};
const safeParseJson =
  setupUtils.safeParseJson ||
  ((value) => {
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  });

const getTemplateIdFromUrlHelper =
  setupUtils.getTemplateIdFromUrl ||
  (() => {
    try {
      return new URLSearchParams(window.location.search).get("templateId") || "";
    } catch {
      return "";
    }
  });

const setStatusHelper =
  setupUtils.setStatus ||
  ((statusEl, message, isError) => {
    if (!statusEl) return;
    statusEl.textContent = message || "";
    statusEl.style.color = isError ? "#fca5a5" : "#93c5fd";
  });

const readConfigFromFields =
  setupUtils.readConfigFromFields ||
  ((fields) => ({
    interviewType: fields?.interviewTypeInput?.value || "",
    difficulty: fields?.difficultyInput?.value || "",
    duration: fields?.durationInput?.value || ""
  }));

const applyConfigToFields =
  setupUtils.applyConfigToFields ||
  ((config, fields) => {
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
  });

const user = safeParseJson(localStorage.getItem("user"));
if (!user || !user.id) {
  window.location.href = "../auth/login.html";
}

const practice = window.InterviewAI?.practice || null;
const ACTIVE_TEMPLATE_KEY = "INTERVIEWAI_ACTIVE_TEMPLATE_ID";

const form = document.getElementById("setupForm");
const savedTemplateSelect = document.getElementById("savedTemplate");
const interviewTypeInput = document.getElementById("interviewType");
const difficultyInput = document.getElementById("difficulty");
const durationInput = document.getElementById("duration");
const templateNameInput = document.getElementById("templateName");
const saveTemplateBtn = document.getElementById("saveTemplateBtn");
const setupStatus = document.getElementById("setupStatus");

const configFields = {
  interviewTypeInput,
  difficultyInput,
  durationInput
};

function setStatus(message, isError = false) {
  setStatusHelper(setupStatus, message, isError);
}

function getTemplateIdFromUrl() {
  return getTemplateIdFromUrlHelper();
}

function getCurrentConfig() {
  return readConfigFromFields(configFields);
}

function applyConfig(config) {
  applyConfigToFields(config, configFields);
}

function renderTemplateOptions() {
  savedTemplateSelect.innerHTML = "";

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "Start from scratch";
  savedTemplateSelect.appendChild(defaultOption);

  if (!practice) return;

  const templates = practice.getTemplates();
  templates.forEach((template) => {
    const option = document.createElement("option");
    option.value = template.id;
    option.textContent = `${template.name} (${template.interviewType}, ${template.difficulty})`;
    savedTemplateSelect.appendChild(option);
  });
}

function applyTemplate(templateId) {
  if (!practice || !templateId) return false;

  const template = practice.getTemplateById(templateId);
  if (!template) return false;

  applyConfig(template);

  if (templateNameInput && !templateNameInput.value.trim()) {
    templateNameInput.value = template.name;
  }

  return true;
}

function startInterview() {
  const config = {
    ...getCurrentConfig(),
    startedAt: new Date().toISOString()
  };

  if (!config.interviewType || !config.difficulty || !config.duration) {
    setStatus("Please complete all required fields.", true);
    return;
  }

  const selectedTemplateId = savedTemplateSelect.value;
  if (selectedTemplateId && practice) {
    const template = practice.getTemplateById(selectedTemplateId);
    if (template) {
      config.templateId = template.id;
      config.templateName = template.name;
      localStorage.setItem(ACTIVE_TEMPLATE_KEY, template.id);
    }
  } else {
    localStorage.removeItem(ACTIVE_TEMPLATE_KEY);
  }

  localStorage.setItem("interviewConfig", JSON.stringify(config));
  window.location.href = "../interview/interview-room.html";
}

if (savedTemplateSelect) {
  savedTemplateSelect.addEventListener("change", () => {
    const selected = savedTemplateSelect.value;
    if (!selected) {
      setStatus("Using manual setup.");
      return;
    }

    const ok = applyTemplate(selected);
    if (ok) {
      localStorage.setItem(ACTIVE_TEMPLATE_KEY, selected);
      setStatus("Template applied.");
    } else {
      setStatus("Unable to load selected template.", true);
    }
  });
}

if (saveTemplateBtn) {
  saveTemplateBtn.addEventListener("click", () => {
    if (!practice) {
      setStatus("Template tools unavailable.", true);
      return;
    }

    const config = getCurrentConfig();
    if (!config.interviewType || !config.difficulty || !config.duration) {
      setStatus("Select type, difficulty, and duration before saving.", true);
      return;
    }

    const name = (templateNameInput.value || "").trim();
    const defaultName = `${config.interviewType} ${config.difficulty} ${config.duration}m`;

    try {
      const template = practice.saveTemplate({
        name: name || defaultName,
        interviewType: config.interviewType,
        difficulty: config.difficulty,
        duration: config.duration,
        notes: ""
      });

      renderTemplateOptions();
      savedTemplateSelect.value = template.id;
      localStorage.setItem(ACTIVE_TEMPLATE_KEY, template.id);
      setStatus(`Template "${template.name}" saved.`);
    } catch {
      setStatus("Could not save template.", true);
    }
  });
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  startInterview();
});

function init() {
  renderTemplateOptions();

  const existingConfig = safeParseJson(localStorage.getItem("interviewConfig"));
  if (existingConfig) {
    applyConfig(existingConfig);
  }

  const preferredTemplateId =
    getTemplateIdFromUrl() ||
    localStorage.getItem(ACTIVE_TEMPLATE_KEY) ||
    "";

  if (preferredTemplateId && practice) {
    const ok = applyTemplate(preferredTemplateId);
    if (ok) {
      savedTemplateSelect.value = preferredTemplateId;
      localStorage.setItem(ACTIVE_TEMPLATE_KEY, preferredTemplateId);
      setStatus("Template preloaded.");
    }
  }
}

init();
