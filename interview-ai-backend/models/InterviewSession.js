const mongoose = require("mongoose");

const interviewEntrySchema = new mongoose.Schema(
  {
    index: {
      type: Number,
      required: true,
      min: 1
    },
    askedAt: {
      type: Date
    },
    question: {
      type: String,
      required: true,
      trim: true
    },
    questionJson: {
      type: mongoose.Schema.Types.Mixed
    },
    answer: {
      type: String,
      trim: true
    },
    answeredAt: {
      type: Date
    },
    evaluation: {
      type: String,
      trim: true
    },
    evaluationJson: {
      type: mongoose.Schema.Types.Mixed
    },
    score: {
      type: Number,
      min: 1,
      max: 10
    }
  },
  { _id: false }
);

const interviewSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    profileSnapshot: {
      type: mongoose.Schema.Types.Mixed
    },
    config: {
      type: mongoose.Schema.Types.Mixed
    },
    startedAt: {
      type: Date,
      default: Date.now
    },
    endedAt: {
      type: Date
    },
    entries: {
      type: [interviewEntrySchema],
      default: []
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("InterviewSession", interviewSessionSchema);

