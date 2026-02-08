(() => {
  const ROOT = (window.InterviewAI = window.InterviewAI || {});

  const STORAGE_KEYS = {
    templates: "INTERVIEWAI_PRACTICE_TEMPLATES",
    goals: "INTERVIEWAI_PRACTICE_GOALS",
    events: "INTERVIEWAI_PRACTICE_EVENTS"
  };

  function safeParseJson(value, fallback) {
    if (!value) return fallback;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function clampInt(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(max, Math.max(min, Math.round(numeric)));
  }

  function normalizeText(value, fallback = "") {
    const text = String(value || "").trim();
    return text || fallback;
  }

  function buildId(prefix) {
    const rand = Math.random().toString(36).slice(2, 8);
    return `${prefix}_${Date.now()}_${rand}`;
  }

  function readArray(key) {
    const parsed = safeParseJson(localStorage.getItem(key), []);
    return Array.isArray(parsed) ? parsed : [];
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function getTemplates() {
    return readArray(STORAGE_KEYS.templates)
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        id: normalizeText(item.id),
        name: normalizeText(item.name),
        interviewType: normalizeText(item.interviewType),
        difficulty: normalizeText(item.difficulty),
        duration: normalizeText(item.duration),
        notes: normalizeText(item.notes),
        createdAt: normalizeText(item.createdAt),
        updatedAt: normalizeText(item.updatedAt)
      }))
      .filter(
        (item) =>
          item.id &&
          item.name &&
          item.interviewType &&
          item.difficulty &&
          item.duration
      )
      .sort((a, b) => {
        const aTime = new Date(a.updatedAt).getTime() || 0;
        const bTime = new Date(b.updatedAt).getTime() || 0;
        return bTime - aTime;
      });
  }

  function getTemplateById(id) {
    const targetId = normalizeText(id);
    if (!targetId) return null;
    return getTemplates().find((item) => item.id === targetId) || null;
  }

  function saveTemplate(input) {
    if (!input || typeof input !== "object") {
      throw new Error("Template input is required");
    }

    const now = new Date().toISOString();
    const templates = getTemplates();
    const existing = getTemplateById(input.id);

    const template = {
      id: existing?.id || buildId("template"),
      name: normalizeText(input.name),
      interviewType: normalizeText(input.interviewType),
      difficulty: normalizeText(input.difficulty),
      duration: String(clampInt(input.duration, 5, 60, 15)),
      notes: normalizeText(input.notes),
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };

    if (!template.name || !template.interviewType || !template.difficulty) {
      throw new Error("Template is missing required fields");
    }

    const next = templates.filter((item) => item.id !== template.id);
    next.push(template);
    writeJson(STORAGE_KEYS.templates, next);

    return template;
  }

  function deleteTemplate(id) {
    const targetId = normalizeText(id);
    if (!targetId) return false;
    const templates = getTemplates();
    const next = templates.filter((item) => item.id !== targetId);
    if (next.length === templates.length) return false;
    writeJson(STORAGE_KEYS.templates, next);
    return true;
  }

  function getGoals() {
    const raw = safeParseJson(localStorage.getItem(STORAGE_KEYS.goals), {});
    return {
      weeklyInterviews: clampInt(raw.weeklyInterviews, 1, 20, 3),
      weeklyQuestions: clampInt(raw.weeklyQuestions, 5, 200, 15),
      updatedAt: normalizeText(raw.updatedAt) || new Date().toISOString()
    };
  }

  function saveGoals(input) {
    const next = {
      weeklyInterviews: clampInt(input?.weeklyInterviews, 1, 20, 3),
      weeklyQuestions: clampInt(input?.weeklyQuestions, 5, 200, 15),
      updatedAt: new Date().toISOString()
    };
    writeJson(STORAGE_KEYS.goals, next);
    return next;
  }

  function normalizeEvent(item) {
    if (!item || typeof item !== "object") return null;
    const date = normalizeText(item.date);
    const parsedDate = new Date(date);
    if (!date || Number.isNaN(parsedDate.getTime())) return null;

    return {
      id: normalizeText(item.id) || buildId("event"),
      sessionId: normalizeText(item.sessionId),
      date: parsedDate.toISOString(),
      questions: clampInt(item.questions, 1, 30, 1)
    };
  }

  function getPracticeEvents() {
    return readArray(STORAGE_KEYS.events)
      .map(normalizeEvent)
      .filter(Boolean)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  function addPracticeEvent(input) {
    const event = normalizeEvent(input);
    if (!event) return null;

    const events = getPracticeEvents();
    const matchIndex = events.findIndex((item) =>
      event.sessionId ? item.sessionId && item.sessionId === event.sessionId : item.id === event.id
    );

    if (matchIndex >= 0) {
      events[matchIndex] = event;
    } else {
      events.push(event);
    }

    const trimmed = events
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 365);

    writeJson(STORAGE_KEYS.events, trimmed);
    return event;
  }

  function startOfWeek(dateValue = new Date()) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return new Date();
    date.setHours(0, 0, 0, 0);
    const day = date.getDay();
    date.setDate(date.getDate() - day);
    return date;
  }

  function toDateKey(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function enumerateDateKeysFromSources(sessions, events) {
    const keys = new Set();

    sessions.forEach((session) => {
      const dateValue = session?.endedAt || session?.startedAt;
      const key = toDateKey(dateValue);
      if (key) keys.add(key);
    });

    events.forEach((event) => {
      const key = toDateKey(event?.date);
      if (key) keys.add(key);
    });

    return Array.from(keys).sort((a, b) => b.localeCompare(a));
  }

  function computeStreakDays(sessions, events, nowValue = new Date()) {
    const keySet = new Set(enumerateDateKeysFromSources(sessions, events));
    if (!keySet.size) return 0;

    let streak = 0;
    const cursor = new Date(nowValue);
    cursor.setHours(0, 0, 0, 0);

    while (true) {
      const key = toDateKey(cursor);
      if (!keySet.has(key)) break;
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    return streak;
  }

  function questionsFromSession(session) {
    if (Array.isArray(session?.entries)) return session.entries.length;
    return clampInt(session?.questionsCount, 0, 100, 0);
  }

  function calculateWeeklyProgress(input = {}) {
    const sessions = Array.isArray(input.sessions) ? input.sessions : [];
    const events = Array.isArray(input.events) ? input.events : [];
    const goals = input.goals || getGoals();
    const now = input.now ? new Date(input.now) : new Date();

    const weekStart = startOfWeek(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const sessionIds = new Set();
    let interviewsThisWeek = 0;
    let questionsThisWeek = 0;

    sessions.forEach((session) => {
      const dateValue = session?.endedAt || session?.startedAt;
      const date = new Date(dateValue);
      if (Number.isNaN(date.getTime())) return;

      if (date >= weekStart && date < weekEnd) {
        interviewsThisWeek += 1;
        questionsThisWeek += questionsFromSession(session);
      }

      if (session?._id) sessionIds.add(String(session._id));
    });

    events.forEach((event) => {
      const date = new Date(event?.date);
      if (Number.isNaN(date.getTime())) return;
      if (event?.sessionId && sessionIds.has(String(event.sessionId))) return;

      if (date >= weekStart && date < weekEnd) {
        interviewsThisWeek += 1;
        questionsThisWeek += clampInt(event.questions, 1, 30, 1);
      }
    });

    const interviewGoal = clampInt(goals.weeklyInterviews, 1, 20, 3);
    const questionGoal = clampInt(goals.weeklyQuestions, 5, 200, 15);

    const interviewPercent = Math.min(
      100,
      Math.round((interviewsThisWeek / interviewGoal) * 100)
    );
    const questionPercent = Math.min(
      100,
      Math.round((questionsThisWeek / questionGoal) * 100)
    );

    return {
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      interviewsThisWeek,
      questionsThisWeek,
      interviewGoal,
      questionGoal,
      interviewPercent,
      questionPercent,
      streakDays: computeStreakDays(sessions, events, now)
    };
  }

  function templateToInterviewConfig(template, extra = {}) {
    return {
      interviewType: normalizeText(template?.interviewType, "Technical"),
      difficulty: normalizeText(template?.difficulty, "Medium"),
      duration: String(clampInt(template?.duration, 5, 60, 15)),
      startedAt: new Date().toISOString(),
      ...extra
    };
  }

  ROOT.practice = {
    STORAGE_KEYS,
    getTemplates,
    getTemplateById,
    saveTemplate,
    deleteTemplate,
    getGoals,
    saveGoals,
    getPracticeEvents,
    addPracticeEvent,
    calculateWeeklyProgress,
    templateToInterviewConfig
  };
})();
