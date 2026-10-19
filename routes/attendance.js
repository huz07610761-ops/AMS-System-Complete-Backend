const express = require("express");
const Student = require("../models/Student");
const Attendance = require("../models/Attendance");
const { protect, adminOnly, studentOnly } = require("../middleware/auth");

const router = express.Router();

// ===============================
// Date & Time Helpers
// ===============================

function todayString() {
  return new Date().toISOString().split("T")[0];
}

function timeString() {
  return new Date().toTimeString().split(" ")[0];
}

// Helper: Get student's shift slot from course timings
function getStudentSlot(student) {
  if (!student.timing || !student.course || !student.course.timings) return null;
  return student.course.timings.find(
    (t) =>
      t.label === student.timing ||
      `${t.startTime}-${t.endTime}` === student.timing
  );
}

// ===============================
// Decide Present / Late / Absent based on Timing
// ===============================

function decideStatus(student, courseDoc) {
  const now = new Date();
  const graceMinutes = 15;
  const slot = getStudentSlot(student);

  if (slot && slot.startTime) {
    const [sh, sm] = slot.startTime.split(":").map(Number);
    const cutoff = new Date(now);
    cutoff.setHours(sh, (sm || 0) + graceMinutes, 0, 0);

    return now > cutoff ? "late" : "present";
  }

  // Fallback default cutoff: 9:30 AM
  const cutoffHour = 9;
  const cutoffMinute = 30;

  if (
    now.getHours() > cutoffHour ||
    (now.getHours() === cutoffHour && now.getMinutes() > cutoffMinute)
  ) {
    return "late";
  }

  return "present";
}


// ===============================
// 1. QR SCAN (Mark Present / Late)
// ===============================

router.post("/scan", protect, adminOnly, async (req, res) => {
  try {
    const { qrCode } = req.body;

    if (!qrCode) {
      return res.status(400).json({ message: "qrCode is required" });
    }

    const student = await Student.findOne({ qrCode }).populate("course");

    if (!student) {
      return res.status(404).json({ message: "Invalid QR code - no matching student" });
    }

    if (!student.isActive) {
      return res.status(403).json({ message: "This student's account is deactivated" });
    }

    const date = todayString();

    // Check today's existing attendance
    const alreadyMarked = await Attendance.findOne({
      student: student._id,
      date,
    });

    if (alreadyMarked) {
      if (alreadyMarked.status === "leave") {
        return res.status(400).json({
          message: `${student.name} is on Leave today. Cannot mark attendance.`,
        });
      }

      return res.status(200).json({
        alreadyMarked: true,
        message: `${student.name} is already marked ${alreadyMarked.status} today at ${alreadyMarked.time}`,
        student: {
          name: student.name,
          rollNumber: student.rollNumber,
          timing: student.timing || null,
        },
        record: alreadyMarked,
      });
    }

    // Decide present / late
    const status = decideStatus(student, student.course);

    // Create attendance record
    const record = await Attendance.create({
      student: student._id,
      date,
      time: timeString(),
      status,
      scannedBy: req.user.id,
    });

    return res.status(201).json({
      alreadyMarked: false,
      message: `Attendance marked (${status}) for ${student.name}`,
      student: {
        name: student.name,
        rollNumber: student.rollNumber,
        timing: student.timing || null,
      },
      record,
    });

  } catch (err) {
    if (err.code === 11000) {
      return res.status(200).json({
        alreadyMarked: true,
        message: "Attendance already marked today",
      });
    }

    console.error("SCAN ERROR:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});


// ===============================
// 2. STUDENT OWN ATTENDANCE
// ===============================

router.get("/me", protect, studentOnly, async (req, res) => {
  try {
    const records = await Attendance.find({ student: req.user.id }).sort({ date: -1 });
    res.json(records);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});


// ===============================
// 3. ADMIN STUDENT ATTENDANCE
// ===============================

router.get("/student/:id", protect, adminOnly, async (req, res) => {
  try {
    const records = await Attendance.find({ student: req.params.id }).sort({ date: -1 });
    res.json(records);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});


// ===============================
// 4. DAILY REPORT
// ===============================

router.get("/report", protect, adminOnly, async (req, res) => {
  try {
    const date = req.query.date || todayString();

    const records = await Attendance.find({ date })
      .populate({
        path: "student",
        select: "name rollNumber course timing",
        populate: { path: "course", select: "name" },
      })
      .sort({ time: 1 });

    res.json({
      date,
      count: records.length,
      records,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});


// ===============================
// 5. AUTO MARK ABSENT (Shift & Timing Based)
// ===============================

router.post("/mark-absent", protect, adminOnly, async (req, res) => {
  try {
    const date = req.body.date || todayString();
    const now = new Date();
    const currentTimeStr = now.toTimeString().split(" ")[0]; // HH:MM:SS

    const students = await Student.find({ isActive: true }).populate("course");
    let absentCount = 0;

    for (const student of students) {
      // Check if attendance record already exists for today
      const existingAttendance = await Attendance.findOne({
        student: student._id,
        date,
      });

      if (existingAttendance) {
        continue; // Agar pehle se present, late ya leave hai, toh chhor dein
      }

      // Check student's shift timing
      const slot = getStudentSlot(student);
      
      let shouldMarkAbsent = false;

      if (slot && slot.endTime) {
        // Agar current time shift ke endTime se aage nikal gaya hai, toh absent lagayen
        if (date < todayString() || currentTimeStr > slot.endTime) {
          shouldMarkAbsent = true;
        }
      } else {
        // Fallback: Agar timing match nahi hui aur sham ke 6 baj gaye hain to absent lagayen
        if (date < todayString() || now.getHours() >= 18) {
          shouldMarkAbsent = true;
        }
      }

      if (shouldMarkAbsent) {
        await Attendance.create({
          student: student._id,
          date,
          time: timeString(),
          status: "absent",
        });
        absentCount++;
      }
    }

    res.json({
      message: "Absent attendance processed successfully based on shifts",
      date,
      absentCount,
    });

  } catch (err) {
    if (err.code === 11000) {
      return res.status(200).json({ message: "Attendance already processed" });
    }

    console.error("MARK ABSENT ERROR:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});


// ===============================
// 6. ADMIN: MARK LEAVE (Chutti Setup)
// ===============================

router.post("/leave", protect, adminOnly, async (req, res) => {
  try {
    const { studentId, date } = req.body;
    const targetDate = date || todayString();

    if (!studentId) {
      return res.status(400).json({ message: "studentId is required" });
    }

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    // Check if attendance already exists
    let attendance = await Attendance.findOne({
      student: studentId,
      date: targetDate,
    });

    if (attendance) {
      // Update status to leave
      attendance.status = "leave";
      attendance.time = "00:00:00";
      await attendance.save();
    } else {
      // Create new leave record
      attendance = await Attendance.create({
        student: studentId,
        date: targetDate,
        time: "00:00:00",
        status: "leave",
      });
    }

    res.json({
      message: `Leave marked successfully for ${student.name} on ${targetDate}`,
      attendance,
    });

  } catch (err) {
    console.error("MARK LEAVE ERROR:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});


// ===============================
// 7. ATTENDANCE INSIGHTS
// ===============================

router.get("/insights", protect, adminOnly, async (req, res) => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 14);
    const sinceStr = since.toISOString().split("T")[0];

    const students = await Student.find({ isActive: true }).select("name rollNumber");
    const insights = [];

    for (const student of students) {
      const records = await Attendance.find({
        student: student._id,
        date: { $gte: sinceStr },
      });

      const totalDays = records.length;
      const presentDays = records.filter(
        (record) => record.status === "present" || record.status === "late"
      ).length;

      const attendanceRate =
        totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;

      if (attendanceRate < 50) {
        insights.push({
          student: {
            id: student._id,
            name: student.name,
            rollNumber: student.rollNumber,
          },
          attendanceRate,
          presentDays,
          totalDays,
          risk: attendanceRate < 25 ? "high" : "medium",
          message:
            attendanceRate < 25
              ? `${student.name} has very low attendance.`
              : `${student.name}'s attendance has dropped below 50%.`,
        });
      }
    }

    insights.sort((a, b) => a.attendanceRate - b.attendanceRate);

    res.json({
      generatedAt: new Date(),
      insights,
    });

  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;