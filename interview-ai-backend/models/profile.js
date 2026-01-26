const mongoose = require("mongoose");

const profileSchema = new mongoose.Schema({
  /* ================= USER LINK ================= */
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true // one profile per user
  },

  /* ================= BASIC INFO ================= */
  name: {
    type: String,
    required: true,
    trim: true
  },

  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },

  phone: {
    type: String,
    required: true,
    trim: true
  },

  location: {
    type: String,
    required: true,
    trim: true
  },

  /* ================= EDUCATION & EXPERIENCE ================= */
  education: {
    type: String,
    required: true
  },

  experienceYears: {
    type: Number,
    required: true,
    min: 0
  },

  experience: {
    type: String,
    required: true
  },

  /* ================= ROLE & SKILLS ================= */
  role: {
    type: String,
    required: true
  },

  skills: {
    type: String,
    required: true
  },

  /* ================= LINKS ================= */
  linkedin: {
    type: String,
    required: true,
    trim: true
  },

  portfolio: {
    type: String,
    trim: true
  },

  /* ================= INTERVIEW PREFERENCES ================= */
  interviewType: {
    type: String,
    required: true
  },

  availability: {
    type: String,
    required: true
  },

  language: {
    type: String,
    required: true
  },

  /* ================= META ================= */
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Profile", profileSchema);
