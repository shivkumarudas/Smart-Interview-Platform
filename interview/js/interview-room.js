console.log("interview-room loaded");

/* ================= AUTH CHECK ================= */
const user = JSON.parse(localStorage.getItem("user"));
if (!user) {
  window.location.href = "../auth/login.html";
}

/* ================= LOAD CONFIG ================= */
const config = JSON.parse(localStorage.getItem("interviewConfig"));
if (!config) {
  window.location.href = "interview-setup.html";
}

/* ================= CAMERA ================= */
const video = document.getElementById("userVideo");

navigator.mediaDevices.getUserMedia({ video: true, audio: false })
  .then(stream => {
    video.srcObject = stream;
  })
  .catch(() => {
    alert("Camera permission required");
  });

/* ================= TIMER ================= */
let seconds = 0;
setInterval(() => {
  seconds++;
  const m = String(Math.floor(seconds / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  document.getElementById("timer").innerText = `⏱ ${m}:${s}`;
}, 1000);

/* ================= QUESTIONS ================= */
let questions = [];
let index = 0;

async function loadQuestions() {
  const res = await fetch(`http://127.0.0.1:5000/profile/${user.id}`);
  const profile = await res.json();

  const skill = profile.skills.split(",")[0];

  if (config.type === "HR") {
    questions = [
      `Tell me about yourself.`,
      `Why do you want this role of ${profile.role}?`,
      `Where do you see yourself in 5 years?`
    ];
  }

  if (config.type === "Technical") {
    questions = [
      `Explain ${skill} in detail.`,
      `What challenges have you faced using ${skill}?`,
      `How would you optimize a real-world project using ${skill}?`
    ];
  }

  if (config.type === "Behavioral") {
    questions = [
      `Describe a difficult situation you handled.`,
      `How do you handle pressure?`,
      `Tell me about a failure and what you learned.`
    ];
  }

  if (config.type === "Mixed") {
    questions = [
      `Introduce yourself.`,
      `Explain ${skill}.`,
      `Describe a challenge you faced.`,
      `Why should we hire you?`
    ];
  }

  showQuestion();
}

function showQuestion() {
  if (index >= questions.length) {
    document.getElementById("questionText").innerText =
      "Interview completed 🎉";
    document.getElementById("nextBtn").style.display = "none";
    return;
  }

  document.getElementById("questionText").innerText =
    questions[index];
}

document.getElementById("nextBtn").addEventListener("click", () => {
  index++;
  showQuestion();
});

/* ================= INIT ================= */
loadQuestions();
