const express = require("express");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("../models/user");
const localAuthStore = require("../utils/localAuthStore");
const { issueAuthToken } = require("../middleware/auth");

const router = express.Router();

function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPassword(password) {
  return String(password || "").length >= 6;
}

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
router.post("/signup", async (req, res) => {
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
        name: name ? String(name).trim() : undefined,
        email: normalizedEmail,
        password: hashedPassword
      });

      await user.save();
      return res.json({ message: "Signup successful" });
    }

    await localAuthStore.createUser({
      name: name ? String(name).trim() : "",
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

/* FORGOT PASSWORD / RESET PASSWORD */
router.post("/forgot-password", async (req, res) => {
  try {
    const { email, newPassword } = req.body || {};
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !newPassword) {
      return res.status(400).json({ error: "Missing fields" });
    }

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ error: "Invalid email" });
    }

    if (!isValidPassword(newPassword)) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
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
});

/* LOGIN */
router.post("/login", async (req, res) => {
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
