console.log("Interview Room Loaded");

/* ================= AUTH ================= */
const user = JSON.parse(localStorage.getItem("user"));
const interviewConfig = JSON.parse(localStorage.getItem("interviewConfig"));

if (!user || !interviewConfig) {
  window.location.href = "../dashboard/dashboard.html";
}

/* ================= CAMERA ================= */
const video = document.getElementById("userVideo");

navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  .then(stream => {
    video.srcObject = stream;
  })
  .catch(() => alert("Camera and mic permission required"));

/* ================= UI ELEMENTS ================= */
const aiText = document.getElementById("aiText");
const answerText = document.getElementById("answerText");
const aiAvatar = document.getElementById("aiAvatar");
let isCapturing = false;
let micActivationPending = false;

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

/* ================= START INTERVIEW ================= */
setTimeout(() => {
  const intro = `Hello ${user.name || "Candidate"}.
This will be a ${interviewConfig.difficulty} ${interviewConfig.interviewType} interview.
Let us begin.`;

  aiText.innerText = intro;
  speak(intro);

  setTimeout(askAIQuestion, 4000);
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

    const res = await fetch("http://localhost:5000/interview/question", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profile: {
          role: interviewConfig.role || "Software Developer",
          skills: interviewConfig.skills || "Programming",
          experience: interviewConfig.experience || "Fresher",
          education: interviewConfig.education || "B.Tech"
        },
        config: {
          interviewType: interviewConfig.interviewType || "Technical",
          difficulty: interviewConfig.difficulty || "Easy"
        },
        context: lastEntry
          ? { question: lastEntry.question, answer: lastEntry.answer }
          : null
      })
    });

    const data = await res.json();
    if (!res.ok || !data.question) {
      throw new Error(data.error || "Failed to get question");
    }

    questionCount++;
    aiText.innerText = data.question;
    speak(data.question);

    answerText.innerText = "Answer when you're ready...";
    beginAnswerCapture();

  } catch (err) {
    console.error("Question error:", err);
    aiText.innerText = err.message;
    setAIState("idle");
  }
}

/* ================= SPEECH TO TEXT ================= */
let recognition;
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
    if (!isCapturing) return;

    const trimmedAnswer = (finalAnswer.trim() || latestTranscript.trim());
    if (!trimmedAnswer) {
      answerText.innerText = "I didn't catch that. Please answer again...";
      beginAnswerCapture();
      return;
    }

    submitAnswer();
  };

  recognition.onerror = (event) => {
    isCapturing = false;
    if (event?.error === "not-allowed" || event?.error === "service-not-allowed") {
      requestMicActivation();
      return;
    }
    answerText.innerText = "Microphone error. Please refresh and allow mic access.";
  };
} else {
  alert("Speech recognition not supported. Use Chrome.");
}

function requestMicActivation() {
  if (micActivationPending) return;
  micActivationPending = true;
  answerText.innerText = "Click anywhere to enable the mic, then answer.";
  document.addEventListener(
    "click",
    () => {
      micActivationPending = false;
      beginAnswerCapture();
    },
    { once: true }
  );
}

function beginAnswerCapture() {
  if (!recognition) return;

  finalAnswer = "";
  latestTranscript = "";
  isCapturing = true;
  answerText.innerText = "Listening...";
  setAIState("thinking");
  try {
    recognition.start();
  } catch (err) {
    isCapturing = false;
    requestMicActivation();
  }
}

async function submitAnswer() {
  isCapturing = false;
  const trimmedAnswer = (finalAnswer.trim() || latestTranscript.trim());
  const isNoAnswer = !trimmedAnswer ||
    /^(i\s*don'?t\s*know|no\s*idea|not\s*sure|skip|pass)\b/i.test(trimmedAnswer);

  if (isNoAnswer) {
    interviewLog.push({
      question: aiText.innerText,
      answer: trimmedAnswer || "No answer",
      feedback: "Skipped"
    });

    answerText.innerText = "No answer detected. Moving to the next question...";
    finalAnswer = "";
    setTimeout(askAIQuestion, 2500);
    return;
  }

  try {
    // SEND ANSWER FOR AI EVALUATION
    const res = await fetch("http://localhost:5000/interview/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: aiText.innerText,
        answer: trimmedAnswer
      })
    });

    const data = await res.json();
    if (!res.ok || !data.evaluation) {
      throw new Error(data.error || "Evaluation failed");
    }

    // SHOW FEEDBACK
    answerText.innerText = "AI Feedback:\n\n" + data.evaluation;

    interviewLog.push({
      question: aiText.innerText,
      answer: trimmedAnswer,
      feedback: data.evaluation
    });

    finalAnswer = "";
    setTimeout(askAIQuestion, 5000);

  } catch (err) {
    console.error("Evaluation error:", err);
    answerText.innerText = err.message;
    setAIState("idle");
  }
}

/* ================= END INTERVIEW ================= */
function endInterview() {
  setAIState("idle");
  speak("Thank you. This concludes your interview.");

  aiText.innerText = "Interview completed. Preparing report...";

  const endedAt = new Date().toISOString();
  sessionStorage.setItem("interviewEndedAt", endedAt);
  localStorage.setItem("lastInterviewEndedAt", endedAt);

  sessionStorage.setItem("interviewSummary", JSON.stringify(interviewLog));
  localStorage.setItem("lastInterviewSummary", JSON.stringify(interviewLog));

  setTimeout(() => {
    window.location.href = "../report/report.html";
  }, 3000);
}
