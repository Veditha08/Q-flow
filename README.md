# Q-flow - Backend Queue Management System

A production-style backend queue and token management engine built with **Node.js**, **Express**, and **PostgreSQL**.

---

## 🚀 Features by Milestone

### 🔐 Authentication & Role-Based Access Control (Milestone 3)
- **JWT Authentication**: Stateless bearer token verification with strict `JWT_SECRET` requirement.
- **Role Separation**:
  - `ADMIN`: Full administrative control (queue creation, user management).
  - `STAFF`: Counter operators (calling next tickets, serving, completing, no-shows).
  - `Public / Customer`: Unauthenticated access for queue discovery, ticket issuance, and status tracking.
- **Endpoints**:
  - `POST /api/v1/auth/register`: Public staff registration (always assigns `STAFF` role).
  - `POST /api/v1/auth/login`: Authenticate and receive a JWT token.
  - `GET /api/v1/auth/me`: Get current logged-in user profile.
  - `POST /api/v1/auth/users`: Admin-only endpoint to create Staff or Admin accounts.

### 🏢 Queue Management (Milestone 1)
- `GET /api/v1/queues`: List all queues with live waiting ticket counts (Public).
- `GET /api/v1/queues/:id`: Fetch single queue status and details (Public).
- `POST /api/v1/queues`: Create a new queue service with custom ticket prefix (*Admin only*).

### 🎟️ Ticket Lifecycle & Workflow (Milestone 2)
- `POST /api/v1/tickets`: Issue a queue ticket with atomic sequence numbering (e.g., `BILL-1`) and return position in line (`WAITING`) (Public).
- `GET /api/v1/tickets/:id`: Fetch ticket status and count of people ahead in line (Public).
- `PATCH /api/v1/tickets/:id/cancel`: Cancel an active waiting ticket (`WAITING` → `CANCELLED`) (Public).
  > **Note**: Public ticket cancellation is currently a temporary limitation because tickets are not yet associated with authenticated customer accounts. Customer ownership will be addressed in a future milestone.
- `POST /api/v1/tickets/next`: Call the next waiting ticket for a queue (`WAITING` → `CALLED`) (*Staff/Admin*).
- `PATCH /api/v1/tickets/:id/start-serving`: Mark ticket as actively being served (`CALLED` → `SERVING`) (*Staff/Admin*).
- `PATCH /api/v1/tickets/:id/complete`: Finish serving ticket (`SERVING` → `COMPLETED`) (*Staff/Admin*).
- `PATCH /api/v1/tickets/:id/no-show`: Mark called ticket as no-show when customer is absent (`CALLED` → `NO_SHOW`) (*Staff/Admin*).

---

## 🛡️ Role & Permission Matrix

| Endpoint | Method | Access Level | Allowed Roles | Description |
|---|---|---|---|---|
| `/api/v1/auth/register` | `POST` | Public | Anyone | Register as `STAFF` |
| `/api/v1/auth/login` | `POST` | Public | Anyone | Login with email & password |
| `/api/v1/auth/me` | `GET` | Authenticated | `ADMIN`, `STAFF` | View own user profile |
| `/api/v1/auth/users` | `POST` | Restricted | `ADMIN` only | Create Staff or Admin users |
| `/api/v1/queues` | `GET` | Public | Anyone | List queues & waiting counts |
| `/api/v1/queues/:id` | `GET` | Public | Anyone | Queue status |
| `/api/v1/queues` | `POST` | Restricted | `ADMIN` only | Create new service queue |
| `/api/v1/tickets` | `POST` | Public | Anyone | Join queue & take ticket |
| `/api/v1/tickets/:id` | `GET` | Public | Anyone | Check ticket position |
| `/api/v1/tickets/:id/cancel` | `PATCH` | Public | Anyone | Cancel waiting ticket |
| `/api/v1/tickets/next` | `POST` | Restricted | `STAFF`, `ADMIN` | Call next waiting ticket |
| `/api/v1/tickets/:id/start-serving` | `PATCH` | Restricted | `STAFF`, `ADMIN` | Begin serving customer |
| `/api/v1/tickets/:id/complete` | `PATCH` | Restricted | `STAFF`, `ADMIN` | Complete ticket service |
| `/api/v1/tickets/:id/no-show` | `PATCH` | Restricted | `STAFF`, `ADMIN` | Mark customer as no-show |

---

## 🔄 Ticket State Machine

```
      [ Issue Ticket ]
             │
             ▼
        ┌─────────┐     cancel      ┌───────────┐
        │ WAITING ├────────────────►│ CANCELLED │
        └────┬────┘                 └───────────┘
             │ call next
             ▼
        ┌─────────┐     no-show     ┌───────────┐
        │ CALLED  ├────────────────►│  NO_SHOW  │
        └────┬────┘                 └───────────┘
             │ start serving
             ▼
        ┌─────────┐
        │ SERVING │
        └────┬────┘
             │ complete
             ▼
        ┌───────────┐
        │ COMPLETED │
        └───────────┘
```

---

## 📁 Project Structure

```
Q-flow/
├── .env.example               # Environment variables template
├── .env                       # Local environment variables
├── .gitignore                 # Files to ignore in git
├── package.json               # Dependencies and run scripts
├── requests.http              # VS Code REST Client test requests
│
├── database/
│   ├── db.js                  # PostgreSQL pool connector
│   ├── schema.sql             # SQL DDL table definitions (queues, tickets, users)
│   └── init-db.js             # Database migration & admin seeding script
│
└── src/
    ├── app.js                 # Express application & route configuration
    ├── server.js              # Server entrypoint
    ├── middlewares/
    │   └── auth.middleware.js # JWT authenticate & authorize middlewares
    ├── routes/
    │   ├── auth.routes.js     # Auth & user routes
    │   ├── queue.routes.js    # Queue endpoint routes
    │   └── ticket.routes.js   # Ticket endpoint routes
    └── controllers/
        ├── auth.controller.js  # Auth controller business logic
        ├── queue.controller.js  # Queue controller business logic
        └── ticket.controller.js # Ticket controller business logic
```

---

## 🛠️ Setup & Running

### 1. Configure Environment Variables
Copy `.env.example` to `.env` and configure your database and JWT secret:
```env
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=qflow_db
DB_USER=postgres
DB_PASSWORD=postgres
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=1d
```

### 2. Initialize Database & Seed Default Admin
```bash
npm run db:init
```
*Seeds default admin:*
- **Email**: `admin@qflow.com`
- **Password**: `admin123`

### 3. Start the Server
- **Development Mode (with auto-reload)**:
  ```bash
  npm run dev
  ```
- **Production Mode**:
  ```bash
  npm start
  ```

---

## 🧪 Testing the APIs
Open [`requests.http`](requests.http) using the **REST Client** extension in VS Code to run the complete test suite including authentication, role enforcement, and the ticket lifecycle.
