const express = require("express");
const router = express.Router();
const queueController = require("../controllers/queue.controller");
const { authenticate, authorize } = require("../middlewares/auth.middleware");

// Public Queue Routes
router.get("/", queueController.getAllQueues);
router.get("/:id", queueController.getQueueById);

// Admin-only Queue Routes
router.post("/", authenticate, authorize("ADMIN"), queueController.createQueue);

module.exports = router;

