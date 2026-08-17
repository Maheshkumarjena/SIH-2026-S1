# Agent Layer Runbook

## 1. Database Setup

Stop `npm run start:dev` before regenerating Prisma on Windows. A running Nest watcher can hold Prisma's query-engine DLL open and cause `EPERM` during `prisma generate`.

```powershell
npm run prisma:generate
npm run db:push
npm run db:seed
```

The seed script reads institutional Markdown documents from:

```text
C:\Users\mahes\Downloads\files
```

Override with:

```powershell
$env:SEED_KB_DIR="C:\path\to\docs"
npm run db:seed
```

## 2. Demo Headers

Protected routes accept either a real JWT access token or demo headers. Prefer JWT for app integration; headers remain useful for Postman/demo calls.

JWT flow:

```http
POST /auth/register
POST /auth/login
GET /users/me
PATCH /users/me
```

Use the returned `access_token` as:

```http
Authorization: Bearer <access_token>
```

Demo header fallback:

Student:

```http
x-user-id: 22222222-2222-4222-8222-222222222222
x-user-role: student
x-department-id: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
x-preferred-language: en
```

Staff:

```http
x-user-id: 33333333-3333-4333-8333-333333333333
x-user-role: staff
x-department-id: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
x-preferred-language: en
```

## 3. Bonafide Demo Flow

1. Start the API.
2. Create an agent session with student headers:

```http
POST /agent/session
{ "language": "en" }
```

3. Send:

```http
POST /agent/session/:id/message
{ "content": "I need a bonafide certificate for a scholarship application." }
```

4. Watch WebSocket events on:

```text
/ws?user_id=22222222-2222-4222-8222-222222222222&session_id=<session_id>
```

5. List approvals with staff headers:

```http
GET /approvals
```

6. Approve the generated high-risk certificate step:

```http
POST /approvals/:id/approve
```

Expected result: `issue_certificate` executes only after approval, the plan updates, the user receives a completion message, and audit entries are appended.

## 4. Useful Endpoints

- `POST /kb/search`
- `GET /kb/documents`
- `GET /agent/session/:id`
- `GET /agent/session/:id/plan`
- `GET /requests`
- `GET /approvals`
- `GET /audit/:entityType/:entityId`
- `GET /audit/verify/:entityType/:entityId`
- `GET /admin/analytics/policy-conflicts`
