const axios = require("axios");
const { tryParseJson } = require("./jsonUtils");

async function evaluateAnswer(question, answer, profile = {}, config = {}) {
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) {
    throw new Error("GROQ_API_KEY is not set");
  }

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

  const res = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2
    },
    {
      headers: {
        Authorization: `Bearer ${groqApiKey}`,
        "Content-Type": "application/json"
      },
      timeout: 15000
    }
  );

  const content = res.data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Groq returned empty response");
  }

  const raw = content.trim();
  return {
    raw,
    json: tryParseJson(raw)
  };
}

module.exports = { evaluateAnswer };
