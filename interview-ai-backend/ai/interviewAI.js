const axios = require("axios");
const { tryParseJson } = require("./jsonUtils");

function truncate(text, maxLen) {
  const value = String(text || "").trim();
  if (!value) return "";
  if (value.length <= maxLen) return value;
  if (maxLen <= 3) return value.slice(0, maxLen);
  return `${value.slice(0, maxLen - 3)}...`;
}

async function generateQuestion(profile = {}, config = {}, context = null) {
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) {
    throw new Error("GROQ_API_KEY is not set");
  }

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
You are a professional interviewer. Ask high-quality, realistic questions.

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
  "question": string,
  "category": string,
  "difficulty": string,
  "expectedKeyPoints": string[],
  "followUps": string[]
}
Rules:
- Ask ONE question only in "question" (no multi-part questions).
- Do not repeat recent questions.
- Make the question specific to the role and skills.
`;

  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.6
      },
      {
        headers: {
          Authorization: `Bearer ${groqApiKey}`,
          "Content-Type": "application/json"
        },
        timeout: 15000
      }
    );

    const content = response.data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Groq returned empty response");
    }

    const raw = content.trim();
    return {
      raw,
      json: tryParseJson(raw)
    };
  } catch (err) {
    console.error("Groq API error:");
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

