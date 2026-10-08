const db = require("../../database/db");

// POST /api/v1/tickets - Join a queue and get a ticket (Public Customer)
async function createTicket(req, res) {
    try {
        const { queue_id, customer_name } = req.body;

        const queueId = parseInt(queue_id, 10);
        if (!queueId || isNaN(queueId)) {
            return res.status(400).json({
                success: false,
                error: "Valid 'queue_id' is required.",
            });
        }

        if (!customer_name || typeof customer_name !== "string" || customer_name.trim() === "") {
            return res.status(400).json({
                success: false,
                error: "'customer_name' is required.",
            });
        }

        const cleanCustomerName = customer_name.trim();

        // 1. Verify queue exists and is active
        const queueCheck = await db.query(
            "SELECT id, name, prefix, is_active FROM queues WHERE id = $1",
            [queueId]
        );

        if (queueCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: `Queue with ID ${queueId} does not exist.`,
            });
        }

        const queue = queueCheck.rows[0];
        if (!queue.is_active) {
            return res.status(400).json({
                success: false,
                error: `Queue '${queue.name}' is currently inactive.`,
            });
        }

        // 2. Generate next sequence number for this queue
        const seqResult = await db.query(
            "SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next_seq FROM tickets WHERE queue_id = $1",
            [queueId]
        );
        const sequenceNumber = parseInt(seqResult.rows[0].next_seq, 10);
        const ticketNumber = `${queue.prefix}-${sequenceNumber}`;

        // 3. Insert new ticket
        const insertQuery = `
            INSERT INTO tickets (queue_id, customer_name, ticket_number, sequence_number, status)
            VALUES ($1, $2, $3, $4, 'WAITING')
            RETURNING *;
        `;
        const ticketResult = await db.query(insertQuery, [
            queueId,
            cleanCustomerName,
            ticketNumber,
            sequenceNumber,
        ]);
        const createdTicket = ticketResult.rows[0];

        // 4. Calculate current position in queue
        const posResult = await db.query(
            "SELECT COUNT(*)::int AS position FROM tickets WHERE queue_id = $1 AND status = 'WAITING' AND id <= $2",
            [queueId, createdTicket.id]
        );
        const positionInQueue = posResult.rows[0].position;

        return res.status(201).json({
            success: true,
            message: "Ticket issued successfully.",
            data: {
                ...createdTicket,
                queue_name: queue.name,
                position_in_queue: positionInQueue,
            },
        });
    } catch (error) {
        console.error("Error creating ticket:", error);
        return res.status(500).json({
            success: false,
            error: "Internal server error while issuing ticket.",
        });
    }
}

// GET /api/v1/tickets/:id - Get ticket details and people ahead (Public Customer)
async function getTicketById(req, res) {
    try {
        const ticketId = parseInt(req.params.id, 10);
        if (isNaN(ticketId)) {
            return res.status(400).json({
                success: false,
                error: "Invalid ticket ID. Must be a number.",
            });
        }

        const queryText = `
            SELECT 
                t.*,
                q.name AS queue_name,
                q.prefix AS queue_prefix
            FROM tickets t
            JOIN queues q ON t.queue_id = q.id
            WHERE t.id = $1;
        `;
        const result = await db.query(queryText, [ticketId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: `Ticket with ID ${ticketId} not found.`,
            });
        }

        const ticket = result.rows[0];
        let peopleAhead = 0;

        if (ticket.status === "WAITING") {
            const aheadResult = await db.query(
                "SELECT COUNT(*)::int AS count FROM tickets WHERE queue_id = $1 AND status = 'WAITING' AND id < $2",
                [ticket.queue_id, ticket.id]
            );
            peopleAhead = aheadResult.rows[0].count;
        }

        return res.status(200).json({
            success: true,
            data: {
                ...ticket,
                people_ahead: peopleAhead,
            },
        });
    } catch (error) {
        console.error("Error fetching ticket:", error);
        return res.status(500).json({
            success: false,
            error: "Internal server error while fetching ticket.",
        });
    }
}

// POST /api/v1/tickets/next - Select and call the next WAITING ticket for a queue (Staff/Admin)
async function callNextTicket(req, res) {
    const { queue_id } = req.body;

    const queueId = parseInt(queue_id, 10);
    if (!queueId || isNaN(queueId)) {
        return res.status(400).json({
            success: false,
            error: "Valid 'queue_id' is required in request body.",
        });
    }

    let client;
    try {
        client = await db.pool.connect();
    } catch (poolErr) {
        console.error("Error acquiring database client from pool:", poolErr);
        return res.status(500).json({
            success: false,
            error: "Internal server error while connecting to database.",
        });
    }

    try {
        await client.query("BEGIN");

        // 1. Check if queue exists and is active within the transaction
        const queueResult = await client.query(
            "SELECT id, name, prefix, is_active FROM queues WHERE id = $1",
            [queueId]
        );

        if (queueResult.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                success: false,
                error: `Queue with ID ${queueId} does not exist.`,
            });
        }

        const queue = queueResult.rows[0];
        if (!queue.is_active) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                success: false,
                error: `Queue '${queue.name}' is currently inactive.`,
            });
        }

        // 2. Concurrency-safe: Lock and select the earliest WAITING ticket for this queue
        const selectQuery = `
            SELECT * FROM tickets 
            WHERE queue_id = $1 AND status = 'WAITING' 
            ORDER BY sequence_number ASC 
            LIMIT 1
            FOR UPDATE;
        `;
        const nextTicketResult = await client.query(selectQuery, [queueId]);

        if (nextTicketResult.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                success: false,
                error: `No waiting tickets found for queue '${queue.name}'.`,
            });
        }

        const nextTicket = nextTicketResult.rows[0];

        // 3. Update ticket status to CALLED on the same connection
        const updateQuery = `
            UPDATE tickets 
            SET status = 'CALLED', updated_at = CURRENT_TIMESTAMP 
            WHERE id = $1 
            RETURNING *;
        `;
        const updateResult = await client.query(updateQuery, [nextTicket.id]);

        // 4. Commit the transaction
        await client.query("COMMIT");

        return res.status(200).json({
            success: true,
            message: `Ticket ${updateResult.rows[0].ticket_number} called successfully.`,
            data: {
                ...updateResult.rows[0],
                queue_name: queue.name,
            },
        });
    } catch (error) {
        if (client) {
            try {
                await client.query("ROLLBACK");
            } catch (rollbackError) {
                console.error("Error during transaction rollback:", rollbackError);
            }
        }
        console.error("Error calling next ticket:", error);
        return res.status(500).json({
            success: false,
            error: "Internal server error while calling next ticket.",
        });
    } finally {
        if (client) {
            client.release();
        }
    }
}

// PATCH /api/v1/tickets/:id/start-serving - Start serving a called ticket (Staff/Admin: CALLED -> SERVING)
async function startServingTicket(req, res) {
    try {
        const ticketId = parseInt(req.params.id, 10);
        if (isNaN(ticketId)) {
            return res.status(400).json({
                success: false,
                error: "Invalid ticket ID. Must be a number.",
            });
        }

        // 1. Fetch ticket
        const checkResult = await db.query(
            `SELECT t.*, q.name AS queue_name 
             FROM tickets t 
             JOIN queues q ON t.queue_id = q.id 
             WHERE t.id = $1`,
            [ticketId]
        );

        if (checkResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: `Ticket with ID ${ticketId} not found.`,
            });
        }

        const ticket = checkResult.rows[0];

        // 2. Enforce transition from CALLED -> SERVING
        if (ticket.status !== "CALLED") {
            return res.status(400).json({
                success: false,
                error: `Cannot start serving. Ticket must be in 'CALLED' status, but current status is '${ticket.status}'.`,
            });
        }

        // 3. Update status to SERVING
        const updateResult = await db.query(
            `UPDATE tickets 
             SET status = 'SERVING', updated_at = CURRENT_TIMESTAMP 
             WHERE id = $1 
             RETURNING *;`,
            [ticketId]
        );

        return res.status(200).json({
            success: true,
            message: `Now serving ticket ${ticket.ticket_number}.`,
            data: {
                ...updateResult.rows[0],
                queue_name: ticket.queue_name,
            },
        });
    } catch (error) {
        console.error("Error starting service for ticket:", error);
        return res.status(500).json({
            success: false,
            error: "Internal server error while starting service for ticket.",
        });
    }
}

// PATCH /api/v1/tickets/:id/complete - Complete serving a ticket (Staff/Admin: SERVING -> COMPLETED)
async function completeTicket(req, res) {
    try {
        const ticketId = parseInt(req.params.id, 10);
        if (isNaN(ticketId)) {
            return res.status(400).json({
                success: false,
                error: "Invalid ticket ID. Must be a number.",
            });
        }

        // 1. Fetch ticket
        const checkResult = await db.query(
            `SELECT t.*, q.name AS queue_name 
             FROM tickets t 
             JOIN queues q ON t.queue_id = q.id 
             WHERE t.id = $1`,
            [ticketId]
        );

        if (checkResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: `Ticket with ID ${ticketId} not found.`,
            });
        }

        const ticket = checkResult.rows[0];

        // 2. Enforce transition from SERVING -> COMPLETED
        if (ticket.status !== "SERVING") {
            return res.status(400).json({
                success: false,
                error: `Cannot complete ticket. Ticket must be in 'SERVING' status, but current status is '${ticket.status}'.`,
            });
        }

        // 3. Update status to COMPLETED
        const updateResult = await db.query(
            `UPDATE tickets 
             SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP 
             WHERE id = $1 
             RETURNING *;`,
            [ticketId]
        );

        return res.status(200).json({
            success: true,
            message: `Ticket ${ticket.ticket_number} marked as completed.`,
            data: {
                ...updateResult.rows[0],
                queue_name: ticket.queue_name,
            },
        });
    } catch (error) {
        console.error("Error completing ticket:", error);
        return res.status(500).json({
            success: false,
            error: "Internal server error while completing ticket.",
        });
    }
}

// PATCH /api/v1/tickets/:id/no-show - Mark a called ticket as no-show (Staff/Admin: CALLED -> NO_SHOW)
async function markNoShowTicket(req, res) {
    try {
        const ticketId = parseInt(req.params.id, 10);
        if (isNaN(ticketId)) {
            return res.status(400).json({
                success: false,
                error: "Invalid ticket ID. Must be a number.",
            });
        }

        // 1. Fetch ticket
        const checkResult = await db.query(
            `SELECT t.*, q.name AS queue_name 
             FROM tickets t 
             JOIN queues q ON t.queue_id = q.id 
             WHERE t.id = $1`,
            [ticketId]
        );

        if (checkResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: `Ticket with ID ${ticketId} not found.`,
            });
        }

        const ticket = checkResult.rows[0];

        // 2. Enforce transition from CALLED -> NO_SHOW
        if (ticket.status !== "CALLED") {
            return res.status(400).json({
                success: false,
                error: `Cannot mark as no-show. Ticket must be in 'CALLED' status, but current status is '${ticket.status}'.`,
            });
        }

        // 3. Update status to NO_SHOW
        const updateResult = await db.query(
            `UPDATE tickets 
             SET status = 'NO_SHOW', updated_at = CURRENT_TIMESTAMP 
             WHERE id = $1 
             RETURNING *;`,
            [ticketId]
        );

        return res.status(200).json({
            success: true,
            message: `Ticket ${ticket.ticket_number} marked as no-show.`,
            data: {
                ...updateResult.rows[0],
                queue_name: ticket.queue_name,
            },
        });
    } catch (error) {
        console.error("Error marking ticket as no-show:", error);
        return res.status(500).json({
            success: false,
            error: "Internal server error while marking ticket as no-show.",
        });
    }
}

// PATCH /api/v1/tickets/:id/cancel - Cancel a waiting ticket (WAITING -> CANCELLED)
// Note: Public ticket cancellation is a temporary limitation because tickets
// are not yet associated with authenticated customer accounts. Customer ownership will be addressed later.
async function cancelTicket(req, res) {
    try {
        const ticketId = parseInt(req.params.id, 10);
        if (isNaN(ticketId)) {
            return res.status(400).json({
                success: false,
                error: "Invalid ticket ID. Must be a number.",
            });
        }

        // 1. Check existing ticket status
        const checkResult = await db.query(
            `SELECT t.*, q.name AS queue_name 
             FROM tickets t 
             JOIN queues q ON t.queue_id = q.id 
             WHERE t.id = $1`,
            [ticketId]
        );

        if (checkResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: `Ticket with ID ${ticketId} not found.`,
            });
        }

        const currentTicket = checkResult.rows[0];

        // 2. Enforce transition from WAITING -> CANCELLED
        if (currentTicket.status !== "WAITING") {
            return res.status(400).json({
                success: false,
                error: `Cannot cancel ticket. Ticket must be in 'WAITING' status, but current status is '${currentTicket.status}'.`,
            });
        }

        // 3. Update status to CANCELLED
        const updateQuery = `
            UPDATE tickets 
            SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING *;
        `;
        const updatedResult = await db.query(updateQuery, [ticketId]);

        return res.status(200).json({
            success: true,
            message: "Ticket cancelled successfully.",
            data: {
                ...updatedResult.rows[0],
                queue_name: currentTicket.queue_name,
            },
        });
    } catch (error) {
        console.error("Error cancelling ticket:", error);
        return res.status(500).json({
            success: false,
            error: "Internal server error while cancelling ticket.",
        });
    }
}

module.exports = {
    createTicket,
    getTicketById,
    callNextTicket,
    startServingTicket,
    completeTicket,
    markNoShowTicket,
    cancelTicket,
};
