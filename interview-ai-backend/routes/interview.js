const express = require("express");
const { generateQuestion } = require("../ai/interviewAI");
const Profile = require("../models/Profile");

const router = express.Router();

router.post("/start", async (req, res) => {
  try {
    const { userId, config } = req.body;

    if (!userId || !config) {
      return res.status(400).json({ error: "Missing data" });
    }

    const profile = await Profile.findOne({ userId });
    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    const question = await generateQuestion(profile, config);
    res.json({ question });

  } catch (err) {
    console.error("AI ERROR:", err);
    res.status(500).json({ error: "AI generation failed" });
  }
});

module.exports = router;
