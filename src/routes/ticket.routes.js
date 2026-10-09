const express = require("express");
const router = express.Router();
const ticketController = require("../controllers/ticket.controller");
const { authenticate, authorize } = require("../middlewares/auth.middleware");
const {
    validateCreateTicket,
    validateCallNextTicket,
    validateTicketIdParam,
} = require("../validators/ticket.validator");

// Public Customer Ticket Routes
router.post("/", validateCreateTicket, ticketController.createTicket);
router.get("/:id", validateTicketIdParam, ticketController.getTicketById);

// Note: Public ticket cancellation is a temporary limitation because tickets
// are not yet associated with authenticated customer accounts. Customer ownership will be addressed later.
router.patch("/:id/cancel", validateTicketIdParam, ticketController.cancelTicket);

// Protected Staff & Admin Queue Operator Routes
router.post("/next", authenticate, authorize("STAFF", "ADMIN"), validateCallNextTicket, ticketController.callNextTicket);
router.patch("/:id/start-serving", authenticate, authorize("STAFF", "ADMIN"), validateTicketIdParam, ticketController.startServingTicket);
router.patch("/:id/complete", authenticate, authorize("STAFF", "ADMIN"), validateTicketIdParam, ticketController.completeTicket);
router.patch("/:id/no-show", authenticate, authorize("STAFF", "ADMIN"), validateTicketIdParam, ticketController.markNoShowTicket);

module.exports = router;
