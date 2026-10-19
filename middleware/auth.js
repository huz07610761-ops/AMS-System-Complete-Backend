const jwt = require("jsonwebtoken");

// Verifies the JWT and attaches the decoded payload to req.user
function protect(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Not authorized, no token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, role }
    next();
  } catch (err) {
    return res.status(401).json({ message: "Not authorized, token invalid or expired" });
  }
}

// Only allows admins/teachers through
function adminOnly(req, res, next) {
  if (req.user && (req.user.role === "admin" || req.user.role === "teacher")) {
    return next();
  }
  return res.status(403).json({ message: "Access denied: admin/teacher only" });
}

// Only allows students through
function studentOnly(req, res, next) {
  if (req.user && req.user.role === "student") {
    return next();
  }
  return res.status(403).json({ message: "Access denied: students only" });
}

module.exports = { protect, adminOnly, studentOnly };