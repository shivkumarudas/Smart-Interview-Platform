const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");

const Profile = require("./models/profile");
const User = require("./models/User");
const Feedback = require("./models/Feedback");
const app = express();

// ================== MIDDLEWARE ==================
app.use(cors());
app.use(express.json()); // MUST be before routes

// Disable buffering (good practice)
mongoose.set("bufferCommands", false);

// ================== DB ==================
const MONGO_URI =
  "mongodb+srv://testuser:Test12345@cluster0.XXXXXXX.mongodb.net/interviewAI?retryWrites=true&w=majority";

// ================== START SERVER ==================
async function startServer() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB Connected (ready)");

    // ================== TEST ==================
    app.get("/ping", (req, res) => {
      res.send("pong");
    });
    
    // ================== SIGNUP ==================
    app.post("/signup", async (req, res) => {
      try {
        const { email, password } = req.body;

        if (!email || !password) {
          return res.status(400).json({ error: "Missing fields" });
        }

        const exists = await User.findOne({ email });
        if (exists) {
          return res.status(400).json({ error: "Email already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = new User({
          email,
          password: hashedPassword
        });

        await user.save();
        res.json({ message: "Signup successful" });

      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ================== LOGIN ==================
    app.post("/login", async (req, res) => {
      try {
        const { email, password } = req.body;

        if (!email || !password) {
          return res.status(400).json({ error: "Missing fields" });
        }

        const user = await User.findOne({ email });
        if (!user) {
          return res.status(400).json({ error: "Invalid email or password" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
          return res.status(400).json({ error: "Invalid email or password" });
        }

        res.json({
          message: "Login successful",
          user: {
            id: user._id.toString(), // 🔥 ENSURE STRING
            name: user.name,
            email: user.email
          }
        });

      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ================== CREATE / UPDATE PROFILE ==================
    app.post("/profile", async (req, res) => {
      try {
        const { userId, ...profileData } = req.body;

        if (!userId) {
          return res.status(400).json({ error: "User ID missing" });
        }

        const existingProfile = await Profile.findOne({ userId });

        if (existingProfile) {
          await Profile.findOneAndUpdate(
            { userId },
            profileData,
            { new: true }
          );
          return res.json({ message: "Profile updated" });
        }

        const profile = new Profile({
          userId,
          ...profileData
        });

        await profile.save();
        res.json({ message: "Profile created" });

      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ================== GET PROFILE ==================
    app.get("/profile/:userId", async (req, res) => {
      try {
        const profile = await Profile.findOne({ userId: req.params.userId });
        if (!profile) return res.json(null);
        res.json(profile);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });



    // ================== FEEDBACK ==================

    app.post("/feedback", async (req, res) => {
  try {
    console.log("REQ BODY /feedback →", req.body);

    const { userId, positive, improvement, recommend } = req.body;

    if (!userId || !positive || !improvement || !recommend) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const feedback = new Feedback({
      userId,
      positive,
      improvement,
      recommend
    });

    await feedback.save();

    res.json({ message: "Thank you for your feedback" });

  } catch (err) {
    console.error("Feedback error:", err);
    res.status(500).json({ error: err.message });
  }
});





    // ================== LISTEN ==================
    app.listen(5000, () => {
      console.log("🚀 Server running on port 5000");
    });

  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    process.exit(1);
  }
}

startServer();
