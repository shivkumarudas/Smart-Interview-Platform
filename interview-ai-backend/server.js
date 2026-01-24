const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const Profile = require("./models/Profile");

const app = express();

app.use(cors());
app.use(express.json());

// disable buffering (good practice)
mongoose.set("bufferCommands", false);

const MONGO_URI =
  "mongodb+srv://testuser:Test12345@cluster0.ibc99sn.mongodb.net/interviewAI?retryWrites=true&w=majority";

async function startServer() {
  try {
    // 🔥 WAIT for MongoDB to connect
    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB Connected (ready)");

    // routes AFTER DB is ready
    app.get("/ping", (req, res) => {
      res.send("pong");
    });

    app.post("/profile", async (req, res) => {
      try {
        console.log("POST /profile", req.body);

        const profile = new Profile(req.body);
        await profile.save();

        res.status(201).json({ message: "Profile saved successfully" });
      } catch (err) {
        console.error("❌ Save failed:", err);
        res.status(500).json({ error: err.message });
      }
    });

    // start server ONLY after DB connection
    app.listen(5000, () => {
      console.log("🚀 Server running on port 5000");
    });

  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    process.exit(1);
  }
}

startServer();
