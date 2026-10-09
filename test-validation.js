const path = require("path");
const db = require(path.resolve("database/db"));
const app = require(path.resolve("src/app"));

async function runValidationAndErrorTestSuite() {
    console.log("\n========================================================");
    console.log("   Q-FLOW VALIDATION & ERROR HANDLING TEST SUITE");
    console.log("========================================================\n");

    const PORT = 3005;
    const baseUrl = `http://localhost:${PORT}/api/v1`;

    const server = app.listen(PORT, async () => {
        let passedTests = 0;
        let failedTests = 0;

        function assert(condition, message) {
            if (condition) {
                console.log(`  ✓ ${message}`);
                passedTests++;
            } else {
                console.error(`  ✗ FAILED: ${message}`);
                failedTests++;
            }
        }

        try {
            // ---------------------------------------------------------
            // Test 1: Health Check & Base Route
            // ---------------------------------------------------------
            console.log("\n--- 1. Base & Health Endpoints ---");
            const healthRes = await fetch(`http://localhost:${PORT}/health`);
            const healthData = await healthRes.json();
            assert(healthRes.status === 200 && healthData.status === "UP", "Health endpoint returns 200 UP");

            // ---------------------------------------------------------
            // Test 2: Valid Registration & Login
            // ---------------------------------------------------------
            console.log("\n--- 2. Valid Registration & Authentication ---");
            const testEmail = `valid_user_${Date.now()}@qflow.com`;
            const regRes = await fetch(`${baseUrl}/auth/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: "Valid Staff",
                    email: testEmail,
                    password: "password123",
                }),
            });
            const regData = await regRes.json();
            assert(regRes.status === 201 && regData.token && regData.data.role === "STAFF", "Valid registration returns 201 with JWT token and STAFF role");

            const staffToken = regData.token;

            const loginRes = await fetch(`${baseUrl}/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: testEmail,
                    password: "password123",
                }),
            });
            const loginData = await loginRes.json();
            assert(loginRes.status === 200 && loginData.token, "Valid login returns 200 with JWT token");

            // Login as Admin
            const adminLoginRes = await fetch(`${baseUrl}/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: "admin@qflow.com",
                    password: "admin123",
                }),
            });
            const adminLoginData = await adminLoginRes.json();
            const adminToken = adminLoginData.token;
            assert(adminLoginRes.status === 200 && adminToken, "Default Admin login successful");

            // ---------------------------------------------------------
            // Test 3: Invalid Registration & Login Inputs (HTTP 400)
            // ---------------------------------------------------------
            console.log("\n--- 3. Invalid Auth Inputs (HTTP 400 Validation) ---");

            // Missing name
            const noNameRes = await fetch(`${baseUrl}/auth/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: "noname@qflow.com", password: "password123" }),
            });
            assert(noNameRes.status === 400, "Registration without name returns HTTP 400");

            // Invalid email format
            const badEmailRes = await fetch(`${baseUrl}/auth/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: "Bad Email", email: "not-an-email", password: "password123" }),
            });
            assert(badEmailRes.status === 400, "Registration with invalid email returns HTTP 400");

            // Password too short (< 6 chars)
            const shortPassRes = await fetch(`${baseUrl}/auth/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: "Short Pass", email: "short@qflow.com", password: "123" }),
            });
            assert(shortPassRes.status === 400, "Registration with short password (< 6 chars) returns HTTP 400");

            // Login missing password
            const noPassLoginRes = await fetch(`${baseUrl}/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: testEmail }),
            });
            assert(noPassLoginRes.status === 400, "Login missing password returns HTTP 400");

            // Malformed JSON payload
            const badJsonRes = await fetch(`${baseUrl}/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{ invalid json payload",
            });
            const badJsonData = await badJsonRes.json();
            assert(badJsonRes.status === 400 && badJsonData.error === "Invalid JSON payload in request body.", "Malformed JSON body returns HTTP 400 handled by centralized error middleware");

            // ---------------------------------------------------------
            // Test 4: Public Registration Cannot Create an ADMIN
            // ---------------------------------------------------------
            console.log("\n--- 4. Role Escalation Prevention ---");
            const escalateEmail = `escalate_${Date.now()}@qflow.com`;
            const escalateRes = await fetch(`${baseUrl}/auth/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: "Hacker Attempt",
                    email: escalateEmail,
                    password: "password123",
                    role: "ADMIN", // Should be ignored or assigned STAFF
                }),
            });
            const escalateData = await escalateRes.json();
            assert(escalateRes.status === 201 && escalateData.data.role === "STAFF", "Public registration strictly enforces STAFF role even if ADMIN role requested");

            // Admin creating an admin user via admin endpoint
            const createAdminRes = await fetch(`${baseUrl}/auth/users`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${adminToken}`,
                },
                body: JSON.stringify({
                    name: "Secondary Admin",
                    email: `admin2_${Date.now()}@qflow.com`,
                    password: "password123",
                    role: "ADMIN",
                }),
            });
            const createAdminData = await createAdminRes.json();
            assert(createAdminRes.status === 201 && createAdminData.data.role === "ADMIN", "Admin can create ADMIN user via protected endpoint");

            // Invalid role in admin creation
            const badRoleRes = await fetch(`${baseUrl}/auth/users`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${adminToken}`,
                },
                body: JSON.stringify({
                    name: "Invalid Role",
                    email: `badrole_${Date.now()}@qflow.com`,
                    password: "password123",
                    role: "SUPERUSER",
                }),
            });
            assert(badRoleRes.status === 400, "Admin creation with invalid role value returns HTTP 400");

            // ---------------------------------------------------------
            // Test 5: Invalid Queue Creation Inputs (HTTP 400)
            // ---------------------------------------------------------
            console.log("\n--- 5. Queue Creation Input Validation (HTTP 400) ---");

            // Missing name
            const noQueueNameRes = await fetch(`${baseUrl}/queues`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${adminToken}`,
                },
                body: JSON.stringify({ prefix: "NOPROX" }),
            });
            assert(noQueueNameRes.status === 400, "Queue creation missing name returns HTTP 400");

            // Missing prefix
            const noQueuePrefixRes = await fetch(`${baseUrl}/queues`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${adminToken}`,
                },
                body: JSON.stringify({ name: "No Prefix Counter" }),
            });
            assert(noQueuePrefixRes.status === 400, "Queue creation missing prefix returns HTTP 400");

            // Prefix too long (> 10 chars)
            const longPrefixRes = await fetch(`${baseUrl}/queues`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${adminToken}`,
                },
                body: JSON.stringify({ name: "Too Long Prefix", prefix: "VERYLONGPREFIX12345" }),
            });
            assert(longPrefixRes.status === 400, "Queue creation with prefix > 10 chars returns HTTP 400");

            // ---------------------------------------------------------
            // Test 6: Invalid Route Parameters (IDs) (HTTP 400)
            // ---------------------------------------------------------
            console.log("\n--- 6. Route Parameter (ID) Validation (HTTP 400) ---");

            // Queue ID non-integer string
            const badQueueIdRes1 = await fetch(`${baseUrl}/queues/abc`);
            assert(badQueueIdRes1.status === 400, "GET /queues/abc returns HTTP 400");

            // Queue ID negative number
            const badQueueIdRes2 = await fetch(`${baseUrl}/queues/-10`);
            assert(badQueueIdRes2.status === 400, "GET /queues/-10 returns HTTP 400");

            // Ticket ID non-integer string
            const badTicketIdRes1 = await fetch(`${baseUrl}/tickets/xyz`);
            assert(badTicketIdRes1.status === 400, "GET /tickets/xyz returns HTTP 400");

            // Ticket ID zero
            const badTicketIdRes2 = await fetch(`${baseUrl}/tickets/0/cancel`, { method: "PATCH" });
            assert(badTicketIdRes2.status === 400, "PATCH /tickets/0/cancel returns HTTP 400");

            // ---------------------------------------------------------
            // Test 7: Valid Queue & Ticket Lifecycle Operations
            // ---------------------------------------------------------
            console.log("\n--- 7. Valid Queue & Ticket Workflow Operations ---");

            // Create valid queue
            const validQueueRes = await fetch(`${baseUrl}/queues`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${adminToken}`,
                },
                body: JSON.stringify({
                    name: `Validation Test Counter ${Date.now()}`,
                    prefix: "VAL",
                    description: "For automated test validation",
                }),
            });
            const validQueueData = await validQueueRes.json();
            const queueId = validQueueData.data.id;
            assert(validQueueRes.status === 201 && queueId, `Admin creates valid queue (ID: ${queueId})`);

            // Fetch queue details
            const getQueueRes = await fetch(`${baseUrl}/queues/${queueId}`);
            assert(getQueueRes.status === 200, `GET /queues/${queueId} returns HTTP 200`);

            // Issue ticket missing customer_name -> 400
            const badCustomerRes = await fetch(`${baseUrl}/tickets`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ queue_id: queueId, customer_name: "" }),
            });
            assert(badCustomerRes.status === 400, "Joining queue with empty customer_name returns HTTP 400");

            // Issue ticket with invalid queue_id -> 400
            const badJoinQueueIdRes = await fetch(`${baseUrl}/tickets`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ queue_id: "invalid-id", customer_name: "Alice" }),
            });
            assert(badJoinQueueIdRes.status === 400, "Joining queue with non-numeric queue_id returns HTTP 400");

            // Issue valid ticket
            const createTicketRes = await fetch(`${baseUrl}/tickets`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ queue_id: queueId, customer_name: "Alice Validated" }),
            });
            const createTicketData = await createTicketRes.json();
            const ticketId = createTicketData.data.id;
            assert(createTicketRes.status === 201 && createTicketData.data.status === "WAITING", `Issued ticket ID ${ticketId} (${createTicketData.data.ticket_number})`);

            // Check ticket position
            const getTicketRes = await fetch(`${baseUrl}/tickets/${ticketId}`);
            const getTicketData = await getTicketRes.json();
            assert(getTicketRes.status === 200 && getTicketData.data.people_ahead === 0, `GET /tickets/${ticketId} returns people_ahead = 0`);

            // Call next ticket: validation on invalid queue_id
            const badCallNextRes = await fetch(`${baseUrl}/tickets/next`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${staffToken}`,
                },
                body: JSON.stringify({ queue_id: "not_a_number" }),
            });
            assert(badCallNextRes.status === 400, "POST /tickets/next with non-numeric queue_id returns HTTP 400");

            // Call next ticket: valid
            const callNextRes = await fetch(`${baseUrl}/tickets/next`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${staffToken}`,
                },
                body: JSON.stringify({ queue_id: queueId }),
            });
            const callNextData = await callNextRes.json();
            assert(callNextRes.status === 200 && callNextData.data.status === "CALLED", `POST /tickets/next transitioned ticket ${ticketId} to CALLED`);

            // Start serving ticket
            const startServeRes = await fetch(`${baseUrl}/tickets/${ticketId}/start-serving`, {
                method: "PATCH",
                headers: { Authorization: `Bearer ${staffToken}` },
            });
            const startServeData = await startServeRes.json();
            assert(startServeRes.status === 200 && startServeData.data.status === "SERVING", `PATCH /tickets/${ticketId}/start-serving transitioned ticket to SERVING`);

            // Complete ticket
            const completeRes = await fetch(`${baseUrl}/tickets/${ticketId}/complete`, {
                method: "PATCH",
                headers: { Authorization: `Bearer ${staffToken}` },
            });
            const completeData = await completeRes.json();
            assert(completeRes.status === 200 && completeData.data.status === "COMPLETED", `PATCH /tickets/${ticketId}/complete transitioned ticket to COMPLETED`);

            // Invalid transition attempt on completed ticket -> 400
            const reCompleteRes = await fetch(`${baseUrl}/tickets/${ticketId}/complete`, {
                method: "PATCH",
                headers: { Authorization: `Bearer ${staffToken}` },
            });
            assert(reCompleteRes.status === 400, "Completing an already COMPLETED ticket returns HTTP 400");

            // ---------------------------------------------------------
            // Test 8: Authentication & Authorization Guards (401 & 403)
            // ---------------------------------------------------------
            console.log("\n--- 8. Authentication & Authorization Enforcement ---");

            // Missing token -> 401
            const noTokenRes = await fetch(`${baseUrl}/queues`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: "Unauth Queue", prefix: "UNAUTH" }),
            });
            assert(noTokenRes.status === 401, "Protected route without token returns HTTP 401");

            // Invalid token -> 401
            const badTokenRes = await fetch(`${baseUrl}/queues`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: "Bearer invalid.jwt.signature",
                },
                body: JSON.stringify({ name: "Unauth Queue", prefix: "UNAUTH" }),
            });
            assert(badTokenRes.status === 401, "Protected route with invalid token returns HTTP 401");

            // Forbidden: Staff attempting admin endpoint -> 403
            const staffForbiddenRes = await fetch(`${baseUrl}/queues`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${staffToken}`,
                },
                body: JSON.stringify({ name: "Forbidden Queue", prefix: "FORB" }),
            });
            assert(staffForbiddenRes.status === 403, "Staff attempting Admin route returns HTTP 403 Forbidden");

            // ---------------------------------------------------------
            // Test 9: Unknown Routes (HTTP 404)
            // ---------------------------------------------------------
            console.log("\n--- 9. Unknown Routes Handler (HTTP 404) ---");
            const unknownRouteRes = await fetch(`${baseUrl}/nonexistent/endpoint/path`);
            const unknownRouteData = await unknownRouteRes.json();
            assert(
                unknownRouteRes.status === 404 &&
                unknownRouteData.success === false &&
                unknownRouteData.error.includes("Route not found"),
                "Unknown route returns HTTP 404 with consistent JSON structure"
            );

            // ---------------------------------------------------------
            // Test 10: Safe Internal Error Responses (HTTP 500)
            // ---------------------------------------------------------
            console.log("\n--- 10. Centralized Error Handling Safe HTTP 500 ---");
            // Test how error middleware formats unexpected errors
            const { errorHandler } = require(path.resolve("src/middlewares/error.middleware"));
            let capturedStatus = null;
            let capturedJson = null;
            const mockReq = { method: "GET", originalUrl: "/test-error" };
            const mockRes = {
                status: (code) => {
                    capturedStatus = code;
                    return {
                        json: (data) => {
                            capturedJson = data;
                        },
                    };
                },
            };
            const mockNext = () => {};

            const fakeDatabaseError = new Error("FATAL: relation \"secret_table\" does not exist at postgres_backend.c:1234");
            errorHandler(fakeDatabaseError, mockReq, mockRes, mockNext);

            assert(
                capturedStatus === 500 &&
                capturedJson.success === false &&
                capturedJson.error === "Internal server error." &&
                !capturedJson.error.includes("relation") &&
                !capturedJson.stack,
                "Unexpected internal error returns safe HTTP 500 without leaking SQL details or stack traces"
            );

            console.log("\n========================================================");
            console.log(`   TEST RESULTS: ${passedTests} Passed, ${failedTests} Failed`);
            if (failedTests === 0) {
                console.log("   🎉 ALL VALIDATION & ERROR TESTS PASSED! 🎉");
            }
            console.log("========================================================\n");

            if (failedTests > 0) {
                throw new Error(`${failedTests} test(s) failed.`);
            }
        } catch (err) {
            console.error("Test Suite Execution Failed:", err);
            process.exitCode = 1;
        } finally {
            server.close();
            await db.pool.end();
        }
    });
}

runValidationAndErrorTestSuite();
