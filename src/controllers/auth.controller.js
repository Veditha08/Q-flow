const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../../database/db");

// Helper function to sign JWT tokens
function generateToken(user) {
    if (!process.env.JWT_SECRET) {
        throw new Error("JWT_SECRET environment variable is missing.");
    }

    const payload = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
    };

    const expiresIn = process.env.JWT_EXPIRES_IN || "1d";
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
}

// POST /api/v1/auth/register - Public registration (always registers with role: STAFF)
async function register(req, res, next) {
    try {
        const { name, email, password } = req.body;

        const cleanName = name.trim();
        const cleanEmail = email.trim().toLowerCase();

        // 1. Check if email is already registered
        const existingUser = await db.query("SELECT id FROM users WHERE email = $1", [cleanEmail]);
        if (existingUser.rows.length > 0) {
            return res.status(409).json({
                success: false,
                error: `A user with email '${cleanEmail}' already exists.`,
            });
        }

        // 2. Hash password and insert user (Staff role strictly enforced for public registration)
        const hashedPassword = await bcrypt.hash(password, 10);
        const role = "STAFF";

        const insertQuery = `
            INSERT INTO users (name, email, password, role)
            VALUES ($1, $2, $3, $4)
            RETURNING id, name, email, role, created_at;
        `;
        const result = await db.query(insertQuery, [cleanName, cleanEmail, hashedPassword, role]);
        const newUser = result.rows[0];

        // 3. Generate JWT
        const token = generateToken(newUser);

        return res.status(201).json({
            success: true,
            message: "User registered successfully as STAFF.",
            token,
            data: newUser,
        });
    } catch (error) {
        next(error);
    }
}

// POST /api/v1/auth/login - User login
async function login(req, res, next) {
    try {
        const { email, password } = req.body;
        const cleanEmail = email.trim().toLowerCase();

        // 1. Fetch user by email
        const userResult = await db.query(
            "SELECT id, name, email, password, role, created_at FROM users WHERE email = $1",
            [cleanEmail]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({
                success: false,
                error: "Invalid email or password.",
            });
        }

        const user = userResult.rows[0];

        // 2. Compare password hash
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                error: "Invalid email or password.",
            });
        }

        // 3. Generate token
        const token = generateToken(user);

        return res.status(200).json({
            success: true,
            message: "Login successful.",
            token,
            data: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                created_at: user.created_at,
            },
        });
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/auth/me - Get current logged-in user profile
async function getMe(req, res, next) {
    try {
        const userId = req.user.id;
        const userResult = await db.query(
            "SELECT id, name, email, role, created_at FROM users WHERE id = $1",
            [userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: "User not found.",
            });
        }

        return res.status(200).json({
            success: true,
            data: userResult.rows[0],
        });
    } catch (error) {
        next(error);
    }
}

// POST /api/v1/auth/users - Admin-only endpoint to create Staff or Admin users
async function createUser(req, res, next) {
    try {
        const { name, email, password, role } = req.body;

        const targetRole = role && ["ADMIN", "STAFF"].includes(role.toUpperCase())
            ? role.toUpperCase()
            : "STAFF";

        const cleanName = name.trim();
        const cleanEmail = email.trim().toLowerCase();

        const existingUser = await db.query("SELECT id FROM users WHERE email = $1", [cleanEmail]);
        if (existingUser.rows.length > 0) {
            return res.status(409).json({
                success: false,
                error: `User with email '${cleanEmail}' already exists.`,
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const insertQuery = `
            INSERT INTO users (name, email, password, role)
            VALUES ($1, $2, $3, $4)
            RETURNING id, name, email, role, created_at;
        `;
        const result = await db.query(insertQuery, [cleanName, cleanEmail, hashedPassword, targetRole]);

        return res.status(201).json({
            success: true,
            message: `User created successfully with role '${targetRole}'.`,
            data: result.rows[0],
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    register,
    login,
    getMe,
    createUser,
};
