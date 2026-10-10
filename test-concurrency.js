const path = require('path');
const db = require(path.resolve('database/db'));
const app = require(path.resolve('src/app'));

async function runConcurrencyAndWorkflowTests() {
    console.log('\n======================================================');
    console.log('   Q-FLOW CONCURRENCY & WORKFLOW VALIDATION SUITE');
    console.log('======================================================\n');

    const server = app.listen(3004, async () => {
        try {
            const baseUrl = 'http://localhost:3004/api/v1';

            // 1. Health check
            const health = await fetch('http://localhost:3004/health').then(r => r.json());
            console.log('✓ Health Check:', health.status);

            // 2. Login as Admin & Staff
            const adminLogin = await fetch(`${baseUrl}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'admin@qflow.com', password: 'admin123' })
            }).then(r => r.json());
            const adminToken = adminLogin.token;

            const randomStaffEmail = `staff_concurrency_${Date.now()}@qflow.com`;
            const staffReg = await fetch(`${baseUrl}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Staff Tester', email: randomStaffEmail, password: 'password123' })
            }).then(r => r.json());
            const staffToken = staffReg.token;
            console.log('✓ Admin & Staff Logins Authenticated');

            // ================================================================
            // NEW: Section A — Concurrent Ticket ISSUANCE Race-Condition Test
            // ================================================================
            // This test specifically targets the race condition that existed
            // in the old createTicket: two requests computing the same
            // MAX(sequence_number)+1 concurrently.
            // The fix uses SELECT ... FOR UPDATE on the queue row so that
            // concurrent requests serialise through the database lock.
            // ================================================================
            console.log('\n--- Section A: Concurrent Ticket Issuance (Race-Condition Fix) ---');

            const issueQueueRes = await fetch(`${baseUrl}/queues`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
                body: JSON.stringify({ name: 'Issuance Race Test Queue', prefix: 'RACE' })
            }).then(r => r.json());
            const issueQueueId = issueQueueRes.data.id;
            console.log(`✓ Created isolated test queue: ID ${issueQueueId} (prefix: RACE)`);

            // Fire CONCURRENT_ISSUE simultaneous POST /tickets requests.
            // Without the lock fix, several of these would get the same
            // sequence number and the same ticket_number would be issued twice.
            const CONCURRENT_ISSUE = 10;
            console.log(`  Firing ${CONCURRENT_ISSUE} simultaneous POST /tickets requests...`);

            const issuePromises = Array.from({ length: CONCURRENT_ISSUE }, (_, i) =>
                fetch(`${baseUrl}/tickets`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ queue_id: issueQueueId, customer_name: `RaceCustomer${i + 1}` })
                }).then(async res => {
                    const body = await res.json();
                    return { httpStatus: res.status, data: body.data, success: body.success };
                })
            );

            const issueResults = await Promise.all(issuePromises);

            // All requests must succeed
            const failedIssues = issueResults.filter(r => r.httpStatus !== 201);
            if (failedIssues.length > 0) {
                throw new Error(`${failedIssues.length} ticket issuance request(s) failed: ${JSON.stringify(failedIssues)}`);
            }
            console.log(`  ✓ All ${CONCURRENT_ISSUE} requests returned HTTP 201`);

            // Collect sequence numbers and ticket numbers from responses
            const responseSeqNums = issueResults.map(r => r.data.sequence_number);
            const responseTicketNums = issueResults.map(r => r.data.ticket_number);

            const uniqueSeqNums = new Set(responseSeqNums);
            const uniqueTicketNums = new Set(responseTicketNums);

            if (uniqueSeqNums.size !== CONCURRENT_ISSUE) {
                throw new Error(
                    `RACE CONDITION DETECTED in ticket issuance! Expected ${CONCURRENT_ISSUE} unique ` +
                    `sequence numbers but got ${uniqueSeqNums.size}. ` +
                    `Sequence numbers: [${responseSeqNums.sort((a, b) => a - b).join(', ')}]`
                );
            }
            console.log(`  ✓ All ${CONCURRENT_ISSUE} sequence numbers are unique: [${[...uniqueSeqNums].sort((a,b)=>a-b).join(', ')}]`);

            if (uniqueTicketNums.size !== CONCURRENT_ISSUE) {
                throw new Error(
                    `RACE CONDITION DETECTED in ticket issuance! Expected ${CONCURRENT_ISSUE} unique ` +
                    `ticket numbers but got ${uniqueTicketNums.size}. ` +
                    `Ticket numbers: [${responseTicketNums.join(', ')}]`
                );
            }
            console.log(`  ✓ All ${CONCURRENT_ISSUE} ticket numbers are unique: [${[...uniqueTicketNums].sort().join(', ')}]`);

            // Verify they are consecutive (1..CONCURRENT_ISSUE)
            const sortedSeqs = [...uniqueSeqNums].sort((a, b) => a - b);
            const expectedSeqs = Array.from({ length: CONCURRENT_ISSUE }, (_, i) => i + 1);
            const isConsecutive = sortedSeqs.every((v, i) => v === expectedSeqs[i]);
            if (!isConsecutive) {
                throw new Error(
                    `Sequence numbers are not consecutive 1..${CONCURRENT_ISSUE}. Got: [${sortedSeqs.join(', ')}]`
                );
            }
            console.log(`  ✓ Sequence numbers are consecutive 1..${CONCURRENT_ISSUE}`);

            // Cross-check with the database to make sure DB records match responses
            const dbCheck = await db.query(
                'SELECT sequence_number, ticket_number FROM tickets WHERE queue_id = $1 ORDER BY sequence_number ASC',
                [issueQueueId]
            );
            if (dbCheck.rows.length !== CONCURRENT_ISSUE) {
                throw new Error(
                    `DB has ${dbCheck.rows.length} tickets but expected ${CONCURRENT_ISSUE}`
                );
            }
            const dbSeqs = dbCheck.rows.map(r => r.sequence_number);
            const dbTickets = new Set(dbCheck.rows.map(r => r.ticket_number));

            if (dbTickets.size !== CONCURRENT_ISSUE) {
                throw new Error(`DB contains duplicate ticket_numbers! Found only ${dbTickets.size} unique out of ${CONCURRENT_ISSUE}.`);
            }
            const dbConsecutive = dbSeqs.every((v, i) => v === i + 1);
            if (!dbConsecutive) {
                throw new Error(`DB sequence numbers are not 1..${CONCURRENT_ISSUE}. Got: [${dbSeqs.join(', ')}]`);
            }
            console.log(`  ✓ Database records match: ${CONCURRENT_ISSUE} tickets, consecutive sequences, no duplicates`);

            // Run the concurrent issuance a second time to verify it's repeatable
            // (using a fresh second queue so sequence numbers start at 1 again)
            console.log(`\n  Running concurrent issuance a second time (fresh queue)...`);
            const issueQueue2Res = await fetch(`${baseUrl}/queues`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
                body: JSON.stringify({ name: 'Issuance Race Test Queue 2', prefix: 'RC2' })
            }).then(r => r.json());
            const issueQueueId2 = issueQueue2Res.data.id;

            const issuePromises2 = Array.from({ length: CONCURRENT_ISSUE }, (_, i) =>
                fetch(`${baseUrl}/tickets`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ queue_id: issueQueueId2, customer_name: `Run2Customer${i + 1}` })
                }).then(async res => ({ httpStatus: res.status, data: (await res.json()).data }))
            );
            const issueResults2 = await Promise.all(issuePromises2);
            const failedIssues2 = issueResults2.filter(r => r.httpStatus !== 201);
            if (failedIssues2.length > 0) {
                throw new Error(`${failedIssues2.length} ticket issuance request(s) failed in run 2: ${JSON.stringify(failedIssues2)}`);
            }
            console.log(`  ✓ All ${CONCURRENT_ISSUE} requests in run 2 returned HTTP 201`);

            const seqs2 = new Set(issueResults2.map(r => r.data.sequence_number));
            if (seqs2.size !== CONCURRENT_ISSUE) {
                throw new Error(`Second run: duplicate sequence numbers detected! Got ${seqs2.size} unique out of ${CONCURRENT_ISSUE}.`);
            }
            console.log(`  ✓ Second concurrent issuance run: all ${CONCURRENT_ISSUE} sequence numbers unique`);

            // Cross-check with PostgreSQL: verify corresponding ticket rows match response sequence numbers
            const dbCheck2 = await db.query(
                'SELECT sequence_number, ticket_number FROM tickets WHERE queue_id = $1 ORDER BY sequence_number ASC',
                [issueQueueId2]
            );
            if (dbCheck2.rows.length !== CONCURRENT_ISSUE) {
                throw new Error(`DB has ${dbCheck2.rows.length} tickets for queue 2, but expected ${CONCURRENT_ISSUE}`);
            }

            const dbSeqs2 = dbCheck2.rows.map(r => r.sequence_number);
            const sortedResponseSeqs2 = issueResults2.map(r => r.data.sequence_number).sort((a, b) => a - b);
            const matchesResponses = dbSeqs2.every((seq, idx) => seq === sortedResponseSeqs2[idx]);
            if (!matchesResponses) {
                throw new Error(`DB sequence numbers for run 2 do not match responses! DB: [${dbSeqs2.join(', ')}], Responses: [${sortedResponseSeqs2.join(', ')}]`);
            }

            const dbTickets2 = new Set(dbCheck2.rows.map(r => r.ticket_number));
            if (dbTickets2.size !== CONCURRENT_ISSUE) {
                throw new Error(`DB contains duplicate ticket_numbers in run 2! Found only ${dbTickets2.size} unique out of ${CONCURRENT_ISSUE}.`);
            }

            const dbConsecutive2 = dbSeqs2.every((v, i) => v === i + 1);
            if (!dbConsecutive2) {
                throw new Error(`DB sequence numbers for run 2 are not consecutive 1..${CONCURRENT_ISSUE}. Got: [${dbSeqs2.join(', ')}]`);
            }
            console.log(`  ✓ Database verification for run 2 passed: ${CONCURRENT_ISSUE} rows match response sequence numbers exactly`);

            console.log('\n✓ Section A PASSED: Ticket issuance is concurrency-safe.\n');

            // ================================================================
            // Section B — Original: callNextTicket Concurrency Test
            // (strengthened with explicit HTTP status assertions)
            // ================================================================

            // 3. Create a test queue
            const queueRes = await fetch(`${baseUrl}/queues`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken}`
                },
                body: JSON.stringify({ name: 'Concurrency Test Counter', prefix: 'CONC' })
            }).then(r => r.json());
            const queueId = queueRes.data.id;
            console.log(`--- Section B: callNextTicket Concurrency (Queue ID ${queueId}) ---`);

            // 4. Test Queue Validations on callNextTicket
            // 4a. Invalid queue_id format -> 400
            const badIdRes = await fetch(`${baseUrl}/tickets/next`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${staffToken}`
                },
                body: JSON.stringify({ queue_id: 'invalid-string' })
            });
            if (badIdRes.status !== 400) {
                throw new Error(`Expected HTTP 400 for invalid queue_id, got ${badIdRes.status}`);
            }
            console.log(`✓ Invalid Queue ID returns 400: status=${badIdRes.status}`);

            // 4b. Non-existent queue -> 404
            const nonExistentRes = await fetch(`${baseUrl}/tickets/next`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${staffToken}`
                },
                body: JSON.stringify({ queue_id: 999999 })
            });
            if (nonExistentRes.status !== 404) {
                throw new Error(`Expected HTTP 404 for non-existent queue, got ${nonExistentRes.status}`);
            }
            console.log(`✓ Non-existent Queue returns 404: status=${nonExistentRes.status}`);

            // 4c. Empty queue (no waiting tickets) -> 404
            const emptyQueueRes = await fetch(`${baseUrl}/tickets/next`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${staffToken}`
                },
                body: JSON.stringify({ queue_id: queueId })
            });
            if (emptyQueueRes.status !== 404) {
                throw new Error(`Expected HTTP 404 for empty queue, got ${emptyQueueRes.status}`);
            }
            console.log(`✓ Empty Queue returns 404: status=${emptyQueueRes.status}`);

            // 4d. Unauthorized call without token -> 401
            const unauthRes = await fetch(`${baseUrl}/tickets/next`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ queue_id: queueId })
            });
            if (unauthRes.status !== 401) {
                throw new Error(`Expected HTTP 401 for unauthorized call without token, got ${unauthRes.status}`);
            }
            console.log(`✓ Missing Auth Token returns 401: status=${unauthRes.status}`);

            // 5. Issue 5 tickets for concurrency testing
            console.log('\n--- Issuing 5 Tickets to Queue ---');
            const ticketIds = [];
            for (let i = 1; i <= 5; i++) {
                const tRes = await fetch(`${baseUrl}/tickets`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ queue_id: queueId, customer_name: `Customer ${i}` })
                }).then(r => r.json());
                ticketIds.push(tRes.data.id);
                console.log(`  Issued Ticket ${i}: ${tRes.data.ticket_number} (Seq: ${tRes.data.sequence_number}, Status: ${tRes.data.status})`);
            }

            // 6. Concurrency Test: Send 3 simultaneous call-next requests
            console.log('\n--- Executing 3 Simultaneous Concurrent callNextTicket Requests ---');
            const concurrentCalls = [1, 2, 3].map((agentNum) =>
                fetch(`${baseUrl}/tickets/next`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${staffToken}`
                    },
                    body: JSON.stringify({ queue_id: queueId })
                }).then(async res => {
                    const body = await res.json();
                    return { agentNum, status: res.status, data: body.data };
                })
            );

            const results = await Promise.all(concurrentCalls);

            const receivedTicketIds = new Set();
            const receivedTicketNumbers = [];

            for (const res of results) {
                console.log(`  Agent ${res.agentNum} received ticket: ${res.data?.ticket_number} (ID: ${res.data?.id}, Status: ${res.data?.status})`);
                if (res.status !== 200) {
                    throw new Error(`Agent ${res.agentNum} call-next request failed with HTTP ${res.status}`);
                }
                if (receivedTicketIds.has(res.data.id)) {
                    throw new Error(`RACE CONDITION DETECTED! Ticket ID ${res.data.id} was claimed more than once!`);
                }
                receivedTicketIds.add(res.data.id);
                receivedTicketNumbers.push(res.data.ticket_number);
            }

            if (receivedTicketIds.size !== 3) {
                throw new Error(`Expected 3 unique tickets, but got ${receivedTicketIds.size}`);
            }
            console.log(`✓ Concurrency Protection Verified: All 3 concurrent calls claimed DISTINCT tickets: [${receivedTicketNumbers.join(', ')}]`);

            // 7. Verify remaining tickets in queue
            console.log('\n--- Calling remaining 2 tickets sequentially ---');
            const next4Res = await fetch(`${baseUrl}/tickets/next`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${staffToken}`
                },
                body: JSON.stringify({ queue_id: queueId })
            });
            if (next4Res.status !== 200) {
                throw new Error(`Expected HTTP 200 calling 4th ticket, got ${next4Res.status}`);
            }
            const next4 = await next4Res.json();
            console.log(`  Called 4th Ticket: ${next4.data.ticket_number} (Status: ${next4.data.status})`);

            const next5Res = await fetch(`${baseUrl}/tickets/next`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${staffToken}`
                },
                body: JSON.stringify({ queue_id: queueId })
            });
            if (next5Res.status !== 200) {
                throw new Error(`Expected HTTP 200 calling 5th ticket, got ${next5Res.status}`);
            }
            const next5 = await next5Res.json();
            console.log(`  Called 5th Ticket: ${next5.data.ticket_number} (Status: ${next5.data.status})`);

            // Queue now empty
            const nextEmptyAgain = await fetch(`${baseUrl}/tickets/next`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${staffToken}`
                },
                body: JSON.stringify({ queue_id: queueId })
            });
            if (nextEmptyAgain.status !== 404) {
                throw new Error(`Expected HTTP 404 for exhausted queue, got ${nextEmptyAgain.status}`);
            }
            console.log(`✓ Queue exhausted: Next call properly returns 404 (status=${nextEmptyAgain.status})`);

            // 8. Test lifecycle for one of the called tickets: CALLED -> SERVING -> COMPLETED
            const firstClaimedId = Array.from(receivedTicketIds)[0];
            const serveRawRes = await fetch(`${baseUrl}/tickets/${firstClaimedId}/start-serving`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${staffToken}` }
            });
            if (serveRawRes.status !== 200) {
                throw new Error(`Expected HTTP 200 starting service, got ${serveRawRes.status}`);
            }
            const serveRes = await serveRawRes.json();
            console.log(`\n✓ Started Serving Ticket ${firstClaimedId}: ${serveRes.data.status}`);

            const compRawRes = await fetch(`${baseUrl}/tickets/${firstClaimedId}/complete`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${staffToken}` }
            });
            if (compRawRes.status !== 200) {
                throw new Error(`Expected HTTP 200 completing ticket, got ${compRawRes.status}`);
            }
            const compRes = await compRawRes.json();
            console.log(`✓ Completed Ticket ${firstClaimedId}: ${compRes.data.status}`);

            console.log('\n✓ Section B PASSED: callNextTicket concurrency is safe.\n');

            console.log('======================================================');
            console.log('   🎉 ALL CONCURRENCY & WORKFLOW TESTS PASSED! 🎉');
            console.log('======================================================\n');
        } catch (error) {
            console.error('Test Suite Failed:', error);
            process.exitCode = 1;
        } finally {
            server.close();
            await db.pool.end();
        }
    });
}

runConcurrencyAndWorkflowTests();
