const user = JSON.parse(localStorage.getItem("user"));
if (!user) {
  window.location.href = "../auth/login.html";
}



function logout() {
  // remove user session
  localStorage.removeItem("user");
  localStorage.removeItem("interviewConfig");

  // redirect to landing page
  window.location.href = "../index.html";
}
