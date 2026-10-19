const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    rollNumber: { type: String, required: true, unique: true },
    phone: { type: String, default: "" },
    timing: { type: String, default: "" },
    address: { type: String, default: "" },

    // sparse: true so multiple students can have an empty NIC without
    // triggering a duplicate-key error on the unique index.
    nic: { type: String, unique: true, sparse: true },

    // Base64 data-URL of the student's uploaded photo (used on the ID card)
    photo: { type: String, default: "" },

    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course" },

    // Unique code embedded inside the QR image. Never guessable (uuid).
    qrCode: { type: String, required: true, unique: true },

    // Base64 data-URL of the generated QR image
    qrImage: { type: String },

    // Current general status (fallback)
    feeStatus: {
      type: String,
      enum: ["paid", "pending", "overdue"],
      default: "pending",
    },

    // NEW: Monthly Fee History Tracking (Har mahine ka alag record)
    feeHistory: [
      {
        month: { type: String, required: true }, // Format: "YYYY-MM" (e.g. "2026-10")
        status: {
          type: String,
          enum: ["paid", "pending", "overdue"],
          default: "pending",
        },
        paidDate: { type: Date },
      },
    ],

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Student", studentSchema);