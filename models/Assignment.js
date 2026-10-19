const mongoose = require("mongoose");

const assignmentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    deadline: { type: Date, required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Assignment", assignmentSchema);