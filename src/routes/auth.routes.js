const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const { authenticate, authorize } = require("../middlewares/auth.middleware");

// Public Auth Routes
router.post("/register", authController.register);
router.post("/login", authController.login);

// Authenticated User Routes
router.get("/me", authenticate, authController.getMe);

// Admin-only User Creation Route
router.post("/users", authenticate, authorize("ADMIN"), authController.createUser);

module.exports = router;
