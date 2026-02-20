console.log("Interview Room Loaded");

/* ================= AUTH ================= */
const user = JSON.parse(localStorage.getItem("user") || "null");
const interviewConfig = JSON.parse(localStorage.getItem("interviewConfig") || "null");

if (!user || !user.id || !interviewConfig) {
  window.location.href = "../dashboard/dashboard.html";
}

/* ================= UI ELEMENTS ================= */
const aiText = document.getElementById("aiText");
const answerText = document.getElementById("answerText");
const aiAvatar = document.getElementById("aiAvatar");
const coachTipEl = document.getElementById("coachTip");
const progressText = document.getElementById("progressText");
const sessionTimerEl = document.getElementById("sessionTimer");
const liveStateEl = document.getElementById("liveState");
const responseStatusEl = document.getElementById("responseStatus");
const answerToggleBtn = document.getElementById("answerToggleBtn");
const typedAnswerEl = document.getElementById("typedAnswer");
const typedFallbackEl = document.getElementById("typedFallback");
const submitTypedBtn = document.getElementById("submitTyped");
const micLevelEl = document.getElementById("micLevel");
const endInterviewBtn = document.getElementById("endInterviewBtn");
const retryQuestionBtn = document.getElementById("retryQuestionBtn");

const PENDING_ENTRY_QUEUE_KEY = "INTERVIEWAI_PENDING_SESSION_ENTRIES";
const PENDING_SESSION_END_QUEUE_KEY = "INTERVIEWAI_PENDING_SESSION_ENDS";
const MAX_PENDING_ENTRY_QUEUE = 160;
const MAX_PENDING_SESSION_END_QUEUE = 40;

function safeParseJson(value, fallback) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function withTimeout(promise, timeoutMs, message) {
  const timeout = Math.max(500, Number(timeoutMs) || 4000);
  return new Promise((resolve, reject) => {
    const timerId = setTimeout(() => {
      reject(new Error(message || "Request timed out"));
    }, timeout);

    Promise.resolve(promise)
      .then((value) => {
        clearTimeout(timerId);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timerId);
        reject(error);
      });
  });
}

/* ================= CAMERA ================= */
const video = document.getElementById("userVideo");
let userStream = null;

let isCapturing = false;
let micActivationPending = false;
let shouldSubmitOnEnd = false;
let browserSpeechToken = 0;
let candidateSpeechLocale = "en-US";
let activeAiAudio = null;
let activeAiAudioUrl = "";
let activeTtsRequestController = null;
const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition || null;
let recognition = null;
let finalAnswer = "";
let latestTranscript = "";
let mediaRecorder = null;
let mediaChunks = [];
let mediaRecorderMimeType = "";
let preferRecorderMode = false;
let forceTypedFallback = false;
let questionRequestInFlight = false;
let isEndingInterview = false;
let isFlushingPendingEntries = false;
let isFlushingPendingSessionEnds = false;
let startFailed = false;
const MIC_AUDIO_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true
};
const INTERVIEW_TTS_VOICE = "Aoede";
const FEMALE_BROWSER_VOICE_HINTS = [
  "female",
  "woman",
  "aoede",
  "samantha",
  "victoria",
  "zira",
  "allison",
  "aria",
  "ava",
  "serena"
];
const MALE_BROWSER_VOICE_HINTS = [
  "male",
  "man",
  "david",
  "mark",
  "thomas",
  "daniel",
  "fred",
  "alex"
];

function getLiveAudioTrack(stream) {
  if (!stream || typeof stream.getAudioTracks !== "function") return null;
  return stream.getAudioTracks().find((track) => track?.readyState === "live") || null;
}

function getLiveVideoTrack(stream) {
  if (!stream || typeof stream.getVideoTracks !== "function") return null;
  return stream.getVideoTracks().find((track) => track?.readyState === "live") || null;
}

function applyUserStream(stream, { clearVideoIfMissing = false } = {}) {
  userStream = stream || null;

  if (!video) return;

  const hasLiveVideo = !!getLiveVideoTrack(stream);
  if (hasLiveVideo) {
    video.srcObject = stream;
    return;
  }

  if (clearVideoIfMissing) {
    video.srcObject = null;
    video.style.background = "#0b1220";
  }
}

async function ensureAudioInputStream() {
  if (getLiveAudioTrack(userStream)) return true;

  if (!navigator.mediaDevices?.getUserMedia) {
    return false;
  }

  try {
    const audioOnlyStream = await navigator.mediaDevices.getUserMedia({
      audio: MIC_AUDIO_CONSTRAINTS
    });

    const existingVideoTrack = getLiveVideoTrack(userStream);
    const mergedStream = existingVideoTrack
      ? new MediaStream([existingVideoTrack, ...audioOnlyStream.getAudioTracks()])
      : audioOnlyStream;

    applyUserStream(mergedStream, { clearVideoIfMissing: true });
    setupMicMeter(mergedStream);
    return true;
  } catch {
    return false;
  }
}

async function initMediaAccess() {
  if (!navigator.mediaDevices?.getUserMedia) {
    requestMicActivation({ allowTypedFallback: true });
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: MIC_AUDIO_CONSTRAINTS
    });

    applyUserStream(stream);
    setupMicMeter(stream);
    return;
  } catch {
    // Continue to audio-only fallback.
  }

  try {
    const audioOnlyStream = await navigator.mediaDevices.getUserMedia({
      audio: MIC_AUDIO_CONSTRAINTS
    });

    applyUserStream(audioOnlyStream, { clearVideoIfMissing: true });
    setupMicMeter(audioOnlyStream);

    setResponseStatus("Camera unavailable. Microphone is active.");
    return;
  } catch {
    requestMicActivation({ allowTypedFallback: true });
  }
}

/* ================= AI AVATAR STATES ================= */
function setAIState(state) {
  const states = {
    idle: "assets/ai-idle.json",
    speaking: "assets/ai-speaking.json",
    thinking: "assets/ai-thinking.json"
  };
  if (aiAvatar) aiAvatar.setAttribute("src", states[state]);
  document.body.dataset.aiState = state;

  if (!liveStateEl) return;

  if (state === "thinking") {
    liveStateEl.innerText = "Interviewer is preparing the next question";
    return;
  }

  if (state === "speaking") {
    liveStateEl.innerText = "Interviewer speaking";
    return;
  }

  liveStateEl.innerText = "Your turn to answer";
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

function setResponseStatus(text) {
  if (responseStatusEl) responseStatusEl.innerText = text;
}

let interviewStartedAtMs = 0;
let timerIntervalId = null;

function formatElapsedTime(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function refreshTimer() {
  if (!sessionTimerEl || !interviewStartedAtMs) return;
  sessionTimerEl.innerText = formatElapsedTime(Date.now() - interviewStartedAtMs);
}

function startTimer() {
  interviewStartedAtMs = Date.now();
  clearInterval(timerIntervalId);
  refreshTimer();
  timerIntervalId = setInterval(refreshTimer, 1000);
}

function stopTimer() {
  clearInterval(timerIntervalId);
  timerIntervalId = null;
}

/* ================= AI SPEECH ================= */
function getSpeechLocaleFromProfileLanguage(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "en-US";

  const hasEnglish = normalized.includes("english");
  const hasHindi = normalized.includes("hindi");

  if (hasHindi && !hasEnglish) return "hi-IN";
  if (hasHindi && hasEnglish) return "en-IN";
  if (hasEnglish) return "en-US";
  return "en-US";
}

function normalizeSpokenText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/\s([?.!,;:])/g, "$1")
    .trim();
}

function releaseAiAudioPlayer() {
  if (activeAiAudio) {
    try {
      activeAiAudio.pause();
    } catch {
      // ignore
    }

    activeAiAudio.src = "";
    activeAiAudio = null;
  }

  if (activeAiAudioUrl) {
    URL.revokeObjectURL(activeAiAudioUrl);
    activeAiAudioUrl = "";
  }
}

function stopAISpeechOutput() {
  browserSpeechToken += 1;
  if (activeTtsRequestController) {
    try {
      activeTtsRequestController.abort("cancelled");
    } catch {
      // ignore
    }
    activeTtsRequestController = null;
  }

  releaseAiAudioPlayer();

  if (window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }
}

function voiceNameMatchesHints(voice, hints) {
  const name = String(voice?.name || "").toLowerCase();
  if (!name) return false;
  return hints.some((hint) => name.includes(hint));
}

function pickBrowserVoice(locale) {
  const synth = window.speechSynthesis;
  if (!synth || typeof synth.getVoices !== "function") return null;

  const voices = synth.getVoices();
  if (!Array.isArray(voices) || !voices.length) return null;

  const normalizedLocale = String(locale || "").toLowerCase();
  const exactMatches = voices.filter(
    (voice) => String(voice.lang || "").toLowerCase() === normalizedLocale
  );

  const prefix = normalizedLocale.split("-")[0];
  const prefixMatches = voices.filter((voice) =>
    String(voice.lang || "").toLowerCase().startsWith(prefix)
  );

  const localePool = exactMatches.length ? exactMatches : prefixMatches.length ? prefixMatches : voices;

  const femalePreferred = localePool.find((voice) =>
    voiceNameMatchesHints(voice, FEMALE_BROWSER_VOICE_HINTS)
  );
  if (femalePreferred) return femalePreferred;

  const nonMale = localePool.find((voice) =>
    !voiceNameMatchesHints(voice, MALE_BROWSER_VOICE_HINTS)
  );
  if (nonMale) return nonMale;

  return localePool[0] || null;
}

function splitTextForSpeech(text) {
  const normalized = normalizeSpokenText(text);
  if (!normalized) return [];

  const sentenceChunks = normalized.match(/[^.!?]+[.!?]*/g) || [normalized];
  const chunks = [];
  let buffer = "";

  sentenceChunks.forEach((chunkRaw) => {
    const chunk = String(chunkRaw || "").trim();
    if (!chunk) return;

    if (!buffer) {
      buffer = chunk;
      return;
    }

    if ((`${buffer} ${chunk}`).length <= 180) {
      buffer = `${buffer} ${chunk}`;
    } else {
      chunks.push(buffer);
      buffer = chunk;
    }
  });

  if (buffer) chunks.push(buffer);
  return chunks;
}

async function requestBackendTtsAudio(text) {
  if (!window.InterviewAI?.api?.fetch) {
    throw new Error("API client unavailable");
  }

  const controller = new AbortController();
  activeTtsRequestController = controller;
  const timeoutId = setTimeout(() => controller.abort("timeout"), 12000);

  try {
    const res = await window.InterviewAI.api.fetch("/interview/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        language: candidateSpeechLocale,
        voice: INTERVIEW_TTS_VOICE
      }),
      signal: controller.signal
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to generate voice");
    }

    const blob = await res.blob();
    if (!blob.size) {
      throw new Error("Generated voice is empty");
    }

    return blob;
  } catch (err) {
    if (err?.name === "AbortError") {
      const abortReason = String(controller.signal?.reason || "").trim().toLowerCase();
      const abortErr = new Error(
        abortReason === "cancelled" ? "Voice generation cancelled" : "Voice generation timed out"
      );
      abortErr.code = abortReason === "cancelled" ? "TTS_CANCELLED" : "TTS_TIMEOUT";
      throw abortErr;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    if (activeTtsRequestController === controller) {
      activeTtsRequestController = null;
    }
  }
}

function playAudioBlob(blob, speechToken, textLength) {
  return new Promise((resolve, reject) => {
    releaseAiAudioPlayer();

    const objectUrl = URL.createObjectURL(blob);
    const audio = new Audio(objectUrl);
    activeAiAudio = audio;
    activeAiAudioUrl = objectUrl;

    const cleanup = () => {
      try {
        audio.pause();
      } catch {
        // ignore
      }

      audio.onended = null;
      audio.onerror = null;
      audio.src = "";

      if (activeAiAudio === audio) {
        activeAiAudio = null;
      }
      if (activeAiAudioUrl === objectUrl) {
        URL.revokeObjectURL(objectUrl);
        activeAiAudioUrl = "";
      }
    };

    const timeoutMs = Math.max(3000, Math.min(30000, textLength * 120));
    const watchdog = setTimeout(() => {
      cleanup();
      resolve({ timedOut: true });
    }, timeoutMs);

    audio.onended = () => {
      clearTimeout(watchdog);
      const cancelled = speechToken !== browserSpeechToken;
      cleanup();
      resolve({ cancelled });
    };

    audio.onerror = () => {
      clearTimeout(watchdog);
      cleanup();
      reject(new Error("Unable to play generated voice"));
    };

    const playPromise = audio.play();
    if (playPromise && typeof playPromise.then === "function") {
      playPromise.catch((err) => {
        clearTimeout(watchdog);
        cleanup();
        reject(err || new Error("Audio playback failed"));
      });
    }
  });
}

function speakWithBrowserVoice(cleanText, speechToken, finish) {
  if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== "function") {
    setTimeout(() => finish(true), 250);
    return;
  }

  const chunks = splitTextForSpeech(cleanText);
  if (!chunks.length) {
    finish(true);
    return;
  }

  const preferredVoice = pickBrowserVoice(candidateSpeechLocale);
  let index = 0;
  const watchdog = setTimeout(() => finish(speechToken === browserSpeechToken), Math.max(2000, cleanText.length * 75));

  const speakNextChunk = () => {
    if (speechToken !== browserSpeechToken) {
      clearTimeout(watchdog);
      finish(false);
      return;
    }

    if (index >= chunks.length) {
      clearTimeout(watchdog);
      finish(true);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(chunks[index]);
    utterance.lang = candidateSpeechLocale;
    utterance.rate = 0.97;
    utterance.pitch = 1.0;
    if (preferredVoice) utterance.voice = preferredVoice;

    utterance.onend = () => {
      if (speechToken !== browserSpeechToken) return;
      index += 1;
      speakNextChunk();
    };

    utterance.onerror = () => {
      if (speechToken !== browserSpeechToken) return;
      index += 1;
      speakNextChunk();
    };

    try {
      window.speechSynthesis.speak(utterance);
    } catch {
      clearTimeout(watchdog);
      finish(true);
    }
  };

  speakNextChunk();
}

function speak(text, onEnd) {
  const clean = normalizeSpokenText(text);
  let finished = false;
  const finish = (shouldInvokeOnEnd) => {
    if (finished) return;
    finished = true;
    setAIState("idle");
    if (shouldInvokeOnEnd && typeof onEnd === "function") onEnd();
  };

  if (!clean) {
    finish(true);
    return;
  }

  stopAISpeechOutput();
  setAIState("speaking");
  const speechToken = browserSpeechToken;

  requestBackendTtsAudio(clean)
    .then((audioBlob) => {
      if (speechToken !== browserSpeechToken) {
        finish(false);
        return null;
      }
      return playAudioBlob(audioBlob, speechToken, clean.length);
    })
    .then((playResult) => {
      if (!playResult) return;
      if (playResult.cancelled) {
        finish(false);
        return;
      }
      finish(true);
    })
    .catch((err) => {
      if (speechToken !== browserSpeechToken || err?.code === "TTS_CANCELLED") {
        finish(false);
        return;
      }

      speakWithBrowserVoice(clean, speechToken, finish);
    });
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

function normalizeApiErrorMessage(rawMessage, fallback) {
  const message = String(rawMessage || "").trim();
  if (!message) return fallback;

  if (/status code 401|invalid api key|unauthorized/i.test(message)) {
    return "AI auth failed. Update GEMINI_API_KEY in interview-ai-backend/.env and restart backend.";
  }

  if (/status code 403|forbidden/i.test(message)) {
    return "AI access denied. Check your API key and model permissions.";
  }

  return message;
}

function canUseSpeechRecognition() {
  return !!recognition;
}

function canUseMediaRecorder() {
  return !!(window.MediaRecorder && getLiveAudioTrack(userStream));
}

function canCaptureVoice() {
  return canUseSpeechRecognition() || canUseMediaRecorder();
}

function setAnswerControls({ canStart, canStop, canSubmitTyped }) {
  const isRecording = !!canStop;
  const canUsePrimaryControl = !!(canStart || canStop);

  if (answerToggleBtn) {
    answerToggleBtn.disabled = !canUsePrimaryControl;
    answerToggleBtn.innerText = isRecording ? "Finish Answer" : "Start Answer";
    answerToggleBtn.classList.toggle("recording", isRecording);
    answerToggleBtn.setAttribute("aria-pressed", String(isRecording));
  }

  if (submitTypedBtn) submitTypedBtn.disabled = !canSubmitTyped;

  if (typedFallbackEl) {
    typedFallbackEl.hidden = !canSubmitTyped;
  }
}

function setRetryQuestionVisibility(visible, options = {}) {
  if (!retryQuestionBtn) return;

  retryQuestionBtn.hidden = !visible;
  retryQuestionBtn.disabled = !!options.disabled;
  retryQuestionBtn.textContent = String(options.label || "Retry Question");
}

function isSecureMicContext() {
  const hostname = String(window.location?.hostname || "").trim().toLowerCase();
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
  return !!window.isSecureContext || isLocalhost;
}

/* ================= INTERVIEW STATE ================= */
let questionCount = 0;
let maxQuestions = 5;
let interviewLog = [];
let currentQuestion = "";
let currentQuestionJson = null;
let currentCoachTip = "";
let currentQuestionAskedAt = null;
let isAnswerWindowOpen = false;
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
    progressText.innerText = `${maxQuestions} questions`;
    return;
  }
  progressText.innerText = `Q${Math.min(questionCount, maxQuestions)}/${maxQuestions}`;
}

setAnswerControls({ canStart: false, canStop: false, canSubmitTyped: false });
setRetryQuestionVisibility(false);
updateProgress();
setResponseStatus("Waiting for the first question");

if (answerToggleBtn) {
  answerToggleBtn.addEventListener("click", async () => {
    await ensureAudioContextRunning();
    if (isCapturing) {
      stopAnswerCapture({ submit: true });
      return;
    }
    await beginAnswerCapture();
  });
}

if (submitTypedBtn) {
  submitTypedBtn.addEventListener("click", () => {
    const typed = String(typedAnswerEl?.value || "").trim();
    if (!typed) {
      answerText.innerText = "Type your answer above, then click Submit.";
      return;
    }
    setResponseStatus("Submitting typed answer");
    setAnswerControls({ canStart: false, canStop: false, canSubmitTyped: false });
    submitAnswer(typed, { source: "typed" });
  });
}

if (endInterviewBtn) {
  endInterviewBtn.addEventListener("click", () => {
    void endInterview();
  });
}

if (retryQuestionBtn) {
  retryQuestionBtn.addEventListener("click", () => {
    if (questionRequestInFlight || isEndingInterview) return;
    if (startFailed) {
      startFailed = false;
      setRetryQuestionVisibility(false);
      void startInterview().catch((err) => {
        console.error("Interview start failed:", err);
        stopTimer();
        setAIState("idle");
        aiText.innerText = "Unable to start interview. Please check your connection and retry.";
        setResponseStatus("Unable to start interview");
        setRetryQuestionVisibility(true, { label: "Retry Start" });
        startFailed = true;
      });
      return;
    }
    void askAIQuestion({ manualRetry: true });
  });
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

function readPendingEntryQueue() {
  const raw = safeParseJson(localStorage.getItem(PENDING_ENTRY_QUEUE_KEY), []);
  return Array.isArray(raw) ? raw : [];
}

function writePendingEntryQueue(queue) {
  const normalized = Array.isArray(queue) ? queue : [];
  const trimmed = normalized
    .filter((item) => item && typeof item === "object")
    .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
    .slice(0, MAX_PENDING_ENTRY_QUEUE);
  localStorage.setItem(PENDING_ENTRY_QUEUE_KEY, JSON.stringify(trimmed));
}

function enqueuePendingSessionEntry(sessionId, entry) {
  if (!sessionId || !entry || typeof entry !== "object") return;

  const queue = readPendingEntryQueue();
  const index = Number(entry?.index) || 0;
  const key = `${sessionId}:${index || Date.now()}`;
  const nextItem = {
    key,
    sessionId: String(sessionId),
    entry,
    attempts: 0,
    queuedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const existingIndex = queue.findIndex((item) => String(item?.key || "") === key);
  if (existingIndex >= 0) {
    const existing = queue[existingIndex];
    queue[existingIndex] = {
      ...existing,
      ...nextItem,
      attempts: Number(existing?.attempts || 0),
      queuedAt: existing?.queuedAt || nextItem.queuedAt
    };
  } else {
    queue.push(nextItem);
  }

  writePendingEntryQueue(queue);
}

async function requestSessionEntrySave(sessionId, entry, { timeoutMs = 5000 } = {}) {
  const res = await withTimeout(
    window.InterviewAI.api.fetch(`/interview/session/${sessionId}/entry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry)
    }),
    timeoutMs,
    "Saving answer took too long"
  );

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to save answer (${res.status})`);
  }
}

async function flushPendingEntryQueue({ maxItems = 16 } = {}) {
  if (isFlushingPendingEntries || !window.InterviewAI?.api?.fetch) return;

  const queue = readPendingEntryQueue();
  if (!queue.length) return;

  isFlushingPendingEntries = true;
  try {
    const keep = [];
    let processed = 0;

    for (const item of queue) {
      if (processed >= Math.max(1, Number(maxItems) || 1)) {
        keep.push(item);
        continue;
      }

      const sessionId = String(item?.sessionId || "").trim();
      const entry = item?.entry;
      if (!sessionId || !entry || typeof entry !== "object") continue;

      try {
        await requestSessionEntrySave(sessionId, entry, { timeoutMs: 4500 });
        processed += 1;
      } catch {
        keep.push({
          ...item,
          attempts: Number(item?.attempts || 0) + 1,
          updatedAt: new Date().toISOString()
        });
      }
    }

    writePendingEntryQueue(keep);
  } finally {
    isFlushingPendingEntries = false;
  }
}

function readPendingSessionEndQueue() {
  const raw = safeParseJson(localStorage.getItem(PENDING_SESSION_END_QUEUE_KEY), []);
  return Array.isArray(raw) ? raw : [];
}

function writePendingSessionEndQueue(queue) {
  const normalized = Array.isArray(queue) ? queue : [];
  const trimmed = normalized
    .filter((item) => item && typeof item === "object")
    .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
    .slice(0, MAX_PENDING_SESSION_END_QUEUE);
  localStorage.setItem(PENDING_SESSION_END_QUEUE_KEY, JSON.stringify(trimmed));
}

function enqueuePendingSessionEnd(sessionId, endedAt) {
  if (!sessionId || !endedAt) return;

  const queue = readPendingSessionEndQueue();
  const existingIndex = queue.findIndex(
    (item) => String(item?.sessionId || "").trim() === String(sessionId).trim()
  );

  const next = {
    sessionId: String(sessionId),
    endedAt: String(endedAt),
    attempts: 0,
    queuedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (existingIndex >= 0) {
    queue[existingIndex] = {
      ...queue[existingIndex],
      ...next,
      attempts: Number(queue[existingIndex]?.attempts || 0),
      queuedAt: queue[existingIndex]?.queuedAt || next.queuedAt
    };
  } else {
    queue.push(next);
  }

  writePendingSessionEndQueue(queue);
}

async function requestSessionEndSave(sessionId, endedAt, { timeoutMs = 3500 } = {}) {
  const res = await withTimeout(
    window.InterviewAI.api.fetch(`/interview/session/${sessionId}/end`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endedAt }),
      keepalive: true
    }),
    timeoutMs,
    "Saving interview end state took too long"
  );

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to end session (${res.status})`);
  }
}

async function flushPendingSessionEndQueue({ maxItems = 10 } = {}) {
  if (isFlushingPendingSessionEnds || !window.InterviewAI?.api?.fetch) return;

  const queue = readPendingSessionEndQueue();
  if (!queue.length) return;

  isFlushingPendingSessionEnds = true;
  try {
    const keep = [];
    let processed = 0;

    for (const item of queue) {
      if (processed >= Math.max(1, Number(maxItems) || 1)) {
        keep.push(item);
        continue;
      }

      const sessionId = String(item?.sessionId || "").trim();
      const endedAt = String(item?.endedAt || "").trim();
      if (!sessionId || !endedAt) continue;

      try {
        await requestSessionEndSave(sessionId, endedAt, { timeoutMs: 3000 });
        processed += 1;
      } catch {
        keep.push({
          ...item,
          attempts: Number(item?.attempts || 0) + 1,
          updatedAt: new Date().toISOString()
        });
      }
    }

    writePendingSessionEndQueue(keep);
  } finally {
    isFlushingPendingSessionEnds = false;
  }
}

async function startInterview() {
  startFailed = false;
  setRetryQuestionVisibility(false);

  candidateProfile = await loadCandidateProfile();
  candidateSpeechLocale = getSpeechLocaleFromProfileLanguage(candidateProfile?.language);
  if (recognition) {
    recognition.lang = candidateSpeechLocale;
  }
  await startSessionIfPossible();
  await flushPendingEntryQueue({ maxItems: 24 });
  await flushPendingSessionEndQueue({ maxItems: 12 });
  startTimer();

  const candidateName = (candidateProfile?.name || user.name || "Candidate").trim();
  const interviewType = String(interviewConfig.interviewType || "technical").toLowerCase();
  const difficulty = String(interviewConfig.difficulty || "standard").toLowerCase();
  const intro = `Hello Welcome to your ${difficulty} ${interviewType} interview.`;

  aiText.innerText = intro;
  setResponseStatus("Interviewer introduction");
  speak(intro, () => setTimeout(askAIQuestion, 450));
}

setTimeout(() => {
  startInterview().catch((err) => {
    console.error("Interview start failed:", err);
    stopTimer();
    setAIState("idle");
    aiText.innerText = "Unable to start interview. Please check your connection and retry.";
    setResponseStatus("Unable to start interview");
    setRetryQuestionVisibility(true, { label: "Retry Start" });
    startFailed = true;
  });
}, 1500);

/* ================= GET AI QUESTION ================= */
async function askAIQuestion({ manualRetry = false } = {}) {
  if (questionRequestInFlight) return;

  if (questionCount >= maxQuestions) {
    void endInterview();
    return;
  }

  questionRequestInFlight = true;
  setRetryQuestionVisibility(false);

  try {
    setAIState("thinking");
    isAnswerWindowOpen = false;
    setResponseStatus("Interviewer is preparing a question");
    setAnswerControls({ canStart: false, canStop: false, canSubmitTyped: false });
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
    startFailed = false;
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
      if (canCaptureVoice()) forceTypedFallback = false;
      isAnswerWindowOpen = true;
      answerText.innerText = "Type your answer below or click Start Answer to respond with voice.";
      setResponseStatus("Your turn to answer");
      setAnswerControls({ canStart: canCaptureVoice(), canStop: false, canSubmitTyped: true });
      setAIState("idle");
    });

  } catch (err) {
    console.error("Question error:", err);
    aiText.innerText = normalizeApiErrorMessage(err?.message, "Failed to get question");
    setAIState("idle");
    answerText.innerText =
      "Unable to load the next question right now. Use Retry Question to continue.";
    setResponseStatus(manualRetry ? "Question retry failed" : "Unable to load question");
    setAnswerControls({ canStart: false, canStop: false, canSubmitTyped: false });
    setRetryQuestionVisibility(true, {
      disabled: false,
      label: manualRetry ? "Retry Again" : "Retry Question"
    });
  } finally {
    questionRequestInFlight = false;
  }
}

/* ================= SPEECH TO TEXT ================= */
function pickRecorderMimeType() {
  if (!window.MediaRecorder || typeof MediaRecorder.isTypeSupported !== "function") {
    return "";
  }

  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4"
  ];

  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read recorded audio"));
    reader.onloadend = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",").pop() : "";
      if (!base64) {
        reject(new Error("Recorded audio is empty"));
        return;
      }
      resolve(base64);
    };
    reader.readAsDataURL(blob);
  });
}

async function transcribeRecordedAudio(audioBlob) {
  const audioBase64 = await blobToBase64(audioBlob);

  const res = await window.InterviewAI.api.fetch("/interview/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audioBase64,
      mimeType: audioBlob.type || mediaRecorderMimeType || "audio/webm",
      language: candidateSpeechLocale,
      prompt: "Interview candidate answer transcript."
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.text) {
    throw new Error(data.error || "Unable to transcribe voice answer");
  }

  return String(data.text || "").trim();
}

async function switchToRecorderCapture(statusMessage) {
  preferRecorderMode = true;
  answerText.innerText = String(statusMessage || "Speech recognition unavailable. Switching to recorder mode.");
  setResponseStatus("Switching recorder mode");

  if (startRecorderCapture()) return true;

  const micReady = await ensureAudioInputStream();
  if (micReady && startRecorderCapture()) return true;

  return false;
}

function initSpeechRecognition() {
  if (!SpeechRecognitionCtor) {
    console.warn("Speech recognition API unavailable. Recorder transcription fallback enabled.");
    return;
  }

  recognition = new SpeechRecognitionCtor();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = candidateSpeechLocale;

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
      setResponseStatus("Answer capture paused");
      setAnswerControls({ canStart: canCaptureVoice(), canStop: false, canSubmitTyped: true });
      return;
    }

    if (!trimmedAnswer) {
      answerText.innerText = "No clear speech detected. Please try the answer again.";
      setResponseStatus("No response captured");
      setAnswerControls({ canStart: canCaptureVoice(), canStop: false, canSubmitTyped: true });
      return;
    }

    setAnswerControls({ canStart: false, canStop: false, canSubmitTyped: false });
    setResponseStatus("Submitting your answer");
    submitAnswer(trimmedAnswer, { source: "speech" });
  };

  recognition.onerror = async (event) => {
    const errorCode = String(event?.error || "").trim().toLowerCase();

    if (!errorCode || errorCode === "aborted") {
      return;
    }

    isCapturing = false;

    if (errorCode === "no-speech") {
      shouldSubmitOnEnd = false;
      answerText.innerText = "No speech detected. Please try again and speak a little louder.";
      setResponseStatus("No speech detected");
      setAnswerControls({ canStart: canCaptureVoice(), canStop: false, canSubmitTyped: true });
      return;
    }

    if (
      errorCode === "network" ||
      errorCode === "audio-capture" ||
      errorCode === "language-not-supported"
    ) {
      shouldSubmitOnEnd = false;
      const switched = await switchToRecorderCapture(
        "Speech recognition is unavailable. Switching to recorder mode..."
      );
      if (!switched) {
        requestMicActivation({ allowTypedFallback: true });
      }
      return;
    }

    if (errorCode === "not-allowed" || errorCode === "service-not-allowed") {
      shouldSubmitOnEnd = false;
      const switched = await switchToRecorderCapture(
        "Browser speech API blocked. Switching to recorder mode..."
      );
      if (!switched) {
        requestMicActivation({ allowTypedFallback: true });
      }
      return;
    }

    shouldSubmitOnEnd = false;
    answerText.innerText = "Microphone error. Try again or type your answer below.";
    setResponseStatus("Microphone unavailable");
    setAnswerControls({ canStart: canCaptureVoice(), canStop: false, canSubmitTyped: true });
  };
}

async function handleRecorderStop() {
  const submit = shouldSubmitOnEnd;
  shouldSubmitOnEnd = false;
  isCapturing = false;

  const blob = mediaChunks.length
    ? new Blob(mediaChunks, { type: mediaRecorderMimeType || "audio/webm" })
    : null;

  mediaChunks = [];
  mediaRecorder = null;

  if (!submit) {
    setResponseStatus("Answer capture paused");
    setAnswerControls({ canStart: canCaptureVoice(), canStop: false, canSubmitTyped: true });
    return;
  }

  if (!blob || !blob.size) {
    answerText.innerText = "No clear speech detected. Please try the answer again.";
    setResponseStatus("No response captured");
    setAnswerControls({ canStart: canCaptureVoice(), canStop: false, canSubmitTyped: true });
    return;
  }

  setAnswerControls({ canStart: false, canStop: false, canSubmitTyped: false });
  answerText.innerText = "Transcribing your voice answer...";
  setResponseStatus("Transcribing response");

  try {
    const transcript = await transcribeRecordedAudio(blob);
    if (!transcript) {
      answerText.innerText = "No clear speech detected. Please try the answer again.";
      setResponseStatus("No response captured");
      setAnswerControls({ canStart: canCaptureVoice(), canStop: false, canSubmitTyped: true });
      return;
    }

    latestTranscript = transcript;
    answerText.innerText = transcript;
    setResponseStatus("Submitting your answer");
    submitAnswer(transcript, { source: "speech" });
  } catch (err) {
    answerText.innerText = normalizeApiErrorMessage(
      err?.message,
      "Voice transcription failed"
    );
    setResponseStatus("Voice transcription failed");
    setAnswerControls({ canStart: canCaptureVoice(), canStop: false, canSubmitTyped: true });
  }
}

function startRecorderCapture() {
  if (!canUseMediaRecorder()) return false;

  mediaChunks = [];
  mediaRecorderMimeType = pickRecorderMimeType();

  try {
    mediaRecorder = mediaRecorderMimeType
      ? new MediaRecorder(userStream, {
        mimeType: mediaRecorderMimeType,
        audioBitsPerSecond: 64000
      })
      : new MediaRecorder(userStream);
    mediaRecorderMimeType = mediaRecorder.mimeType || mediaRecorderMimeType || "audio/webm";
  } catch (err) {
    console.warn("MediaRecorder unavailable:", err?.message || err);
    mediaRecorder = null;
    return false;
  }

  mediaRecorder.ondataavailable = (event) => {
    if (event?.data && event.data.size > 0) {
      mediaChunks.push(event.data);
    }
  };

  mediaRecorder.onerror = () => {
    isCapturing = false;
    shouldSubmitOnEnd = false;
    mediaChunks = [];
    mediaRecorder = null;
    answerText.innerText = "Recording failed. Please try again or type your answer.";
    setResponseStatus("Recording failed");
    setAnswerControls({ canStart: canCaptureVoice(), canStop: false, canSubmitTyped: true });
  };

  mediaRecorder.onstop = () => {
    handleRecorderStop().catch(() => {
      answerText.innerText = "Voice transcription failed";
      setResponseStatus("Voice transcription failed");
      setAnswerControls({ canStart: canCaptureVoice(), canStop: false, canSubmitTyped: true });
    });
  };

  isCapturing = true;
  shouldSubmitOnEnd = true;
  silenceStartedAt = null;
  forceTypedFallback = false;
  answerText.innerText = "Listening...";
  setResponseStatus("Recording your answer");
  setAnswerControls({ canStart: false, canStop: true, canSubmitTyped: false });

  try {
    mediaRecorder.start(200);
    return true;
  } catch (err) {
    isCapturing = false;
    shouldSubmitOnEnd = false;
    mediaChunks = [];
    mediaRecorder = null;
    return false;
  }
}

function requestMicActivation({ allowTypedFallback = true } = {}) {
  if (micActivationPending) return;
  micActivationPending = true;
  forceTypedFallback = allowTypedFallback || !canCaptureVoice();
  const canAnswerNow = isAnswerWindowOpen;

  if (!canCaptureVoice()) {
    answerText.innerText = "Voice input is unavailable in this browser. Type your answer instead.";
    setResponseStatus("Typed input mode");
  } else if (!isSecureMicContext()) {
    answerText.innerText =
      "Microphone requires HTTPS or localhost. Open this app from https:// or http://localhost.";
    setResponseStatus("Insecure context for microphone");
  } else {
    answerText.innerText = "Microphone permission required. Allow this site to use your mic, then click Start Answer.";
    setResponseStatus("Microphone permission required");
  }

  setAnswerControls({
    canStart: canAnswerNow && canCaptureVoice() && isSecureMicContext(),
    canStop: false,
    canSubmitTyped: canAnswerNow
  });
  setTimeout(() => {
    micActivationPending = false;
  }, 1500);
}

async function beginAnswerCapture() {
  stopAISpeechOutput();
  finalAnswer = "";
  latestTranscript = "";
  forceTypedFallback = false;
  await ensureAudioInputStream();

  if (canUseSpeechRecognition() && !preferRecorderMode) {
    isCapturing = true;
    shouldSubmitOnEnd = true;
    silenceStartedAt = null;
    answerText.innerText = "Listening...";
    setResponseStatus("Recording your answer");
    setAnswerControls({ canStart: false, canStop: true, canSubmitTyped: false });

    try {
      recognition.start();
      return;
    } catch {
      preferRecorderMode = true;
      isCapturing = false;
      shouldSubmitOnEnd = false;
    }
  }

  if (startRecorderCapture()) return;

  const micReady = await ensureAudioInputStream();
  if (micReady && startRecorderCapture()) return;

  requestMicActivation({ allowTypedFallback: true });
}

function stopAnswerCapture({ submit }) {
  shouldSubmitOnEnd = !!submit;
  isCapturing = false;
  setResponseStatus(submit ? "Processing your answer" : "Answer capture paused");
  setAnswerControls({ canStart: false, canStop: false, canSubmitTyped: false });

  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    try {
      mediaRecorder.stop();
    } catch {
      // ignore
    }
    return;
  }

  if (recognition) {
    try {
      recognition.stop();
    } catch {
      // ignore
    }
    return;
  }

  setAnswerControls({ canStart: canCaptureVoice(), canStop: false, canSubmitTyped: true });
}

initSpeechRecognition();
initMediaAccess();
window.addEventListener("online", () => {
  void flushPendingEntryQueue({ maxItems: 24 });
  void flushPendingSessionEndQueue({ maxItems: 12 });
});

async function saveSessionEntry(entry) {
  if (!currentSessionId) return false;

  try {
    await requestSessionEntrySave(currentSessionId, entry, { timeoutMs: 4500 });
    await flushPendingEntryQueue({ maxItems: 8 });
    return true;
  } catch (err) {
    enqueuePendingSessionEntry(currentSessionId, entry);
    console.warn("Queued session entry for retry:", err?.message || err);
    return false;
  }
}

async function submitAnswer(answerValue, { source } = {}) {
  isAnswerWindowOpen = false;
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
    setResponseStatus("Moving to next question");
    setTimeout(askAIQuestion, 1200);
    return;
  }

  try {
    setAIState("thinking");
    setResponseStatus("AI is evaluating your answer");
    setAnswerControls({ canStart: false, canStop: false, canSubmitTyped: false });
    answerText.innerText = "Answer received. Evaluating in background...";

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
    answerText.innerText = "Answer saved. Detailed AI feedback will appear in your final report.";
    setResponseStatus("Answer saved");
    setTimeout(askAIQuestion, 1000);
  } catch (err) {
    console.error("Evaluation error:", err);
    const fallbackEntry = {
      ...baseEntry,
      feedback: "Evaluation unavailable for this answer.",
      score: null
    };
    interviewLog.push(fallbackEntry);

    await saveSessionEntry({
      ...baseEntry,
      evaluation: "Evaluation unavailable for this answer.",
      score: null
    });

    setAIState("idle");
    answerText.innerText = "Answer saved. AI evaluation was unavailable for this question.";
    setResponseStatus("Answer saved (evaluation delayed)");
    setTimeout(askAIQuestion, 1000);
  }
}

/* ================= END INTERVIEW ================= */
async function endInterview() {
  if (isEndingInterview) return;
  isEndingInterview = true;

  try {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      shouldSubmitOnEnd = false;
      mediaRecorder.stop();
    }

    if (recognition) {
      shouldSubmitOnEnd = false;
      recognition.stop();
    }
  } catch {
    // ignore
  }
  isCapturing = false;
  isAnswerWindowOpen = false;
  stopTimer();
  setResponseStatus("Interview complete");
  setAnswerControls({ canStart: false, canStop: false, canSubmitTyped: false });
  setRetryQuestionVisibility(false);
  if (endInterviewBtn) {
    endInterviewBtn.disabled = true;
    endInterviewBtn.textContent = "Ending...";
  }

  setAIState("idle");
  speak("Thank you. This concludes your interview.");

  aiText.innerText = "Interview completed. Preparing report...";

  const endedAt = new Date().toISOString();
  sessionStorage.setItem("interviewEndedAt", endedAt);
  localStorage.setItem("lastInterviewEndedAt", endedAt);

  sessionStorage.setItem("interviewSummary", JSON.stringify(interviewLog));
  localStorage.setItem("lastInterviewSummary", JSON.stringify(interviewLog));

  if (window.InterviewAI?.practice?.addPracticeEvent) {
    window.InterviewAI.practice.addPracticeEvent({
      sessionId: currentSessionId || "",
      date: endedAt,
      questions: Math.max(1, interviewLog.length)
    });
  }

  if (userStream) {
    userStream.getTracks().forEach((track) => track.stop());
    userStream = null;
  }

  if (currentSessionId) {
    localStorage.setItem("lastInterviewSessionId", currentSessionId);
    localStorage.removeItem("currentInterviewSessionId");
    setResponseStatus("Finalizing interview...");

    try {
      await flushPendingEntryQueue({ maxItems: 48 });
      await requestSessionEndSave(currentSessionId, endedAt, { timeoutMs: 3200 });
      await flushPendingSessionEndQueue({ maxItems: 24 });
    } catch (err) {
      enqueuePendingSessionEnd(currentSessionId, endedAt);
      console.warn("Queued session end for retry:", err?.message || err);
      setResponseStatus("Interview complete (sync pending)");
    }
  }

  setTimeout(() => {
    window.location.href = "../report/report.html";
  }, 2200);
}
