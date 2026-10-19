require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const connectDB = require("./config/db");
const Admin = require("./models/Admin");

const authRoutes = require("./routes/auth");
const studentRoutes = require("./routes/students");
const attendanceRoutes = require("./routes/attendance");
const courseRoutes = require("./routes/courses");
const publicRoutes = require("./routes/public");
const quizRoutes = require("./routes/quizzes");
const assignments =  require('./routes/assignments')

const app = express();

app.use(cors());
app.use(express.json({ limit: "5mb" })); // higher limit to be safe with QR base64 payloads

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/quizzes", quizRoutes);
app.use("/api/assignments", assignments);

app.get("/", (req, res) => {
  res.send("Smart QR Student Portal API is running");
});

// Creates a default admin account on first run so you can log in immediately.
// Reads credentials from .env — change DEFAULT_ADMIN_PASSWORD before deploying!
async function seedDefaultAdmin() {
  const email = process.env.DEFAULT_ADMIN_EMAIL;
  const password = process.env.DEFAULT_ADMIN_PASSWORD;
  const name = process.env.DEFAULT_ADMIN_NAME || "Admin";

  if (!email || !password) return;

  const existing = await Admin.findOne({ email: email.toLowerCase() });
  if (existing) return;

  const hashedPassword = await bcrypt.hash(password, 10);
  await Admin.create({ name, email: email.toLowerCase(), password: hashedPassword, role: "admin" });
  console.log(`Default admin created -> email: ${email} | password: ${password}`);
  console.log("IMPORTANT: log in and change this password immediately.");
}

const PORT = process.env.PORT || 5000;

connectDB().then(async () => {
  await seedDefaultAdmin();
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
});