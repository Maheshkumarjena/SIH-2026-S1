# Campus Service Copilot — Frontend Integration Guide & Backend Context

This document provides complete technical context for the **Frontend Development Team** to integrate with the updated backend APIs, relational college database, AI agent workflows, and Human-in-the-Loop (HITL) approval interfaces.

---

## 🚀 1. Overview of Backend Updates

The backend has transitioned from a stubbed database to a **fully relational, multi-departmental college database system** backed by Neon PostgreSQL, Prisma ORM, pgvector hybrid policy retrieval (RAG), and a LangGraph state machine.

### Key Functional Highlights for Frontend:
1. **Academic Standing & Identity Resolution**: The Copilot automatically resolves student registration numbers, roll numbers, sections, batches, and current academic year without forcing users to type them manually.
2. **Education Loan Enrollment & Fee Certificate Flow**: The Copilot aggregates annual scheduled fees (tuition, hostel, exam) and payment balances (amount paid vs. net outstanding balance) to auto-generate loan certificates.
3. **Staff HITL Evidence Payload**: High-risk approval steps in the staff `/approvals` dashboard now attach full verified financial and academic evidence inside `contextJson`.
4. **Digital Certificates & Printable Document Payload**: Issued certificates produce both cryptographic SHA-256 HMAC signatures and printable letterhead document payloads (`SOA-CERT-2026-XXXXX`).
5. **Section-Aware Lab & Seminar Hall Bookings**: Supports department-filtered resources, section-aware lab bookings, auditorium HITL capacity checks (>200 capacity), and database-level conflict enforcement (`409 SLOT_CONFLICT`).

---

## 🗄️ 2. Database Schema & Data Models Summary

### Academic Structure
- **`departments`**: `id`, `name`, `code` (`CSE`, `ECE`, `MECH`, `ACAD`, `EXAM`, `ACC`, `HOSTEL`, `LIB`), `type` (`academic`, `hostel`, `lab`, `administrative`), `hod_user_id`.
- **`sections`**: `id`, `department_id`, `name`, `year` (1–4), `semester` (1–8), `batch_label` (e.g. `CSE-3A`), `strength`.
- **`students`** (1:1 with `User`): `user_id`, `registration_no` (e.g. `21CSE1042`), `roll_no` (e.g. `CSE3A-14`), `section_id`, `admission_year`, `status` (`active`), `guardian_name`, `guardian_phone`.
- **`faculty`** (1:1 with `User`): `user_id`, `employee_id`, `department_id`, `designation`, `is_lab_incharge`, `is_hod`.
- **`subjects`**: `id`, `department_id`, `code` (e.g. `CS301`), `name`, `semester`, `requires_lab`.
- **`section_subject_faculty`**: Join table mapping section + subject + teaching faculty.

### Facilities & Bookings
- **`lab_resources`**: `id`, `name`, `department_id` (null = common lab), `capacity`, `lab_type` (`programming`, `hardware`), `location`.
- **`lab_bookings`**: `id`, `resource_id`, `user_id`, `section_id`, `start_time`, `end_time`, `status` (`confirmed`, `cancelled`), `course_code`, `faculty_ref`.
- **`seminar_halls`**: `id`, `name`, `department_id` (null = main auditorium), `capacity`, `has_projector`, `has_ac`, `location`.
- **`seminar_hall_bookings`**: `id`, `hall_id`, `booked_by_user_id`, `purpose`, `start_time`, `end_time`, `status` (`confirmed`, `pending_approval`), `approval_required`.

### Administrative & Financial
- **`fee_structure`**: `id`, `department_id`, `year`, `semester`, `tuition_fee`, `hostel_fee`, `exam_fee`, `due_date`.
- **`fee_payments`**: `id`, `student_id`, `fee_structure_id`, `amount_paid`, `payment_status` (`paid`, `partial`, `unpaid`), `receipt_no`, `payment_mode`.
- **`exam_records`**: `id`, `student_id`, `subject_id`, `exam_type` (`mid_sem`, `end_sem`), `marks_obtained`, `max_marks`, `status`.
- **`hostel_allocations`**: `id`, `student_id`, `hostel_block`, `room_no`, `warden_id`, `status`.
- **`library_records`**: `id`, `student_id`, `book_title`, `issued_at`, `due_date`, `fine_amount`.

---

## 🔌 3. New REST API Endpoints for Frontend Integration

### 3.1 Student Academic & Financial API (`/students`)

| Endpoint | Method | Persona | Description | Use in Frontend |
|---|---|---|---|---|
| `/students/me/profile` | `GET` | Student | Returns student registration no, section, batch, department details | Display student identity card on profile page / header |
| `/students/me/annual-fee-summary` | `GET` | Student | Accepts optional `?year=X`. Returns total scheduled fee, paid amount, net outstanding, and receipt no | Render fee breakdown modal for education loan application |
| `/students/me/fee-status` | `GET` | Student | Returns payment history and semester fee structure | Render Fee Payments tab / receipt download table |
| `/students/me/exam-records` | `GET` | Student | Accepts optional `?course_code=CS301`. Returns exam marks and paper status | Render Academic Marks card & grievance trigger button |

#### Response Sample (`GET /students/me/annual-fee-summary?year=3`):
```json
{
  "student": {
    "registrationNo": "21CSE1042",
    "name": "Aditi Sharma",
    "departmentName": "Computer Science & Engineering"
  },
  "academicYear": 3,
  "totalTuitionFee": 75000,
  "totalHostelFee": 10000,
  "totalExamFee": 2000,
  "totalAnnualScheduledFee": 87000,
  "totalAmountPaid": 87000,
  "outstandingBalance": 0,
  "isFullyPaid": true,
  "paymentStatus": "paid",
  "recentReceiptNo": "RCPT-2026-004521"
}
```

---

### 3.2 Seminar Halls & Auditorium API (`/seminar-halls`)

| Endpoint | Method | Persona | Description | Use in Frontend |
|---|---|---|---|---|
| `/seminar-halls` | `GET` | Any | Returns list of seminar halls and Main Auditorium | Render hall selection cards / filters |
| `/seminar-halls/:id/availability` | `GET` | Any | Accepts `?start_time=...&end_time=...`. Returns availability & HITL approval flag | Display time slot availability badge |
| `/seminar-halls/book` | `POST` | Any | Reserves hall. Halls with capacity $\ge$ 200 return `status: pending_approval` | Submit booking form. Alert user if staff sign-off required |

#### Response Sample (`POST /seminar-halls/book`):
```json
{
  "id": "aud_bk_901",
  "hallId": "99999999-9999-4999-8999-111111111111",
  "purpose": "Annual Tech Symposium Opening Ceremony",
  "startTime": "2026-08-25T09:00:00.000Z",
  "endTime": "2026-08-25T13:00:00.000Z",
  "status": "pending_approval",
  "approvalRequired": true,
  "hall": {
    "name": "Main Auditorium",
    "capacity": 400
  }
}
```

---

### 3.3 Human-in-the-Loop Approvals API (`/approvals`)

The staff dashboard (`/approvals`) has been updated to deliver rich evidence context so staff do not approve blindly.

| Endpoint | Method | Persona | Description | Use in Frontend |
|---|---|---|---|---|
| `/approvals/pending` | `GET` | Staff / Admin | Returns pending approval steps with complete `contextJson` evidence | Render Staff Approvals Table with evidence drawer |
| `/approvals/:id/approve` | `POST` | Staff / Admin | Approves step, executes tool action, updates request status | Handle "Approve" button action |
| `/approvals/:id/reject` | `POST` | Staff / Admin | Rejects step with mandatory explanation | Handle "Reject" modal with reason textarea |

#### Response Sample (`GET /approvals/pending`):
```json
{
  "items": [
    {
      "id": "appr_loan_909",
      "workflowStepId": "step_701",
      "stepName": "Issue bonafide loan certificate",
      "toolName": "issue_certificate",
      "riskLevel": "high",
      "contextJson": {
        "registration_no": "21CSE1042",
        "student_name": "Aditi Sharma",
        "year": 3,
        "batch_label": "CSE-3A",
        "total_annual_fee": 87000,
        "amount_paid": 87000,
        "outstanding_balance": 0,
        "purpose": "education_loan"
      }
    }
  ]
}
```

---

## 🔄 4. End-to-End Application UI Workflows

---

### Workflow A: Education Loan Enrollment & Fee Certificate (Student $\rightarrow$ Copilot $\rightarrow$ Staff Sign-Off)

```
[Student Chat Interface]
 └── Prompt: "I need a bonafide enrollment certificate for my education loan sanction"
         │
         ▼
[Copilot Graph Execution]
 ├── Auto-resolves identity: Aditi Sharma (21CSE1042, CSE 3rd Year)
 ├── Aggregates 3rd Year Fee: Scheduled ₹87,000 | Paid ₹87,000 | Outstanding ₹0
 ├── Creates ServiceRequest (Type: certificate)
 └── Schedules tool `issue_certificate` as HIGH Risk
         │
         ▼
[Staff Dashboard: /approvals]
 ├── Staff sees pending approval with exact financial breakdown in context drawer
 └── Staff clicks "Approve & Sign"
         │
         ▼
[Document Generation & Student UI]
 ├── Certificate issued with Serial No: SOA-CERT-2026-8A19F & HMAC SHA-256 Signature
 └── Student UI renders printable letterhead document with Registrar Verification Block
```

---

### Workflow B: Lab Booking & Section Conflict Prevention

1. **Faculty UI**: Selects lab resource (`CSE Programming Lab 1`), picks time slot (`2:00 PM – 4:00 PM`), selects Section (`CSE-3A`), and submits.
2. **Backend**: Saves booking record (`status: confirmed`).
3. **Conflict Attempt**: Another user attempts to book the same lab for overlapping times.
4. **Backend Response**: Returns `409 Conflict` (`SLOT_CONFLICT`).
5. **Frontend UI Handling**: Catch `409` error code, display red warning toast: *"This lab slot is already reserved by Section CSE-3A for CS305 Operating Systems Lab"*, and prompt user to select an alternate free lab (`CSE Programming Lab 2` or `Central Computing Lab`).

---

### Workflow C: Academic Re-Evaluation Grievance & Escalation

1. **Student UI**: Views exam marks (`GET /students/me/exam-records`). Notices DBMS mid-sem marks: `38/50`.
2. **Grievance Trigger**: Clicks "Request Re-evaluation" $\rightarrow$ Posts grievance to `POST /grievances` with category `academic_evaluation` and exam record reference.
3. **Staff / HOD UI**: Academic Section staff inspects open grievances (`GET /grievances?category=academic_evaluation`).
4. **Escalation Action**: Clicks "Escalate to HOD" $\rightarrow$ Calls `POST /grievances/:id/escalate`.
5. **Real-time Push**: WebSocket event `grievance.escalated` is pushed to student's interface, updating status badge to **"Escalated to Level 2 (HOD Review)"**.

---

### Workflow D: Fee Receipt Reprint & Unpaid Edge Case

1. **Paid Student Flow (Aditi Sharma)**:
   - Asks Copilot: *"Can I get my 3rd year fee receipt?"*
   - Backend detects `paymentStatus = 'paid'` and receipt `RCPT-2026-004521`.
   - Tool `create_request` executes as **Low Risk** automatically.
   - Copilot returns receipt card in chat with download link.

2. **Unpaid Student Flow (Rohit Panda)**:
   - Asks Copilot: *"I need a fee payment receipt."*
   - Backend detects `paymentStatus = 'unpaid'` and outstanding balance `₹87,000`.
   - Copilot responds with structured payment warning card: *"No fee payment receipt is available because your 2nd Year balance of ₹87,000 is outstanding. Click below to proceed to Online Fee Payment."*

---

## 🔑 5. Development Headers for Frontend Persona Testing

To test role-based UI views without running full login flows, set mock headers in dev requests:

```http
# Student Persona (Fee Paid, 3rd Year CSE)
x-user-id: 22222222-2222-4222-8222-222222222222
x-user-role: student
x-department-id: aaaaaaaa-aaaa-4aaa-8aaa-111111111111

# Student Persona (Fee Unpaid, 2nd Year ECE)
x-user-id: 44444444-4444-4444-8444-444444444444
x-user-role: student
x-department-id: aaaaaaaa-aaaa-4aaa-8aaa-222222222222

# Academic Staff Persona (Approver)
x-user-id: 33333333-3333-4333-8333-333333333333
x-user-role: staff
x-department-id: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa

# Faculty & Lab In-Charge Persona
x-user-id: 55555555-1111-4555-8555-111111111111
x-user-role: lab_incharge
x-department-id: aaaaaaaa-aaaa-4aaa-8aaa-111111111111
```
