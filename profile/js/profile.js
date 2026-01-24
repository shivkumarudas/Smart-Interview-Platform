console.log("profile.js loaded");

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("profileForm");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    console.log("Submit clicked");

    const profileData = {
      name: document.getElementById("name").value.trim(),
      education: document.getElementById("education").value,
      experience: document.getElementById("experience").value,
      role: document.getElementById("role").value
    };

    console.log("Sending:", profileData);

    try {
      const response = await fetch("http://127.0.0.1:5000/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileData)
      });

      console.log("Response received:", response.status);

      const result = await response.json();
      console.log("Result:", result);

      if (response.ok) {
        alert("Profile saved successfully!");
        window.location.href = "../dashboard.html";
      } else {
        alert("Server error: " + result.error);
      }

    } catch (err) {
      console.error("Fetch failed:", err);
      alert("Backend not reachable");
    }
  });
});
