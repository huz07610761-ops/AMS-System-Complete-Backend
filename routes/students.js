const express = require("express");
const bcrypt = require("bcryptjs");
const QRCode = require("qrcode");
const { randomUUID } = require("crypto");
const Student = require("../models/Student");
const Attendance = require("../models/Attendance");
const { protect, adminOnly } = require("../middleware/auth");

const router = express.Router();

// @route   POST /api/students   (admin creates a new student -> auto-generates QR)
router.post("/", protect, adminOnly, async (req, res) => {
  try {
    const { name, email, password, rollNumber, phone, course } = req.body;

    if (!name || !email || !password || !rollNumber) {
      return res.status(400).json({ message: "Name, email, password and roll number are required" });
    }

    const existing = await Student.findOne({ $or: [{ email }, { rollNumber }] });
    if (existing) {
      return res.status(400).json({ message: "Student with this email or roll number already exists" });
    }

    // Unique, unguessable code embedded inside the QR
    const qrCode = randomUUID();
    const qrImage = await QRCode.toDataURL(qrCode, { width: 300, margin: 2 });

    const hashedPassword = await bcrypt.hash(password, 10);

    const student = await Student.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      rollNumber,
      phone,
      course: course || null,
      qrCode,
      qrImage,
    });

    res.status(201).json({
      message: "Student created successfully",
      student: { ...student.toObject(), password: undefined },
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
    console.log(err)
  }
});

// @route   GET /api/students   (admin: list all students)
router.get("/", protect, adminOnly, async (req, res) => {
  try {
    const students = await Student.find().populate("course").select("-password").sort({ createdAt: -1 });
    res.json(students);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
    console.log(err)
  }
});

// @route   GET /api/students/:id   (admin: single student detail)
router.get("/:id", protect, adminOnly, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id).populate("course").select("-password");
    if (!student) return res.status(404).json({ message: "Student not found" });
    res.json(student);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// @route   PUT /api/students/:id   (admin: update student info)
router.put("/:id", protect, adminOnly, async (req, res) => {
  try {
    const { name, phone, course, feeStatus, isActive } = req.body;
    const student = await Student.findByIdAndUpdate(
      req.params.id,
      { name, phone, course, feeStatus, isActive },
      { new: true }
    ).select("-password");
    if (!student) return res.status(404).json({ message: "Student not found" });
    res.json(student);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// @route   DELETE /api/students/:id   (admin: remove student)
router.delete("/:id", protect, adminOnly, async (req, res) => {
  try {
    const student = await Student.findByIdAndDelete(req.params.id);
    if (!student) return res.status(404).json({ message: "Student not found" });
    await Attendance.deleteMany({ student: student._id });
    res.json({ message: "Student deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// @route   POST /api/students/:id/regenerate-qr   (admin: issue a fresh QR if lost/compromised)
router.post("/:id/regenerate-qr", protect, adminOnly, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ message: "Student not found" });

    const qrCode = randomUUID();
    const qrImage = await QRCode.toDataURL(qrCode, { width: 300, margin: 2 });

    student.qrCode = qrCode;
    student.qrImage = qrImage;
    await student.save();

    res.json({ message: "QR code regenerated", qrImage });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// PUT: Update student monthly fee status
router.put("/:id/fee", async (req, res) => {
  try {
    const { month, status } = req.body;
    const student = await Student.findById(req.params.id);

    if (!student) {
      return res.status(404).json({ message: "Student nahi mila" });
    }

    // Ensure feeHistory is an array
    if (!student.feeHistory) {
      student.feeHistory = [];
    }

    // Check if record for this month already exists
    const historyIndex = student.feeHistory.findIndex((h) => h.month === month);

    if (historyIndex > -1) {
      student.feeHistory[historyIndex].status = status;
      if (status === "paid") {
        student.feeHistory[historyIndex].paidDate = new Date();
      }
    } else {
      student.feeHistory.push({
        month,
        status,
        paidDate: status === "paid" ? new Date() : undefined,
      });
    }

    // Optional: General fallback status update
    student.feeStatus = status;

    await student.save();
    res.json({ message: "Monthly fee status updated successfully", student });
  } catch (err) {
    console.error("Fee Update Error:", err);
    res.status(500).json({ message: "Fee status update karne mein error aaya" });
  }
});

module.exports = router;