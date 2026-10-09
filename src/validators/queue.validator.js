const { body, param } = require("express-validator");
const { validate } = require("../middlewares/validate.middleware");

// Validation rules for creating a new queue (Admin)
const validateCreateQueue = validate([
    body("name")
        .exists({ checkFalsy: true })
        .withMessage("Queue 'name' is required.")
        .isString()
        .withMessage("Queue 'name' must be a string.")
        .trim()
        .notEmpty()
        .withMessage("Queue 'name' cannot be empty."),
    body("prefix")
        .exists({ checkFalsy: true })
        .withMessage("Queue 'prefix' is required (e.g. 'BILL', 'REG', 'DOC').")
        .isString()
        .withMessage("Queue 'prefix' must be a string.")
        .trim()
        .notEmpty()
        .withMessage("Queue 'prefix' cannot be empty.")
        .isLength({ max: 10 })
        .withMessage("Queue 'prefix' must not exceed 10 characters."),
    body("description")
        .optional({ nullable: true })
        .isString()
        .withMessage("Description must be a string.")
        .trim(),
]);

// Validation rules for queue ID in route parameters
const validateQueueIdParam = validate([
    param("id")
        .isInt({ min: 1 })
        .withMessage("Invalid queue ID. Must be a positive integer."),
]);

module.exports = {
    validateCreateQueue,
    validateQueueIdParam,
};
