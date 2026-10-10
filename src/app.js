const express = require("express");
const cors = require("cors");
const queueRoutes = require("./routes/queue.routes");
const ticketRoutes = require("./routes/ticket.routes");
const authRoutes = require("./routes/auth.routes");
const { notFoundHandler, errorHandler } = require("./middlewares/error.middleware");

const app = express();

// ---------------------------------------------------------------------------
// CORS Configuration
// ---------------------------------------------------------------------------
// Q-flow uses JWT Bearer tokens (not cookies), so credentials: true is NOT
// needed and is intentionally omitted.
//
// How CORS works (beginner explanation):
//   • CORS is a *browser* safety feature — it has nothing to do with
//     authentication or authorization at the server level.
//   • When a browser-based frontend (e.g., React on localhost:5173) calls this
//     API, the browser first asks: "Is this server OK with requests from my
//     origin?" It does this via an `Origin` header.
//   • The server replies with `Access-Control-Allow-Origin`. If the browser
//     does not see its own origin reflected back, it *blocks* the response
//     before the JS code can read it — but the request DID reach the server.
//   • Non-browser tools (curl, requests.http, Postman) NEVER send Origin
//     headers, so they are completely unaffected by CORS headers.
//   • CORS says nothing about WHO the user is — that is the job of
//     authentication (JWT) and authorization (RBAC).
//
// CLIENT_URL examples:
//   Development : http://localhost:5173   (Vite React default)
//   Production  : https://yourapp.example.com
//
// If CLIENT_URL is missing from .env, we fall back to the Vite default so
// local development still works out of the box, but we intentionally do NOT
// use '*' for production safety.
const allowedOrigins = [
    process.env.CLIENT_URL || "http://localhost:5173",
];

const corsOptions = {
    origin: function (origin, callback) {
        // `origin` is undefined for non-browser clients (curl, Postman, etc.)
        // — always allow those through so requests.http keeps working.
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            // Reject unknown browser origins.  The error is passed to the
            // centralized error handler via express's next(err) chain so it
            // formats consistently with all other API errors.
            const err = new Error(
                `CORS policy: origin '${origin}' is not allowed by this server.`
            );
            err.statusCode = 403;
            callback(err);
        }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    // credentials: false (default) — JWT lives in Authorization header, not cookies
};

// Apply CORS before all other middleware and routes so preflight OPTIONS
// requests are answered immediately without reaching auth or route handlers.
app.use(cors(corsOptions));

// ---------------------------------------------------------------------------
// Global Middlewares
// ---------------------------------------------------------------------------
app.use(express.json());

// Base Route
app.get("/", (req, res) => {
    res.json({
        name: "Q-flow API",
        version: "1.0.0",
        message: "Queue Management Backend is running smoothly.",
    });
});

// Health Check Endpoint
app.get("/health", (req, res) => {
    res.status(200).json({
        status: "UP",
        timestamp: new Date().toISOString(),
    });
});

// API Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/queues", queueRoutes);
app.use("/api/v1/tickets", ticketRoutes);

// 404 Not Found Handler for unmatched routes
app.use(notFoundHandler);

// Centralized Error Handling Middleware (must be registered last)
app.use(errorHandler);

module.exports = app;
