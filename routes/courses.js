const express = require("express");
const Course = require("../models/Course");
const { protect, adminOnly } = require("../middleware/auth");

const router = express.Router();

// @route   GET /api/courses
router.get("/", protect, async (req, res) => {
  try {
    const courses = await Course.find().sort({ name: 1 });
    res.json(courses);
  } catch (err) {
    console.error("GET COURSES ERROR:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// @route   POST /api/courses
router.post("/", protect, adminOnly, async (req, res) => {
  try {
    const { name, description, duration, fee, timings } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Course name is required" });
    }

    // timings clean + validate
    let cleanTimings = [];
    if (Array.isArray(timings) && timings.length > 0) {
      for (let i = 0; i < timings.length; i++) {
        const t = timings[i];
        if (!t.label?.trim() || !t.startTime || !t.endTime) {
          return res.status(400).json({
            message: `Timing ${i + 1}: label, startTime aur endTime required hain`,
          });
        }
        cleanTimings.push({
          label: t.label.trim(),
          startTime: t.startTime,
          endTime: t.endTime,
        });
      }
    }

    const course = await Course.create({
      name: name.trim(),
      description: description || "",
      duration: duration || "",
      fee: fee === "" || fee === undefined ? 0 : Number(fee),
      timings: cleanTimings,
    });

    res.status(201).json(course);
  } catch (err) {
    console.error("CREATE COURSE ERROR:", err);
    res.status(500).json({ message: "Server error", error: err });
  }
});

// @route   PUT /api/courses/:id
router.put("/:id", protect, adminOnly, async (req, res) => {
  try {
    const { name, description, duration, fee, timings } = req.body;

    const update = {};

    if (name !== undefined) update.name = name.trim();
    if (description !== undefined) update.description = description;
    if (duration !== undefined) update.duration = duration;
    if (fee !== undefined) update.fee = fee === "" ? 0 : Number(fee);

    if (Array.isArray(timings)) {
      const cleanTimings = [];
      for (let i = 0; i < timings.length; i++) {
        const t = timings[i];
        if (!t.label?.trim() || !t.startTime || !t.endTime) {
          return res.status(400).json({
            message: `Timing ${i + 1}: label, startTime aur endTime required hain`,
          });
        }
        cleanTimings.push({
          label: t.label.trim(),
          startTime: t.startTime,
          endTime: t.endTime,
        });
      }
      update.timings = cleanTimings;
    }

    const course = await Course.findByIdAndUpdate(req.params.id, update, {
      returnDocument: 'after',
      runValidators: true,
    });

    if (!course) return res.status(404).json({ message: "Course not found" });
    res.json(course);
  } catch (err) {
    console.error("UPDATE COURSE ERROR:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// @route   DELETE /api/courses/:id
router.delete("/:id", protect, adminOnly, async (req, res) => {
  try {
    const course = await Course.findByIdAndDelete(req.params.id);
    if (!course) return res.status(404).json({ message: "Course not found" });
    res.json({ message: "Course deleted successfully" });
  } catch (err) {
    console.error("DELETE COURSE ERROR:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;