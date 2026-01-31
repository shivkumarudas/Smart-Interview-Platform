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

/* ================= START INTERVIEW ================= */
setTimeout(async () => {
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

    const res = await fetch("http://127.0.0.1:5000/interview/question", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profile: {
          role: interviewConfig.role,
          skills: interviewConfig.skills,
          experience: interviewConfig.experience,
          education: interviewConfig.education
        },
        config: {
          interviewType: interviewConfig.interviewType,
          difficulty: interviewConfig.difficulty
        }
      })
    });

    const data = await res.json();

    if (!res.ok || !data.question) {
      throw new Error(data.error || "AI returned empty question");
    }

    questionCount++;
    aiText.innerText = data.question;
    speak(data.question);

    answerText.innerText = "Click Start Answer and speak…";

  } catch (err) {
    console.error("AI question error:", err);
    aiText.innerText = err.message;
    setAIState("idle");
  }
}

/* ================= SPEECH TO TEXT ================= */
let recognition;
let finalAnswer = "";

if ("webkitSpeechRecognition" in window) {
  recognition = new webkitSpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  recognition.onresult = (event) => {
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

  interviewLog.push({
    question: aiText.innerText,
    answer: finalAnswer
  });

  setTimeout(askAIQuestion, 2000);
};

/* ================= END INTERVIEW ================= */
function endInterview() {
  setAIState("idle");
  speak("Thank you. This concludes your interview.");

  aiText.innerText = "Interview completed.";

  sessionStorage.setItem("interviewSummary", JSON.stringify(interviewLog));

  setTimeout(() => {
    window.location.href = "../report/report.html";
  }, 3000);
}
