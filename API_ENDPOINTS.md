# Campus Service Copilot — Complete Backend API Reference & Postman Guide

**Base URL:** `http://localhost:3000`  
**WebSocket URL:** `ws://localhost:3000/ws` (Socket.IO namespace: `/ws`)

---

## 🔑 Authentication & Headers

Protected endpoints accept either a **JWT Bearer Token** in the `Authorization` header, **HTTP-only Cookies**, or **Development / Mock Headers**.

### 1. JWT Bearer Token (Standard Flow)
Obtain `access_token` via `/auth/register` or `/auth/login`, then include:
```http
Authorization: Bearer <access_token>
Content-Type: application/json
```

### 2. Development / Mock Headers (Quick Role Switching)
When testing in Postman without acquiring a token, you can pass mock headers directly (handled by `MockJwtAuthGuard`):

#### Student Persona:
```http
x-user-id: 22222222-2222-4222-8222-222222222222
x-user-role: student
x-department-id: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
x-preferred-language: en
Content-Type: application/json
```

#### Staff / Approver Persona:
```http
x-user-id: 33333333-3333-4333-8333-333333333333
x-user-role: staff
x-department-id: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
x-preferred-language: en
Content-Type: application/json
```

#### Admin Persona:
```http
x-user-id: 11111111-1111-4111-8111-111111111111
x-user-role: admin
x-department-id: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
x-preferred-language: en
Content-Type: application/json
```

#### Warden Persona:
```http
x-user-id: 44444444-4444-4444-8444-444444444444
x-user-role: warden
x-department-id: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
x-preferred-language: en
Content-Type: application/json
```

#### Lab In-Charge Persona:
```http
x-user-id: 55555555-5555-4555-8555-555555555555
x-user-role: lab_incharge
x-department-id: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
x-preferred-language: en
Content-Type: application/json
```

---

## 🚨 Error Response Schema
All error responses conform to the normalized structure:
```json
{
  "code": "ERROR_CODE",
  "message": "Human readable error description",
  "field": "optional_field_name"
}
```

---

## Table of Contents
1. [Authentication & Profile (`/auth`, `/users`)](#1-authentication--profile)
2. [AI Agent & LangGraph Orchestration (`/agent/session`)](#2-ai-agent--langgraph-orchestration)
3. [Service Requests (`/requests`)](#3-service-requests)
4. [Human-in-the-Loop Approvals (`/approvals`)](#4-human-in-the-loop-approvals)
5. [Lab Resources & Bookings (`/lab-resources`, `/lab-bookings`)](#5-lab-resources--bookings)
6. [Grievances & Redressal (`/grievances`)](#6-grievances--redressal)
7. [Knowledge Base & Hybrid Search (`/kb`)](#7-knowledge-base--hybrid-search)
8. [Notifications (`/notifications`)](#8-notifications)
9. [Immutable Audit Trail & Hash-Chain (`/audit`)](#9-immutable-audit-trail--hash-chain)
10. [Admin Analytics & Insights (`/admin/analytics`)](#10-admin-analytics--insights)
11. [WebSocket Real-Time Events (`/ws`)](#11-websocket-real-time-events)

---

## 1. Authentication & Profile

### 1.1 `POST /auth/register`
Register a new user account. Sets `access_token` and `refresh_token` HTTP-only cookies.

- **Auth:** Public
- **Request Body:**
```json
{
  "name": "Rahul Sharma",
  "email": "rahul.student@campus.edu",
  "password": "Password123!",
  "role": "student",
  "department_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "preferred_language": "en"
}
```
> **Valid Roles:** `student`, `staff`, `admin`, `warden`, `lab_incharge`  
> **Valid Languages:** `en`, `hi`, `or`

- **Response `201 Created`:**
```json
{
  "user": {
    "id": "22222222-2222-4222-8222-222222222222",
    "name": "Rahul Sharma",
    "email": "rahul.student@campus.edu",
    "role": "student",
    "department_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "preferred_language": "en",
    "notification_prefs": {}
  },
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "uR8abc123..."
}
```

---

### 1.2 `POST /auth/login`
Authenticate with email and password.

- **Auth:** Public
- **Request Body:**
```json
{
  "email": "rahul.student@campus.edu",
  "password": "Password123!"
}
```
- **Response `200 OK` / `201 Created`:**
```json
{
  "user": {
    "id": "22222222-2222-4222-8222-222222222222",
    "name": "Rahul Sharma",
    "email": "rahul.student@campus.edu",
    "role": "student",
    "department_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "preferred_language": "en",
    "notification_prefs": {}
  },
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "uR8abc123..."
}
```

---

### 1.3 `POST /auth/refresh`
Rotate and refresh access & refresh tokens.

- **Auth:** Public (Body token or `refresh_token` Cookie)
- **Request Body:**
```json
{
  "refresh_token": "uR8abc123..."
}
```
- **Response `200 OK`:**
```json
{
  "user": {
    "id": "22222222-2222-4222-8222-222222222222",
    "name": "Rahul Sharma",
    "email": "rahul.student@campus.edu",
    "role": "student",
    "department_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "preferred_language": "en",
    "notification_prefs": {}
  },
  "access_token": "new-jwt-token...",
  "refresh_token": "new-refresh-token..."
}
```

---

### 1.4 `POST /auth/logout`
Revoke refresh tokens and clear authentication cookies.

- **Auth:** Optional / Bearer Token
- **Request Body:**
```json
{
  "refresh_token": "uR8abc123...",
  "all_devices": false
}
```
- **Response `200 OK`:**
```json
{
  "logged_out": true
}
```

---

### 1.5 `GET /users/me`
Retrieve authenticated user profile.

- **Auth:** Bearer Token (Any Role)
- **Response `200 OK`:**
```json
{
  "id": "22222222-2222-4222-8222-222222222222",
  "name": "Rahul Sharma",
  "email": "rahul.student@campus.edu",
  "role": "student",
  "department_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "preferred_language": "en",
  "notification_prefs": {}
}
```

---

### 1.6 `PATCH /users/me`
Update profile settings (preferred language or notification preferences).

- **Auth:** Bearer Token (Any Role)
- **Request Body:**
```json
{
  "preferred_language": "hi",
  "notification_prefs": {
    "email": true,
    "push": true
  }
}
```
- **Response `200 OK`:** Updated user object.

---

## 2. AI Agent & LangGraph Orchestration

### 2.1 `POST /agent/session`
Initialize a new AI agent conversation session.

- **Auth:** Bearer Token (Any Role)
- **Request Body:**
```json
{
  "language": "en"
}
```
- **Response `201 Created`:**
```json
{
  "session_id": "9f77f6b6-89d5-47fe-bbbb-064e4331a980",
  "started_at": "2026-08-18T12:00:00.000Z"
}
```

---

### 2.2 `POST /agent/session/:id/message`
Send a user prompt into the LangGraph state machine. Executes planning, RAG retrieval, policy validation, and workflow step creation asynchronously.

- **Auth:** Bearer Token (Session Owner)
- **Path Params:** `id` = Session UUID
- **Request Body:**
```json
{
  "content": "I need a bonafide certificate for my education loan application."
}
```
- **Response `201 Created`:**
```json
{
  "accepted": true
}
```

---

### 2.3 `GET /agent/session/:id`
Retrieve full conversation history for a session.

- **Auth:** Bearer Token (Session Owner)
- **Path Params:** `id` = Session UUID
- **Response `200 OK`:**
```json
{
  "session_id": "9f77f6b6-89d5-47fe-bbbb-064e4331a980",
  "messages": [
    {
      "id": "e9365e1d-4009-42b7-83d3-0599092ba188",
      "sender": "user",
      "content": "I need a bonafide certificate for my education loan application.",
      "confidence_score": null,
      "cited_chunk_ids": [],
      "created_at": "2026-08-18T12:00:05.000Z"
    },
    {
      "id": "2195fbc9-ffb2-4d43-9877-2e11a3bcf440",
      "sender": "agent",
      "content": "I have created your bonafide certificate request. Because this is a verified document, it requires staff approval before issuance.",
      "confidence_score": 0.94,
      "cited_chunk_ids": ["c1-doc-chunk-id"],
      "created_at": "2026-08-18T12:00:08.000Z"
    }
  ]
}
```

---

### 2.4 `GET /agent/session/:id/plan`
Retrieve the step-by-step execution plan and tool actions created by the agent.

- **Auth:** Bearer Token (Session Owner)
- **Path Params:** `id` = Session UUID
- **Response `200 OK`:**
```json
{
  "steps": [
    {
      "step_name": "verify_student_eligibility",
      "tool_name": "student_verification",
      "risk_level": "low",
      "status": "done",
      "rationale": "Verifying that the student is active and has no pending dues"
    },
    {
      "step_name": "issue_bonafide_certificate",
      "tool_name": "issue_certificate",
      "risk_level": "high",
      "status": "awaiting_approval",
      "rationale": "Issuing a verified document is administratively irreversible and requires staff sign-off"
    }
  ]
}
```

---

## 3. Service Requests

### 3.1 `POST /requests`
Create a manual service request.

- **Auth:** Bearer Token (Any Role)
- **Request Body:**
```json
{
  "request_type": "bonafide_certificate",
  "description": "Requesting bonafide certificate for passport renewal",
  "department_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
}
```
- **Response `201 Created`:**
```json
{
  "id": "528574d7-062e-4b68-80f0-974fa2e5192c",
  "userId": "22222222-2222-4222-8222-222222222222",
  "sessionId": null,
  "requestTypeId": "0ff94b15-cf6a-49a6-8968-0fa2e3c049e7",
  "departmentId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "status": "pending",
  "description": "Requesting bonafide certificate for passport renewal",
  "createdAt": "2026-08-18T12:05:00.000Z",
  "slaDueAt": "2026-08-21T12:05:00.000Z",
  "resolvedAt": null
}
```

---

### 3.2 `GET /requests`
List requests with pagination and status filter.
- Students view only their own requests.
- Staff/Admin view requests for their assigned department.

- **Auth:** Bearer Token
- **Query Params:** `page` (default: 1), `limit` (default: 20), `status` (optional)
- **Example:** `GET /requests?page=1&limit=10&status=pending`
- **Response `200 OK`:**
```json
{
  "items": [
    {
      "id": "528574d7-062e-4b68-80f0-974fa2e5192c",
      "request_type": "bonafide_certificate",
      "status": "pending",
      "description": "Requesting bonafide certificate for passport renewal",
      "created_at": "2026-08-18T12:05:00.000Z",
      "sla_due_at": "2026-08-21T12:05:00.000Z",
      "department_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "session_id": null
    }
  ],
  "total": 1,
  "page": 1
}
```

---

### 3.3 `GET /requests/:id`
Get request details and execution timeline steps.

- **Auth:** Bearer Token (Owner or Staff)
- **Path Params:** `id` = Request UUID
- **Response `200 OK`:**
```json
{
  "id": "528574d7-062e-4b68-80f0-974fa2e5192c",
  "request_type": "bonafide_certificate",
  "status": "pending",
  "description": "Requesting bonafide certificate for passport renewal",
  "created_at": "2026-08-18T12:05:00.000Z",
  "sla_due_at": "2026-08-21T12:05:00.000Z",
  "department_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "session_id": null,
  "timeline": [
    {
      "step_name": "eligibility_check",
      "risk_level": "low",
      "status": "done",
      "executed_at": "2026-08-18T12:05:02.000Z"
    },
    {
      "step_name": "issue_bonafide_certificate",
      "risk_level": "high",
      "status": "awaiting_approval",
      "executed_at": null
    }
  ]
}
```

---

### 3.4 `PATCH /requests/:id/status`
Update status of a service request.

- **Auth:** Roles `staff`, `admin`, `warden`, `lab_incharge`
- **Path Params:** `id` = Request UUID
- **Request Body:**
```json
{
  "status": "resolved"
}
```
- **Response `200 OK`:** Updated `ServiceRequest` record with `resolvedAt` timestamp.

---

## 4. Human-in-the-Loop Approvals

> 🛡️ **Access Control:** Restricted to `staff`, `admin`, `warden`, `lab_incharge`.

### 4.1 `GET /approvals`
List all pending approval requests awaiting reviewer action.

- **Auth:** Bearer Token (Staff Roles)
- **Response `200 OK`:**
```json
{
  "items": [
    {
      "id": "6a964e59-a5fe-4f11-893c-cf570daea09d",
      "workflowStepId": "f768bda9-fa7d-4530-9b4a-a92c0d832e82",
      "reviewerId": null,
      "decision": null,
      "reason": null,
      "question": null,
      "contextJson": {
        "student_id": "22222222-2222-4222-8222-222222222222",
        "certificate_type": "bonafide",
        "purpose": "Education loan"
      },
      "decidedAt": null,
      "createdAt": "2026-08-18T12:00:10.000Z",
      "workflowStep": {
        "id": "f768bda9-fa7d-4530-9b4a-a92c0d832e82",
        "stepName": "issue_bonafide_certificate",
        "toolName": "issue_certificate",
        "riskLevel": "high",
        "status": "awaiting_approval",
        "request": {
          "id": "528574d7-062e-4b68-80f0-974fa2e5192c",
          "userId": "22222222-2222-4222-8222-222222222222",
          "description": "Bonafide request"
        }
      }
    }
  ]
}
```

---

### 4.2 `POST /approvals/:id/approve`
Approve pending action, atomically execute underlying tool, log to hash-chain audit, and resume remaining agent workflow steps.

- **Auth:** Bearer Token (Staff Roles)
- **Path Params:** `id` = Approval UUID
- **Request Body:** `{}` (empty)
- **Response `200 OK` / `201 Created`:**
```json
{
  "id": "6a964e59-a5fe-4f11-893c-cf570daea09d",
  "decision": "approved",
  "executed": true,
  "executed_at": "2026-08-18T12:10:00.000Z",
  "result": {
    "id": "d04a62aa-d933-40f4-9040-ee9da372aa79",
    "serialNumber": "CERT-2026-ABC12345",
    "verificationCode": "V-993821",
    "status": "issued"
  }
}
```

---

### 4.3 `POST /approvals/:id/reject`
Reject pending action with a mandatory explanation.

- **Auth:** Bearer Token (Staff Roles)
- **Path Params:** `id` = Approval UUID
- **Request Body:**
```json
{
  "reason": "Attendance is below mandatory 75% requirement for this semester"
}
```
*(Validation: `reason` must be at least 10 characters)*
- **Response `200 OK` / `201 Created`:**
```json
{
  "id": "6a964e59-a5fe-4f11-893c-cf570daea09d",
  "decision": "rejected",
  "reason": "Attendance is below mandatory 75% requirement for this semester"
}
```

---

### 4.4 `POST /approvals/:id/request-info`
Request clarification from student. Automatically posts question into the agent chat session.

- **Auth:** Bearer Token (Staff Roles)
- **Path Params:** `id` = Approval UUID
- **Request Body:**
```json
{
  "question": "Please upload or mention your scholarship loan reference ID."
}
```
- **Response `200 OK` / `201 Created`:**
```json
{
  "id": "6a964e59-a5fe-4f11-893c-cf570daea09d",
  "decision": "info_requested"
}
```

---

## 5. Lab Resources & Bookings

### 5.1 `GET /lab-resources`
List all lab resources and capacities.

- **Auth:** Bearer Token (Any Role)
- **Response `200 OK`:**
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

---

### 5.2 `GET /lab-bookings`
List existing bookings for a specific lab resource on a given date.

- **Auth:** Bearer Token (Any Role)
- **Query Params:**
  - `resource_id` (required, UUID)
  - `date` (required, ISO date string e.g. `2026-08-20`)
- **Example:** `GET /lab-bookings?resource_id=55555555-5555-4555-8555-555555555555&date=2026-08-20`
- **Response `200 OK`:**
```json
{
  "items": [
    {
      "id": "a90b62e4-c5a4-4f01-b3b3-8a3c87db98f2",
      "resourceId": "55555555-5555-4555-8555-555555555555",
      "userId": "22222222-2222-4222-8222-222222222222",
      "startTime": "2026-08-20T10:00:00.000Z",
      "endTime": "2026-08-20T12:00:00.000Z",
      "status": "confirmed",
      "courseCode": "CS401",
      "facultyRef": "Dr. Sharma"
    }
  ]
}
```

---

### 5.3 `POST /lab-bookings`
Reserve a lab slot (1 to 4 hours duration). Rejects conflicting slots automatically.

- **Auth:** Bearer Token (Any Role)
- **Request Body:**
```json
{
  "resource_id": "55555555-5555-4555-8555-555555555555",
  "start_time": "2026-08-20T14:00:00.000Z",
  "end_time": "2026-08-20T16:00:00.000Z",
  "course_code": "CS401",
  "faculty_ref": "Dr. Sharma"
}
```
- **Response `201 Created`:**
```json
{
  "id": "4d16d1a9-b68e-4a6c-b3a6-574d754b2d39",
  "resourceId": "55555555-5555-4555-8555-555555555555",
  "userId": "22222222-2222-4222-8222-222222222222",
  "startTime": "2026-08-20T14:00:00.000Z",
  "endTime": "2026-08-20T16:00:00.000Z",
  "status": "confirmed",
  "courseCode": "CS401",
  "facultyRef": "Dr. Sharma"
}
```

---

### 5.4 `DELETE /lab-bookings/:id`
Cancel an existing lab booking.

- **Auth:** Bearer Token (Any Role)
- **Path Params:** `id` = Booking UUID
- **Response `200 OK`:** Updated booking with `status: "cancelled"`.

---

## 6. Grievances & Redressal

### 6.1 `POST /grievances`
File an institutional grievance (optionally anonymous). Automatically sets a 7-day SLA.

- **Auth:** Bearer Token (Any Role)
- **Request Body:**
```json
{
  "category": "hostel_maintenance",
  "description": "Water leakage in Hostel Block B, 3rd floor washroom.",
  "anonymous": false,
  "evidence_urls": ["https://storage.campus.edu/evidence/photo1.jpg"]
}
```
- **Response `201 Created`:**
```json
{
  "id": "782ffda7-3b98-47c3-a3d2-3114f6b69cf6",
  "userId": "22222222-2222-4222-8222-222222222222",
  "ownerUserId": "22222222-2222-4222-8222-222222222222",
  "category": "hostel_maintenance",
  "description": "Water leakage in Hostel Block B, 3rd floor washroom.",
  "anonymous": false,
  "status": "open",
  "escalationLevel": 1,
  "slaDueAt": "2026-08-25T12:00:00.000Z",
  "createdAt": "2026-08-18T12:00:00.000Z"
}
```

---

### 6.2 `GET /grievances`
List grievances with optional filtering. Anonymous complaints omit identity for non-owner reviewers.

- **Auth:** Bearer Token
- **Query Params:** `page`, `limit`, `status`, `escalation_level`
- **Example:** `GET /grievances?page=1&status=open&escalation_level=1`
- **Response `200 OK`:**
```json
{
  "items": [
    {
      "id": "782ffda7-3b98-47c3-a3d2-3114f6b69cf6",
      "user_id": "22222222-2222-4222-8222-222222222222",
      "category": "hostel_maintenance",
      "description": "Water leakage in Hostel Block B, 3rd floor washroom.",
      "anonymous": false,
      "status": "open",
      "escalation_level": 1,
      "sla_due_at": "2026-08-25T12:00:00.000Z",
      "created_at": "2026-08-18T12:00:00.000Z"
    }
  ],
  "total": 1,
  "page": 1
}
```

---

### 6.3 `GET /grievances/:id`
Get detailed grievance information including escalation history.

- **Auth:** Bearer Token (Owner or Staff)
- **Path Params:** `id` = Grievance UUID
- **Response `200 OK`:** Grievance record + `escalation_history: []`.

---

### 6.4 `POST /grievances/:id/escalate`
Escalate grievance level.

- **Auth:** Roles `staff`, `admin`, `warden`
- **Path Params:** `id` = Grievance UUID
- **Response `201 Created` / `200 OK`:**
```json
{
  "id": "782ffda7-3b98-47c3-a3d2-3114f6b69cf6",
  "escalation_level": 2,
  "escalated_at": "2026-08-18T12:15:00.000Z"
}
```

---

## 7. Knowledge Base & Hybrid Search

### 7.1 `GET /kb/documents`
List all ingested policy documents.

- **Auth:** Bearer Token (Any Role)
- **Response `200 OK`:**
```json
{
  "items": [
    {
      "id": "d1e44f12-0056-4c92-a167-93cf82a8848a",
      "title": "Hostel Policy & Regulations 2026",
      "document_id": "DOC-HOSTEL-01",
      "version": "2026.1",
      "effective_date": "2026-01-01T00:00:00.000Z",
      "status": "active",
      "uploaded_by": "11111111-1111-4111-8111-111111111111",
      "file_url": null,
      "chunk_count": 4
    }
  ]
}
```

---

### 7.2 `POST /kb/documents`
Upload / upsert markdown policy document. Automatically chunks by clause headings and generates vector embeddings.

- **Auth:** Roles `staff`, `admin`
- **Request Body:**
```json
{
  "title": "Academic Bonafide Certificate Policy",
  "document_id": "DOC-ACAD-BONAFIDE-01",
  "version": "2026.1",
  "effective_date": "2026-01-01",
  "content": "# Academic Regulations\n\n## Clause 1 Eligibility\nStudents must maintain minimum 75% attendance and have no financial dues to be eligible for a Bonafide Certificate.\n\n## Clause 2 SLA and Turnaround\nStandard processing time is 72 working hours from staff approval."
}
```
- **Response `201 Created`:**
```json
{
  "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "title": "Academic Bonafide Certificate Policy",
  "version": "2026.1",
  "status": "active",
  "chunks": 2
}
```

---

### 7.3 `POST /kb/search`
Perform hybrid vector & BM25 lexical similarity search over policy chunks.

- **Auth:** Bearer Token (Any Role)
- **Request Body:**
```json
{
  "query": "bonafide certificate eligibility attendance",
  "top_k": 5
}
```
- **Response `201 Created` / `200 OK`:**
```json
{
  "chunks": [
    {
      "chunk_id": "f5e925b4-d5cf-4df5-a7b6-bfbfa71239aa",
      "content": "## Clause 1 Eligibility\nStudents must maintain minimum 75% attendance and have no financial dues to be eligible for a Bonafide Certificate.",
      "source_document": "DOC-ACAD-BONAFIDE-01",
      "document_version": "2026.1",
      "page": 1,
      "clause": "Eligibility",
      "similarity": 0.92
    }
  ]
}
```

---

## 8. Notifications

### 8.1 `GET /notifications`
List in-app notifications for authenticated user.

- **Auth:** Bearer Token (Any Role)
- **Query Params:** `page`, `limit`, `unread_only` (`true` | `false`)
- **Example:** `GET /notifications?unread_only=true`
- **Response `200 OK`:**
```json
{
  "items": [
    {
      "id": "e4f8d9a2-9b21-4f11-9a72-68da91a92e10",
      "userId": "22222222-2222-4222-8222-222222222222",
      "title": "Approval required",
      "body": "Your request has been submitted for approval.",
      "readFlag": false,
      "deepLink": "/chat?session=9f77f6b6-89d5-47fe-bbbb-064e4331a980",
      "createdAt": "2026-08-18T12:00:10.000Z"
    }
  ],
  "total": 1,
  "page": 1
}
```

---

### 8.2 `POST /notifications/mark-read`
Mark notifications as read.

- **Auth:** Bearer Token (Any Role)
- **Request Body:**
```json
{
  "ids": ["e4f8d9a2-9b21-4f11-9a72-68da91a92e10"]
}
```
*(Omit `ids` to mark all notifications as read)*
- **Response `201 Created` / `200 OK`:**
```json
{
  "updated": 1
}
```

---

## 9. Immutable Audit Trail & Hash-Chain

> 🛡️ **Access Control:** Restricted to `admin` role only.

### 9.1 `GET /audit/search`
Query chronological audit events across system entities.

- **Auth:** Roles `admin`
- **Query Params:** `page`, `limit`, `entity_type`, `action`
- **Example:** `GET /audit/search?entity_type=agent_sessions`
- **Response `200 OK`:**
```json
{
  "items": [
    {
      "id": "2b938f32-73a1-4328-86d7-ea88df74092b",
      "entityType": "agent_sessions",
      "entityId": "9f77f6b6-89d5-47fe-bbbb-064e4331a980",
      "action": "N13.approval_creation",
      "actor": "agent",
      "payloadJson": {
        "approval_id": "6a964e59-a5fe-4f11-893c-cf570daea09d",
        "risk_level": "high"
      },
      "prevHash": "GENESIS",
      "entryHash": "7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
      "createdAt": "2026-08-18T12:00:10.000Z"
    }
  ],
  "total": 1,
  "page": 1
}
```

---

### 9.2 `GET /audit/verify/:entityType/:entityId`
Verify cryptographic SHA-256 hash-chain integrity for an entity.

- **Auth:** Roles `admin`
- **Path Params:** `entityType` (e.g. `agent_sessions`), `entityId` (UUID)
- **Example:** `GET /audit/verify/agent_sessions/9f77f6b6-89d5-47fe-bbbb-064e4331a980`
- **Response `200 OK` (Chain Valid):**
```json
{
  "intact": true
}
```
- **Response `200 OK` (Tampering Detected):**
```json
{
  "intact": false,
  "broken_at_entry_id": "2b938f32-73a1-4328-86d7-ea88df74092b"
}
```

---

### 9.3 `GET /audit/:entityType/:entityId`
Get ordered audit trail logs for a specific entity.

- **Auth:** Roles `admin`
- **Path Params:** `entityType`, `entityId`
- **Response `200 OK`:** Array of `AuditLog` records.

---

## 10. Admin Analytics & Insights

> 🛡️ **Access Control:** Restricted to `admin` role only.

### 10.1 `GET /admin/analytics/requests-summary`
Distribution of requests by request type and lifecycle status.

- **Auth:** Roles `admin`
- **Response `200 OK`:**
```json
{
  "by_type": [
    { "request_type": "bonafide_certificate", "count": 14 },
    { "request_type": "hostel_maintenance", "count": 8 }
  ],
  "by_status": [
    { "status": "pending", "count": 5 },
    { "status": "resolved", "count": 15 },
    { "status": "rejected", "count": 2 }
  ]
}
```

---

### 10.2 `GET /admin/analytics/resolution-time`
Resolution time trends for completed service requests.

- **Auth:** Roles `admin`
- **Response `200 OK`:**
```json
{
  "points": [
    {
      "date": "2026-08-18",
      "avg_resolution_hours": 3.42
    }
  ]
}
```

---

### 10.3 `GET /admin/analytics/bottlenecks`
Approval steps exceeding SLA deadlines grouped by department.

- **Auth:** Roles `admin`
- **Response `200 OK`:**
```json
{
  "items": [
    {
      "department": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "step_name": "issue_bonafide_certificate",
      "overdue_count": 3
    }
  ]
}
```

---

### 10.4 `GET /admin/analytics/policy-conflicts`
Automated flags for conflicting policy clauses across document versions.

- **Auth:** Roles `admin`
- **Response `200 OK`:**
```json
{
  "items": [
    {
      "id": "c71e21b2-16a7-4c31-89be-758fa4923f99",
      "doc_a": {
        "document_id": "DOC-HOSTEL-01",
        "clause": "Clause 4 Curfew",
        "version": "2025.2"
      },
      "doc_b": {
        "document_id": "DOC-HOSTEL-01",
        "clause": "Clause 4 Extended Lab Hours",
        "version": "2026.1"
      },
      "raised_at": "2026-08-18T10:00:00.000Z",
      "status": "open"
    }
  ]
}
```

---

## 11. WebSocket Real-Time Events

### Socket.IO Setup
- **Namespace:** `/ws`
- **Connection URL:** `http://localhost:3000/ws`
- **Handshake Authentication / Query Parameters:**
  - `user_id`: Current User UUID
  - `session_id`: (Optional) Current Agent Session UUID

### Subscribed Event Schema
All events arrive on client listener `'event'`:
```json
{
  "type": "<EVENT_TYPE>",
  "payload": { ... }
}
```

### Event Types Catalog:
| Event Type | Room Target | Trigger Description |
| :--- | :--- | :--- |
| `notification.new` | `user:<userId>` | New notification created for user |
| `status.changed` | `user:<userId>` | Service request status changed |
| `booking.created` | `user:<userId>` | Lab booking confirmed |
| `booking.cancelled` | `user:<userId>` | Lab booking cancelled |
| `grievance.escalated`| `user:<userId>` | Grievance escalation level incremented |
| `plan.update` | `agent_session:<sessionId>` | Workflow step planned / status updated |
| `message.complete` | `agent_session:<sessionId>` | Agent answer / message complete |
| `approval.created` | `agent_session:<sessionId>` | High-risk step awaiting staff approval |
| `approval.status` | `agent_session:<sessionId>` | Status update on pending approval |
| `approval.actioned` | `agent_session:<sessionId>` | Decision recorded (approved / rejected) |
