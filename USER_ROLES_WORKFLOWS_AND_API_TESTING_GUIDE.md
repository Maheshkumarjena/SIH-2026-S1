# Campus Service Copilot — User Roles, Routing Matrix & Complete API Testing Guide

This document provides a comprehensive reference for developers and QA testers evaluating the Campus Service Copilot system. It covers user role responsibilities, request routing logic, database schema context, and 5 complete, step-by-step API testing flows.

---

## 1. User Types, Access Control & Responsibilities

| Role | Primary Persona | System Access Rights & Scope | Key Responsibilities |
|---|---|---|---|
| `student` | Mahesh Kumar Jena (`22222222-2222-4222-8222-222222222222`), Rohit Panda, Ananya Mishra | - View personal academic profile, fee status, exam marks, library/hostel records.<br>- Submit service requests (`certificate`, `maintenance`, `fee_receipt`, `hostel_maintenance`, `library_noc`).<br>- File grievances.<br>- Query lab/seminar hall availability and book coursework slots.<br>- **Cannot** approve requests or view other students' private records. | - Submit requests with required details.<br>- Provide clarification when staff asks via HITL.<br>- Track request progress. |
| `staff` | Priya Das (`33333333-3333-4333-8333-333333333333`), Sunita Sen, Ramesh Sahoo | - Department-scoped access (Academic `ACAD`, Exam `EXAM`, Accounts `ACC`).<br>- Review and act on pending HITL approvals (`/approvals`).<br>- Update service request statuses (`/requests/:id/status`).<br>- Upload & manage Knowledge Base policy documents (`/kb/documents`). | - Approve or reject High/Medium risk workflow steps.<br>- Request missing info from students.<br>- Ensure SLA compliance. |
| `lab_incharge` | Dr. R. Nayak (`55555555-1111-4555-8555-111111111111`) | - Faculty assigned to specific lab resources (e.g. CSE Programming Lab 1 & 2).<br>- Review Medium/High risk lab booking overrides.<br>- Manage lab slot restrictions. | - Review lab reservations.<br>- Prevent resource conflicts.<br>- Approve out-of-schedule lab requests. |
| `warden` | Mr. K. Behera (`66666666-6666-4666-8666-666666666666`) | - Hostel Administration department scope (`HOSTEL`).<br>- View and resolve hostel maintenance requests and room allocations.<br>- Manage hostel grievances. | - Assign hostel maintenance staff.<br>- Resolve room/facility complaints.<br>- Manage room allocations. |
| `admin` | Admin User (`11111111-1111-4111-8111-111111111111`) | - Global system-wide access across all departments.<br>- Access admin analytics (`/admin/analytics`).<br>- Verify cryptographic audit log integrity (`/audit/verify`).<br>- Resolve policy conflict flags (`policy_conflict_flags`). | - System health monitoring.<br>- Resolve inter-departmental policy conflicts.<br>- Audit compliance. |

---

## 2. Service Request Routing & Responsibility Mapping Matrix

| Request Type | Description | Target Department | Assigned Reviewer Persona | Risk Level & HITL Workflow | Real Example |
|---|---|---|---|---|---|
| `certificate` | Bonafide, Conduct, or Education Loan Certificates | Academic Section (`ACAD` / `dept-acad`) | Academic `staff` (Priya Das) | **High Risk**: Requires staff approval before certificate issuance & serial code generation. | "I need a bonafide certificate for my SBI education loan." |
| `fee_receipt` | Annual fee receipt or payment breakdown | Accounts & Finance (`ACC` / `financeDept`) | Accounts `staff` (Ramesh Sahoo) | **Low Risk**: Auto-retrieves payment record (`RCPT-2026-084521`) if paid in DB; routes to Accounts if dues exist. | "Can I get my 3rd year fee receipt?" |
| `hostel_maintenance` | Room AC, plumbing, electrical, or furniture repairs | Hostel Administration (`HOSTEL` / `hostelDept`) | Hostel `warden` (Mr. K. Behera) | **Low / Medium Risk**: Creates SLA ticket (48h); alerts Warden queue if urgent. | "AC in Block C room 304 is leaking water." |
| `lab_booking` | Computer / Hardware lab slot reservation | Department / Lab In-Charge (`dept-cse` / `fac1`) | `lab_incharge` (Dr. R. Nayak) | **Low Risk**: Auto-confirms if slot is free; **Medium Risk**: HITL approval if override requested. | "Book the CSE lab tomorrow from 2 PM to 4 PM for CS305." |
| `grievance` | Exam re-evaluation, unfair grading, or misconduct | Examination / Academic (`EXAM` / `ACAD`) | Exam `staff` (Sunita Sen) / HOD (Dr. S. Mohanty) | **High Risk**: Enters formal grievance pipeline; escalates automatically if SLA breached (168h). | "I want to re-evaluate my DBMS mid-sem paper." |
| `transcript_request` | Official marks transcript | Examination Section (`EXAM` / `deptExam`) | Exam `staff` (Sunita Sen) | **High Risk**: Requires manual verification of all semester marks. | "Issue my official 5th semester transcript." |

---

## 3. Core Database Schema Context for Testing

The diagram below maps how relational tables interconnect during agent tool execution and request routing:

```
departments (id, name, code, type, hod_user_id)
  ├── sections (id, department_id, batch_label, year, semester)
  │     └── students (user_id, registration_no, roll_no, section_id)
  │           ├── fee_payments ── fee_structure (tuition_fee, hostel_fee, exam_fee)
  │           ├── exam_records ── subjects (code, name)
  │           ├── hostel_allocations (hostel_block, room_no, warden_id)
  │           └── library_records (book_title, due_date, fine_amount)
  └── faculty (user_id, employee_id, designation, is_lab_incharge, is_hod)
        └── lab_resources ── lab_bookings (resource_id, user_id, start_time, end_time, status)

users (id, name, email, role, department_id)
  ├── agent_sessions ── agent_messages
  ├── service_requests ── workflow_steps ── approvals (reviewer_id, decision, reason)
  └── grievances (owner_user_id, category, description, status, escalation_level)
```

---

## 4. End-to-End API Testing Guide (5 Complete Ordered Scenarios)

You can run these requests using Postman or `curl`. Protected endpoints use mock authentication headers (`x-user-id`, `x-user-role`, `x-department-id`).

---

### Scenario 1: Student Fee Record & Receipt Query (Automated Database Retrieval)

**Goal**: Student asks "Can I get my 3rd year fee receipt?". Agent classifies intent as `fee_query`, executes `get_annual_fee_summary` tool, and synthesizes the exact receipt `#RCPT-2026-084521` and ₹87,000 paid breakdown.

#### Step 1.1: Create Agent Session
```http
POST http://localhost:3000/agent/session
Content-Type: application/json
x-user-id: 22222222-2222-4222-8222-222222222222
x-user-role: student
x-department-id: aaaaaaaa-aaaa-4aaa-8aaa-111111111111

{
  "language": "en"
}
```
**Expected Response `201 Created`**:
```json
{
  "session_id": "9f77f6b6-89d5-47fe-bbbb-064e4331a980",
  "started_at": "2026-08-21T18:30:00.000Z"
}
```

#### Step 1.2: Send Query Message
```http
POST http://localhost:3000/agent/session/9f77f6b6-89d5-47fe-bbbb-064e4331a980/message
Content-Type: application/json
x-user-id: 22222222-2222-4222-8222-222222222222
x-user-role: student
x-department-id: aaaaaaaa-aaaa-4aaa-8aaa-111111111111

{
  "content": "Can I get my 3rd year fee receipt?"
}
```
**Expected Response `201 Created`**: `{"accepted": true}`

#### Step 1.3: Fetch Agent Session Messages & Response
```http
GET http://localhost:3000/agent/session/9f77f6b6-89d5-47fe-bbbb-064e4331a980
x-user-id: 22222222-2222-4222-8222-222222222222
x-user-role: student
```
**Expected Agent Response**:
> **3rd Year Fee Receipt Summary**
> - **Student Name**: Mahesh Kumar Jena
> - **Registration No**: 21CSE1042
> - **Department**: Computer Science & Engineering (Year 3)
> - **Tuition Fee**: ₹75,000
> - **Hostel Fee**: ₹10,000
> - **Exam Fee**: ₹2,000
> - **Scheduled Total**: ₹87,000
> - **Amount Paid**: ₹87,000 (Paid in full)
> - **Receipt Number**: `RCPT-2026-084521`

---

### Scenario 2: Student Bonafide Certificate Request (High-Risk HITL Staff Approval Flow)

**Goal**: Student requests a bonafide certificate. Agent generates plan with High-Risk `issue_certificate` step, pauses for staff approval. Staff approves, generating signed certificate serial code.

#### Step 2.1: Send Certificate Request Prompt
```http
POST http://localhost:3000/agent/session/9f77f6b6-89d5-47fe-bbbb-064e4331a980/message
Content-Type: application/json
x-user-id: 22222222-2222-4222-8222-222222222222
x-user-role: student
x-department-id: aaaaaaaa-aaaa-4aaa-8aaa-111111111111

{
  "content": "I need a bonafide certificate for my education loan application."
}
```

#### Step 2.2: Staff Fetches Pending Approvals Queue
```http
GET http://localhost:3000/approvals
x-user-id: 33333333-3333-4333-8333-333333333333
x-user-role: staff
x-department-id: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
```
**Expected Response `200 OK`**:
```json
{
  "items": [
    {
      "id": "6a964e59-a5fe-4f11-893c-cf570daea09d",
      "workflowStepId": "f768bda9-fa7d-4530-9b4a-a92c0d832e82",
      "decision": null,
      "contextJson": {
        "student_id": "22222222-2222-4222-8222-222222222222",
        "certificate_type": "bonafide",
        "purpose": "education loan application"
      },
      "workflowStep": {
        "stepName": "Issue bonafide certificate",
        "toolName": "issue_certificate",
        "riskLevel": "high"
      }
    }
  ]
}
```

#### Step 2.3: Staff Approves Certificate Issuance
```http
POST http://localhost:3000/approvals/6a964e59-a5fe-4f11-893c-cf570daea09d/approve
Content-Type: application/json
x-user-id: 33333333-3333-4333-8333-333333333333
x-user-role: staff
x-department-id: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa

{}
```
**Expected Response `200 OK`**:
```json
{
  "id": "6a964e59-a5fe-4f11-893c-cf570daea09d",
  "decision": "approved",
  "executed": true,
  "result": {
    "id": "cert-uuid-12345",
    "serialNumber": "CERT-2026-A8B9C0",
    "verificationCode": "V-771928",
    "status": "issued"
  }
}
```

---

### Scenario 3: Lab Resource Reservation & Structural Conflict Checking

**Goal**: Reserve CSE Programming Lab 1. Verify successful booking, then attempt double booking to prove exclusion conflict enforcement.

#### Step 3.1: Check Available Lab Resources
```http
GET http://localhost:3000/lab-resources
x-user-id: 22222222-2222-4222-8222-222222222222
x-user-role: student
```
**Expected Response `200 OK`**:
```json
{
  "items": [
    {
      "id": "55555555-1111-4555-8555-111111111111",
      "name": "CSE Programming Lab 1",
      "capacity": 60,
      "location": "CS Block, 2nd Floor"
    }
  ]
}
```

#### Step 3.2: Book Lab Slot (Successful Booking)
```http
POST http://localhost:3000/lab-bookings
Content-Type: application/json
x-user-id: 55555555-1111-4555-8555-111111111111
x-user-role: lab_incharge

{
  "resource_id": "55555555-1111-4555-8555-111111111111",
  "start_time": "2026-08-25T10:00:00.000Z",
  "end_time": "2026-08-25T12:00:00.000Z",
  "course_code": "CS305",
  "faculty_ref": "Dr. R. Nayak"
}
```
**Expected Response `201 Created`**:
```json
{
  "id": "booking-uuid-001",
  "resourceId": "55555555-1111-4555-8555-111111111111",
  "status": "confirmed"
}
```

#### Step 3.3: Attempt Conflicting Booking (Same Time Window)
```http
POST http://localhost:3000/lab-bookings
Content-Type: application/json
x-user-id: 22222222-2222-4222-8222-222222222222
x-user-role: student

{
  "resource_id": "55555555-1111-4555-8555-111111111111",
  "start_time": "2026-08-25T11:00:00.000Z",
  "end_time": "2026-08-25T13:00:00.000Z",
  "course_code": "CS301",
  "faculty_ref": "Dr. S. Mohanty"
}
```
**Expected Response `409 Conflict`**:
```json
{
  "code": "SLOT_CONFLICT",
  "message": "Lab resource is already booked during the requested time window."
}
```

---

### Scenario 4: Academic Evaluation Grievance & SLA Escalation

**Goal**: Student files a re-evaluation grievance for DBMS paper. Exam staff views and escalates grievance level.

#### Step 4.1: Student Files Grievance
```http
POST http://localhost:3000/grievances
Content-Type: application/json
x-user-id: 22222222-2222-4222-8222-222222222222
x-user-role: student

{
  "category": "academic_evaluation",
  "description": "Requesting paper re-evaluation for CS301 DBMS mid-sem (marks recorded: 38/50).",
  "anonymous": false
}
```
**Expected Response `201 Created`**:
```json
{
  "id": "griev-uuid-8818",
  "category": "academic_evaluation",
  "status": "open",
  "escalationLevel": 1,
  "slaDueAt": "2026-08-28T18:30:00.000Z"
}
```

#### Step 4.2: Exam Staff Escalates Grievance to HOD Review (Level 2)
```http
POST http://localhost:3000/grievances/griev-uuid-8818/escalate
Content-Type: application/json
x-user-id: 33333333-3333-4333-8333-444444444444
x-user-role: staff
x-department-id: aaaaaaaa-aaaa-4aaa-8aaa-444444444444

{}
```
**Expected Response `200 OK`**:
```json
{
  "id": "griev-uuid-8818",
  "escalation_level": 2,
  "status": "open"
}
```

---

### Scenario 5: Admin System Audit & Hash-Chain Integrity Verification

**Goal**: Admin verifies cryptographic hash-chain tamper prevention log.

#### Step 5.1: Verify Audit Hash-Chain Integrity
```http
GET http://localhost:3000/audit/verify
x-user-id: 11111111-1111-4111-8111-111111111111
x-user-role: admin
```
**Expected Response `200 OK`**:
```json
{
  "verified": true,
  "total_entries": 42,
  "last_entry_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
}
```

---

## Summary Checklist for Testers

| Purpose | Persona & Header | Endpoint | Key Test Criteria |
|---|---|---|---|
| Fee Receipt RAG | `student` (`2222...22`) | `POST /agent/session/:id/message` | RAG correctly reads `fee_payments` DB record `#RCPT-2026-084521`. |
| Certificate HITL | `student` -> `staff` (`3333...33`) | `POST /approvals/:id/approve` | High-risk step requires manual staff sign-off. |
| Lab Reservation | `lab_incharge` / `student` | `POST /lab-bookings` | Prevents overlapping time window bookings with `409 Conflict`. |
| Grievance SLA | `student` -> `staff` | `POST /grievances/:id/escalate` | Escalates grievance to Level 2. |
| Cryptographic Audit | `admin` (`1111...11`) | `GET /audit/verify` | Returns `verified: true` for tamper prevention. |
