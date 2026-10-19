const router = require("express").Router();
const Assignment = require("../models/Assignment");
const Submission = require("../models/Submission");

// Admin: Create Assignment
router.post("/", async (req, res) => {
  try {
    const assignment = new Assignment(req.body);
    await assignment.save();
    res.status(201).json({ message: "Assignment created successfully", assignment });
  } catch (err) {
    res.status(500).json({ message: "Failed to create assignment" });
  }
});

// Admin: Update Submission Status (Approve / Reject)
// NOTE: Isay hamesha specific routes (jaise /:id) ke upar rakhein
router.put("/submissions/:subId/status", async (req, res) => {
  try {
    const { status } = req.body; // "approved" ya "rejected"
    const updatedSubmission = await Submission.findByIdAndUpdate(
      req.params.subId,
      { status },
      { returnDocument: "after" }
    );
    
    if (!updatedSubmission) {
      return res.status(404).json({ message: "Submission nahi mili" });
    }
    
    res.json({ message: `Submission ${status} successfully`, updatedSubmission });
  } catch (err) {
    console.error("Status Update Error:", err);
    res.status(500).json({ message: "Status update karne mein error aaya" });
  }
});

// Admin: Edit Assignment
router.put("/:id", async (req, res) => {
  try {
    const updated = await Assignment.findByIdAndUpdate(req.params.id, req.body, { returnDocument: "after" });
    res.json({ message: "Assignment updated", updated });
  } catch (err) {
    res.status(500).json({ message: "Failed to update assignment" });
  }
});

// Get All Assignments (For Admin & Students)
router.get("/", async (req, res) => {
  try {
    const assignments = await Assignment.find().populate("course", "name");
    res.json(assignments);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch assignments" });
  }
});

// Admin: Get Submissions for a specific assignment (Eye button view)
router.get("/:id/submissions", async (req, res) => {
  try {
    const submissions = await Submission.find({ assignment: req.params.id }).populate("student", "name rollNumber email");
    res.json(submissions);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch submissions" });
  }
});

// Student: Submit or Update Assignment
router.post("/:id/submit", async (req, res) => {
  try {
    const { studentId, link, description, image } = req.body;
    const assignment = await Assignment.findById(req.params.id);

    if (!assignment) return res.status(404).json({ message: "Assignment not found" });

    // Check deadline
    if (new Date() > new Date(assignment.deadline)) {
      return res.status(400).json({ message: "Deadline khatam ho chuki hai. Submit nahi ho sakta." });
    }

    let submission = await Submission.findOne({ assignment: req.params.id, student: studentId });

    if (submission) {
      // Update existing submission if before deadline
      submission.link = link;
      submission.description = description;
      if (image) submission.image = image;
      submission.submittedAt = Date.now();
      await submission.save();
    } else {
      // Create new submission
      submission = new Submission({
        assignment: req.params.id,
        student: studentId,
        link,
        description,
        image,
      });
      await submission.save();
    }

    res.json({ message: "Assignment submitted successfully", submission });
  } catch (err) {
    res.status(500).json({ message: "Submission failed" });
  }
});

// Student: Get my submissions
router.get("/my-submissions", async (req, res) => {
  try {
    // Agar auth middleware use ho raha hai toh req.user._id se student ID lein
    // Ya agar query parameter se aati hai toh us hisaab se find karein
    const submissions = await Submission.find(); // Ya student ID ke mutabiq filter karein
    res.json(submissions);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch submissions" });
  }
});

module.exports = router;