console.log("Interview setup loaded");

// AUTH CHECK
const user = JSON.parse(localStorage.getItem("user"));
if (!user) {
  window.location.href = "../auth/login.html";
}

// FORM HANDLER
document.getElementById("setupForm").addEventListener("submit", (e) => {
  e.preventDefault();

  const interviewConfig = {
    interviewType: document.getElementById("interviewType").value,
    difficulty: document.getElementById("difficulty").value,
    duration: document.getElementById("duration").value,
    startedAt: new Date().toISOString()
  };

  // VALIDATION
  for (let key in interviewConfig) {
    if (!interviewConfig[key]) {
      alert("Please select all required fields");
      return;
    }
  }

  // STORE CONFIG
  localStorage.setItem(
    "interviewConfig",
    JSON.stringify(interviewConfig)
  );

  // GO TO INTERVIEW ROOM
  window.location.href = "../interview/interview-room.html";
});
