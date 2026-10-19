const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const Student = require("../models/Student");

const router = express.Router();

function generateToken(id, role) {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

// @route   POST /api/auth/admin/login
router.post("/admin/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email: email?.toLowerCase() });

    if (!admin) return res.status(401).json({ message: "Invalid email or password" });

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid email or password" });

    const token = generateToken(admin._id, admin.role);
    res.json({
      token,
      user: { id: admin._id, name: admin.name, email: admin.email, role: admin.role },
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err });
    console.log(err)
  }
});

// @route   POST /api/auth/student/login
router.post("/student/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const student = await Student.findOne({ email: email?.toLowerCase() }).populate("course");

    if (!student) return res.status(401).json({ message: "Invalid email or password" });
    if (!student.isActive) return res.status(403).json({ message: "Account is deactivated" });

    const isMatch = await bcrypt.compare(password, student.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid email or password" });

    const token = generateToken(student._id, "student");
    res.json({
      token,
      user: {
        id: student._id,
        name: student.name,
        email: student.email,
        rollNumber: student.rollNumber,
        course: student.course,
        qrImage: student.qrImage,
        feeStatus: student.feeStatus,
        role: "student",
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;