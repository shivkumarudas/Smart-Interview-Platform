console.log("Interview Room Loaded");

/* ================= AUTH ================= */
const user = JSON.parse(localStorage.getItem("user") || "null");
const interviewConfig = JSON.parse(localStorage.getItem("interviewConfig") || "null");

if (!user || !user.id || !interviewConfig) {
  window.location.href = "../dashboard/dashboard.html";
}

/* ================= CAMERA ================= */
const video = document.getElementById("userVideo");
let userStream = null;

navigator.mediaDevices.getUserMedia({
  video: { facingMode: "user" },
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  }
})
  .then(stream => {
    userStream = stream;
    video.srcObject = stream;
    setupMicMeter(stream);
  })
  .catch(() => alert("Camera and mic permission required"));

/* ================= UI ELEMENTS ================= */
const aiText = document.getElementById("aiText");
const answerText = document.getElementById("answerText");
const aiAvatar = document.getElementById("aiAvatar");
const coachTipEl = document.getElementById("coachTip");
const progressText = document.getElementById("progressText");
const startAnswerBtn = document.getElementById("startAnswer");
const stopAnswerBtn = document.getElementById("stopAnswer");
const typedAnswerEl = document.getElementById("typedAnswer");
const submitTypedBtn = document.getElementById("submitTyped");
const micLevelEl = document.getElementById("micLevel");
const repeatQuestionBtn = document.getElementById("repeatQuestion");
const skipQuestionBtn = document.getElementById("skipQuestion");
const endInterviewBtn = document.getElementById("endInterviewBtn");
let isCapturing = false;
let micActivationPending = false;
let shouldSubmitOnEnd = false;

/* ================= AI AVATAR STATES ================= */
function setAIState(state) {
  const states = {
    idle: "assets/ai-idle.json",
    speaking: "assets/ai-speaking.json",
    thinking: "assets/ai-thinking.json"
  };
  if (aiAvatar) aiAvatar.setAttribute("src", states[state]);
}

/* ================= AUDIO METER ================= */
let audioContext = null;
let analyserNode = null;
let meterAnimationId = null;
let silenceStartedAt = null;

const SILENCE_RMS_THRESHOLD = 0.018;
const SILENCE_STOP_AFTER_MS = 1600;

function setupMicMeter(stream) {
  if (!micLevelEl || !stream) return;

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;

  try {
    audioContext = audioContext || new AudioCtx();
    const source = audioContext.createMediaStreamSource(stream);

    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 1024;
    source.connect(analyserNode);

    const data = new Uint8Array(analyserNode.fftSize);

    const tick = () => {
      if (!analyserNode) return;

      analyserNode.getByteTimeDomainData(data);
      let sumSquares = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sumSquares += v * v;
      }
      const rms = Math.sqrt(sumSquares / data.length);
      const levelPct = Math.min(100, Math.round(rms * 260));
      micLevelEl.style.width = `${levelPct}%`;

      const canDetectSilence = audioContext && audioContext.state === "running";

      if (isCapturing && canDetectSilence) {
        const now = Date.now();
        if (rms < SILENCE_RMS_THRESHOLD) {
          silenceStartedAt = silenceStartedAt || now;
          if (now - silenceStartedAt >= SILENCE_STOP_AFTER_MS) {
            silenceStartedAt = null;
            stopAnswerCapture({ submit: true });
          }
        } else {
          silenceStartedAt = null;
        }
      } else {
        silenceStartedAt = null;
      }

      meterAnimationId = requestAnimationFrame(tick);
    };

    cancelAnimationFrame(meterAnimationId);
    tick();
  } catch (err) {
    console.warn("Mic meter unavailable:", err?.message || err);
  }
}

async function ensureAudioContextRunning() {
  if (!audioContext) return;
  if (audioContext.state === "suspended") {
    try {
      await audioContext.resume();
    } catch {
      // ignore
    }
  }
}

/* ================= AI SPEECH ================= */
function speak(text, onEnd) {
  speechSynthesis.cancel();
  setAIState("speaking");

  const clean = String(text || "").trim();
  if (!clean) {
    setAIState("idle");
    if (typeof onEnd === "function") onEnd();
    return;
  }

  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.onend = () => {
    setAIState("idle");
    if (typeof onEnd === "function") onEnd();
  };

  speechSynthesis.speak(u);
}

function formatEvaluation(rawText, parsedJson) {
  if (!parsedJson || typeof parsedJson !== "object") return String(rawText || "").trim();

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

  return lines.length ? lines.join("\n") : String(rawText || "").trim();
}

function setAnswerControls({ canStart, canStop, canSubmitTyped }) {
  if (startAnswerBtn) startAnswerBtn.disabled = !canStart;
  if (stopAnswerBtn) stopAnswerBtn.disabled = !canStop;
  if (submitTypedBtn) submitTypedBtn.disabled = !canSubmitTyped;
}

/* ================= INTERVIEW STATE ================= */
let questionCount = 0;
let maxQuestions = 5;
let interviewLog = [];
let currentQuestion = "";
let currentQuestionJson = null;
let currentCoachTip = "";
let currentQuestionAskedAt = null;
let currentSessionId = null;
currentSessionId = localStorage.getItem("currentInterviewSessionId") || null;

function computeMaxQuestions(durationMinutesRaw) {
  const minutes = Number(durationMinutesRaw);
  if (!Number.isFinite(minutes) || minutes <= 0) return 5;
  return Math.max(3, Math.min(10, Math.round(minutes / 3)));
}

maxQuestions = computeMaxQuestions(interviewConfig.duration);

function updateProgress() {
  if (!progressText) return;
  if (!questionCount) {
    progressText.innerText = `Ready | ${maxQuestions}Q`;
    return;
  }
  progressText.innerText = `Q${Math.min(questionCount, maxQuestions)}/${maxQuestions}`;
}

setAnswerControls({ canStart: false, canStop: false, canSubmitTyped: false });
updateProgress();

if (startAnswerBtn) {
  startAnswerBtn.addEventListener("click", async () => {
    await ensureAudioContextRunning();
    beginAnswerCapture();
  });
}

if (stopAnswerBtn) {
  stopAnswerBtn.addEventListener("click", () => stopAnswerCapture({ submit: true }));
}

if (submitTypedBtn) {
  submitTypedBtn.addEventListener("click", () => {
    const typed = String(typedAnswerEl?.value || "").trim();
    if (!typed) {
      answerText.innerText = "Type your answer above, then click Submit.";
      return;
    }
    submitAnswer(typed, { source: "typed" });
  });
}

if (repeatQuestionBtn) {
  repeatQuestionBtn.addEventListener("click", () => {
    if (currentQuestion) speak(currentQuestion);
  });
}

if (skipQuestionBtn) {
  skipQuestionBtn.addEventListener("click", () => {
    if (!questionCount || !currentQuestion) return;
    submitAnswer("Skipped", { source: "skip" });
  });
}

if (endInterviewBtn) {
  endInterviewBtn.addEventListener("click", () => endInterview());
}

/* ================= START INTERVIEW ================= */
let candidateProfile = null;

async function loadCandidateProfile() {
  try {
    const res = await window.InterviewAI.api.fetch(`/profile/${user.id}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function startSessionIfPossible() {
  if (currentSessionId) return currentSessionId;

  try {
    const res = await window.InterviewAI.api.fetch("/interview/session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user.id,
        config: interviewConfig,
        profile: candidateProfile
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.sessionId) return null;

    currentSessionId = data.sessionId;
    localStorage.setItem("currentInterviewSessionId", currentSessionId);
    return currentSessionId;
  } catch {
    return null;
  }
}

async function startInterview() {
  candidateProfile = await loadCandidateProfile();
  await startSessionIfPossible();

  const candidateName = (candidateProfile?.name || user.name || "Candidate").trim();
  const intro = `Hello ${candidateName}.
This will be a ${interviewConfig.difficulty} ${interviewConfig.interviewType} interview.
We will do ${maxQuestions} questions. Click Start Answer when you're ready.`;

  aiText.innerText = intro;
  speak(intro, () => setTimeout(askAIQuestion, 500));
}

setTimeout(() => {
  startInterview().catch((err) => {
    console.error("Interview start failed:", err);
    setAIState("idle");
    aiText.innerText = "Unable to start interview. Please refresh and try again.";
  });
}, 1500);

/* ================= GET AI QUESTION ================= */
async function askAIQuestion() {
  if (questionCount >= maxQuestions) {
    endInterview();
    return;
  }

  try {
    setAIState("thinking");
    const lastEntry = interviewLog[interviewLog.length - 1];

    const res = await window.InterviewAI.api.fetch("/interview/question", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profile: {
          role: candidateProfile?.role || "Software Developer",
          skills: candidateProfile?.skills || "Programming, Problem Solving",
          experience: candidateProfile?.experience || "Fresher",
          education: candidateProfile?.education || "Bachelor's Degree"
        },
        config: {
          interviewType: interviewConfig.interviewType || candidateProfile?.interviewType || "Technical",
          difficulty: interviewConfig.difficulty || "Easy"
        },
        context: lastEntry ? { question: lastEntry.question, answer: lastEntry.answer } : null,
        history: interviewLog.slice(-3).map((entry) => ({
          question: entry.question,
          answer: entry.answer
        }))
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.question) {
      throw new Error(data.error || "Failed to get question");
    }

    questionCount++;
    currentQuestion = String(data.question || "").trim();
    currentQuestionJson = data.questionJson && typeof data.questionJson === "object"
      ? data.questionJson
      : null;
    currentCoachTip = String(data.coachTip || "").trim();
    currentQuestionAskedAt = new Date().toISOString();

    updateProgress();

    if (coachTipEl) {
      coachTipEl.innerText = currentCoachTip;
    }

    if (typedAnswerEl) typedAnswerEl.value = "";

    aiText.innerText = currentQuestion;
    speak(currentQuestion, () => {
      answerText.innerText = "Click Start Answer and speak, or type your answer and submit.";
      setAnswerControls({ canStart: !!recognition, canStop: false, canSubmitTyped: true });
      setAIState("idle");
    });

  } catch (err) {
    console.error("Question error:", err);
    aiText.innerText = err.message;
    setAIState("idle");
  }
}

/* ================= SPEECH TO TEXT ================= */
let recognition = null;
let finalAnswer = "";
let latestTranscript = "";

if ("webkitSpeechRecognition" in window) {
  recognition = new webkitSpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  recognition.onresult = (event) => {
    let interim = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const text = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalAnswer += text + " ";
      } else {
        interim += text;
      }
    }

    latestTranscript = (finalAnswer + interim).trim();
    answerText.innerText = latestTranscript;
  };

  recognition.onend = () => {
    const submit = shouldSubmitOnEnd;
    shouldSubmitOnEnd = false;
    isCapturing = false;

    const trimmedAnswer = (finalAnswer.trim() || latestTranscript.trim());
    if (!submit) {
      setAnswerControls({ canStart: !!recognition, canStop: false, canSubmitTyped: true });
      return;
    }

    if (!trimmedAnswer) {
      answerText.innerText = "No speech detected. Click Start Answer and try again, or type your answer.";
      setAnswerControls({ canStart: !!recognition, canStop: false, canSubmitTyped: true });
      return;
    }

    setAnswerControls({ canStart: false, canStop: false, canSubmitTyped: false });
    submitAnswer(trimmedAnswer, { source: "speech" });
  };

  recognition.onerror = (event) => {
    isCapturing = false;
    shouldSubmitOnEnd = false;
    if (event?.error === "not-allowed" || event?.error === "service-not-allowed") {
      requestMicActivation();
      return;
    }
    answerText.innerText = "Microphone error. Please refresh and allow mic access.";
    setAnswerControls({ canStart: !!recognition, canStop: false, canSubmitTyped: true });
  };
} else {
  console.warn("Speech recognition not supported. Falling back to typed answers.");
}

function requestMicActivation() {
  if (micActivationPending) return;
  micActivationPending = true;
  answerText.innerText = "Microphone permission required. Allow mic access, then click Start Answer.";
  setAnswerControls({ canStart: !!recognition, canStop: false, canSubmitTyped: true });
  setTimeout(() => {
    micActivationPending = false;
  }, 1500);
}

function beginAnswerCapture() {
  if (!recognition) return;

  finalAnswer = "";
  latestTranscript = "";
  isCapturing = true;
  shouldSubmitOnEnd = true;
  silenceStartedAt = null;
  answerText.innerText = "Listening...";
  setAnswerControls({ canStart: false, canStop: true, canSubmitTyped: false });
  try {
    recognition.start();
  } catch (err) {
    isCapturing = false;
    shouldSubmitOnEnd = false;
    requestMicActivation();
  }
}

function stopAnswerCapture({ submit }) {
  if (!recognition) return;
  shouldSubmitOnEnd = !!submit;
  isCapturing = false;
  setAnswerControls({ canStart: false, canStop: false, canSubmitTyped: false });
  try {
    recognition.stop();
  } catch {
    // ignore
  }
}

async function saveSessionEntry(entry) {
  if (!currentSessionId) return;

  try {
    await window.InterviewAI.api.fetch(`/interview/session/${currentSessionId}/entry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry)
    });
  } catch {
    // ignore
  }
}

async function submitAnswer(answerValue, { source } = {}) {
  const answeredAt = new Date().toISOString();
  const trimmedAnswer = String(answerValue || "").trim();
  const isSkip =
    source === "skip" ||
    !trimmedAnswer ||
    /^(i\s*don'?t\s*know|no\s*idea|not\s*sure|skip|pass|skipped)\b/i.test(trimmedAnswer);

  const baseEntry = {
    index: questionCount,
    askedAt: currentQuestionAskedAt,
    question: currentQuestion || aiText.innerText,
    questionJson: currentQuestionJson || undefined,
    answer: trimmedAnswer || "No answer",
    answeredAt
  };

  if (isSkip) {
    const feedback = "Skipped";
    interviewLog.push({ ...baseEntry, feedback });
    await saveSessionEntry({ ...baseEntry, evaluation: feedback, score: null });

    answerText.innerText = "Skipping. Moving to the next question...";
    setTimeout(askAIQuestion, 1200);
    return;
  }

  try {
    setAIState("thinking");
    setAnswerControls({ canStart: false, canStop: false, canSubmitTyped: false });
    answerText.innerText = "Evaluating your answer...";

    const res = await window.InterviewAI.api.fetch("/interview/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: baseEntry.question,
        answer: trimmedAnswer,
        profile: candidateProfile,
        config: {
          interviewType: interviewConfig.interviewType || candidateProfile?.interviewType || "Technical",
          difficulty: interviewConfig.difficulty || "Easy"
        }
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.evaluation) {
      throw new Error(data.error || "Evaluation failed");
    }

    const formattedFeedback = formatEvaluation(data.evaluation, data.evaluationJson);

    answerText.innerText = "AI Feedback:\n\n" + formattedFeedback;

    const score = data.score ?? data?.evaluationJson?.score ?? null;

    const entry = {
      ...baseEntry,
      feedback: formattedFeedback,
      evaluationJson: data.evaluationJson || undefined,
      score
    };

    interviewLog.push(entry);

    await saveSessionEntry({
      ...baseEntry,
      evaluation: data.evaluation,
      evaluationJson: data.evaluationJson || undefined,
      score
    });

    setAIState("idle");
    setTimeout(askAIQuestion, 4500);
  } catch (err) {
    console.error("Evaluation error:", err);
    setAIState("idle");
    answerText.innerText = err.message || "Evaluation failed";
    setAnswerControls({ canStart: !!recognition, canStop: false, canSubmitTyped: true });
  }
}

/* ================= END INTERVIEW ================= */
function endInterview() {
  try {
    if (recognition) {
      shouldSubmitOnEnd = false;
      recognition.stop();
    }
  } catch {
    // ignore
  }
  isCapturing = false;
  setAnswerControls({ canStart: false, canStop: false, canSubmitTyped: false });
  if (endInterviewBtn) endInterviewBtn.disabled = true;

  setAIState("idle");
  speak("Thank you. This concludes your interview.");

  aiText.innerText = "Interview completed. Preparing report...";

  const endedAt = new Date().toISOString();
  sessionStorage.setItem("interviewEndedAt", endedAt);
  localStorage.setItem("lastInterviewEndedAt", endedAt);

  sessionStorage.setItem("interviewSummary", JSON.stringify(interviewLog));
  localStorage.setItem("lastInterviewSummary", JSON.stringify(interviewLog));

  if (userStream) {
    userStream.getTracks().forEach((track) => track.stop());
    userStream = null;
  }

  if (currentSessionId) {
    localStorage.setItem("lastInterviewSessionId", currentSessionId);
    localStorage.removeItem("currentInterviewSessionId");

    window.InterviewAI.api.fetch(`/interview/session/${currentSessionId}/end`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endedAt })
    }).catch(() => {
      // ignore
    });
  }

  setTimeout(() => {
    window.location.href = "../report/report.html";
  }, 3000);
}
