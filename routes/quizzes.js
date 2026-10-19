const express = require("express");
const Quiz = require("../models/Quiz");
const QuizAttempt = require("../models/QuizAttempt");
const Student = require("../models/Student");
const { protect, adminOnly, studentOnly } = require("../middleware/auth");

const router = express.Router();

// An in-progress attempt that hasn't been touched in this many minutes is
// considered abandoned (phone died, lost connection, closed the app, etc).
const STALE_MINUTES = 15;

async function markStaleAttemptsAbandoned(quizId, studentId) {
  const staleThreshold = new Date(Date.now() - STALE_MINUTES * 60 * 1000);
  await QuizAttempt.updateMany(
    { quiz: quizId, student: studentId, status: "in-progress", startedAt: { $lt: staleThreshold } },
    { status: "abandoned" }
  );
}

/* ============================= ADMIN ROUTES ============================= */

// @route   POST /api/quizzes   (admin: create a quiz, optionally assign immediately)
router.post("/", protect, adminOnly, async (req, res) => {
  try {
    const { title, description, questions, assignToAll, assignedTo, maxAttempts, passPercentage } = req.body;

    if (!title || !questions || !questions.length) {
      return res.status(400).json({ message: "Title and at least one question are required" });
    }

    for (const q of questions) {
      if (!q.questionText || !q.options || q.options.length !== 4 || q.correctOptionIndex === undefined) {
        return res.status(400).json({ message: "Every question needs text, 4 options, and a correct option" });
      }
    }

    const quiz = await Quiz.create({
      title,
      description,
      questions,
      assignToAll: !!assignToAll,
      assignedTo: assignToAll ? [] : assignedTo || [],
      maxAttempts: maxAttempts || 3,
      passPercentage: passPercentage || 50,
    });

    res.status(201).json(quiz);
  } catch (err) {
    console.error("CREATE QUIZ ERROR:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// @route   GET /api/quizzes   (admin: list all quizzes)
router.get("/", protect, adminOnly, async (req, res) => {
  try {
    const quizzes = await Quiz.find().populate("assignedTo", "name rollNumber").sort({ createdAt: -1 });
    res.json(quizzes);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// @route   PUT /api/quizzes/:id   (admin: edit quiz / change assignment)
router.put("/:id", protect, adminOnly, async (req, res) => {
  try {
    const { title, description, questions, assignToAll, assignedTo, maxAttempts, passPercentage, isActive } = req.body;
    const quiz = await Quiz.findByIdAndUpdate(
      req.params.id,
      { title, description, questions, assignToAll, assignedTo: assignToAll ? [] : assignedTo, maxAttempts, passPercentage, isActive },
      { new: true }
    );
    if (!quiz) return res.status(404).json({ message: "Quiz not found" });
    res.json(quiz);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// @route   DELETE /api/quizzes/:id
router.delete("/:id", protect, adminOnly, async (req, res) => {
  try {
    const quiz = await Quiz.findByIdAndDelete(req.params.id);
    if (!quiz) return res.status(404).json({ message: "Quiz not found" });
    await QuizAttempt.deleteMany({ quiz: quiz._id });
    res.json({ message: "Quiz deleted" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// @route   GET /api/quizzes/:id/results   (admin: see every student's outcome)
router.get("/:id/results", protect, adminOnly, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return res.status(404).json({ message: "Quiz not found" });

    const targetStudents = quiz.assignToAll
      ? await Student.find({ isActive: true }).select("name rollNumber")
      : await Student.find({ _id: { $in: quiz.assignedTo } }).select("name rollNumber");

    const results = [];
    for (const student of targetStudents) {
      const attempts = await QuizAttempt.find({ quiz: quiz._id, student: student._id }).sort({ attemptNumber: 1 });
      const completed = attempts.find((a) => a.status === "completed");
      const usedCount = attempts.length;

      let status = "not-started";
      if (completed) status = "completed";
      else if (usedCount >= quiz.maxAttempts) status = "failed";
      else if (usedCount > 0) status = "in-progress";

      results.push({
        student: { id: student._id, name: student.name, rollNumber: student.rollNumber },
        status,
        attemptsUsed: usedCount,
        maxAttempts: quiz.maxAttempts,
        score: completed ? completed.score : null,
        totalQuestions: completed ? completed.totalQuestions : quiz.questions.length,
      });
    }

    res.json({ quiz: { id: quiz._id, title: quiz.title }, results });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

/* ============================ STUDENT ROUTES ============================ */

// @route   GET /api/quizzes/my   (student: list quizzes assigned to me + my status)
router.get("/my", protect, studentOnly, async (req, res) => {
  try {
    const quizzes = await Quiz.find({
      isActive: true,
      $or: [{ assignToAll: true }, { assignedTo: req.user.id }],
    }).select("title description questions maxAttempts passPercentage");

    const list = [];
    for (const quiz of quizzes) {
      await markStaleAttemptsAbandoned(quiz._id, req.user.id);
      const attempts = await QuizAttempt.find({ quiz: quiz._id, student: req.user.id });
      const completed = attempts.find((a) => a.status === "completed");
      const usedCount = attempts.length;

      let status = "not-started";
      if (completed) status = "completed";
      else if (usedCount >= quiz.maxAttempts) status = "failed";

      list.push({
        id: quiz._id,
        title: quiz.title,
        description: quiz.description,
        totalQuestions: quiz.questions.length,
        maxAttempts: quiz.maxAttempts,
        attemptsUsed: usedCount,
        status,
        score: completed ? completed.score : null,
        percentage: completed ? Math.round((completed.score / completed.totalQuestions) * 100) : null,
      });
    }

    res.json(list);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// @route   POST /api/quizzes/:id/play   (student: start or resume an attempt)
router.post("/:id/play", protect, studentOnly, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz || !quiz.isActive) return res.status(404).json({ message: "Quiz not found" });

    const isAssigned = quiz.assignToAll || quiz.assignedTo.some((id) => id.toString() === req.user.id);
    if (!isAssigned) return res.status(403).json({ message: "This quiz is not assigned to you" });

    await markStaleAttemptsAbandoned(quiz._id, req.user.id);

    const attempts = await QuizAttempt.find({ quiz: quiz._id, student: req.user.id });
    if (attempts.some((a) => a.status === "completed")) {
      return res.status(400).json({ message: "You have already completed this quiz" });
    }
    if (attempts.length >= quiz.maxAttempts) {
      return res.status(403).json({ message: "No attempts remaining. This quiz is marked as failed." });
    }

    // Resume an existing in-progress attempt, or start a fresh one
    let attempt = attempts.find((a) => a.status === "in-progress");
    if (!attempt) {
      attempt = await QuizAttempt.create({
        quiz: quiz._id,
        student: req.user.id,
        attemptNumber: attempts.length + 1,
        totalQuestions: quiz.questions.length,
      });
    }

    // Never send the correct answer to the browser
    const safeQuestions = quiz.questions.map((q) => ({
      questionText: q.questionText,
      options: q.options,
    }));

    res.json({
      attemptId: attempt._id,
      title: quiz.title,
      questions: safeQuestions,
      attemptNumber: attempt.attemptNumber,
      maxAttempts: quiz.maxAttempts,
    });
  } catch (err) {
    console.error("PLAY QUIZ ERROR:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// @route   POST /api/quizzes/:id/submit   (student: finish the quiz and get a score)
router.post("/:id/submit", protect, studentOnly, async (req, res) => {
  try {
    const { attemptId, answers } = req.body; // answers: [{ questionIndex, selectedOption }]
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return res.status(404).json({ message: "Quiz not found" });

    const attempt = await QuizAttempt.findOne({ _id: attemptId, quiz: quiz._id, student: req.user.id });
    if (!attempt) return res.status(404).json({ message: "Attempt not found" });
    if (attempt.status !== "in-progress") {
      return res.status(400).json({ message: "This attempt is no longer active" });
    }

    let score = 0;
    quiz.questions.forEach((q, index) => {
      const given = answers.find((a) => a.questionIndex === index);
      if (given && given.selectedOption === q.correctOptionIndex) score++;
    });

    attempt.status = "completed";
    attempt.score = score;
    attempt.totalQuestions = quiz.questions.length;
    attempt.answers = answers;
    attempt.completedAt = new Date();
    await attempt.save();

    const percentage = Math.round((score / quiz.questions.length) * 100);

    res.json({
      score,
      total: quiz.questions.length,
      percentage,
      passed: percentage >= quiz.passPercentage,
    });
  } catch (err) {
    console.error("SUBMIT QUIZ ERROR:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// @route   POST /api/quizzes/:id/abandon   (best-effort: called when the student
// closes the tab/app mid-quiz, via navigator.sendBeacon, so the attempt is
// freed up sooner instead of waiting for the 15-minute stale timeout)
router.post("/:id/abandon", protect, studentOnly, async (req, res) => {
  try {
    const { attemptId } = req.body;
    await QuizAttempt.updateOne(
      { _id: attemptId, quiz: req.params.id, student: req.user.id, status: "in-progress" },
      { status: "abandoned" }
    );
    res.json({ message: "ok" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;