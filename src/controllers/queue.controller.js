const db = require("../../database/db");

// GET /api/v1/queues - List all queues with active waiting ticket counts
async function getAllQueues(req, res, next) {
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
        next(error);
    }
}

// GET /api/v1/queues/:id - Get single queue details
async function getQueueById(req, res, next) {
    try {
        const queueId = parseInt(req.params.id, 10);

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
        next(error);
    }
}

// POST /api/v1/queues - Create a new queue
async function createQueue(req, res, next) {
    try {
        const { name, prefix, description } = req.body;

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
        next(error);
    }
}

module.exports = {
    getAllQueues,
    getQueueById,
    createQueue,
};
