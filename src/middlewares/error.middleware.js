/**
 * Custom application error class for throwing known operational errors with HTTP status codes.
 */
class AppError extends Error {
    constructor(message, statusCode = 500, errors = null) {
        super(message);
        this.statusCode = statusCode;
        this.status = statusCode;
        this.isOperational = true;
        this.errors = errors;
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * 404 Not Found handler for unmatched routes.
 */
function notFoundHandler(req, res, next) {
    res.status(404).json({
        success: false,
        error: `Route not found: ${req.method} ${req.originalUrl}`,
    });
}

/**
 * Centralized error-handling middleware.
 * Must declare exactly 4 arguments (err, req, res, next) for Express to recognize it as error middleware.
 */
function errorHandler(err, req, res, next) {
    // 1. Handle JSON parse errors from express.json()
    if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
        return res.status(400).json({
            success: false,
            error: "Invalid JSON payload in request body.",
        });
    }

    // 2. Determine status code (default to 500 for unhandled exceptions)
    const statusCode = err.statusCode || err.status || 500;

    // 3. Server-side diagnostic logging (strip/sanitize any sensitive credentials)
    if (statusCode >= 500) {
        console.error(`[Q-flow Error Handler] Server Error [${req.method} ${req.originalUrl}]:`, err.message);
        if (process.env.NODE_ENV !== "production" && err.stack) {
            console.error(err.stack);
        }
    } else {
        console.warn(`[Q-flow Error Handler] Client Error (${statusCode}) [${req.method} ${req.originalUrl}]:`, err.message);
    }

    // 4. Response formatting
    if (statusCode >= 500) {
        // Safe 500 response without leaking internal SQL or stack traces
        return res.status(500).json({
            success: false,
            error: "Internal server error.",
        });
    }

    // Known client error response
    const response = {
        success: false,
        error: err.message || "An error occurred.",
    };

    if (err.errors) {
        response.errors = err.errors;
    }

    return res.status(statusCode).json(response);
}

module.exports = {
    AppError,
    notFoundHandler,
    errorHandler,
};
