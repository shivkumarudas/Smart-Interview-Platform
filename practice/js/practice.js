console.log("practice.js loaded");

(() => {
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
    return;
  }

  const api = window.InterviewAI?.api || null;
  const practice = window.InterviewAI?.practice || null;

  if (!practice) {
    alert("Practice tools unavailable. Please refresh the page.");
    return;
  }

  const goalForm = document.getElementById("goalForm");
  const weeklyInterviewsInput = document.getElementById("weeklyInterviews");
  const weeklyQuestionsInput = document.getElementById("weeklyQuestions");
  const goalStatus = document.getElementById("goalStatus");

  const interviewGoalText = document.getElementById("interviewGoalText");
  const questionGoalText = document.getElementById("questionGoalText");
  const interviewGoalBar = document.getElementById("interviewGoalBar");
  const questionGoalBar = document.getElementById("questionGoalBar");
  const streakText = document.getElementById("streakText");
  const weekRangeText = document.getElementById("weekRangeText");

  const templateForm = document.getElementById("templateForm");
  const templateIdInput = document.getElementById("templateId");
  const templateNameInput = document.getElementById("templateName");
  const templateTypeInput = document.getElementById("templateType");
  const templateDifficultyInput = document.getElementById("templateDifficulty");
  const templateDurationInput = document.getElementById("templateDuration");
  const templateNotesInput = document.getElementById("templateNotes");
  const saveTemplateBtn = document.getElementById("saveTemplateBtn");
  const resetTemplateBtn = document.getElementById("resetTemplateBtn");
  const templateList = document.getElementById("templateList");
  const templateEmpty = document.getElementById("templateEmpty");

  const activityList = document.getElementById("activityList");
  const activityEmpty = document.getElementById("activityEmpty");

  let sessions = [];
  let sessionsUnavailable = false;

  const TEMPLATE_SEED_KEY = "INTERVIEWAI_TEMPLATE_SEEDED";

  function pluralize(value, singular, plural) {
    return `${value} ${value === 1 ? singular : plural}`;
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";
    return date.toLocaleString();
  }

  function formatDateShort(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function setProgress(el, percent) {
    if (!el) return;
    const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
    el.style.width = `${clamped}%`;
  }

  function showGoalStatus(message, isError = false) {
    if (!goalStatus) return;
    goalStatus.textContent = message || "";
    goalStatus.style.color = isError ? "#b42323" : "#5d6e86";
  }

  function clearTemplateForm() {
    templateIdInput.value = "";
    templateNameInput.value = "";
    templateTypeInput.value = "";
    templateDifficultyInput.value = "";
    templateDurationInput.value = "15";
    templateNotesInput.value = "";
    saveTemplateBtn.textContent = "Save Template";
  }

  function fillTemplateForm(template) {
    templateIdInput.value = template.id;
    templateNameInput.value = template.name;
    templateTypeInput.value = template.interviewType;
    templateDifficultyInput.value = template.difficulty;
    templateDurationInput.value = String(template.duration || "15");
    templateNotesInput.value = template.notes || "";
    saveTemplateBtn.textContent = "Update Template";
  }

  function startWithTemplate(template) {
    const config = practice.templateToInterviewConfig(template, {
      templateId: template.id,
      templateName: template.name
    });

    localStorage.setItem("interviewConfig", JSON.stringify(config));
    localStorage.setItem("INTERVIEWAI_ACTIVE_TEMPLATE_ID", template.id);
    window.location.href = "../interview/interview-room.html";
  }

  function openSetupWithTemplate(template) {
    const url = new URL("../interview/interview-setup.html", window.location.href);
    url.searchParams.set("templateId", template.id);
    localStorage.setItem("INTERVIEWAI_ACTIVE_TEMPLATE_ID", template.id);
    window.location.href = url.toString();
  }

  function renderTemplates() {
    const templates = practice.getTemplates();
    templateList.innerHTML = "";

    if (!templates.length) {
      templateEmpty.style.display = "block";
      return;
    }

    templateEmpty.style.display = "none";

    templates.forEach((template) => {
      const item = document.createElement("div");
      item.className = "template-item";

      const details = document.createElement("div");
      details.innerHTML = `
        <h3>${template.name}</h3>
        <p class="template-meta">${template.interviewType} | ${template.difficulty} | ${template.duration} min</p>
        ${template.notes ? `<p class="template-notes">${template.notes}</p>` : ""}
      `;

      const actions = document.createElement("div");
      actions.className = "actions";

      const startBtn = document.createElement("button");
      startBtn.type = "button";
      startBtn.className = "small-btn primary";
      startBtn.textContent = "Start";
      startBtn.addEventListener("click", () => startWithTemplate(template));

      const setupBtn = document.createElement("button");
      setupBtn.type = "button";
      setupBtn.className = "small-btn";
      setupBtn.textContent = "Open Setup";
      setupBtn.addEventListener("click", () => openSetupWithTemplate(template));

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "small-btn";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", () => fillTemplateForm(template));

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "small-btn warn";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", () => {
        const ok = window.confirm(`Delete template "${template.name}"?`);
        if (!ok) return;
        practice.deleteTemplate(template.id);
        if (templateIdInput.value === template.id) {
          clearTemplateForm();
        }
        renderTemplates();
      });

      actions.appendChild(startBtn);
      actions.appendChild(setupBtn);
      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);

      item.appendChild(details);
      item.appendChild(actions);
      templateList.appendChild(item);
    });
  }

  function mergeActivities() {
    const sessionActivities = sessions.map((session) => {
      const config = session?.config && typeof session.config === "object" ? session.config : {};
      const date = session?.endedAt || session?.startedAt;
      const entryCount = Array.isArray(session?.entries) ? session.entries.length : 0;

      const details = [
        formatDate(date),
        config.difficulty || "Unknown difficulty"
      ];

      if (entryCount > 0) {
        details.push(pluralize(entryCount, "question", "questions"));
      }

      return {
        id: String(session?._id || ""),
        type: "saved",
        date,
        title: `${config.interviewType || "Interview"} practice`,
        meta: details.join(" | ")
      };
    });

    const seenSessionIds = new Set(
      sessions.map((session) => String(session?._id || "").trim()).filter(Boolean)
    );

    const localActivities = practice
      .getPracticeEvents()
      .filter((event) => !(event.sessionId && seenSessionIds.has(String(event.sessionId))))
      .map((event) => ({
        id: event.id,
        type: "local",
        date: event.date,
        title: "Local interview session",
        meta: `${formatDate(event.date)} | ${pluralize(event.questions, "question", "questions")}`
      }));

    return [...sessionActivities, ...localActivities]
      .filter((item) => item.date)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 12);
  }

  function renderActivities() {
    const activities = mergeActivities();
    activityList.innerHTML = "";

    if (!activities.length) {
      activityEmpty.style.display = "block";
      return;
    }

    activityEmpty.style.display = "none";

    activities.forEach((item) => {
      const row = document.createElement("div");
      row.className = "activity-item";
      row.innerHTML = `
        <div>
          <p class="activity-title">${item.title}</p>
          <p class="activity-meta">${item.meta}</p>
        </div>
        <span class="badge ${item.type === "local" ? "local" : ""}">
          ${item.type === "local" ? "Local" : "Saved"}
        </span>
      `;
      activityList.appendChild(row);
    });
  }

  function renderGoalInputs() {
    const goals = practice.getGoals();
    weeklyInterviewsInput.value = goals.weeklyInterviews;
    weeklyQuestionsInput.value = goals.weeklyQuestions;
  }

  function renderProgress() {
    const goals = practice.getGoals();
    const progress = practice.calculateWeeklyProgress({
      sessions,
      events: practice.getPracticeEvents(),
      goals
    });

    interviewGoalText.textContent = `${progress.interviewsThisWeek}/${progress.interviewGoal}`;
    questionGoalText.textContent = `${progress.questionsThisWeek}/${progress.questionGoal}`;

    setProgress(interviewGoalBar, progress.interviewPercent);
    setProgress(questionGoalBar, progress.questionPercent);

    streakText.textContent = pluralize(progress.streakDays, "day", "days");

    const endDate = new Date(progress.weekEnd);
    endDate.setDate(endDate.getDate() - 1);
    weekRangeText.textContent = `${formatDateShort(progress.weekStart)} - ${formatDateShort(endDate)}`;

    if (sessionsUnavailable) {
      showGoalStatus("Showing local progress only. Saved sessions are currently unavailable.");
    }
  }

  async function hydrateSessionDetails(basicSessions) {
    if (!api) return basicSessions;
    const targets = basicSessions.filter((item) => item?._id).slice(0, 12);

    const details = await Promise.all(
      targets.map(async (item) => {
        try {
          const res = await api.fetch(`/interview/session/${encodeURIComponent(item._id)}`);
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data?.session) return null;
          return data.session;
        } catch {
          return null;
        }
      })
    );

    const byId = new Map(
      details
        .filter(Boolean)
        .map((session) => [String(session._id), session])
    );

    return basicSessions.map((session) => byId.get(String(session._id)) || session);
  }

  async function loadSavedSessions() {
    sessionsUnavailable = false;

    if (!api) {
      sessions = [];
      sessionsUnavailable = true;
      return;
    }

    try {
      const res = await api.fetch(`/interview/sessions?userId=${encodeURIComponent(user.id)}`);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        sessions = [];
        sessionsUnavailable = true;
        return;
      }

      const basicSessions = Array.isArray(data?.sessions) ? data.sessions : [];
      sessions = await hydrateSessionDetails(basicSessions);
    } catch {
      sessions = [];
      sessionsUnavailable = true;
    }
  }

  function ensureStarterTemplates() {
    const templates = practice.getTemplates();
    const seeded = localStorage.getItem(TEMPLATE_SEED_KEY) === "1";
    if (templates.length || seeded) return;

    practice.saveTemplate({
      name: "Backend Core Drill",
      interviewType: "Technical",
      difficulty: "Medium",
      duration: "15",
      notes: "APIs, database design, and debugging tradeoffs."
    });

    practice.saveTemplate({
      name: "Behavioral STAR Prep",
      interviewType: "Behavioral",
      difficulty: "Easy",
      duration: "10",
      notes: "Leadership, conflict resolution, and ownership examples."
    });

    localStorage.setItem(TEMPLATE_SEED_KEY, "1");
  }

  goalForm.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      practice.saveGoals({
        weeklyInterviews: weeklyInterviewsInput.value,
        weeklyQuestions: weeklyQuestionsInput.value
      });
      showGoalStatus("Goals updated.");
      renderProgress();
    } catch {
      showGoalStatus("Unable to save goals.", true);
    }
  });

  templateForm.addEventListener("submit", (event) => {
    event.preventDefault();

    try {
      practice.saveTemplate({
        id: templateIdInput.value,
        name: templateNameInput.value,
        interviewType: templateTypeInput.value,
        difficulty: templateDifficultyInput.value,
        duration: templateDurationInput.value,
        notes: templateNotesInput.value
      });

      clearTemplateForm();
      renderTemplates();
    } catch {
      alert("Please complete all required template fields.");
    }
  });

  resetTemplateBtn.addEventListener("click", () => {
    clearTemplateForm();
  });

  async function init() {
    ensureStarterTemplates();
    renderGoalInputs();
    clearTemplateForm();
    renderTemplates();
    await loadSavedSessions();
    renderProgress();
    renderActivities();
  }

  init();
})();
