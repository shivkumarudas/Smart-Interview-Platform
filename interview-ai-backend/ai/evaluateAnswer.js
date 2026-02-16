const { tryParseJson } = require("./jsonUtils");
const { generateGeminiContent, getGeminiModel } = require("./geminiClient");

async function evaluateAnswer(question, answer, profile = {}, config = {}) {
  const role = profile?.role || "Software Developer";
  const skills = profile?.skills || "Programming, Problem Solving";
  const experience = profile?.experience || "Fresher";
  const interviewType = config?.interviewType || profile?.interviewType || "Technical";
  const difficulty = config?.difficulty || "Easy";

  const prompt = `
You are an interview evaluator.

Role: ${role}
Skills: ${skills}
Experience: ${experience}
Interview type: ${interviewType}
Difficulty: ${difficulty}

Question:
${question}

Candidate Answer:
${answer}

Return ONLY valid JSON (no markdown, no extra text) with these keys:
{
  "score": number (1-10),
  "overallFeedback": string (1-2 sentences),
  "strengths": string[],
  "improvements": string[],
  "communication": string[],
  "betterAnswer": string (short improved answer),
  "followUpQuestion": string (optional)
}
`;

  const result = await generateGeminiContent({
    parts: [{ text: prompt }],
    model: getGeminiModel(),
    temperature: 0.2,
    timeoutMs: 15000
  });

  const raw = String(result.raw || "").trim();
  return {
    raw,
    json: tryParseJson(raw)
  };
}

module.exports = { evaluateAnswer };
