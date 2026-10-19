const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    date: { type: String, required: true }, // stored as YYYY-MM-DD for easy filtering
    time: { type: String, required: true }, // HH:MM:SS
    status: {
  type: String,
  enum: ["present", "late", "absent", "leave"],
  default: "absent",
},
    scannedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true }
);

// Prevent marking the same student present twice on the same day
attendanceSchema.index({ student: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("Attendance", attendanceSchema);