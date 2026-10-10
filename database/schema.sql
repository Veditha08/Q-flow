-- Q-flow Database Schema (Milestone 1)

-- 1. Queues Table
CREATE TABLE IF NOT EXISTS queues (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    prefix VARCHAR(10) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tickets Table
CREATE TABLE IF NOT EXISTS tickets (
    id SERIAL PRIMARY KEY,
    queue_id INTEGER NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
    customer_name VARCHAR(100) NOT NULL,
    ticket_number VARCHAR(30) NOT NULL,
    sequence_number INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'WAITING', -- 'WAITING', 'CALLED', 'SERVING', 'COMPLETED', 'CANCELLED', 'NO_SHOW'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Integrity safeguard: the application uses SELECT ... FOR UPDATE to prevent
    -- duplicates, but this constraint is the last line of defence at the DB level.
    CONSTRAINT uq_tickets_queue_sequence UNIQUE (queue_id, sequence_number)
);

-- Indexes for fast queue and status lookups
CREATE INDEX IF NOT EXISTS idx_tickets_queue_status ON tickets(queue_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);


-- 3. Users Table (Milestone 3: Authentication & RBAC)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'STAFF', -- 'ADMIN', 'STAFF'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

