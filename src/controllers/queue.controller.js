const db = require("../../database/db");

// GET /api/v1/queues - List all queues with active waiting ticket counts
async function getAllQueues(req, res) {
    try {
        const queryText = `
            SELECT 
                q.id,
                q.name,
                q.prefix,
                q.description,
                q.is_active,
                q.created_at,
                COUNT(t.id) FILTER (WHERE t.status = 'WAITING')::int AS waiting_count
            FROM queues q
            LEFT JOIN tickets t ON q.id = t.queue_id
            GROUP BY q.id
            ORDER BY q.id ASC;
        `;
        const result = await db.query(queryText);

        return res.status(200).json({
            success: true,
            count: result.rows.length,
            data: result.rows,
        });
    } catch (error) {
        console.error("Error fetching queues:", error);
        return res.status(500).json({
            success: false,
            error: "Internal server error while fetching queues.",
        });
    }
}

// GET /api/v1/queues/:id - Get single queue details
async function getQueueById(req, res) {
    try {
        const queueId = parseInt(req.params.id, 10);
        if (isNaN(queueId)) {
            return res.status(400).json({
                success: false,
                error: "Invalid queue ID. Must be a number.",
            });
        }

        const queryText = `
            SELECT 
                q.id,
                q.name,
                q.prefix,
                q.description,
                q.is_active,
                q.created_at,
                COUNT(t.id) FILTER (WHERE t.status = 'WAITING')::int AS waiting_count
            FROM queues q
            LEFT JOIN tickets t ON q.id = t.queue_id
            WHERE q.id = $1
            GROUP BY q.id;
        `;
        const result = await db.query(queryText, [queueId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: `Queue with ID ${queueId} not found.`,
            });
        }

        return res.status(200).json({
            success: true,
            data: result.rows[0],
        });
    } catch (error) {
        console.error("Error fetching queue by ID:", error);
        return res.status(500).json({
            success: false,
            error: "Internal server error while fetching queue.",
        });
    }
}

// POST /api/v1/queues - Create a new queue
async function createQueue(req, res) {
    try {
        const { name, prefix, description } = req.body;

        if (!name || typeof name !== "string" || name.trim() === "") {
            return res.status(400).json({
                success: false,
                error: "Queue 'name' is required.",
            });
        }

        if (!prefix || typeof prefix !== "string" || prefix.trim() === "") {
            return res.status(400).json({
                success: false,
                error: "Queue 'prefix' is required (e.g. 'BILL', 'REG', 'DOC').",
            });
        }

        const cleanName = name.trim();
        const cleanPrefix = prefix.trim().toUpperCase();
        const cleanDesc = description ? description.trim() : null;

        const insertQuery = `
            INSERT INTO queues (name, prefix, description)
            VALUES ($1, $2, $3)
            RETURNING *;
        `;
        const result = await db.query(insertQuery, [cleanName, cleanPrefix, cleanDesc]);

        return res.status(201).json({
            success: true,
            message: "Queue created successfully.",
            data: result.rows[0],
        });
    } catch (error) {
        console.error("Error creating queue:", error);
        return res.status(500).json({
            success: false,
            error: "Internal server error while creating queue.",
        });
    }
}

module.exports = {
    getAllQueues,
    getQueueById,
    createQueue,
};
