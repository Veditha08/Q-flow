const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const db = require("./db");

async function initializeDatabase() {
    console.log("Connecting to PostgreSQL and running migrations...");
    try {
        const schemaPath = path.join(__dirname, "schema.sql");
        const schemaSql = fs.readFileSync(schemaPath, "utf8");

        await db.query(schemaSql);
        console.log("Database schema initialized successfully! (queues, tickets, users tables created)");

        // Seed initial admin user if not already present
        const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || "admin@qflow.com";
        const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || "admin123";

        const existingAdmin = await db.query("SELECT id FROM users WHERE email = $1", [adminEmail]);
        if (existingAdmin.rows.length === 0) {
            const hashedPassword = await bcrypt.hash(adminPassword, 10);
            await db.query(
                `INSERT INTO users (name, email, password, role)
                 VALUES ($1, $2, $3, 'ADMIN')`,
                ["Default Admin", adminEmail, hashedPassword]
            );
            console.log(`Seeded default admin user: ${adminEmail} (password: ${adminPassword})`);
        } else {
            console.log(`Default admin user (${adminEmail}) already exists.`);
        }
    } catch (error) {
        console.error("Failed to initialize database schema:", error.message);
    } finally {
        await db.pool.end();
    }
}

initializeDatabase();
