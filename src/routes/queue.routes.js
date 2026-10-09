const express = require("express");
const router = express.Router();
const queueController = require("../controllers/queue.controller");
const { authenticate, authorize } = require("../middlewares/auth.middleware");
const {
    validateCreateQueue,
    validateQueueIdParam,
} = require("../validators/queue.validator");

// Public Queue Routes
router.get("/", queueController.getAllQueues);
router.get("/:id", validateQueueIdParam, queueController.getQueueById);

// Admin-only Queue Routes
router.post("/", authenticate, authorize("ADMIN"), validateCreateQueue, queueController.createQueue);

module.exports = router;
