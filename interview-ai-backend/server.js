const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");

const Profile = require("./models/Profile");
const User = require("./models/User");

const app = express();

app.use(cors());
app.use(express.json());

// Disable buffering (good practice)
mongoose.set("bufferCommands", false);

const MONGO_URI =
  "mongodb+srv://testuser:Test12345@cluster0.ibc99sn.mongodb.net/interviewAI?retryWrites=true&w=majority";

async function startServer() {
  try {
    // ✅ WAIT for MongoDB connection
    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB Connected (ready)");

    /* ================== TEST ================== */
    app.get("/ping", (req, res) => {
      res.send("pong");
    });

    /* ================== PROFILE ================== */
    app.post("/profile", async (req, res) => {
      try {
        const profile = new Profile(req.body);
        await profile.save();
        res.status(201).json({ message: "Profile saved successfully" });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    /* ================== SIGNUP ================== */
   app.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(400).json({ error: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      name,
      email,
      password: hashedPassword
    });

    await user.save();
    res.json({ message: "Signup successful" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

    /* ================== LOGIN ================== */
   app.post("/login", async (req, res) => {
  try {
    console.log("REQ BODY (LOGIN):", req.body);

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
        id: user._id,
        name: user.name,
        email: user.email
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

    /* ================== START SERVER ================== */
    app.listen(5000, () => {
      console.log("🚀 Server running on port 5000");
    });

  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    process.exit(1);
  }
}

startServer();
