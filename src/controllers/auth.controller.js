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
async function register(req, res) {
    try {
        const { name, email, password } = req.body;

        // 1. Validation
        if (!name || typeof name !== "string" || name.trim() === "") {
            return res.status(400).json({
                success: false,
                error: "'name' is required.",
            });
        }

        if (!email || typeof email !== "string" || !email.includes("@")) {
            return res.status(400).json({
                success: false,
                error: "A valid 'email' address is required.",
            });
        }

        if (!password || typeof password !== "string" || password.length < 6) {
            return res.status(400).json({
                success: false,
                error: "'password' is required and must be at least 6 characters long.",
            });
        }

        const cleanName = name.trim();
        const cleanEmail = email.trim().toLowerCase();

        // 2. Check if email is already registered
        const existingUser = await db.query("SELECT id FROM users WHERE email = $1", [cleanEmail]);
        if (existingUser.rows.length > 0) {
            return res.status(409).json({
                success: false,
                error: `A user with email '${cleanEmail}' already exists.`,
            });
        }

        // 3. Hash password and insert user (Staff role strictly enforced for public registration)
        const hashedPassword = await bcrypt.hash(password, 10);
        const role = "STAFF";

        const insertQuery = `
            INSERT INTO users (name, email, password, role)
            VALUES ($1, $2, $3, $4)
            RETURNING id, name, email, role, created_at;
        `;
        const result = await db.query(insertQuery, [cleanName, cleanEmail, hashedPassword, role]);
        const newUser = result.rows[0];

        // 4. Generate JWT
        const token = generateToken(newUser);

        return res.status(201).json({
            success: true,
            message: "User registered successfully as STAFF.",
            token,
            data: newUser,
        });
    } catch (error) {
        console.error("Error in user registration:", error);
        return res.status(500).json({
            success: false,
            error: "Internal server error during registration.",
        });
    }
}

// POST /api/v1/auth/login - User login
async function login(req, res) {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: "Both 'email' and 'password' are required.",
            });
        }

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
        console.error("Error during user login:", error);
        return res.status(500).json({
            success: false,
            error: "Internal server error during login.",
        });
    }
}

// GET /api/v1/auth/me - Get current logged-in user profile
async function getMe(req, res) {
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
        console.error("Error fetching current user profile:", error);
        return res.status(500).json({
            success: false,
            error: "Internal server error while fetching profile.",
        });
    }
}

// POST /api/v1/auth/users - Admin-only endpoint to create Staff or Admin users
async function createUser(req, res) {
    try {
        const { name, email, password, role } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                error: "'name', 'email', and 'password' are required.",
            });
        }

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
        console.error("Error creating user (admin):", error);
        return res.status(500).json({
            success: false,
            error: "Internal server error while creating user.",
        });
    }
}

module.exports = {
    register,
    login,
    getMe,
    createUser,
};
