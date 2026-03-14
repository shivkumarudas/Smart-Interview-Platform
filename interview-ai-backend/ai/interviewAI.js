const { tryParseJson } = require("./jsonUtils");
const { generateGeminiContent, getGeminiModel } = require("./geminiClient");

function truncate(text, maxLen) {
  const value = String(text || "").trim();
  if (!value) return "";
  if (value.length <= maxLen) return value;
  if (maxLen <= 3) return value.slice(0, maxLen);
  return `${value.slice(0, maxLen - 3)}...`;
}

function normalizeWhitespace(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function normalizeLeadIn(text, maxLen = 110) {
  let value = normalizeWhitespace(text).replace(/^["'`]+|["'`]+$/g, "");
  if (!value) return "";

  if (value.length > maxLen) {
    value = `${value.slice(0, maxLen - 3).trim()}...`;
  }

  value = value.replace(/\s+/g, " ").trim();
  value = value.replace(/[!?]+$/g, "").replace(/[.]+$/g, "");

  if (!value) return "";
  return `${value}.`;
}

function normalizeQuestion(text, maxLen = 280) {
  let value = normalizeWhitespace(text).replace(/^["'`]+|["'`]+$/g, "");
  if (!value) return "";

  value = value.replace(/^(question|next question)\s*:\s*/i, "");

  if (value.length > maxLen) {
    value = value.slice(0, maxLen).trim();
  }

  const firstQuestionMark = value.indexOf("?");
  if (firstQuestionMark !== -1) {
    value = value.slice(0, firstQuestionMark + 1).trim();
  } else {
    value = value.replace(/[.!]+$/g, "").trim();
    value = `${value}?`;
  }

  return value;
}

function normalizeStringArray(value, maxItems, maxLen) {
  if (!Array.isArray(value)) return [];

  const out = [];
  const seen = new Set();

  value.forEach((entry) => {
    if (out.length >= maxItems) return;

    const normalized = normalizeWhitespace(entry);
    if (!normalized) return;

    const trimmed = normalized.length > maxLen
      ? `${normalized.slice(0, maxLen - 3).trim()}...`
      : normalized;

    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;

    seen.add(key);
    out.push(trimmed);
  });

  return out;
}

function isLikelySkipAnswer(answer) {
  const value = normalizeWhitespace(answer).toLowerCase();
  if (!value) return true;
  return /^(i\s*don'?t\s*know|no\s*idea|not\s*sure|skip|pass|skipped)\b/.test(value);
}

function buildFallbackLeadIn(historyLength, contextAnswer) {
  if (!historyLength) {
    return "Let's start with this";
  }

  if (isLikelySkipAnswer(contextAnswer)) {
    return "No problem, let's try a different angle";
  }

  const answerWordCount = normalizeWhitespace(contextAnswer).split(" ").filter(Boolean).length;
  if (answerWordCount < 10) {
    return "Thanks, let's go one level deeper";
  }

  const variants = [
    "Thanks, that was helpful context",
    "Good, let's build on that",
    "Nice, let's move to the next scenario"
  ];

  return variants[historyLength % variants.length];
}

function extractQuestionFromRaw(raw) {
  const text = normalizeWhitespace(raw).replace(/```json|```/gi, "").trim();
  if (!text) return "";

  const quotedMatch = text.match(/"question"\s*:\s*"([^"]+)"/i);
  if (quotedMatch?.[1]) {
    return normalizeQuestion(quotedMatch[1]);
  }

  const qIndex = text.indexOf("?");
  if (qIndex !== -1) {
    const snippet = text.slice(0, qIndex + 1);
    return normalizeQuestion(snippet);
  }

  return "";
}

function shapeQuestionJson(parsed, { config, context, history }) {
  const safe = parsed && typeof parsed === "object" ? parsed : {};

  const question = normalizeQuestion(safe.question);
  if (!question) return null;

  const fallbackLeadIn = buildFallbackLeadIn(history.length, context?.answer || "");
  const leadIn = normalizeLeadIn(
    safe.leadIn || safe.interviewerLeadIn || safe.preface || fallbackLeadIn
  );

  return {
    leadIn,
    question,
    category: normalizeWhitespace(safe.category) || String(config?.interviewType || "Technical"),
    difficulty: normalizeWhitespace(safe.difficulty) || String(config?.difficulty || "Easy"),
    expectedKeyPoints: normalizeStringArray(safe.expectedKeyPoints, 6, 120),
    followUps: normalizeStringArray(safe.followUps, 5, 140)
  };
}

async function generateQuestion(profile = {}, config = {}, context = null) {
  const role = profile.role || "Software Developer";
  const skills = profile.skills || "Programming, Problem Solving";
  const experience = profile.experience || "Fresher";
  const education = profile.education || "Bachelor's Degree";

  const interviewType = config.interviewType || "Technical";
  const difficulty = config.difficulty || "Easy";

  const history = Array.isArray(context?.history) ? context.history : [];
  const historyBlock = history.length
    ? `
Recent interview history (most recent last):
${history
  .slice(-3)
  .map((entry, idx) => {
    const number = Math.max(1, history.length - 2) + idx;
    const question = truncate(entry?.question, 220);
    const answer = truncate(entry?.answer, 280);
    return `#${number} Q: ${question}\n#${number} A: ${answer}`;
  })
  .join("\n\n")}
`
    : "";

  const contextBlock = context?.question && context?.answer
    ? `
Previous question: ${context.question}
Candidate answer: ${context.answer}

Ask the next interview question based on the candidate's answer.
`
    : "";

  const prompt = `
You are a senior interviewer in a live one-on-one interview.
Sound natural, warm, and human. Avoid robotic phrasing.

Role: ${role}
Skills: ${skills}
Experience: ${experience}
Education: ${education}

Interview type: ${interviewType}
Difficulty: ${difficulty}

${historyBlock}
${contextBlock}
Return ONLY valid JSON (no markdown, no extra text) with this shape:
{
  "leadIn": string,
  "question": string,
  "category": string,
  "difficulty": string,
  "expectedKeyPoints": string[],
  "followUps": string[]
}
Rules:
- Ask ONE clear question only in "question" (no multi-part questions).
- "question" must be a single sentence that ends with "?".
- Keep "question" conversational and specific to the role and skills.
- Keep "leadIn" as one short spoken transition (max 12 words, no question mark).
- If there is previous context, briefly acknowledge the answer in "leadIn".
- Do not repeat recent questions.
- Do not include markdown, numbering, or labels like "Question:" in output.
`;

  try {
    const result = await generateGeminiContent({
      parts: [{ text: prompt }],
      model: getGeminiModel(),
      temperature: 0.6,
      timeoutMs: 15000
    });

    const raw = String(result.raw || "").trim();
    const parsed = tryParseJson(raw);
    const shaped = shapeQuestionJson(parsed, { config, context, history });

    if (shaped) {
      return {
        raw,
        json: shaped
      };
    }

    const fallbackQuestion = extractQuestionFromRaw(raw);
    if (fallbackQuestion) {
      return {
        raw,
        json: {
          leadIn: normalizeLeadIn(buildFallbackLeadIn(history.length, context?.answer || "")),
          question: fallbackQuestion,
          category: String(config?.interviewType || "Technical"),
          difficulty: String(config?.difficulty || "Easy"),
          expectedKeyPoints: [],
          followUps: []
        }
      };
    }

    return {
      raw,
      json: parsed
    };
  } catch (err) {
    console.error("Gemini API error:");
    if (err.response) {
      console.error("Status:", err.response.status);
      console.error("Data:", err.response.data);
    } else {
      console.error(err.message);
    }
    throw err;
  }
}

module.exports = { generateQuestion };
