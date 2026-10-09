const { validationResult } = require("express-validator");

/**
 * Higher-order middleware factory that executes express-validator rules
 * and formats any validation errors into a standardized JSON response.
 *
 * @param {Array} validations - Array of express-validator validation chains
 * @returns {Array} Middleware array including validation chains and error evaluator
 */
function validate(validations) {
    return [
        ...validations,
        (req, res, next) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                const formattedErrors = errors.array().map((err) => ({
                    field: err.path || err.param,
                    message: err.msg,
                }));

                return res.status(400).json({
                    success: false,
                    error: formattedErrors[0].message || "Validation failed.",
                    errors: formattedErrors,
                });
            }
            next();
        },
    ];
}

module.exports = {
    validate,
};
