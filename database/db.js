const { Pool } = require("pg");
require("dotenv").config();

const baseConfig = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.DB_HOST || "localhost",
        port: parseInt(process.env.DB_PORT, 10) || 5432,
        database: process.env.DB_NAME || "qflow_db",
        user: process.env.DB_USER || "postgres",
        password: process.env.DB_PASSWORD || "postgres",
    };

// max: allow up to 20 concurrent client connections (default is 10).
// connectionTimeoutMillis: if all connections are busy, fail fast (5s) rather
// than hanging indefinitely — surfaces pool exhaustion as a real error.
const poolConfig = {
    ...baseConfig,
    max: 20,
    connectionTimeoutMillis: 5000,
};

const pool = new Pool(poolConfig);

pool.on("error", (err) => {
    console.error("Unexpected error on idle PostgreSQL client", err);
});

module.exports = {
    query: (text, params) => pool.query(text, params),
    pool,
};
