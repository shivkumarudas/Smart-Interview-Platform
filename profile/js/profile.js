console.log("profile.js loaded");

document.addEventListener("DOMContentLoaded", () => {

  /* ================= USER CHECK ================= */
  const user = JSON.parse(localStorage.getItem("user"));
  if (!user || !user.id) {
    window.location.href = "../auth/login.html";
    return;
  }

  const form = document.getElementById("profileForm");
  const statusMsg = document.getElementById("statusMsg");
  const editBtn = document.getElementById("editBtn");
  const saveBtn = document.getElementById("saveBtn");

  /* ================= LOAD PROFILE ================= */
  async function loadProfile() {
    try {
      const res = await fetch(`http://127.0.0.1:5000/profile/${user.id}`);

      if (!res.ok) {
        console.error("Profile fetch failed", res.status);
        return;
      }

      const profile = await res.json();

      // 👇 FIRST TIME USER (NO PROFILE YET)
      if (!profile) {
        saveBtn.style.display = "inline-block";
        editBtn.style.display = "none";
        return;
      }

      // autofill
      document.getElementById("name").value = profile.name;
      document.getElementById("email").value = profile.email;
      document.getElementById("phone").value = profile.phone;
      document.getElementById("location").value = profile.location;
      document.getElementById("education").value = profile.education;
      document.getElementById("experienceYears").value = profile.experienceYears;
      document.getElementById("experience").value = profile.experience;
      document.getElementById("role").value = profile.role;
      document.getElementById("skills").value = profile.skills;
      document.getElementById("linkedin").value = profile.linkedin;
      document.getElementById("portfolio").value = profile.portfolio || "";
      document.getElementById("interviewType").value = profile.interviewType;
      document.getElementById("availability").value = profile.availability;
      document.getElementById("language").value = profile.language;

      // disable all inputs
      document
        .querySelectorAll("#profileForm input, #profileForm select")
        .forEach(el => el.disabled = true);

      editBtn.style.display = "inline-block";
      saveBtn.style.display = "none";

    } catch (err) {
      console.error("Load profile failed:", err);
    }
  }

  /* ================= CALL ON PAGE LOAD ================= */
  loadProfile();

  /* ================= EDIT BUTTON ================= */
  editBtn.addEventListener("click", () => {
    document
      .querySelectorAll("#profileForm input, #profileForm select")
      .forEach(el => el.disabled = false);

    editBtn.style.display = "none";
    saveBtn.style.display = "inline-block";
  });

  /* ================= SAVE / UPDATE PROFILE ================= */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const profileData = {
      userId: user.id,
      name: document.getElementById("name").value.trim(),
      email: document.getElementById("email").value.trim(),
      phone: document.getElementById("phone").value.trim(),
      location: document.getElementById("location").value.trim(),
      education: document.getElementById("education").value,
      experienceYears: document.getElementById("experienceYears").value,
      experience: document.getElementById("experience").value,
      role: document.getElementById("role").value,
      skills: document.getElementById("skills").value.trim(),
      linkedin: document.getElementById("linkedin").value.trim(),
      portfolio: document.getElementById("portfolio").value.trim(),
      interviewType: document.getElementById("interviewType").value,
      availability: document.getElementById("availability").value,
      language: document.getElementById("language").value
    };

    // validation
    for (let key in profileData) {
      if (!profileData[key] && key !== "portfolio") {
        alert("Please fill all mandatory fields");
        return;
      }
    }

    try {
      const res = await fetch("http://127.0.0.1:5000/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileData)
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Profile save failed");
        return;
      }

      statusMsg.style.display = "block";
      loadProfile(); // reload in read-only mode

    } catch (err) {
      console.error("SAVE FAILED:", err);
      alert("Backend not reachable");
    }
  });

});
