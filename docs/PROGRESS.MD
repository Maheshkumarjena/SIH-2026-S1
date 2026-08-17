# Progress

## Implemented

- NestJS/TypeScript backend scaffold.
- Prisma schema for agent sessions, messages, workflow steps, approvals, audit logs, KB docs/chunks, requests, notifications, lab bookings, grievances, and policy conflict flags.
- Agent routes:
  - `POST /agent/session`
  - `POST /agent/session/:id/message`
  - `GET /agent/session/:id`
  - `GET /agent/session/:id/plan`
- Explicit N1-N17-style graph runner.
- Central `LLMGateway` with provider tiers, fallback, timeout, circuit breaker, and audit logging.
- JWT auth routes:
  - `POST /auth/register`
  - `POST /auth/login`
  - `GET /users/me`
  - `PATCH /users/me`
- Auth guard accepts JWT bearer/cookie tokens and keeps demo header fallback.
- Knowledge-base routes:
  - `GET /kb/documents`
  - `POST /kb/documents`
  - `POST /kb/search`
- KB Markdown chunking and seed ingestion for six institutional policy documents.
- Local 64-dimensional embedding generation.
- Seed script writes pgvector embeddings into `document_chunks.embedding`.
- Retrieval uses pgvector similarity when embeddings exist, with lexical fallback.
- HITL approval routes:
  - `GET /approvals`
  - `POST /approvals/:id/approve`
  - `POST /approvals/:id/reject`
  - `POST /approvals/:id/request-info`
- Approval transaction uses `SELECT ... FOR UPDATE`.
- Medium/High-risk tools require approved approval context.
- Fixed tool registry with JSON schema validation and bounded retries.
- Requests, notifications, audit, lab booking, grievance, and admin analytics endpoints.
- WebSocket gateway emits expected frontend event names.
- Hash-chained audit append and verification.
- Guardrails for prompt injection, citation validation, policy conflict detection, and tool-arg PII minimization.

## Verified

- `npm run build`
- `npm test`
- `npx prisma validate`

## Remaining

- Run `npm run prisma:generate`, `npm run db:push`, and `npm run db:seed` after stopping any running Nest watcher.
- Add persistent refresh tokens and logout.
- Add proper role decorator/guard enforcement per endpoint, not only broad auth.
- Add production migrations instead of relying only on `prisma db push`.
- Add full integration tests against a test database.
- Add real certificate document generation/signing integration.
- Add real ERP/student status verification.
- Add stronger LLM/NLI citation entailment checks.
- Add email/push notification providers.
- Add frontend integration.
