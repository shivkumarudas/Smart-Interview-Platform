const express = require("express");
const mongoose = require("mongoose");
const { generateQuestion } = require("../ai/interviewAI");
const { evaluateAnswer } = require("../ai/evaluateAnswer");
const InterviewSession = require("../models/InterviewSession");

const router = express.Router();

function dbRequired(req, res, next) {
  if (mongoose.connection.readyState === 1) {
    return next();
  }
  return res.status(503).json({
    error:
      "Database not connected. Set MONGO_URI in interview-ai-backend/.env and restart the server."
  });
}

function sanitizeProfileSnapshot(profile) {
  if (!profile || typeof profile !== "object") return null;
  const snapshot = {};
  const allowedKeys = [
    "name",
    "email",
    "phone",
    "location",
    "education",
    "experienceYears",
    "experience",
    "role",
    "skills",
    "linkedin",
    "portfolio",
    "interviewType",
    "availability",
    "language"
  ];

  allowedKeys.forEach((key) => {
    if (profile[key] !== undefined) snapshot[key] = profile[key];
  });

  return snapshot;
}

/* ================== SESSION START ================== */
router.post("/session/start", dbRequired, async (req, res) => {
  try {
    const { userId, config, profile } = req.body || {};

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid userId" });
    }

    const session = await InterviewSession.create({
      userId,
      config: config && typeof config === "object" ? config : {},
      profileSnapshot: sanitizeProfileSnapshot(profile),
      startedAt: new Date()
    });

    return res.json({
      success: true,
      sessionId: session._id.toString(),
      startedAt: session.startedAt
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to start session" });
  }
});

/* ================== SESSION APPEND ENTRY ================== */
router.post("/session/:sessionId/entry", dbRequired, async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ error: "Invalid sessionId" });
    }

    const {
      index,
      askedAt,
      question,
      questionJson,
      answer,
      answeredAt,
      evaluation,
      evaluationJson,
      score
    } = req.body || {};

    const numericIndex = Number(index);
    if (!Number.isFinite(numericIndex) || numericIndex < 1) {
      return res.status(400).json({ error: "Invalid index" });
    }

    if (!question || typeof question !== "string" || !question.trim()) {
      return res.status(400).json({ error: "Question is required" });
    }

    const entry = {
      index: numericIndex,
      askedAt: askedAt ? new Date(askedAt) : undefined,
      question: question.trim(),
      questionJson: questionJson && typeof questionJson === "object" ? questionJson : undefined,
      answer: typeof answer === "string" ? answer.trim() : undefined,
      answeredAt: answeredAt ? new Date(answeredAt) : undefined,
      evaluation: typeof evaluation === "string" ? evaluation.trim() : undefined,
      evaluationJson: evaluationJson && typeof evaluationJson === "object" ? evaluationJson : undefined,
      score: Number.isFinite(Number(score)) ? Number(score) : undefined
    };

    await InterviewSession.updateOne(
      { _id: sessionId },
      { $pull: { entries: { index: numericIndex } } }
    );

    const updateResult = await InterviewSession.updateOne(
      { _id: sessionId },
      { $push: { entries: entry } }
    );

    if (!updateResult.matchedCount) {
      return res.status(404).json({ error: "Session not found" });
    }

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to save entry" });
  }
});

/* ================== SESSION END ================== */
router.post("/session/:sessionId/end", dbRequired, async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ error: "Invalid sessionId" });
    }

    const endedAt = req.body?.endedAt ? new Date(req.body.endedAt) : new Date();

    const session = await InterviewSession.findByIdAndUpdate(
      sessionId,
      { endedAt },
      { new: true }
    ).lean();

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    return res.json({ success: true, session });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to end session" });
  }
});

/* ================== SESSION GET ================== */
router.get("/session/:sessionId", dbRequired, async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ error: "Invalid sessionId" });
    }

    const session = await InterviewSession.findById(sessionId).lean();
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    return res.json({ success: true, session });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to load session" });
  }
});

/* ================== SESSION LIST ================== */
router.get("/sessions", dbRequired, async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid userId" });
    }

    const sessions = await InterviewSession.find({ userId })
      .sort({ startedAt: -1 })
      .select({ entries: 0 })
      .lean();

    return res.json({ success: true, sessions });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to list sessions" });
  }
});

/* ================== ASK INTERVIEW QUESTION ================== */
router.post("/question", async (req, res) => {
  try {
    const { profile, config, context, history } = req.body || {};

    const profileInput = profile && typeof profile === "object" ? profile : {};
    const configInput = config && typeof config === "object" ? config : {};

    const historyInput = Array.isArray(history)
      ? history
      : Array.isArray(context?.history)
        ? context.history
        : [];

    const contextInput = context && typeof context === "object" ? context : null;
    const aiContext = contextInput
      ? { ...contextInput, history: historyInput }
      : { history: historyInput };

    const questionResult = await generateQuestion(profileInput, configInput, aiContext);
    const questionText = String(
      questionResult?.json?.question || questionResult?.raw || ""
    ).trim();

    if (!questionText) {
      throw new Error("Failed to generate question");
    }

    const questionJson =
      questionResult?.json && typeof questionResult.json === "object"
        ? questionResult.json
        : null;

    const type = String(configInput?.interviewType || "").trim().toLowerCase();
    const coachTip =
      type === "behavioral"
        ? "Tip: Answer using STAR (Situation, Task, Action, Result). Be specific and time-box to 60–90 seconds."
        : type === "hr"
          ? "Tip: Be concise, honest, and tie your answer to the role. Mention impact and what you learned."
          : type === "mixed"
            ? "Tip: Structure your answer (context → approach → impact). If technical, think aloud and cover tradeoffs."
            : "Tip: Think aloud (approach → tradeoffs → edge cases → complexity). Use a small example when possible.";

    res.json({
      success: true,
      question: questionText,
      questionJson,
      coachTip
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
    const { question, answer, profile, config } = req.body || {};

    if (!question || !answer) {
      return res.status(400).json({
        success: false,
        error: "Question or answer missing"
      });
    }

    const profileInput = profile && typeof profile === "object" ? profile : {};
    const configInput = config && typeof config === "object" ? config : {};

    const evaluation = await evaluateAnswer(question, answer, profileInput, configInput);

    res.json({
      success: true,
      evaluation: evaluation.raw,
      evaluationJson: evaluation.json,
      score: evaluation?.json?.score ?? null
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
