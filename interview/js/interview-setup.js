console.log("interview-setup loaded");

const user = JSON.parse(localStorage.getItem("user"));
if (!user) {
  window.location.href = "../auth/login.html";
}

document.getElementById("setupForm").addEventListener("submit", (e) => {
  e.preventDefault();

  const interviewConfig = {
    type: document.getElementById("type").value,
    difficulty: document.getElementById("difficulty").value
  };

  if (!interviewConfig.type || !interviewConfig.difficulty) {
    alert("Select all options");
    return;
  }

  // store config for interview room
  localStorage.setItem("interviewConfig", JSON.stringify(interviewConfig));

  window.location.href = "interview-room.html";
});
