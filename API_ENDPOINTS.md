# Campus Service Copilot API Endpoints

Base URL: `http://localhost:3000`

Protected endpoints accept either `Authorization: Bearer <access_token>`, cookies from auth responses, or demo headers:

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

Seeded demo login password after the latest seed update is `Password123!`.

## Auth

### `POST /auth/register`

Request:

```json
{
  "name": "Demo Student",
  "email": "demo.student@soa.test",
  "password": "Password123!",
  "role": "student",
  "department_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "preferred_language": "en"
}
```

Expected response:

```json
{
  "user": {
    "id": "uuid",
    "name": "Demo Student",
    "email": "demo.student@soa.test",
    "role": "student",
    "department_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "preferred_language": "en",
    "notification_prefs": {}
  },
  "access_token": "jwt",
  "refresh_token": "opaque-token"
}
```

Also sets `access_token` and `refresh_token` HTTP-only cookies.

### `POST /auth/login`

Request:

```json
{
  "email": "student@soa.demo",
  "password": "Password123!"
}
```

Expected response: same shape as `/auth/register`.

### `POST /auth/refresh`

Request with body token:

```json
{
  "refresh_token": "opaque-token"
}
```

Or send only the `refresh_token` cookie.

Expected response:

```json
{
  "user": {
    "id": "uuid",
    "name": "Test Student",
    "email": "student@soa.demo",
    "role": "student",
    "department_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "preferred_language": "en",
    "notification_prefs": {}
  },
  "access_token": "new-jwt",
  "refresh_token": "new-opaque-token"
}
```

The old refresh token is revoked and replaced.

### `POST /auth/logout`

Request:

```json
{
  "refresh_token": "opaque-token",
  "all_devices": false
}
```

Expected response:

```json
{
  "logged_out": true
}
```

Clears auth cookies. Set `all_devices: true` to revoke all active refresh tokens for the authenticated user.

### `GET /users/me`

Request type: protected `GET`.

Expected response:

```json
{
  "id": "uuid",
  "name": "Test Student",
  "email": "student@soa.demo",
  "role": "student",
  "department_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "preferred_language": "en",
  "notification_prefs": {}
}
```

### `PATCH /users/me`

Request:

```json
{
  "preferred_language": "hi",
  "notification_prefs": {
    "email": true,
    "websocket": true
  }
}
```

Expected response: updated user object.

## Agent

### `POST /agent/session`

Request:

```json
{
  "language": "en"
}
```

Expected response:

```json
{
  "session_id": "uuid",
  "started_at": "2026-08-17T12:00:00.000Z"
}
```

### `POST /agent/session/:id/message`

Request:

```json
{
  "content": "I need a bonafide certificate for a scholarship application."
}
```

Expected immediate response:

```json
{
  "accepted": true
}
```

Agent progress and final response are delivered through WebSocket events.

### `GET /agent/session/:id`

Request type: protected `GET`.

Expected response:

```json
{
  "session_id": "uuid",
  "messages": [
    {
      "id": "uuid",
      "sender": "user",
      "content": "I need a bonafide certificate for a scholarship application.",
      "confidence_score": null,
      "cited_chunk_ids": [],
      "created_at": "2026-08-17T12:00:00.000Z"
    }
  ]
}
```

### `GET /agent/session/:id/plan`

Request type: protected `GET`.

Expected response:

```json
{
  "steps": [
    {
      "step_name": "Create certificate service request",
      "tool_name": "create_request",
      "risk_level": "low",
      "status": "done",
      "rationale": "A tracked request is required before certificate processing."
    },
    {
      "step_name": "Issue bonafide certificate",
      "tool_name": "issue_certificate",
      "risk_level": "high",
      "status": "awaiting_approval",
      "rationale": "Issuing a certificate is administratively irreversible and requires staff approval."
    }
  ]
}
```

If no plan exists:

```json
{
  "steps": []
}
```

## Approvals

All approval routes require `staff`, `admin`, `warden`, or `lab_incharge`.

### `GET /approvals`

Request type: protected staff `GET`.

Expected response:

```json
{
  "items": [
    {
      "id": "uuid",
      "workflowStepId": "uuid",
      "reviewerId": null,
      "decision": null,
      "reason": null,
      "question": null,
      "contextJson": {
        "original_request": "I need a bonafide certificate for a scholarship application.",
        "retrieved_evidence": [],
        "reasoning_trace": "Issuing a certificate is administratively irreversible and requires staff approval.",
        "proposed_tool": {
          "tool_name": "issue_certificate",
          "args": {
            "request_id": "uuid",
            "certificate_type": "bonafide",
            "purpose": "scholarship"
          }
        },
        "risk_level": "high",
        "guardrail_flags": []
      },
      "decidedAt": null,
      "createdAt": "2026-08-17T12:00:00.000Z",
      "workflowStep": {}
    }
  ]
}
```

### `POST /approvals/:id/approve`

Request type: protected staff `POST`.

Request:

```json
{}
```

Expected response:

```json
{
  "id": "uuid",
  "decision": "approved",
  "executed": true,
  "executed_at": "2026-08-17T12:00:00.000Z",
  "result": {
    "id": "uuid",
    "request_id": "uuid",
    "user_id": "uuid",
    "certificate_type": "bonafide",
    "purpose": "scholarship",
    "serial_number": "SOA-CERT-2026-ABCDE12345",
    "verification_code": "ABCDEF123456ABCDEF123456",
    "signature": "hex-hmac",
    "issued_at": "2026-08-17T12:00:00.000Z"
  }
}
```

### `POST /approvals/:id/reject`

Request:

```json
{
  "reason": "Missing scholarship purpose document."
}
```

Expected response:

```json
{
  "id": "uuid",
  "decision": "rejected",
  "reason": "Missing scholarship purpose document."
}
```

### `POST /approvals/:id/request-info`

Request:

```json
{
  "question": "Please upload or mention your scholarship application reference."
}
```

Expected response:

```json
{
  "id": "uuid",
  "decision": "info_requested"
}
```

## Knowledge Base

### `GET /kb/documents`

Request type: protected `GET`.

Expected response:

```json
{
  "items": [
    {
      "id": "uuid",
      "title": "Bonafide Certificate Policy",
      "document_id": "ACAD-CERT-001",
      "version": "2",
      "effective_date": "2026-01-01T00:00:00.000Z",
      "status": "active",
      "uploaded_by": "uuid",
      "file_url": "C:\\Users\\mahes\\Downloads\\files\\01_Bonafide_Certificate_Policy_v2.md",
      "chunk_count": 4
    }
  ]
}
```

### `POST /kb/documents`

Requires `staff` or `admin`.

Request:

```json
{
  "title": "Bonafide Certificate Policy",
  "document_id": "ACAD-CERT-001",
  "version": "2",
  "content": "# Bonafide Certificate Policy\n\n## Clause 1 Eligibility\nStudents may request bonafide certificates for scholarship applications.",
  "effective_date": "2026-01-01"
}
```

Expected response:

```json
{
  "id": "uuid",
  "title": "Bonafide Certificate Policy",
  "version": "2",
  "status": "active",
  "chunks": 2
}
```

### `POST /kb/search`

Request:

```json
{
  "query": "bonafide certificate scholarship",
  "top_k": 6
}
```

Expected response:

```json
{
  "chunks": [
    {
      "chunk_id": "uuid",
      "content": "Students may request bonafide certificates...",
      "source_document": "ACAD-CERT-001",
      "document_version": "2",
      "page": 1,
      "clause": "1 Eligibility",
      "similarity": 0.82
    }
  ]
}
```

## Requests

### `POST /requests`

Request:

```json
{
  "request_type": "maintenance",
  "description": "AC is not cooling in Block C room 214",
  "department_id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
}
```

Expected response:

```json
{
  "id": "uuid",
  "userId": "uuid",
  "sessionId": null,
  "requestTypeId": "uuid",
  "departmentId": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  "status": "pending",
  "description": "AC is not cooling in Block C room 214",
  "createdAt": "2026-08-17T12:00:00.000Z",
  "slaDueAt": "2026-08-19T12:00:00.000Z",
  "resolvedAt": null
}
```

### `GET /requests?page=1&limit=20&status=pending`

Request type: protected `GET`.

Expected response:

```json
{
  "items": [
    {
      "id": "uuid",
      "request_type": "maintenance",
      "status": "pending",
      "description": "AC is not cooling in Block C room 214",
      "created_at": "2026-08-17T12:00:00.000Z",
      "sla_due_at": "2026-08-19T12:00:00.000Z",
      "department_id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "session_id": null
    }
  ],
  "total": 1,
  "page": 1
}
```

### `GET /requests/:id`

Request type: protected `GET`.

Expected response:

```json
{
  "id": "uuid",
  "request_type": "certificate",
  "status": "pending",
  "description": "I need a bonafide certificate for a scholarship application.",
  "created_at": "2026-08-17T12:00:00.000Z",
  "sla_due_at": "2026-08-20T12:00:00.000Z",
  "department_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "session_id": "uuid",
  "timeline": [
    {
      "step_name": "Issue bonafide certificate",
      "risk_level": "high",
      "status": "awaiting_approval",
      "executed_at": null
    }
  ]
}
```

### `PATCH /requests/:id/status`

Requires `staff`, `admin`, `warden`, or `lab_incharge`.

Request:

```json
{
  "status": "resolved"
}
```

Expected response: updated `ServiceRequest` record.

## Lab Bookings

### `GET /lab-resources`

Expected response:

```json
{
  "items": [
    {
      "id": "55555555-5555-4555-8555-555555555555",
      "name": "Central Computing Lab",
      "departmentId": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      "capacity": 40,
      "restrictions": "Course code or faculty reference required."
    }
  ]
}
```

### `GET /lab-bookings?resource_id=55555555-5555-4555-8555-555555555555&date=2026-08-18`

Expected response:

```json
{
  "items": [
    {
      "id": "uuid",
      "resourceId": "55555555-5555-4555-8555-555555555555",
      "userId": "uuid",
      "startTime": "2026-08-18T10:00:00.000Z",
      "endTime": "2026-08-18T12:00:00.000Z",
      "status": "confirmed",
      "courseCode": "CSE101",
      "facultyRef": "Prof. Demo"
    }
  ]
}
```

### `POST /lab-bookings`

Request:

```json
{
  "resource_id": "55555555-5555-4555-8555-555555555555",
  "start_time": "2026-08-18T10:00:00.000Z",
  "end_time": "2026-08-18T12:00:00.000Z",
  "course_code": "CSE101",
  "faculty_ref": "Prof. Demo"
}
```

Expected response:

```json
{
  "id": "uuid",
  "resourceId": "55555555-5555-4555-8555-555555555555",
  "userId": "uuid",
  "startTime": "2026-08-18T10:00:00.000Z",
  "endTime": "2026-08-18T12:00:00.000Z",
  "status": "confirmed",
  "courseCode": "CSE101",
  "facultyRef": "Prof. Demo"
}
```

### `DELETE /lab-bookings/:id`

Expected response: updated booking with `status: "cancelled"`.

## Grievances

### `POST /grievances`

Request:

```json
{
  "category": "academic",
  "description": "My internal marks were not updated after re-evaluation.",
  "anonymous": false,
  "evidence_urls": []
}
```

Expected response:

```json
{
  "id": "uuid",
  "userId": "uuid",
  "ownerUserId": "uuid",
  "category": "academic",
  "description": "My internal marks were not updated after re-evaluation.",
  "anonymous": false,
  "status": "open",
  "escalationLevel": 1,
  "slaDueAt": "2026-08-24T12:00:00.000Z",
  "createdAt": "2026-08-17T12:00:00.000Z"
}
```

### `GET /grievances?page=1&status=open&escalation_level=1`

Expected response:

```json
{
  "items": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "category": "academic",
      "description": "My internal marks were not updated after re-evaluation.",
      "anonymous": false,
      "status": "open",
      "escalation_level": 1,
      "sla_due_at": "2026-08-24T12:00:00.000Z",
      "created_at": "2026-08-17T12:00:00.000Z"
    }
  ],
  "total": 1,
  "page": 1
}
```

Anonymous grievances hide `user_id` from non-owner reviewers.

### `GET /grievances/:id`

Expected response: grievance detail plus:

```json
{
  "escalation_history": []
}
```

### `POST /grievances/:id/escalate`

Requires `staff`, `admin`, or `warden`.

Expected response:

```json
{
  "id": "uuid",
  "escalation_level": 2,
  "escalated_at": "2026-08-17T12:00:00.000Z"
}
```

## Notifications

### `GET /notifications?page=1&unread_only=true`

Expected response:

```json
{
  "items": [
    {
      "id": "uuid",
      "userId": "uuid",
      "title": "Agent request completed",
      "body": "The approved action has been completed.",
      "readFlag": false,
      "deepLink": "/chat?session=uuid",
      "createdAt": "2026-08-17T12:00:00.000Z"
    }
  ],
  "total": 1,
  "page": 1
}
```

### `POST /notifications/mark-read`

Request:

```json
{
  "ids": ["uuid"]
}
```

Omit `ids` to mark all notifications as read.

Expected response:

```json
{
  "updated": 1
}
```

## Audit

All audit routes require `admin`.

### `GET /audit/search?page=1&limit=20&entity_type=agent_sessions&action=N8.generated_plan`

Expected response:

```json
{
  "items": [
    {
      "id": "uuid",
      "entityType": "agent_sessions",
      "entityId": "uuid",
      "action": "N8.generated_plan",
      "actor": "agent",
      "payloadJson": {},
      "prevHash": "GENESIS",
      "entryHash": "hex",
      "createdAt": "2026-08-17T12:00:00.000Z"
    }
  ],
  "total": 1,
  "page": 1
}
```

### `GET /audit/verify/:entityType/:entityId`

Expected response:

```json
{
  "intact": true
}
```

### `GET /audit/:entityType/:entityId`

Expected response: ordered audit log array for that entity.

## Admin Analytics

All admin analytics routes require `admin`.

### `GET /admin/analytics/requests-summary`

Expected response:

```json
{
  "by_type": [
    {
      "request_type": "certificate",
      "count": 3
    }
  ],
  "by_status": [
    {
      "status": "pending",
      "count": 2
    }
  ]
}
```

### `GET /admin/analytics/resolution-time`

Expected response:

```json
{
  "points": [
    {
      "date": "2026-08-17",
      "avg_resolution_hours": 1.25
    }
  ]
}
```

### `GET /admin/analytics/bottlenecks`

Expected response:

```json
{
  "items": [
    {
      "department": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "step_name": "Issue bonafide certificate",
      "overdue_count": 1
    }
  ]
}
```

### `GET /admin/analytics/policy-conflicts`

Expected response:

```json
{
  "items": [
    {
      "id": "uuid",
      "doc_a": {
        "document_id": "uuid",
        "clause": "4.1",
        "version": "3"
      },
      "doc_b": {
        "document_id": "uuid",
        "clause": "4.1",
        "version": "2021"
      },
      "raised_at": "2026-08-17T12:00:00.000Z",
      "status": "open"
    }
  ]
}
```

## WebSocket

Connect:

```text
ws://localhost:3000/ws?user_id=<user_id>&session_id=<session_id>
```

Socket.IO namespace: `/ws`

Server event name: `event`

Envelope:

```json
{
  "type": "message.complete",
  "payload": {
    "session_id": "uuid",
    "message": {}
  }
}
```

Supported event types:

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
