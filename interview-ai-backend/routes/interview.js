const express = require("express");
const mongoose = require("mongoose");
const { generateQuestion } = require("../ai/interviewAI");
const { evaluateAnswer } = require("../ai/evaluateAnswer");
const { synthesizeSpeech } = require("../ai/textToSpeech");
const { transcribeSpeech, MAX_AUDIO_BYTES } = require("../ai/speechToText");
const InterviewSession = require("../models/InterviewSession");
const { requireAuth, requireSameUserIdFrom } = require("../middleware/auth");

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

function getProviderStatusCode(err) {
  return Number(err?.response?.status || err?.status || err?.statusCode || 0);
}

function sendAiAuthError(res, serviceLabel, keyName) {
  return res.status(503).json({
    success: false,
    error: `${serviceLabel} is unavailable. Update ${keyName} in interview-ai-backend/.env and restart the backend.`
  });
}

function parseBase64Audio(audioBase64) {
  const raw = String(audioBase64 || "").trim();
  if (!raw) return null;

  const cleaned = raw.includes(",") ? raw.split(",").pop() : raw;
  if (!cleaned) return null;

  try {
    const buffer = Buffer.from(cleaned, "base64");
    return buffer.length ? buffer : null;
  } catch {
    return null;
  }
}

async function requireSessionOwnership(req, res, next) {
  const { sessionId } = req.params;
  if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
    return res.status(400).json({ error: "Invalid sessionId" });
  }

  try {
    const session = await InterviewSession.findById(sessionId).select({ userId: 1 }).lean();
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (String(session.userId) !== String(req?.auth?.userId || "")) {
      return res.status(403).json({ error: "Forbidden" });
    }

    req.sessionOwnershipChecked = true;
    return next();
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to validate session ownership" });
  }
}

/* ================== SESSION START ================== */
router.post("/session/start", dbRequired, requireAuth, requireSameUserIdFrom("body.userId"), async (req, res) => {
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
router.post(
  "/session/:sessionId/entry",
  dbRequired,
  requireAuth,
  requireSessionOwnership,
  async (req, res) => {
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
      { _id: sessionId, userId: req.auth.userId },
      { $pull: { entries: { index: numericIndex } } }
    );

    const updateResult = await InterviewSession.updateOne(
      { _id: sessionId, userId: req.auth.userId },
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
router.post(
  "/session/:sessionId/end",
  dbRequired,
  requireAuth,
  requireSessionOwnership,
  async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ error: "Invalid sessionId" });
    }

    const endedAt = req.body?.endedAt ? new Date(req.body.endedAt) : new Date();

    const session = await InterviewSession.findOneAndUpdate(
      { _id: sessionId, userId: req.auth.userId },
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
router.get(
  "/session/:sessionId",
  dbRequired,
  requireAuth,
  requireSessionOwnership,
  async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ error: "Invalid sessionId" });
    }

    const session = await InterviewSession.findOne({
      _id: sessionId,
      userId: req.auth.userId
    }).lean();
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    return res.json({ success: true, session });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to load session" });
  }
});

/* ================== SESSION LIST ================== */
router.get(
  "/sessions",
  dbRequired,
  requireAuth,
  requireSameUserIdFrom("query.userId"),
  async (req, res) => {
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
router.post("/question", requireAuth, async (req, res) => {
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
    const providerStatus = getProviderStatusCode(err);
    const providerMessage = String(err?.response?.data?.error?.message || err?.message || "");
    if (providerStatus === 429) {
      return res.status(503).json({
        success: false,
        error:
          "Gemini quota exceeded. Set GEMINI_MODEL=gemini-flash-lite-latest in interview-ai-backend/.env, wait for reset, or upgrade billing."
      });
    }
    if (
      providerStatus === 401 ||
      providerStatus === 403 ||
      (providerStatus === 400 && /api key|credential|unauthorized|permission/i.test(providerMessage))
    ) {
      return sendAiAuthError(res, "Interview question service", "GEMINI_API_KEY");
    }

    if (err?.code === "GEMINI_API_KEY_MISSING" || String(err?.message || "").includes("GEMINI_API_KEY is not set")) {
      return sendAiAuthError(res, "Interview question service", "GEMINI_API_KEY");
    }

    console.error("Interview question error:", err.message);

    return res.status(500).json({
      success: false,
      error: "Failed to generate question"
    });
  }
});

/* ================== EVALUATE USER ANSWER ================== */
router.post("/evaluate", requireAuth, async (req, res) => {
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
    const providerStatus = getProviderStatusCode(err);
    const providerMessage = String(err?.response?.data?.error?.message || err?.message || "");
    if (providerStatus === 429) {
      return res.status(503).json({
        success: false,
        error:
          "Gemini quota exceeded. Set GEMINI_MODEL=gemini-flash-lite-latest in interview-ai-backend/.env, wait for reset, or upgrade billing."
      });
    }
    if (
      providerStatus === 401 ||
      providerStatus === 403 ||
      (providerStatus === 400 && /api key|credential|unauthorized|permission/i.test(providerMessage))
    ) {
      return sendAiAuthError(res, "Answer evaluation service", "GEMINI_API_KEY");
    }

    if (err?.code === "GEMINI_API_KEY_MISSING" || String(err?.message || "").includes("GEMINI_API_KEY is not set")) {
      return sendAiAuthError(res, "Answer evaluation service", "GEMINI_API_KEY");
    }

    console.error("Answer evaluation error:", err.message);

    return res.status(500).json({
      success: false,
      error: "Failed to evaluate answer"
    });
  }
});

/* ================== TRANSCRIBE USER VOICE ================== */
router.post("/transcribe", requireAuth, async (req, res) => {
  try {
    const { audioBase64, mimeType, language, prompt } = req.body || {};
    const audioBuffer = parseBase64Audio(audioBase64);

    if (!audioBuffer) {
      return res.status(400).json({
        success: false,
        error: "Audio is required"
      });
    }

    if (audioBuffer.length > MAX_AUDIO_BYTES) {
      return res.status(413).json({
        success: false,
        error: "Audio is too large. Keep recordings under 6MB."
      });
    }

    const result = await transcribeSpeech({
      audioBuffer,
      mimeType,
      language,
      prompt
    });

    return res.json({
      success: true,
      text: result.text,
      provider: result.provider
    });
  } catch (err) {
    if (err?.code === "STT_API_KEY_MISSING") {
      return res.status(503).json({
        success: false,
        error:
          "Voice transcription is unavailable. Set OPENAI_API_KEY or GEMINI_API_KEY in interview-ai-backend/.env."
      });
    }

    if (err?.code === "AUDIO_TOO_LARGE") {
      return res.status(413).json({
        success: false,
        error: err.message
      });
    }

    const providerStatus = getProviderStatusCode(err);
    const providerMessage = String(err?.response?.data?.error?.message || err?.message || "");
    if (
      providerStatus === 401 ||
      providerStatus === 403 ||
      (providerStatus === 400 && /api key|credential|unauthorized|permission/i.test(providerMessage))
    ) {
      return res.status(503).json({
        success: false,
        error:
          "Voice transcription auth failed. Check OPENAI_API_KEY or GEMINI_API_KEY in interview-ai-backend/.env."
      });
    }

    console.error("Transcription error:", err.message);
    return res.status(500).json({
      success: false,
      error: "Failed to transcribe audio"
    });
  }
});

/* ================== TTS (HUMAN-LIKE AI VOICE) ================== */
router.post("/tts", requireAuth, async (req, res) => {
  try {
    const {
      text,
      voice,
      speed,
      language,
      style,
      responseFormat
    } = req.body || {};

    const cleanText = String(text || "").trim();
    if (!cleanText) {
      return res.status(400).json({
        success: false,
        error: "Text is required"
      });
    }

    if (cleanText.length > 1200) {
      return res.status(400).json({
        success: false,
        error: "Text is too long for TTS. Keep it under 1200 characters."
      });
    }

    const result = await synthesizeSpeech({
      text: cleanText,
      voice,
      speed,
      language,
      style,
      responseFormat
    });

    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-TTS-Provider", result.provider || "unknown");
    res.setHeader("X-TTS-Model", result.model);
    res.setHeader("X-TTS-Voice", result.voice);

    return res.send(result.audioBuffer);
  } catch (err) {
    if (err?.code === "GEMINI_API_KEY_MISSING") {
      return res.status(503).json({
        success: false,
        error: "Neural voice unavailable. Set GEMINI_API_KEY in interview-ai-backend/.env."
      });
    }

    if (err?.code === "OPENAI_API_KEY_MISSING") {
      return res.status(503).json({
        success: false,
        error: "Neural voice unavailable. Set OPENAI_API_KEY in interview-ai-backend/.env."
      });
    }

    if (err?.code === "TTS_API_KEY_MISSING") {
      return res.status(503).json({
        success: false,
        error:
          "Neural voice unavailable. Set GEMINI_API_KEY (preferred) or OPENAI_API_KEY in interview-ai-backend/.env."
      });
    }

    const providerStatus = getProviderStatusCode(err);
    if (providerStatus === 429) {
      return res.status(503).json({
        success: false,
        error:
          "Voice quota exceeded. Try again later, switch GEMINI_TTS_MODEL, or upgrade your provider plan."
      });
    }

    const providerMessage = String(err?.response?.data?.error?.message || err?.message || "");
    if (
      providerStatus === 401 ||
      providerStatus === 403 ||
      (providerStatus === 400 && /api key|credential|unauthorized|permission/i.test(providerMessage))
    ) {
      return res.status(503).json({
        success: false,
        error:
          "Neural voice auth failed. Check GEMINI_API_KEY (or OPENAI_API_KEY) in interview-ai-backend/.env."
      });
    }

    console.error(
      "TTS error",
      providerStatus ? `(provider status ${providerStatus})` : "",
      err?.message || ""
    );
    return res.status(500).json({
      success: false,
      error: "Failed to generate speech"
    });
  }
});

module.exports = router;
