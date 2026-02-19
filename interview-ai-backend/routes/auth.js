const express = require("express");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("../models/user");
const localAuthStore = require("../utils/localAuthStore");
const { issueAuthToken } = require("../middleware/auth");
const { createRateLimiter } = require("../middleware/rateLimit");
const passwordResetStore = require("../utils/passwordResetStore");
const {
  normalizeEmail,
  isValidEmail,
  isValidPassword,
  normalizeText
} = require("../utils/validation");

const router = express.Router();

function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

const signupLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_SIGNUP_MAX || 10),
  message: "Too many signup attempts. Please try again in a few minutes.",
  keyGenerator: (req) => `${req.ip}:signup:${normalizeEmail(req?.body?.email)}`
});

const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_LOGIN_MAX || 15),
  message: "Too many login attempts. Please try again in a few minutes.",
  keyGenerator: (req) => `${req.ip}:login:${normalizeEmail(req?.body?.email)}`
});

const forgotPasswordRequestLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_FORGOT_REQUEST_MAX || 6),
  message: "Too many password reset requests. Please wait and try again.",
  keyGenerator: (req) => `${req.ip}:forgot-request:${normalizeEmail(req?.body?.email)}`
});

const forgotPasswordConfirmLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_FORGOT_CONFIRM_MAX || 10),
  message: "Too many reset confirmation attempts. Please wait and try again.",
  keyGenerator: (req) => `${req.ip}:forgot-confirm:${normalizeEmail(req?.body?.email)}`
});

const forgotPasswordLegacyLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_FORGOT_LEGACY_MAX || 10),
  message: "Too many password reset attempts. Please wait and try again.",
  keyGenerator: (req) => `${req.ip}:forgot-legacy:${normalizeEmail(req?.body?.email)}`
});

async function findUsersByEmail(normalizedEmail) {
  const dbConnected = isDbConnected();
  const dbUser = dbConnected ? await User.findOne({ email: normalizedEmail }) : null;
  const localUser = await localAuthStore.findByEmail(normalizedEmail);

  return {
    dbConnected,
    dbUser,
    localUser
  };
}

/* SIGNUP */
router.post("/signup", signupLimiter, async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !password) {
      return res.status(400).json({ error: "Missing fields" });
    }

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ error: "Invalid email" });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const { dbConnected, dbUser, localUser } = await findUsersByEmail(normalizedEmail);
    const exists = dbUser || localUser;

    if (exists) {
      return res.status(400).json({ error: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    if (dbConnected) {
      const user = new User({
        name: name ? normalizeText(name, 120) : undefined,
        email: normalizedEmail,
        password: hashedPassword
      });

      await user.save();
      return res.json({ message: "Signup successful" });
    }

    await localAuthStore.createUser({
      name: name ? normalizeText(name, 120) : "",
      email: normalizedEmail,
      passwordHash: hashedPassword
    });

    return res.json({
      message: "Signup successful",
      warning: "Database unavailable. Account stored locally on this machine."
    });
  } catch (err) {
    if (err?.code === "EMAIL_EXISTS") {
      return res.status(409).json({ error: "Email already exists" });
    }
    if (err?.code === 11000) {
      return res.status(409).json({ error: "Email already exists" });
    }
    return res.status(500).json({ error: err.message });
  }
});

async function handleForgotPasswordRequest(req, res) {
  try {
    const normalizedEmail = normalizeEmail(req?.body?.email);

    if (!normalizedEmail) {
      return res.status(400).json({ error: "Email is required" });
    }

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ error: "Invalid email" });
    }

    const { dbUser, localUser } = await findUsersByEmail(normalizedEmail);
    const accountExists = !!(dbUser || localUser);
    const isProd = String(process.env.NODE_ENV || "").toLowerCase() === "production";

    let devResetCode = "";
    if (accountExists) {
      const code = passwordResetStore.issueResetCode(normalizedEmail);
      if (!isProd) {
        devResetCode = code;
        console.info(`Password reset code for ${normalizedEmail}: ${code}`);
      }
    }

    return res.json({
      message:
        "If an account exists for this email, a password reset code has been issued.",
      ...(devResetCode ? { devResetCode } : {})
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function handleForgotPasswordConfirm(req, res) {
  try {
    const normalizedEmail = normalizeEmail(req?.body?.email);
    const resetCode = String(req?.body?.resetCode || "").trim();
    const newPassword = String(req?.body?.newPassword || "");

    if (!normalizedEmail || !resetCode || !newPassword) {
      return res.status(400).json({ error: "Missing fields" });
    }

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ error: "Invalid email" });
    }

    if (!isValidPassword(newPassword)) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const verification = passwordResetStore.verifyResetCode(normalizedEmail, resetCode);
    if (!verification?.ok) {
      const hint =
        verification?.reason === "expired"
          ? "Request a new reset code and try again."
          : verification?.reason === "locked"
            ? "Too many invalid attempts. Request a new reset code."
            : "";
      return res.status(400).json({
        error: "Invalid or expired reset code",
        ...(hint ? { hint } : {})
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const { dbConnected } = await findUsersByEmail(normalizedEmail);

    let updatedDatabase = false;
    let updatedLocal = false;

    if (dbConnected) {
      const updated = await User.updateOne(
        { email: normalizedEmail },
        { password: hashedPassword }
      );
      updatedDatabase = !!updated?.matchedCount;
    }

    updatedLocal = await localAuthStore.updateUserPassword(normalizedEmail, hashedPassword);

    if (!updatedDatabase && !updatedLocal) {
      return res.status(404).json({
        error: "Account not found",
        hint: dbConnected
          ? "No account was found in either database or local storage for this email."
          : "Database is disconnected. Reset is available for local accounts only. Start MongoDB to reset database accounts."
      });
    }

    passwordResetStore.clearResetCode(normalizedEmail);

    return res.json({
      message: "Password reset successful",
      mode: updatedDatabase && updatedLocal
        ? "database+local"
        : updatedDatabase
          ? "database"
          : "local"
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

router.post(
  "/forgot-password/request",
  forgotPasswordRequestLimiter,
  handleForgotPasswordRequest
);

router.post(
  "/forgot-password/confirm",
  forgotPasswordConfirmLimiter,
  handleForgotPasswordConfirm
);

// Backward-compatible endpoint with secure flow only.
router.post("/forgot-password", forgotPasswordLegacyLimiter, async (req, res) => {
  const hasResetCode = !!String(req?.body?.resetCode || "").trim();
  const hasNewPassword = !!String(req?.body?.newPassword || "").trim();

  if (hasResetCode || hasNewPassword) {
    return handleForgotPasswordConfirm(req, res);
  }

  return handleForgotPasswordRequest(req, res);
});

/* LOGIN */
router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !password) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const { dbConnected, dbUser, localUser } = await findUsersByEmail(normalizedEmail);
    const mode = dbUser ? "database" : localUser ? "local" : "";
    const user = dbUser || localUser;

    if (!mode || !user) {
      if (!dbConnected) {
        return res.status(400).json({
          error: "Invalid credentials",
          hint:
            "Database is disconnected. If this account exists in MongoDB, start MongoDB and restart the backend, or create a local account via Sign Up."
        });
      }
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const passwordValue = String(user.password || "");
    let isMatch = false;

    if (passwordValue) {
      isMatch = await bcrypt.compare(password, passwordValue).catch(() => false);
    }

    // Backward compatibility: migrate plain-text legacy passwords to bcrypt on successful login.
    if (!isMatch && passwordValue && passwordValue === password) {
      isMatch = true;
      const upgradedHash = await bcrypt.hash(password, 10);

      if (mode === "database") {
        await User.updateOne({ _id: user._id }, { password: upgradedHash });
      } else {
        await localAuthStore.updateUserPassword(normalizedEmail, upgradedHash);
      }
    }

    if (!isMatch) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    return res.json({
      message: "Login successful",
      user: {
        id: mode === "database" ? user._id.toString() : String(user.id),
        name: user.name || "",
        email: user.email
      },
      token: issueAuthToken(
        {
          id: mode === "database" ? user._id.toString() : String(user.id),
          name: user.name || "",
          email: user.email
        },
        mode
      ),
      mode
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
