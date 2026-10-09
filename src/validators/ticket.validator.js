const { body, param } = require("express-validator");
const { validate } = require("../middlewares/validate.middleware");

// Validation rules for joining a queue (issuing a ticket)
const validateCreateTicket = validate([
    body("queue_id")
        .exists({ checkFalsy: true })
        .withMessage("Valid 'queue_id' is required.")
        .isInt({ min: 1 })
        .withMessage("Valid 'queue_id' is required."),
    body("customer_name")
        .exists({ checkFalsy: true })
        .withMessage("'customer_name' is required.")
        .isString()
        .withMessage("'customer_name' must be a string.")
        .trim()
        .notEmpty()
        .withMessage("'customer_name' cannot be empty."),
]);

// Validation rules for calling the next ticket in a queue
const validateCallNextTicket = validate([
    body("queue_id")
        .exists({ checkFalsy: true })
        .withMessage("Valid 'queue_id' is required in request body.")
        .isInt({ min: 1 })
        .withMessage("Valid 'queue_id' is required in request body."),
]);

// Validation rules for ticket ID in route parameters
const validateTicketIdParam = validate([
    param("id")
        .isInt({ min: 1 })
        .withMessage("Invalid ticket ID. Must be a positive integer."),
]);

module.exports = {
    validateCreateTicket,
    validateCallNextTicket,
    validateTicketIdParam,
};
