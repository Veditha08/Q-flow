-- =============================================================================
-- Q-flow Migration: Add unique constraint on (queue_id, sequence_number)
-- Migration File: database/migrations/001_add_unique_ticket_sequence.sql
-- =============================================================================
-- PURPOSE
-- -------
-- Adds the UNIQUE constraint `uq_tickets_queue_sequence` on (queue_id, sequence_number)
-- to the `tickets` table as a database-level safeguard against duplicate sequence
-- numbers within the same queue, complementing application-level row locking
-- (SELECT ... FOR UPDATE in createTicket).
--
-- SAFELY IDEMPOTENT MULTI-STEP APPROACH
-- -------------------------------------
-- This migration handles four distinct database states:
--   Case 1: The correct unique constraint already exists on `tickets(queue_id, sequence_number)`.
--           -> If `uq_tickets_queue_sequence` exists backed by index `uq_tickets_queue_sequence`,
--              Pre-check passes, index creation is skipped via IF NOT EXISTS, and the
--              final attachment block detects the existing constraint and exits cleanly.
--           -> If an equivalent unique constraint on `(queue_id, sequence_number)` already exists
--              under a DIFFERENT name, OR if `uq_tickets_queue_sequence` is backed by an index
--              with a different name, Step 1 aborts safely with a clear error to prevent Step 2
--              from creating a redundant index or duplicate constraint.
--   Case 2: The correct unique index exists but is not yet attached as a constraint.
--           -> Pre-check verifies index validity, access method (btree), and definition,
--              index creation is skipped via IF NOT EXISTS, and the constraint is attached
--              using the existing index.
--   Case 3: Neither exists.
--           -> Pre-check succeeds, the index is built concurrently without exclusive locks,
--              and the constraint is attached using the newly built index.
--   Case 4: An index or constraint with name `uq_tickets_queue_sequence` exists but has
--           an unexpected definition (different table/schema, wrong columns/order, non-btree,
--           non-unique constraint type such as CHECK, invalid, partial, or expression-based).
--           -> Step 1 aborts immediately with a descriptive exception before Step 2.
--              It never drops, replaces, or assumes correctness automatically.
--
-- POSTGRESQL TRANSACTION RESTRICTION & LIMITATION NOTE
-- ----------------------------------------------------
-- PostgreSQL does NOT permit `CREATE INDEX CONCURRENTLY` inside a transaction block or
-- inside a PL/pgSQL block:
--   "ERROR: CREATE INDEX CONCURRENTLY cannot run inside a transaction block"
--
-- For that reason:
--   • Step 2 (CREATE UNIQUE INDEX CONCURRENTLY) is a standalone top-level statement,
--     never placed inside a `DO $$` block or wrapped in `BEGIN ... COMMIT`.
--   • Execute this script outside a transaction block (in autocommit mode).
--   • In a single raw SQL file, a top-level statement cannot be skipped conditionally
--     by server-side PL/pgSQL logic. The native `IF NOT EXISTS <index_name>` clause only
--     matches on the exact index name `uq_tickets_queue_sequence`. Step 1 therefore
--     explicitly halts with a safe exception if an equivalent unique constraint already exists
--     under a different name (or is backed by a differently-named index), preventing Step 2
--     from producing a redundant duplicate index.
--   • If using `psql`, do NOT pass `-1` / `--single-transaction`:
--         psql -U <db_user> -d <db_name> -f database/migrations/001_add_unique_ticket_sequence.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Step 1: Rigorously validate catalog state for existing constraint or index
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    c_rec RECORD;
    i_rec RECORD;
    expected_cols CONSTANT TEXT := 'UNIQUE (queue_id, sequence_number)';
BEGIN
    -- 1. Check existing constraint named `uq_tickets_queue_sequence`
    -- Uses LEFT JOIN on pg_class to ensure constraints without backing indexes
    -- (such as CHECK or foreign-key constraints where conindid = 0) are still detected.
    FOR c_rec IN
        SELECT
            c.conname,
            cl.relname AS tablename,
            n.nspname AS schema_name,
            c.contype,
            ic.relname AS backing_index_name,
            pg_get_constraintdef(c.oid) AS def
        FROM pg_constraint c
        JOIN pg_class cl ON cl.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = cl.relnamespace
        LEFT JOIN pg_class ic ON ic.oid = c.conindid
        WHERE c.conname = 'uq_tickets_queue_sequence'
    LOOP
        -- Check table and schema first
        IF c_rec.tablename != 'tickets' OR c_rec.schema_name != current_schema() THEN
            RAISE EXCEPTION 'Constraint "uq_tickets_queue_sequence" already exists on %.% rather than intended %.tickets.',
                c_rec.schema_name, c_rec.tablename, current_schema();
        END IF;

        -- Check constraint type and definition before checking backing index name
        IF c_rec.contype != 'u' OR c_rec.def != expected_cols THEN
            RAISE EXCEPTION 'Constraint "uq_tickets_queue_sequence" exists on %.tickets with unexpected definition "%" (expected "%").',
                current_schema(), c_rec.def, expected_cols;
        END IF;

        -- If the constraint is backed by a differently-named index, halt to prevent Step 2
        -- from creating a redundant duplicate index under the name `uq_tickets_queue_sequence`.
        IF c_rec.backing_index_name IS NULL OR c_rec.backing_index_name != 'uq_tickets_queue_sequence' THEN
            RAISE EXCEPTION 'Constraint "uq_tickets_queue_sequence" exists on %.tickets but is backed by index "%" rather than "uq_tickets_queue_sequence". Migration halted to prevent creating a redundant index.',
                current_schema(), COALESCE(c_rec.backing_index_name, 'none');
        END IF;
    END LOOP;

    -- Also check if ANY OTHER unique constraint already exists on tickets covering (queue_id, sequence_number)
    FOR c_rec IN
        SELECT
            c.conname,
            ic.relname AS backing_index_name
        FROM pg_constraint c
        JOIN pg_class cl ON cl.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = cl.relnamespace
        LEFT JOIN pg_class ic ON ic.oid = c.conindid
        WHERE cl.relname = 'tickets'
          AND n.nspname = current_schema()
          AND c.contype = 'u'
          AND c.conname != 'uq_tickets_queue_sequence'
          AND pg_get_constraintdef(c.oid) = expected_cols
    LOOP
        RAISE EXCEPTION 'Table %.tickets already has unique constraint "%" on (queue_id, sequence_number) backed by index "%". Migration halted to prevent creating a redundant index "uq_tickets_queue_sequence".',
            current_schema(), c_rec.conname, COALESCE(c_rec.backing_index_name, 'none');
    END LOOP;

    -- 2. Check existing index named `uq_tickets_queue_sequence`
    -- Uses pg_index, pg_class, and pg_am catalog attributes to inspect relation, schema,
    -- access method, uniqueness, validity, predicates, expressions, and ordered key attributes.
    FOR i_rec IN
        SELECT
            ic.relname AS index_name,
            c.relname AS table_name,
            n.nspname AS schema_name,
            am.amname AS access_method,
            i.indisunique,
            i.indisvalid,
            i.indnatts,
            i.indnkeyatts,
            (i.indexprs IS NOT NULL) AS is_expression,
            (i.indpred IS NOT NULL) AS is_partial,
            ARRAY(
                SELECT a.attname::text
                FROM pg_attribute a
                JOIN unnest(string_to_array(i.indkey::text, ' ')::int2[]) WITH ORDINALITY AS k(attnum, ord)
                  ON a.attrelid = i.indrelid AND a.attnum = k.attnum
                ORDER BY k.ord
            ) AS key_columns
        FROM pg_index i
        JOIN pg_class ic ON ic.oid = i.indexrelid
        JOIN pg_class c ON c.oid = i.indrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_am am ON am.oid = ic.relam
        WHERE ic.relname = 'uq_tickets_queue_sequence'
    LOOP
        IF i_rec.table_name != 'tickets' OR i_rec.schema_name != current_schema() THEN
            RAISE EXCEPTION 'Index "uq_tickets_queue_sequence" exists on %.% rather than intended %.tickets.',
                i_rec.schema_name, i_rec.table_name, current_schema();
        END IF;

        -- Validate access method explicitly (must be btree for standard unique constraints)
        IF i_rec.access_method != 'btree' THEN
            RAISE EXCEPTION 'Index "uq_tickets_queue_sequence" on %.tickets uses access method "%" (expected "btree").',
                current_schema(), i_rec.access_method;
        END IF;

        IF NOT i_rec.indisunique THEN
            RAISE EXCEPTION 'Index "uq_tickets_queue_sequence" on %.tickets is not UNIQUE.', current_schema();
        END IF;

        IF NOT i_rec.indisvalid THEN
            RAISE EXCEPTION 'Index "uq_tickets_queue_sequence" on %.tickets is marked INVALID (e.g. from an aborted concurrent build). Drop it before rerunning.',
                current_schema();
        END IF;

        IF i_rec.is_partial THEN
            RAISE EXCEPTION 'Index "uq_tickets_queue_sequence" on %.tickets is a partial index (contains a WHERE clause) and cannot back a UNIQUE constraint.',
                current_schema();
        END IF;

        IF i_rec.is_expression THEN
            RAISE EXCEPTION 'Index "uq_tickets_queue_sequence" on %.tickets contains expressions and cannot back a standard UNIQUE constraint.',
                current_schema();
        END IF;

        IF i_rec.indnkeyatts != 2 OR i_rec.indnatts != 2 THEN
            RAISE EXCEPTION 'Index "uq_tickets_queue_sequence" on %.tickets has % key attributes and % total attributes (expected exactly 2 key columns without INCLUDE).',
                current_schema(), i_rec.indnkeyatts, i_rec.indnatts;
        END IF;

        IF i_rec.key_columns != ARRAY['queue_id', 'sequence_number']::text[] THEN
            RAISE EXCEPTION 'Index "uq_tickets_queue_sequence" on %.tickets indexes % rather than the expected columns (queue_id, sequence_number).',
                current_schema(), i_rec.key_columns;
        END IF;
    END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- Step 2: Build unique index CONCURRENTLY (if not already existing)
-- Standalone statement to satisfy PostgreSQL restriction on transaction blocks.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_tickets_queue_sequence
    ON tickets (queue_id, sequence_number);

-- -----------------------------------------------------------------------------
-- Step 3: Attach constraint using the index (skipped if constraint already exists)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    expected_cols CONSTANT TEXT := 'UNIQUE (queue_id, sequence_number)';
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class cl ON cl.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = cl.relnamespace
        WHERE c.conname = 'uq_tickets_queue_sequence'
          AND cl.relname = 'tickets'
          AND n.nspname = current_schema()
          AND c.contype = 'u'
          AND pg_get_constraintdef(c.oid) = expected_cols
    ) THEN
        RAISE NOTICE 'Constraint "uq_tickets_queue_sequence" already exists on %.tickets with expected definition; skipping.', current_schema();
    ELSE
        ALTER TABLE tickets
            ADD CONSTRAINT uq_tickets_queue_sequence
            UNIQUE USING INDEX uq_tickets_queue_sequence;
        RAISE NOTICE 'Attached unique constraint "uq_tickets_queue_sequence" to %.tickets using index.', current_schema();
    END IF;
END $$;
