const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema({
  questionText: { type: String, required: true },
  options: {
    type: [String],
    validate: {
      validator: (arr) => arr.length === 4,
      message: "Each question must have exactly 4 options",
    },
    required: true,
  },
  correctOptionIndex: { type: Number, required: true, min: 0, max: 3 },
});

const quizSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: "" },
    questions: {
      type: [questionSchema],
      validate: {
        validator: (arr) => arr.length > 0,
        message: "Quiz must have at least one question",
      },
      required: true,
    },

    // Either assign to everyone, or to specific students (not both at once)
    assignToAll: { type: Boolean, default: false },
    assignedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: "Student" }],

    maxAttempts: { type: Number, default: 3 },
    passPercentage: { type: Number, default: 50 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Quiz", quizSchema);