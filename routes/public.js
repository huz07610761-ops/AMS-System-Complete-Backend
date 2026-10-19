const express = require("express");
const bcrypt = require("bcryptjs");
const QRCode = require("qrcode");
const { v4: uuidv4 } = require("uuid");
const Student = require("../models/Student");
const Course = require("../models/Course");

const router = express.Router();

// @route   GET /api/public/courses
// Returns only course names/ids so the public registration form's dropdown
// shows exactly the courses the admin has added — nothing else.
router.get("/courses", async (req, res) => {
  try {
    const courses = await Course.find()
      .select("name timings")
      .sort({ name: 1 });
    res.json(courses);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// @route   POST /api/public/register
// Public self-registration: name, address, email, phone, nic, course, photo.
// Auto-generates a roll number, a login password, and a unique QR code —
// the same QR-generation logic the admin panel uses.
router.post("/register", async (req, res) => {
  try {
    const { name, address, email, phone, nic, course, timing, password, photo } = req.body;

    if (!name || !email || !phone || !nic || !course || !password) {
      return res.status(400).json({
        message: "Name, email, phone, NIC, course and password are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const existing = await Student.findOne({ $or: [{ email }, { nic }] });
    if (existing) {
      return res.status(400).json({
        message: "A registration with this email or NIC already exists",
      });
    }

    const courseDoc = await Course.findById(course);
    if (!courseDoc) return res.status(400).json({ message: "Selected course is invalid" });

    // timing validate (agar course mein timings hain)
    if (courseDoc.timings?.length > 0) {
      const valid = courseDoc.timings.some(
        (t) => t.label === timing || `${t.startTime}-${t.endTime}` === timing
      );
      if (!timing || !valid) {
        return res.status(400).json({ message: "Please select a valid class timing" });
      }
    }

    const year = new Date().getFullYear();
    const count = await Student.countDocuments();
    const rollNumber = `NWS-${year}-${String(count + 1).padStart(4, "0")}`;

    const hashedPassword = await bcrypt.hash(password, 10);

    const qrCode = uuidv4();
    const qrImage = await QRCode.toDataURL(qrCode, { width: 300, margin: 2 });

    const student = await Student.create({
      name,
      address,
      email: email.toLowerCase(),
      phone,
      nic,
      photo,
      course: courseDoc._id,
      timing: timing || "",
      rollNumber,
      password: hashedPassword,
      qrCode,
      qrImage,
    });

    res.status(201).json({
      message: "Registered successfully",
      rollNumber: student.rollNumber,
    });
  } catch (err) {
    console.error("PUBLIC REGISTER ERROR:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});
// @route   GET /api/public/id-card/:nic
// Looks up a student by NIC and returns exactly what the ID card needs:
// name, course, photo, and the QR code image already generated at registration.
router.get("/id-card/:nic", async (req, res) => {
  try {
    const student = await Student.findOne({ nic: req.params.nic }).populate("course", "name");
    if (!student) return res.status(404).json({ message: "No registration found for this NIC" });

    res.json({
      name: student.name,
      rollNumber: student.rollNumber,
      nic: student.nic,
      address: student.address,
      phone: student.phone,
      course: student.course?.name || "Not assigned",
      photo: student.photo,
      qrImage: student.qrImage,
      joiningDate: student.createdAt,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;
