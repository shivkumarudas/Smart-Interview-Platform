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
const aiAvatar = document.getElementById("aiAvatar");

/* ================= AI AVATAR STATES ================= */
function setAIState(state) {
  const states = {
    idle: "assets/ai-idle.json",
    speaking: "assets/ai-speaking.json",
    thinking: "assets/ai-thinking.json"
  };
  if (aiAvatar) aiAvatar.setAttribute("src", states[state]);
}

/* ================= AI SPEECH ================= */
function speak(text) {
  speechSynthesis.cancel();
  setAIState("speaking");

  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";

  u.onend = () => setAIState("idle");

  speechSynthesis.speak(u);
}

/* ================= INTERVIEW STATE ================= */
let questionCount = 0;
const maxQuestions = 5;
let interviewLog = [];

/* ================= VOICE METRICS ================= */
let answerStartTime = null;
let pauseCount = 0;
let lastSpeechTime = null;
let finalAnswer = "";

/* ================= FACE METRICS ================= */
let faceMovements = 0;
let lastFaceBox = null;
let faceInterval;

/* ================= START INTERVIEW ================= */
setTimeout(async () => {
  const intro = `Hello ${user.name || "Candidate"}. 
This will be a ${interviewConfig.difficulty} ${interviewConfig.interviewType} interview. 
Let us begin.`;

  aiText.innerText = intro;
  speak(intro);

  startFaceAnalysis();
  setTimeout(askAIQuestion, 5000);
}, 1500);

/* ================= GET AI QUESTION ================= */
async function askAIQuestion() {
  if (questionCount >= maxQuestions) {
    endInterview();
    return;
  }

  try {
    setAIState("thinking");

    const res = await fetch("http://127.0.0.1:5000/interview/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user.id,
        config: interviewConfig
      })
    });

    const data = await res.json();
    if (!data.question) throw new Error("AI returned empty question");

    questionCount++;
    aiText.innerText = data.question;
    speak(data.question);

    answerText.innerText = "Click Start Answer and speak…";

  } catch (err) {
    console.error("AI question error:", err);
    aiText.innerText = "AI failed to generate a question.";
    setAIState("idle");
  }
}

/* ================= SPEECH TO TEXT ================= */
let recognition;

if ("webkitSpeechRecognition" in window) {
  recognition = new webkitSpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  recognition.onresult = (event) => {
    const now = Date.now();
    if (!answerStartTime) answerStartTime = now;

    if (lastSpeechTime && now - lastSpeechTime > 1200) pauseCount++;
    lastSpeechTime = now;

    let transcript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }

    finalAnswer = transcript;
    answerText.innerText = transcript;
  };
}

/* ================= CONTROLS ================= */
startBtn.onclick = () => {
  finalAnswer = "";
  answerText.innerText = "Listening...";
  setAIState("thinking");
  recognition.start();
};

stopBtn.onclick = () => {
  recognition.stop();

  const duration = (Date.now() - answerStartTime) / 1000;
  const words = finalAnswer.trim().split(/\s+/).length;
  const wpm = Math.round((words / duration) * 60);
  const confidence = calculateConfidence(duration, pauseCount, wpm);

  interviewLog.push({
    question: aiText.innerText,
    answer: finalAnswer,
    duration,
    pauses: pauseCount,
    wpm,
    confidence
  });

  resetVoiceMetrics();
  setTimeout(askAIQuestion, 2000);
};

/* ================= CONFIDENCE ================= */
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
  pauseCount = 0;
  lastSpeechTime = null;
}

/* ================= FACE / STRESS ================= */
async function startFaceAnalysis() {
  if (!("FaceDetector" in window)) return;

  const detector = new FaceDetector({ fastMode: true });

  faceInterval = setInterval(async () => {
    const faces = await detector.detect(video);

    if (!faces.length) {
      faceMovements += 2;
      return;
    }

    const box = faces[0].boundingBox;
    if (lastFaceBox) {
      const movement = Math.abs(box.x - lastFaceBox.x) +
                       Math.abs(box.y - lastFaceBox.y);
      if (movement > 15) faceMovements++;
    }
    lastFaceBox = box;
  }, 1200);
}

function calculateStress() {
  let score = 3;
  if (faceMovements > 5) score += 2;
  if (faceMovements > 10) score += 3;
  return Math.min(10, score);
}

/* ================= END INTERVIEW ================= */
function endInterview() {
  clearInterval(faceInterval);
  setAIState("idle");

  speak("Thank you. This concludes your interview.");
  aiText.innerText = "Interview completed. Generating report...";

  sessionStorage.setItem("interviewSummary", JSON.stringify({
    interviewLog,
    stressScore: calculateStress()
  }));

  setTimeout(() => {
    window.location.href = "../report/report.html";
  }, 3000);
}
