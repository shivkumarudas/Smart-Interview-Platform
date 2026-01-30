import express from "express";
import { generateQuestion } from "../ai/interviewAI.js";
import Profile from "../models/Profile.js";

const router = express.Router();

router.post("/start", async (req, res) => {
  try {
    const { userId, config } = req.body;

    const profile = await Profile.findOne({ userId });
    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    const question = await generateQuestion(profile, config);

    res.json({ question });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "AI generation failed" });
  }
});

export default router;
