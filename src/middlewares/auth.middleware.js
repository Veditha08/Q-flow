const jwt = require("jsonwebtoken");

/**
 * Authentication Middleware:
 * Verifies JWT token from Authorization header and attaches decoded user to req.user.
 */
function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            success: false,
            error: "Authentication required. Please provide a valid Bearer token in Authorization header.",
        });
    }

    const token = authHeader.split(" ")[1];

    if (!process.env.JWT_SECRET) {
        console.error("FATAL ERROR: JWT_SECRET environment variable is missing.");
        return res.status(500).json({
            success: false,
            error: "Internal server error: JWT_SECRET is not configured on the server.",
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        if (err.name === "TokenExpiredError") {
            return res.status(401).json({
                success: false,
                error: "Access token has expired. Please log in again.",
            });
        }
        return res.status(401).json({
            success: false,
            error: "Invalid access token.",
        });
    }
}

/**
 * Role-Based Authorization Middleware Factory:
 * Enforces that req.user.role is one of the allowed roles.
 */
function authorize(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(401).json({
                success: false,
                error: "Authentication required before checking permissions.",
            });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                error: `Forbidden: Insufficient permissions. Required role: [${allowedRoles.join(", ")}], but your role is '${req.user.role}'.`,
            });
        }

        next();
    };
}

module.exports = {
    authenticate,
    authorize,
};
