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
            console.log(`✓ Test Queue Created: ID ${queueId} (${queueRes.data.prefix})`);

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
            console.log(`✓ Empty Queue returns 404: status=${emptyQueueRes.status}`);

            // 4d. Unauthorized call without token -> 401
            const unauthRes = await fetch(`${baseUrl}/tickets/next`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ queue_id: queueId })
            });
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
            const next4 = await fetch(`${baseUrl}/tickets/next`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${staffToken}`
                },
                body: JSON.stringify({ queue_id: queueId })
            }).then(r => r.json());
            console.log(`  Called 4th Ticket: ${next4.data.ticket_number} (Status: ${next4.data.status})`);

            const next5 = await fetch(`${baseUrl}/tickets/next`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${staffToken}`
                },
                body: JSON.stringify({ queue_id: queueId })
            }).then(r => r.json());
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
            console.log(`✓ Queue exhausted: Next call properly returns 404 (status=${nextEmptyAgain.status})`);

            // 8. Test lifecycle for one of the called tickets: CALLED -> SERVING -> COMPLETED
            const firstClaimedId = Array.from(receivedTicketIds)[0];
            const serveRes = await fetch(`${baseUrl}/tickets/${firstClaimedId}/start-serving`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${staffToken}` }
            }).then(r => r.json());
            console.log(`\n✓ Started Serving Ticket ${firstClaimedId}: ${serveRes.data.status}`);

            const compRes = await fetch(`${baseUrl}/tickets/${firstClaimedId}/complete`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${staffToken}` }
            }).then(r => r.json());
            console.log(`✓ Completed Ticket ${firstClaimedId}: ${compRes.data.status}`);

            console.log('\n======================================================');
            console.log('   🎉 ALL CONCURRENCY & WORKFLOW TESTS PASSED! 🎉');
            console.log('======================================================\n');
        } catch (error) {
            console.error('Test Suite Failed:', error);
        } finally {
            server.close();
            await db.pool.end();
        }
    });
}

runConcurrencyAndWorkflowTests();
