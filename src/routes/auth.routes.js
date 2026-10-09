const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const { authenticate, authorize } = require("../middlewares/auth.middleware");
const {
    validateRegister,
    validateLogin,
    validateCreateUser,
} = require("../validators/auth.validator");

// Public Auth Routes
router.post("/register", validateRegister, authController.register);
router.post("/login", validateLogin, authController.login);

// Authenticated User Routes
router.get("/me", authenticate, authController.getMe);

// Admin-only User Creation Route
router.post("/users", authenticate, authorize("ADMIN"), validateCreateUser, authController.createUser);

module.exports = router;
