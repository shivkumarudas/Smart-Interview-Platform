const axios = require("axios");

const GEMINI_API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_GEMINI_MODEL = "gemini-flash-lite-latest";

function getGeminiApiKey() {
  return String(process.env.GEMINI_API_KEY || "").trim();
}

function hasGeminiApiKey() {
  return !!getGeminiApiKey();
}

function getGeminiModel(defaultModel = DEFAULT_GEMINI_MODEL) {
  return String(process.env.GEMINI_MODEL || defaultModel).trim() || defaultModel;
}

function buildGenerateContentUrl(model, apiKey) {
  const encodedModel = encodeURIComponent(String(model || "").trim());
  const encodedKey = encodeURIComponent(String(apiKey || "").trim());
  return `${GEMINI_API_ROOT}/${encodedModel}:generateContent?key=${encodedKey}`;
}

function readTextFromCandidate(candidate) {
  const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
  return parts
    .map((part) => String(part?.text || "").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function readGeminiText(responseData) {
  const candidates = Array.isArray(responseData?.candidates) ? responseData.candidates : [];
  for (const candidate of candidates) {
    const text = readTextFromCandidate(candidate);
    if (text) return text;
  }
  return "";
}

function buildGenerationConfig({ temperature, responseMimeType }) {
  const config = {};
  const numericTemperature = Number(temperature);

  if (Number.isFinite(numericTemperature)) {
    config.temperature = Math.max(0, Math.min(2, numericTemperature));
  }

  const mime = String(responseMimeType || "").trim();
  if (mime) {
    config.responseMimeType = mime;
  }

  return config;
}

async function generateGeminiContent({
  parts,
  model,
  temperature = 0.4,
  responseMimeType = "",
  timeoutMs = 20000
}) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    const err = new Error("GEMINI_API_KEY is not set");
    err.code = "GEMINI_API_KEY_MISSING";
    throw err;
  }

  const selectedModel = String(model || getGeminiModel()).trim() || DEFAULT_GEMINI_MODEL;
  const selectedParts = Array.isArray(parts) ? parts : [];
  if (!selectedParts.length) {
    throw new Error("Gemini request requires at least one content part");
  }

  const payload = {
    contents: [
      {
        role: "user",
        parts: selectedParts
      }
    ],
    generationConfig: buildGenerationConfig({ temperature, responseMimeType })
  };

  const response = await axios.post(
    buildGenerateContentUrl(selectedModel, apiKey),
    payload,
    {
      headers: { "Content-Type": "application/json" },
      timeout: Math.max(3000, Number(timeoutMs) || 20000)
    }
  );

  const raw = readGeminiText(response.data);
  if (!raw) {
    const blocked = response.data?.promptFeedback?.blockReason;
    const finish = response.data?.candidates?.[0]?.finishReason;
    const reason = blocked || finish || "empty content";
    throw new Error(`Gemini returned empty response (${reason})`);
  }

  return {
    raw,
    model: selectedModel,
    data: response.data
  };
}

module.exports = {
  getGeminiApiKey,
  hasGeminiApiKey,
  getGeminiModel,
  generateGeminiContent
};
