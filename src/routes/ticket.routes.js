const express = require("express");
const router = express.Router();
const ticketController = require("../controllers/ticket.controller");
const { authenticate, authorize } = require("../middlewares/auth.middleware");

// Public Customer Ticket Routes
router.post("/", ticketController.createTicket);
router.get("/:id", ticketController.getTicketById);

// Note: Public ticket cancellation is a temporary limitation because tickets
// are not yet associated with authenticated customer accounts. Customer ownership will be addressed later.
router.patch("/:id/cancel", ticketController.cancelTicket);

// Protected Staff & Admin Queue Operator Routes
router.post("/next", authenticate, authorize("STAFF", "ADMIN"), ticketController.callNextTicket);
router.patch("/:id/start-serving", authenticate, authorize("STAFF", "ADMIN"), ticketController.startServingTicket);
router.patch("/:id/complete", authenticate, authorize("STAFF", "ADMIN"), ticketController.completeTicket);
router.patch("/:id/no-show", authenticate, authorize("STAFF", "ADMIN"), ticketController.markNoShowTicket);

module.exports = router;

