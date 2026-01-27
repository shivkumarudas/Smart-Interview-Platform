console.log("Interview Room Loaded");

/* ================= AUTH ================= */
const user = JSON.parse(localStorage.getItem("user"));
const interviewConfig = JSON.parse(localStorage.getItem("interviewConfig"));

if (!user || !interviewConfig) {
  window.location.href = "../dashboard/dashboard.html";
}

/* ================= CAMERA ================= */
const video = document.getElementById("userVideo");

navigator.mediaDevices.getUserMedia({ video: true })
  .then(stream => video.srcObject = stream)
  .catch(() => alert("Camera permission required"));

/* ================= UI ELEMENTS ================= */
const aiText = document.getElementById("aiText");
const answerText = document.getElementById("answerText");
const startBtn = document.getElementById("startAnswer");
const stopBtn = document.getElementById("stopAnswer");

/* ================= AI SPEECH ================= */
function speak(text) {
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = 1;
  speechSynthesis.speak(u);
}

/* ================= INTERVIEW STATE ================= */
let questionCount = 1;
const maxQuestions = 5;
let interviewLog = [];

/* ================= CONFIDENCE (VOICE) METRICS ================= */
let answerStartTime = null;
let answerEndTime = null;
let pauseCount = 0;
let lastSpeechTime = null;
let finalAnswer = "";

/* ================= STRESS (FACE) METRICS ================= */
let faceCheckInterval;
let faceMovements = 0;
let lastFaceBox = null;

/* ================= AI INTRO ================= */
setTimeout(() => {
  const intro = `Hello ${user.name || "Candidate"}. 
  This will be a ${interviewConfig.difficulty} ${interviewConfig.interviewType} interview. 
  Let's begin.`;

  aiText.innerText = intro;
  speak(intro);

  startFaceAnalysis();
  setTimeout(askQuestion, 5000);
}, 1500);

/* ================= FIRST QUESTION ================= */
function askQuestion() {
  const question = "Can you explain one core skill you are confident in?";
  aiText.innerText = question;
  speak(question);
}

/* ================= SPEECH RECOGNITION ================= */
let recognition;

if ("webkitSpeechRecognition" in window) {
  recognition = new webkitSpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  recognition.onresult = (event) => {
    const now = Date.now();

    if (!answerStartTime) answerStartTime = now;

    if (lastSpeechTime && now - lastSpeechTime > 1200) {
      pauseCount++;
    }
    lastSpeechTime = now;

    let transcript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }

    finalAnswer = transcript;
    answerText.innerText = transcript;
  };

  recognition.onerror = (e) => console.error("Speech error:", e);
} else {
  alert("Speech Recognition not supported in this browser");
}

/* ================= ANSWER CONTROLS ================= */
startBtn.onclick = () => {
  finalAnswer = "";
  answerText.innerText = "Listening...";
  recognition.start();
};

stopBtn.onclick = () => {
  recognition.stop();
  answerEndTime = Date.now();

  const durationSec = (answerEndTime - answerStartTime) / 1000;
  const words = finalAnswer.trim().split(/\s+/).filter(Boolean).length;
  const wpm = durationSec > 0 ? Math.round((words / durationSec) * 60) : 0;

  const confidence = calculateConfidence(durationSec, pauseCount, wpm);

  interviewLog.push({
    question: aiText.innerText,
    answer: finalAnswer,
    durationSec,
    pauseCount,
    wpm,
    confidence
  });

  resetVoiceMetrics();
  setTimeout(askFollowUp, 1500);
};

/* ================= ADAPTIVE FOLLOW-UP ================= */
function askFollowUp() {
  questionCount++;

  if (questionCount > maxQuestions) {
    endInterview();
    return;
  }

  const lastConfidence = interviewLog.at(-1).confidence;
  let nextQuestion;

  if (lastConfidence < 5) {
    nextQuestion = "Can you explain that in simpler terms?";
  } else {
    nextQuestion = "Can you give a real-world example of this skill?";
  }

  aiText.innerText = nextQuestion;
  speak(nextQuestion);
  answerText.innerText = "Click Start Answer and speak…";
}

/* ================= CONFIDENCE SCORE ================= */
function calculateConfidence(duration, pauses, wpm) {
  let score = 5;

  if (duration < 5) score -= 2;
  if (pauses >= 2) score -= pauses;
  if (wpm < 90) score -= 2;
  if (wpm > 130) score += 2;

  return Math.max(1, Math.min(10, score));
}

function resetVoiceMetrics() {
  answerStartTime = null;
  answerEndTime = null;
  pauseCount = 0;
  lastSpeechTime = null;
}

/* ================= FACE / STRESS ANALYSIS ================= */
async function startFaceAnalysis() {
  if (!("FaceDetector" in window)) {
    console.warn("FaceDetector not supported");
    return;
  }

  const detector = new FaceDetector({ fastMode: true });

  faceCheckInterval = setInterval(async () => {
    try {
      const faces = await detector.detect(video);

      if (faces.length === 0) {
        faceMovements += 2;
        return;
      }

      const box = faces[0].boundingBox;

      if (lastFaceBox) {
        const dx = Math.abs(box.x - lastFaceBox.x);
        const dy = Math.abs(box.y - lastFaceBox.y);

        if (dx + dy > 15) {
          faceMovements++;
        }
      }

      lastFaceBox = box;
    } catch (err) {
      console.error("Face detection error:", err);
    }
  }, 1200);
}

function calculateStressScore() {
  let score = 3;

  if (faceMovements > 5) score += 2;
  if (faceMovements > 10) score += 3;
  if (faceMovements > 15) score += 4;

  return Math.min(10, score);
}

/* ================= END INTERVIEW ================= */
function endInterview() {
  const stressScore = calculateStressScore();

  speak("Thank you. This concludes your interview.");
  aiText.innerText = "Interview completed. Generating report...";

  const interviewSummary = {
    interviewLog,
    stressScore
  };

  sessionStorage.setItem(
    "interviewSummary",
    JSON.stringify(interviewSummary)
  );

  clearInterval(faceCheckInterval);

  setTimeout(() => {
    window.location.href = "../report/report.html";
  }, 3000);
}
