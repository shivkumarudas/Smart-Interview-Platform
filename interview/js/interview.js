console.log("interview.js loaded");

/* ================= USER CHECK ================= */
const user = JSON.parse(localStorage.getItem("user"));
const interviewConfig = JSON.parse(localStorage.getItem("interviewConfig"));

if (!user || !interviewConfig) {
  window.location.href = "../dashboard/dashboard.html";
}

/* ================= INTERVIEW INFO ================= */
document.getElementById("interviewInfo").innerText =
  `${interviewConfig.type} • ${interviewConfig.role} • ${interviewConfig.level}`;

/* ================= QUESTIONS (TEMP MOCK) ================= */
const questions = [
  "Tell me about yourself.",
  "What are your strongest skills?",
  "Describe a challenge you faced and how you solved it.",
  "Why should we hire you?",
  "Where do you see yourself in 5 years?"
];

let currentIndex = 0;
const answers = [];

/* ================= LOAD QUESTION ================= */
function loadQuestion() {
  document.getElementById("questionText").innerText =
    questions[currentIndex];
  document.getElementById("answer").value = "";
}

loadQuestion();

/* ================= NEXT QUESTION ================= */
document.getElementById("nextBtn").addEventListener("click", () => {
  const answerText = document.getElementById("answer").value.trim();

  if (!answerText) {
    alert("Please answer the question");
    return;
  }

  answers.push({
    question: questions[currentIndex],
    answer: answerText
  });

  currentIndex++;

  if (currentIndex < questions.length) {
    loadQuestion();
  } else {
    // Save interview responses
    localStorage.setItem("interviewAnswers", JSON.stringify(answers));

    // Go to report page (next step)
    window.location.href = "../report/report.html";
  }
});
