# Campus Service Copilot Agent Backend

Backend implementation for the SOAIDEATHON-S1 Campus Service Copilot. The project is a NestJS, TypeScript, Prisma, PostgreSQL, and pgvector API that implements an agentic AI layer with RAG, tool execution, human-in-the-loop approvals, realtime WebSocket updates, and hash-chained audit logs.

## Current Status

- Backend API is implemented.
- Agent state-machine flow is implemented across the agent, retrieval, planner, risk, tool, approval, notification, realtime, and audit modules.
- Prisma schema includes users, sessions, messages, requests, workflow steps, approvals, audit logs, knowledge documents/chunks, notifications, lab bookings, grievances, refresh tokens, and certificates.
- Local setup requires a PostgreSQL database with the `vector` extension enabled.
- Frontend is not included in this repository.

## Tech Stack

- Node.js
- NestJS
- TypeScript
- Prisma ORM
- PostgreSQL
- pgvector
- Socket.IO WebSocket gateway
- Jest
- OpenAI/Groq-compatible LLM gateway with local embedding fallback

## Prerequisites

- Node.js 22 or compatible recent LTS version
- npm
- PostgreSQL database with pgvector support
- A configured `.env` file
- Optional: OpenAI and Groq API keys for live LLM calls

For Neon Postgres, enable pgvector in the Neon SQL editor before pushing the schema:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

## Local Setup

Install dependencies:

```powershell
npm install
```

Create a local environment file:

```powershell
Copy-Item .env.example .env
```

Update `.env` with your own values:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require"
JWT_SECRET="replace-with-a-strong-secret"
CERTIFICATE_SIGNING_SECRET="replace-with-a-strong-secret"
PORT=3000
RETRIEVAL_CONFIDENCE_THRESHOLD=0.62
LLM_TIMEOUT_MS=12000
LLM_CIRCUIT_BREAKER_COOLDOWN_MS=60000

LLM_TIER_A_PROVIDER=openai
LLM_TIER_A_MODEL=gpt-4o
LLM_TIER_A_FALLBACK_PROVIDER=groq
LLM_TIER_A_FALLBACK_MODEL=openai/gpt-oss-120b

LLM_TIER_B_PROVIDER=groq
LLM_TIER_B_MODEL=openai/gpt-oss-20b
LLM_TIER_B_FALLBACK_PROVIDER=openai
LLM_TIER_B_FALLBACK_MODEL=gpt-4o-mini

LLM_TIER_C_PROVIDER=groq
LLM_TIER_C_MODEL=openai/gpt-oss-safeguard-20b
LLM_TIER_C_FALLBACK_PROVIDER=openai
LLM_TIER_C_FALLBACK_MODEL=gpt-4o-mini

LLM_TIER_D_PROVIDER=openai
LLM_TIER_D_MODEL=text-embedding-3-small

OPENAI_API_KEY=""
GROQ_API_KEY=""
```

Do not commit `.env` or real secrets.

## Database Setup

Stop any running `npm run start:dev` process before regenerating Prisma on Windows. The Nest watcher can hold Prisma's query-engine DLL open.

Generate the Prisma client:

```powershell
npm run prisma:generate
```

Push the schema:

```powershell
npm run db:push
```

Seed demo users, request types, lab resources, and institutional knowledge-base documents:

```powershell
npm run db:seed
```

The seed script reads Markdown policy files from:

```text
C:\Users\mahes\Downloads\files
```

To use a different folder:

```powershell
$env:SEED_KB_DIR="C:\path\to\institutional-docs"
npm run db:seed
```

Expected seeded demo password:

```text
Password123!
```

Demo users:

```text
student@soa.demo
staff@soa.demo
admin@soa.demo
```

## Run The API

Development mode:

```powershell
npm run start:dev
```

Production build:

```powershell
npm run build
npm run start
```

Default base URL:

```text
http://localhost:3000
```

## Useful Scripts

```text
npm run build             Compile TypeScript
npm run start             Run compiled dist/main.js
npm run start:dev         Run NestJS in watch mode
npm test                  Run Jest tests
npm run prisma:generate   Generate Prisma client
npm run db:push           Push Prisma schema to database
npm run db:seed           Seed demo data and KB documents
```

## Authentication

The API supports JWT auth through:

```text
POST /auth/register
POST /auth/login
POST /auth/refresh
POST /auth/logout
GET  /users/me
PATCH /users/me
```

Use the returned token:

```http
Authorization: Bearer <access_token>
```

For demos and Postman testing, protected routes also accept demo headers:

```http
x-user-id: 22222222-2222-4222-8222-222222222222
x-user-role: student
x-department-id: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
x-preferred-language: en
Content-Type: application/json
```

Staff demo headers:

```http
x-user-id: 33333333-3333-4333-8333-333333333333
x-user-role: staff
x-department-id: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
x-preferred-language: en
Content-Type: application/json
```

Admin demo headers:

```http
x-user-id: 11111111-1111-4111-8111-111111111111
x-user-role: admin
x-department-id: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
x-preferred-language: en
Content-Type: application/json
```

## Core API Areas

Agent:

```text
POST /agent/session
POST /agent/session/:id/message
GET  /agent/session/:id
GET  /agent/session/:id/plan
```

Approvals:

```text
GET  /approvals
POST /approvals/:id/approve
POST /approvals/:id/reject
POST /approvals/:id/request-info
```

Knowledge base:

```text
GET  /kb/documents
POST /kb/documents
POST /kb/search
```

Requests:

```text
POST  /requests
GET   /requests
GET   /requests/:id
PATCH /requests/:id/status
```

Other areas:

```text
GET    /lab-resources
GET    /lab-bookings
POST   /lab-bookings
DELETE /lab-bookings/:id

POST /grievances
GET  /grievances
GET  /grievances/:id
POST /grievances/:id/escalate

GET  /notifications
POST /notifications/mark-read

GET /audit/search
GET /audit/verify/:entityType/:entityId
GET /audit/:entityType/:entityId

GET /admin/analytics/requests-summary
GET /admin/analytics/resolution-time
GET /admin/analytics/bottlenecks
GET /admin/analytics/policy-conflicts
```

See `API_ENDPOINTS.md` for full request and response examples.

## WebSocket Events

Socket.IO namespace:

```text
/ws
```

Connect with:

```text
ws://localhost:3000/ws?user_id=<user_id>&session_id=<session_id>
```

The server emits an `event` envelope:

```json
{
  "type": "message.complete",
  "payload": {
    "session_id": "uuid",
    "message": {}
  }
}
```

Expected event types include:

```text
message.token
message.complete
plan.update
approval.created
approval.status
approval.actioned
status.changed
booking.created
booking.cancelled
grievance.escalated
notification.new
```

## Bonafide Certificate Demo Flow

Start the API and create an agent session as the seeded student:

```http
POST /agent/session
Content-Type: application/json
x-user-id: 22222222-2222-4222-8222-222222222222
x-user-role: student
x-department-id: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
x-preferred-language: en

{ "language": "en" }
```

Send the demo request:

```http
POST /agent/session/:id/message
Content-Type: application/json
x-user-id: 22222222-2222-4222-8222-222222222222
x-user-role: student
x-department-id: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
x-preferred-language: en

{
  "content": "I need a bonafide certificate for a scholarship application."
}
```

Expected immediate HTTP response:

```json
{
  "accepted": true
}
```

Expected backend behavior:

1. Detect English.
2. Classify `certificate_request`.
3. Extract certificate type and purpose.
4. Retrieve bonafide certificate policy chunks.
5. Generate a workflow plan.
6. Mark certificate issuance as high risk.
7. Create a pending approval.
8. Emit `approval.created` and `plan.update`.
9. Pause until staff approval.
10. Staff approves through `POST /approvals/:id/approve`.
11. The certificate tool executes.
12. The user receives a completion message.
13. Audit logs contain the hash-chained record of the flow.

## Tests

Run unit tests:

```powershell
npm test
```

Run a build:

```powershell
npm run build
```

Some integration tests require a configured test database and may be gated by environment variables. Check the relevant files under `test/`.

## Project Structure

```text
src/
  agent/              Agent session, NLU, planner, orchestration, guardrails, risk
  approvals/          Human-in-the-loop approval queue
  audit/              Hash-chain audit services and controllers
  auth/               Register, login, refresh, logout, user profile
  certificates/       Certificate issuance and student verification
  common/             Guards, decorators, filters, shared types
  grievances/         Grievance creation and escalation
  knowledge-base/     Document ingestion and retrieval
  lab-bookings/       Lab resources and booking workflow
  llm/                Central LLM gateway and provider types
  notifications/      Notification storage and realtime dispatch
  prisma/             Prisma service/module
  realtime/           Socket.IO gateway and event dispatcher
  requests/           Service request lifecycle
  tools/              Fixed tool registry and execution service

prisma/
  schema.prisma       Database schema
  seed.js             Demo and knowledge-base seed script

test/                 Jest unit and integration tests
docs/                 Runbook and progress notes
```

## Security And Architecture Notes

- Agent tools are fixed and registered in code.
- The planner proposes actions but does not execute tools.
- Medium and high-risk actions require approval before execution.
- Tool arguments are schema-validated.
- Tool execution uses idempotency keys and bounded retries.
- Retrieved documents are treated as untrusted context.
- Audit records are append-only and hash-chained.
- Refresh tokens are stored hashed.
- Never commit `.env`, API keys, database credentials, or generated secrets.

## Troubleshooting

`DATABASE_URL` is missing:

- Ensure `.env` exists in the project root.
- Ensure `DATABASE_URL` is present and quoted if it contains special characters.

`type "vector" does not exist` during `npm run db:push`:

- Enable pgvector in the database:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

`public.users does not exist` during seed:

- Run the schema push before seeding:

```powershell
npm run db:push
npm run db:seed
```

Prisma `EPERM` on Windows:

- Stop `npm run start:dev`.
- Run:

```powershell
npm run prisma:generate
```

LLM provider errors:

- Confirm `OPENAI_API_KEY` and/or `GROQ_API_KEY`.
- The gateway has timeout, fallback, and circuit-breaker handling, but invalid keys still need correction.

## Additional Documentation

- `API_ENDPOINTS.md`
- `docs/AGENT_LAYER_RUNBOOK.md`
- `docs/PROGRESS.MD`
- `IMPLEMENTATION_SUMMARY.md`
- `FINAL_STATUS_REPORT.md`
- `FRONTEND_PAGES_FEATURES.md`
