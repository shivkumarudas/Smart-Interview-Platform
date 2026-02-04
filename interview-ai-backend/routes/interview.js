const express = require("express");
const { generateQuestion } = require("../ai/interviewAI");
const { evaluateAnswer } = require("../ai/evaluateAnswer");

const router = express.Router();

/* ================== ASK INTERVIEW QUESTION ================== */
router.post("/question", async (req, res) => {
  try {
    const { profile, config, context } = req.body;

    const question = await generateQuestion(profile, config, context);

    res.json({
      success: true,
      question
    });
  } catch (err) {
    console.error("Interview question error:", err.message);

    res.status(500).json({
      success: false,
      error: err.message || "Failed to generate question"
    });
  }
});

/* ================== EVALUATE USER ANSWER ================== */
router.post("/evaluate", async (req, res) => {
  try {
    const { question, answer } = req.body;

    if (!question || !answer) {
      return res.status(400).json({
        success: false,
        error: "Question or answer missing"
      });
    }

    const evaluation = await evaluateAnswer(question, answer);

    res.json({
      success: true,
      evaluation
    });
  } catch (err) {
    console.error("Answer evaluation error:", err.message);

    res.status(500).json({
      success: false,
      error: err.message || "Failed to evaluate answer"
    });
  }
});

module.exports = router;
