const mongoose = require("mongoose");

const timingSchema = new mongoose.Schema(
  {
    label: { type: String, required: true }, // e.g. "Morning Batch 9:00-11:00"
    startTime: { type: String, required: true }, // "09:00" (24h)
    endTime: { type: String, required: true },   // "11:00"
  },
  { _id: false }
);

const courseSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: "" },
    duration: { type: String, default: "" },
    fee: { type: Number, default: 0 },
    timings: { type: [timingSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Course", courseSchema);