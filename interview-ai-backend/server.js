// Load environment variables first.
require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

// ================== APP ==================
const app = express();

function isTruthy(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(normalized);
}

// ================== MIDDLEWARE ==================
app.disable("x-powered-by");
const corsOriginEnv = String(process.env.CORS_ORIGIN || "").trim();
const corsOrigin = corsOriginEnv
  ? corsOriginEnv === "*"
    ? "*"
    : corsOriginEnv.split(",").map((origin) => origin.trim()).filter(Boolean)
  : "*";
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: "1mb" }));

app.use((err, req, res, next) => {
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON" });
  }
  return next(err);
});

// Disable mongoose buffering
mongoose.set("bufferCommands", false);

// ================== ROUTES ==================
const authRoutes = require("./routes/auth");
const interviewRoutes = require("./routes/interview");

// ================== MODELS ==================
const Profile = require("./models/profile");
const Feedback = require("./models/Feedback");

// ================== DB ==================
const MONGO_URI = process.env.MONGO_URI;
const REQUIRE_DB =
  isTruthy(process.env.REQUIRE_DB) ||
  String(process.env.NODE_ENV || "").toLowerCase() === "production";

// ================== PORT ==================
const PORT = Number(process.env.PORT) || 5000;

function registerFrontend(appInstance) {
  const frontendRoot = path.join(__dirname, "..");
  const staticOptions = {
    dotfiles: "ignore",
    index: false,
    fallthrough: true
  };

  const staticDirs = [
    "auth",
    "css",
    "dashboard",
    "feedback",
    "interview",
    "js",
    "profile",
    "report"
  ];

  staticDirs.forEach((dir) => {
    appInstance.use(`/${dir}`, express.static(path.join(frontendRoot, dir), staticOptions));
  });

  appInstance.get(["/", "/index.html"], (req, res) => {
    res.sendFile(path.join(frontendRoot, "index.html"));
  });
}

function dbRequired(req, res, next) {
  if (mongoose.connection.readyState === 1) {
    return next();
  }
  return res.status(503).json({
    error:
      "Database not connected. Set MONGO_URI in interview-ai-backend/.env and restart the server."
  });
}

async function connectToMongoIfConfigured() {
  if (!MONGO_URI) {
    const message =
      "MONGO_URI is not set. Add it to interview-ai-backend/.env (see interview-ai-backend/.env.example).";
    if (REQUIRE_DB) {
      throw new Error(message);
    }
    console.warn(message);
    return false;
  }

  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    console.log("MongoDB connected");
    return true;
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    if (REQUIRE_DB) {
      throw err;
    }
    return false;
  }
}

// ================== START SERVER ==================
async function startServer() {
  try {
    // ================== HEALTH CHECK ==================
    app.get("/ping", (req, res) => {
      res.send("pong");
    });

    // ================== FRONTEND ==================
    registerFrontend(app);

    // ================== INTERVIEW ==================
    // Interview routes do not require MongoDB.
    app.use("/interview", interviewRoutes);

    await connectToMongoIfConfigured();

    // ================== AUTH ==================
    app.use("/", authRoutes);

    // ================== PROFILE ==================
    app.post("/profile", dbRequired, async (req, res) => {
      try {
        const { userId, ...data } = req.body;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
          return res.status(400).json({ error: "Invalid userId" });
        }

        const profile = await Profile.findOneAndUpdate(
          { userId },
          { userId, ...data },
          { upsert: true, new: true, runValidators: true }
        );

        res.json({ message: "Profile saved", profile: profile || null });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.get("/profile/:userId", dbRequired, async (req, res) => {
      try {
        const { userId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(userId)) {
          return res.status(400).json({ error: "Invalid userId" });
        }
        const profile = await Profile.findOne({ userId });
        res.json(profile || null);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ================== FEEDBACK ==================
    app.post("/feedback", dbRequired, async (req, res) => {
      try {
        const { userId, positive, improvement, recommend } = req.body;
        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
          return res.status(400).json({ error: "Invalid userId" });
        }
        if (!positive || !improvement || !recommend) {
          return res.status(400).json({ error: "Missing fields" });
        }

        const feedback = new Feedback(req.body);
        await feedback.save();
        res.json({ message: "Thank you for your feedback" });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ================== ERRORS ==================
    app.use((err, req, res, next) => {
      console.error("Unhandled error:", err);
      if (res.headersSent) {
        return next(err);
      }

      const statusCode = Number(err?.statusCode || err?.status) || 500;
      const isProd = String(process.env.NODE_ENV || "").toLowerCase() === "production";
      const message =
        statusCode >= 500 && isProd
          ? "Internal server error"
          : err?.message || "Request failed";

      return res.status(statusCode).json({ error: message });
    });

    app.use((req, res) => {
      if (req.method === "GET" && req.accepts("html")) {
        return res.status(404).send("Not found");
      }
      return res.status(404).json({ error: "Not found" });
    });

    // ================== LISTEN ==================
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running at http://localhost:${PORT}`);
      console.log(`Test: http://localhost:${PORT}/ping`);
    });
  } catch (err) {
    console.error("Startup failed:", err);
    process.exit(1);
  }
}

startServer();
