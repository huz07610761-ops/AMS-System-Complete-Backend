const mongoose = require("mongoose");

const quizAttemptSchema = new mongoose.Schema(
  {
    quiz: { type: mongoose.Schema.Types.ObjectId, ref: "Quiz", required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    attemptNumber: { type: Number, required: true },

    // in-progress: currently being taken
    // completed:   student submitted the quiz (final result exists)
    // abandoned:   left in-progress too long (phone died / connection lost) - counts against the 3 chances
    status: { type: String, enum: ["in-progress", "completed", "abandoned"], default: "in-progress" },

    score: { type: Number, default: 0 },
    totalQuestions: { type: Number, default: 0 },
    answers: [{ questionIndex: Number, selectedOption: Number }],

    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("QuizAttempt", quizAttemptSchema);