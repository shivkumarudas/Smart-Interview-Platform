const axios = require("axios");
const OpenAI = require("openai");
const { hasGeminiApiKey, getGeminiApiKey } = require("./geminiClient");

const GEMINI_API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_GEMINI_TTS_MODEL = "gemini-2.5-flash-preview-tts";

const OPENAI_SUPPORTED_VOICES = new Set([
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "onyx",
  "nova",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar"
]);

const OPENAI_SUPPORTED_FORMATS = new Set(["mp3", "opus", "aac", "flac", "wav", "pcm"]);

let cachedOpenAIClient = null;

function getOpenAIApiKey() {
  return String(process.env.OPENAI_API_KEY || "").trim();
}

function getOpenAIClient() {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) return null;

  if (!cachedOpenAIClient) {
    cachedOpenAIClient = new OpenAI({ apiKey });
  }

  return cachedOpenAIClient;
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function normalizeOpenAIVoice(value) {
  const configured = String(value || process.env.TTS_VOICE || "verse")
    .trim()
    .toLowerCase();

  if (OPENAI_SUPPORTED_VOICES.has(configured)) return configured;
  return "verse";
}

function normalizeOpenAIFormat(value) {
  const configured = String(value || process.env.TTS_RESPONSE_FORMAT || "mp3")
    .trim()
    .toLowerCase();

  if (OPENAI_SUPPORTED_FORMATS.has(configured)) return configured;
  return "mp3";
}

function getOpenAIContentType(format) {
  switch (format) {
    case "wav":
      return "audio/wav";
    case "aac":
      return "audio/aac";
    case "flac":
      return "audio/flac";
    case "opus":
      return "audio/ogg";
    case "pcm":
      return "audio/L16";
    case "mp3":
    default:
      return "audio/mpeg";
  }
}

function buildOpenAIVoiceInstructions({ language, style }) {
  const languageText = String(language || "").trim();
  const styleText = String(style || "").trim();

  const parts = [];
  if (languageText) {
    parts.push(`Speak naturally in ${languageText}.`);
  }
  if (styleText) {
    parts.push(styleText);
  }
  if (!parts.length) {
    parts.push(
      "Use a natural, warm, professional interviewer tone with human-like pacing."
    );
  }

  return parts.join(" ");
}

function getTtsProvider() {
  const forced = String(process.env.TTS_PROVIDER || "").trim().toLowerCase();

  if (forced === "gemini") {
    if (!hasGeminiApiKey()) {
      const err = new Error("GEMINI_API_KEY is not set");
      err.code = "GEMINI_API_KEY_MISSING";
      throw err;
    }
    return "gemini";
  }

  if (forced === "openai") {
    if (!getOpenAIApiKey()) {
      const err = new Error("OPENAI_API_KEY is not set");
      err.code = "OPENAI_API_KEY_MISSING";
      throw err;
    }
    return "openai";
  }

  if (hasGeminiApiKey()) return "gemini";
  if (getOpenAIApiKey()) return "openai";

  const err = new Error("No TTS API key configured");
  err.code = "TTS_API_KEY_MISSING";
  throw err;
}

function getGeminiTtsModel() {
  const explicit = String(process.env.GEMINI_TTS_MODEL || "").trim();
  if (explicit) return explicit;

  const generic = String(process.env.GEMINI_MODEL || "").trim();
  if (generic && /\btts\b/i.test(generic)) return generic;

  return DEFAULT_GEMINI_TTS_MODEL;
}

function normalizeGeminiVoice(value) {
  const configured = String(
    value || process.env.GEMINI_TTS_VOICE || process.env.TTS_VOICE || "Kore"
  ).trim();

  if (!configured) return "Kore";
  if (!/^[a-z0-9_-]{2,40}$/i.test(configured)) return "Kore";

  return configured;
}

function buildGeminiGenerateContentUrl(model) {
  const safeModel = encodeURIComponent(String(model || "").trim());
  return `${GEMINI_API_ROOT}/${safeModel}:generateContent`;
}

function parseGeminiAudioPart(responseData) {
  const candidates = Array.isArray(responseData?.candidates) ? responseData.candidates : [];

  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    for (const part of parts) {
      const inlineData = part?.inlineData;
      if (!inlineData?.data) continue;

      return {
        mimeType: String(inlineData.mimeType || "").trim(),
        base64Data: String(inlineData.data || "").trim()
      };
    }
  }

  return null;
}

function getAudioMimeType(mimeType) {
  const cleanMime = String(mimeType || "").trim();
  if (cleanMime) {
    return cleanMime.split(";")[0].trim().toLowerCase();
  }
  return "audio/l16";
}

function parsePcmSampleRate(mimeType) {
  const match = String(mimeType || "").match(/rate\s*=\s*(\d+)/i);
  const parsed = Number(match?.[1] || 0);
  if (Number.isFinite(parsed) && parsed >= 8000 && parsed <= 96000) {
    return parsed;
  }
  return 24000;
}

function pcm16ToWav(pcmBuffer, sampleRate = 24000, channels = 1) {
  const safePcmBuffer =
    pcmBuffer.length % 2 === 0 ? pcmBuffer : Buffer.concat([pcmBuffer, Buffer.alloc(1)]);

  const bitsPerSample = 16;
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + safePcmBuffer.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(safePcmBuffer.length, 40);

  return Buffer.concat([header, safePcmBuffer]);
}

function shouldConvertGeminiPcmToWav(mimeType) {
  const normalized = String(mimeType || "").trim().toLowerCase();
  return (
    normalized.startsWith("audio/l16") ||
    normalized.startsWith("audio/pcm") ||
    normalized.startsWith("audio/raw")
  );
}

async function synthesizeWithGemini({ text, voice }) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    const err = new Error("GEMINI_API_KEY is not set");
    err.code = "GEMINI_API_KEY_MISSING";
    throw err;
  }

  const model = getGeminiTtsModel();
  const selectedVoice = normalizeGeminiVoice(voice);

  const response = await axios.post(
    buildGeminiGenerateContentUrl(model),
    {
      contents: [
        {
          role: "user",
          parts: [{ text }]
        }
      ],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: selectedVoice
            }
          }
        }
      }
    },
    {
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      timeout: 45000
    }
  );

  const audioPart = parseGeminiAudioPart(response.data);
  if (!audioPart?.base64Data) {
    const blocked = response.data?.promptFeedback?.blockReason;
    const finish = response.data?.candidates?.[0]?.finishReason;
    const reason = blocked || finish || "empty audio";
    throw new Error(`Gemini TTS returned no audio (${reason})`);
  }

  const rawAudio = Buffer.from(audioPart.base64Data, "base64");
  if (!rawAudio.length) {
    throw new Error("Gemini TTS returned empty audio");
  }

  const audioMimeType = getAudioMimeType(audioPart.mimeType);
  if (shouldConvertGeminiPcmToWav(audioMimeType)) {
    const sampleRate = parsePcmSampleRate(audioPart.mimeType);
    return {
      audioBuffer: pcm16ToWav(rawAudio, sampleRate),
      contentType: "audio/wav",
      model,
      voice: selectedVoice,
      speed: null,
      responseFormat: "wav",
      provider: "gemini"
    };
  }

  return {
    audioBuffer: rawAudio,
    contentType: audioMimeType || "audio/mpeg",
    model,
    voice: selectedVoice,
    speed: null,
    responseFormat: audioMimeType.split("/")[1] || "audio",
    provider: "gemini"
  };
}

async function synthesizeWithOpenAI({
  text,
  voice,
  speed,
  language,
  style,
  responseFormat
}) {
  const client = getOpenAIClient();
  if (!client) {
    const error = new Error("OPENAI_API_KEY is not set");
    error.code = "OPENAI_API_KEY_MISSING";
    throw error;
  }

  const model = String(process.env.TTS_MODEL || "gpt-4o-mini-tts").trim();
  const selectedVoice = normalizeOpenAIVoice(voice);
  const selectedFormat = normalizeOpenAIFormat(responseFormat);
  const selectedSpeed = clampNumber(
    speed,
    0.25,
    4.0,
    clampNumber(process.env.TTS_SPEED, 0.25, 4.0, 1)
  );

  const instructions = buildOpenAIVoiceInstructions({ language, style });

  const response = await client.audio.speech.create({
    model,
    voice: selectedVoice,
    input: text,
    response_format: selectedFormat,
    speed: selectedSpeed,
    instructions
  });

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  if (!audioBuffer.length) {
    throw new Error("TTS generated empty audio");
  }

  return {
    audioBuffer,
    contentType: getOpenAIContentType(selectedFormat),
    model,
    voice: selectedVoice,
    speed: selectedSpeed,
    responseFormat: selectedFormat,
    provider: "openai"
  };
}

async function synthesizeSpeech({ text, voice, speed, language, style, responseFormat }) {
  const cleanText = String(text || "").trim();
  if (!cleanText) {
    throw new Error("Text is required");
  }

  const provider = getTtsProvider();
  if (provider === "gemini") {
    return synthesizeWithGemini({ text: cleanText, voice });
  }

  return synthesizeWithOpenAI({
    text: cleanText,
    voice,
    speed,
    language,
    style,
    responseFormat
  });
}

module.exports = {
  synthesizeSpeech
};
