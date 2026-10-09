const express = require("express");
const queueRoutes = require("./routes/queue.routes");
const ticketRoutes = require("./routes/ticket.routes");
const authRoutes = require("./routes/auth.routes");
const { notFoundHandler, errorHandler } = require("./middlewares/error.middleware");

const app = express();

// Global Middlewares
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
