const express = require("express");
const { generateQuestion } = require("../ai/interviewAI");

// ✅ DEFINE ROUTER
const router = express.Router();

// ================== INTERVIEW QUESTION ==================
router.post("/question", async (req, res) => {
  try {
    const { profile, config } = req.body;

    const question = await generateQuestion(profile, config);

    res.json({
      success: true,
      question
    });

  } catch (err) {
    console.error("❌ Interview route error:", err.message);

    res.status(500).json({
      success: false,
      error: err.message || "Groq request failed"
    });
  }
});

module.exports = router;
