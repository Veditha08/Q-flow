const { body } = require("express-validator");
const { validate } = require("../middlewares/validate.middleware");

// Validation rules for public user registration
const validateRegister = validate([
    body("name")
        .exists({ checkFalsy: true })
        .withMessage("'name' is required.")
        .isString()
        .withMessage("'name' must be a string.")
        .trim()
        .notEmpty()
        .withMessage("'name' cannot be empty."),
    body("email")
        .exists({ checkFalsy: true })
        .withMessage("A valid 'email' address is required.")
        .isEmail()
        .withMessage("A valid 'email' address is required.")
        .normalizeEmail(),
    body("password")
        .exists({ checkFalsy: true })
        .withMessage("'password' is required and must be at least 6 characters long.")
        .isString()
        .withMessage("'password' must be a string.")
        .isLength({ min: 6 })
        .withMessage("'password' is required and must be at least 6 characters long."),
]);

// Validation rules for user login
const validateLogin = validate([
    body("email")
        .exists({ checkFalsy: true })
        .withMessage("A valid 'email' address is required.")
        .isEmail()
        .withMessage("A valid 'email' address is required.")
        .normalizeEmail(),
    body("password")
        .exists({ checkFalsy: true })
        .withMessage("'password' is required.")
        .isString()
        .withMessage("'password' must be a string.")
        .notEmpty()
        .withMessage("'password' cannot be empty."),
]);

// Validation rules for Admin creating a user
const validateCreateUser = validate([
    body("name")
        .exists({ checkFalsy: true })
        .withMessage("'name' is required.")
        .isString()
        .withMessage("'name' must be a string.")
        .trim()
        .notEmpty()
        .withMessage("'name' cannot be empty."),
    body("email")
        .exists({ checkFalsy: true })
        .withMessage("A valid 'email' address is required.")
        .isEmail()
        .withMessage("A valid 'email' address is required.")
        .normalizeEmail(),
    body("password")
        .exists({ checkFalsy: true })
        .withMessage("'password' is required and must be at least 6 characters long.")
        .isString()
        .withMessage("'password' must be a string.")
        .isLength({ min: 6 })
        .withMessage("'password' is required and must be at least 6 characters long."),
    body("role")
        .optional()
        .isString()
        .withMessage("'role' must be a string.")
        .toUpperCase()
        .isIn(["ADMIN", "STAFF"])
        .withMessage("Role must be either 'ADMIN' or 'STAFF'."),
]);

module.exports = {
    validateRegister,
    validateLogin,
    validateCreateUser,
};
