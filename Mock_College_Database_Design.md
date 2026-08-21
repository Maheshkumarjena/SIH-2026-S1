# Campus Service Copilot — Mock College Database Design

Companion to `prisma/schema.prisma`. This document extends the existing schema (users, departments, service_requests, lab_resources, lab_bookings, grievances, audit_logs, etc.) with the additional tables needed to make the agent's queries and tool calls resolve against real, interconnected data instead of stubs.

Design principle: every table exists because a demo use case needs to query or write to it. Nothing here is decorative.

---

## 0. Naming conventions

- All PKs are `id UUID`.
- All FKs are named `<referenced_table_singular>_id`.
- Timestamps: `created_at`, `updated_at` where mutation matters.
- This doc uses snake_case for readability; map to Prisma camelCase fields as done elsewhere in the schema (e.g. `department_id` → `departmentId`).

---

## 1. Academic Structure — Departments → Sections → Students

### 1.1 `departments` *(already in schema — extend)*

| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | TEXT | e.g. "Computer Science & Engineering" |
| code | TEXT UNIQUE | e.g. "CSE" — used by the agent to resolve "CSE lab" → department |
| type | TEXT | `academic` \| `hostel` \| `lab` \| `administrative` |
| hod_user_id | UUID FK → users.id NULL | Head of Department |

Sample:
```
id=dept-cse   name="Computer Science & Engineering"  code="CSE"  type=academic
id=dept-ece   name="Electronics & Communication Engg" code="ECE" type=academic
id=dept-mech  name="Mechanical Engineering"           code="MECH" type=academic
id=dept-acad  name="Academic Section"                 code="ACAD" type=administrative
id=dept-exam  name="Examination Section"              code="EXAM" type=administrative
id=dept-acc   name="Accounts & Finance"                code="ACC"  type=administrative
id=dept-hostel name="Hostel Administration"            code="HOSTEL" type=hostel
id=dept-lib   name="Central Library"                   code="LIB"  type=administrative
```

### 1.2 `sections` *(new)*

A section is a specific batch-year-branch cohort, e.g. "CSE 3rd Year Section A". This is the unit the agent checks when booking labs ("book the CSE lab for section A").

| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| department_id | UUID FK → departments.id | |
| name | TEXT | e.g. "A", "B" |
| year | INT | 1–4 |
| semester | INT | 1–8 |
| batch_label | TEXT | e.g. "CSE-3A", denormalized for quick display/search |
| class_teacher_id | UUID FK → faculty.id NULL | |
| strength | INT | headcount, for capacity checks |

Sample:
```
id=sec-cse3a  department_id=dept-cse  name=A  year=3 semester=5 batch_label="CSE-3A" strength=62
id=sec-cse3b  department_id=dept-cse  name=B  year=3 semester=5 batch_label="CSE-3B" strength=58
id=sec-ece2a  department_id=dept-ece  name=A  year=2 semester=3 batch_label="ECE-2A" strength=54
```

### 1.3 `students` *(extends `users` — 1:1)*

Rather than overload `users`, keep academic-specific fields in a child table keyed on `user_id`.

| Field | Type | Notes |
|---|---|---|
| user_id | UUID PK, FK → users.id | |
| registration_no | TEXT UNIQUE | e.g. "21CSE1042" — what the agent asks for/resolves on |
| roll_no | TEXT | section-scoped roll number, e.g. "CSE3A-14" |
| section_id | UUID FK → sections.id | |
| admission_year | INT | |
| status | TEXT | `active` \| `graduated` \| `dropped` \| `on_leave` |
| guardian_name | TEXT | |
| guardian_phone | TEXT | |

Sample:
```
user_id=u-stud-1  registration_no="21CSE1042" roll_no="CSE3A-14" section_id=sec-cse3a admission_year=2021 status=active
user_id=u-stud-2  registration_no="22ECE1005" roll_no="ECE2A-05" section_id=sec-ece2a admission_year=2022 status=active
```

**Why this matters for the demo:** "I need a bonafide certificate" → agent resolves `state.user.id` → `students.user_id` → gets `registration_no`, `section_id` → `sections.department_id` to route the request to the right Academic Section queue, and pulls `admission_year`/`status` to validate eligibility (Layer 3 planning step "validate eligibility").

---

## 2. Faculty & Subjects

### 2.1 `faculty` *(extends `users` — 1:1, role = staff/admin with department)*

| Field | Type | Notes |
|---|---|---|
| user_id | UUID PK, FK → users.id | |
| employee_id | TEXT UNIQUE | |
| department_id | UUID FK → departments.id | |
| designation | TEXT | `Professor` \| `Associate Professor` \| `Assistant Professor` \| `Lab In-charge` |
| is_lab_incharge | BOOLEAN | flags eligibility for lab-booking approvals |
| is_hod | BOOLEAN | |

Sample:
```
user_id=u-fac-1 employee_id="EMP-CSE-011" department_id=dept-cse designation="Assistant Professor" is_lab_incharge=true  is_hod=false
user_id=u-fac-2 employee_id="EMP-CSE-002" department_id=dept-cse designation="Professor"            is_lab_incharge=false is_hod=true
```

### 2.2 `subjects` *(new)*

| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| department_id | UUID FK → departments.id | owning department |
| code | TEXT UNIQUE | e.g. "CS301" — used as `course_code` on lab bookings |
| name | TEXT | e.g. "Database Management Systems" |
| semester | INT | |
| requires_lab | BOOLEAN | |

Sample:
```
id=sub-cs301 department_id=dept-cse code="CS301" name="Database Management Systems" semester=5 requires_lab=true
id=sub-cs305 department_id=dept-cse code="CS305" name="Operating Systems Lab"        semester=5 requires_lab=true
```

### 2.3 `section_subject_faculty` *(join table — teaching assignments)*

| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| section_id | UUID FK → sections.id | |
| subject_id | UUID FK → subjects.id | |
| faculty_id | UUID FK → faculty.user_id | |

Sample: `sec-cse3a + sub-cs305 + u-fac-1` — this is what lets the agent auto-fill `faculty_ref` when a lab booking is made "for CS305".

---

## 3. Labs — Department-specific + Common, Slots, Bookings

This extends the existing `lab_resources` / `lab_bookings` tables with a few fields needed for section-aware, capacity-aware, conflict-checked booking — the core of the "book the CSE lab tomorrow 2–4 PM" use case.

### 3.1 `lab_resources` *(already in schema — extend)*

| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | TEXT | e.g. "CSE Programming Lab 1" |
| department_id | UUID FK → departments.id NULL | NULL = common/shared lab (e.g. central computing lab, open to all branches) |
| capacity | INT | |
| restrictions | TEXT NULL | e.g. "Course code or faculty reference required." |
| lab_type | TEXT | `programming` \| `hardware` \| `seminar_hall` \| `workshop` — lets one table cover labs *and* seminar halls if desired, or keep seminar halls separate (see 3.4) |
| lab_incharge_id | UUID FK → faculty.user_id NULL | who approves Medium/High-risk booking overrides |
| location | TEXT | building/floor, for the confirmation message |

Sample:
```
id=lab-cse-prog1  name="CSE Programming Lab 1"    department_id=dept-cse capacity=60 lab_type=programming lab_incharge_id=u-fac-1 location="CS Block, 2nd Floor"
id=lab-cse-prog2  name="CSE Programming Lab 2"    department_id=dept-cse capacity=60 lab_type=programming lab_incharge_id=u-fac-1 location="CS Block, 2nd Floor"
id=lab-ece-hw1    name="ECE Hardware Lab"          department_id=dept-ece capacity=40 lab_type=hardware    lab_incharge_id=u-fac-3 location="ECE Block, 1st Floor"
id=lab-central    name="Central Computing Lab"     department_id=NULL     capacity=100 lab_type=programming lab_incharge_id=u-fac-1 location="Main Block, Ground Floor"
```
(`lab-central` matches the already-seeded resource in `prisma/seed.js`.)

### 3.2 `lab_bookings` *(already in schema — extend)*

| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| resource_id | UUID FK → lab_resources.id | |
| user_id | UUID FK → users.id | booker (usually faculty, sometimes the agent on behalf of a student rep) |
| section_id | UUID FK → sections.id NULL | which section the slot is booked for — this is the key check for "is this lab already booked by another section" |
| start_time | TIMESTAMPTZ | |
| end_time | TIMESTAMPTZ | |
| status | TEXT | `confirmed` \| `cancelled` |
| course_code | TEXT NULL | FK-ish to subjects.code |
| faculty_ref | TEXT NULL | |

DB-level guarantee (already specified in backend annex): `EXCLUDE USING gist (resource_id WITH =, tstzrange(start_time,end_time) WITH &&) WHERE (status='confirmed')` — this is what makes "double booking structurally impossible" true regardless of which section asks.

Sample:
```
id=bk-1 resource_id=lab-cse-prog1 user_id=u-fac-1 section_id=sec-cse3a start_time=2026-08-22T14:00Z end_time=2026-08-22T16:00Z status=confirmed course_code="CS305" faculty_ref="Dr. R. Nayak"
```
Agent flow for "Book the CSE lab tomorrow from 2–4 PM": resolve "CSE lab" → candidate `lab_resources` where `department_id=dept-cse OR department_id IS NULL`; call `check_lab_availability` against each candidate for the requested window; if `lab-cse-prog1` is free, propose it; `book_lab_slot` inserts into `lab_bookings` with the caller's `section_id` resolved from `students.section_id` (if student) or from the faculty's assigned section.

### 3.3 `lab_slots` *(new — optional, for a fixed-timetable view)*

If the demo wants a recurring weekly timetable (not just ad-hoc bookings), add:

| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| resource_id | UUID FK → lab_resources.id | |
| section_id | UUID FK → sections.id | |
| day_of_week | INT | 0=Mon..6=Sun |
| start_time | TIME | |
| end_time | TIME | |
| subject_id | UUID FK → subjects.id NULL | |

This is a *template*; `lab_bookings` remains the source of truth for actual occupied windows (recurring slots get materialized into `lab_bookings` rows, or checked as a recurring constraint at booking time). For a 1-day demo, `lab_bookings` alone is sufficient — treat `lab_slots` as a stretch table.

### 3.4 `seminar_halls` *(new — separate from labs since booking rules differ: no course_code requirement, longer durations, event-based)*

| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | TEXT | e.g. "Main Auditorium", "CSE Seminar Hall" |
| department_id | UUID FK → departments.id NULL | NULL = common |
| capacity | INT | |
| has_projector | BOOLEAN | |
| has_ac | BOOLEAN | |
| location | TEXT | |

### 3.5 `seminar_hall_bookings` *(new)*

| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| hall_id | UUID FK → seminar_halls.id | |
| booked_by_user_id | UUID FK → users.id | |
| purpose | TEXT | e.g. "Guest lecture", "Department seminar" |
| start_time | TIMESTAMPTZ | |
| end_time | TIMESTAMPTZ | |
| status | TEXT | `confirmed` \| `cancelled` |
| approval_required | BOOLEAN | halls above a capacity threshold or the main auditorium require HITL approval (Medium/High risk) |

Sample:
```
id=hall-1 name="Main Auditorium"        department_id=NULL    capacity=400 has_projector=true has_ac=true location="Admin Block"
id=hall-2 name="CSE Seminar Hall"       department_id=dept-cse capacity=80  has_projector=true has_ac=true location="CS Block, 3rd Floor"
```

Same `EXCLUDE`-constraint pattern as `lab_bookings` prevents double-booking a hall.

---

## 4. Administrative Sections: Exam, Accounts, Hostel, Library

### 4.1 `exam_records` *(new — backs "what's my exam status", grievance re-evaluation flows)*

| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| student_id | UUID FK → students.user_id | |
| subject_id | UUID FK → subjects.id | |
| exam_type | TEXT | `mid_sem` \| `end_sem` \| `supplementary` |
| marks_obtained | NUMERIC NULL | |
| max_marks | NUMERIC | |
| status | TEXT | `pending` \| `published` \| `under_review` |
| published_at | TIMESTAMPTZ NULL | |

Sample:
```
id=exam-1 student_id=u-stud-1 subject_id=sub-cs301 exam_type=mid_sem marks_obtained=38 max_marks=50 status=published
```

### 4.2 `fee_structure` *(new)*

| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| department_id | UUID FK → departments.id | |
| year | INT | |
| semester | INT | |
| tuition_fee | NUMERIC | |
| hostel_fee | NUMERIC NULL | |
| exam_fee | NUMERIC | |
| due_date | DATE | |

### 4.3 `fee_payments` *(new — the "has he paid or not" table)*

| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| student_id | UUID FK → students.user_id | |
| fee_structure_id | UUID FK → fee_structure.id | |
| amount_paid | NUMERIC | |
| payment_status | TEXT | `paid` \| `partial` \| `unpaid` \| `overdue` |
| payment_date | TIMESTAMPTZ NULL | |
| receipt_no | TEXT UNIQUE NULL | |
| payment_mode | TEXT NULL | `online` \| `dd` \| `cash` |

Sample:
```
id=pay-1 student_id=u-stud-1 fee_structure_id=fee-cse-3-5 amount_paid=85000 payment_status=paid receipt_no="RCPT-2026-004521" payment_date=2026-07-10T00:00Z payment_mode=online
```

**Fee-receipt use case:** "I need my fees receipt" → agent resolves student via session → `students.registration_no` → looks up `fee_payments WHERE student_id=... AND payment_status='paid'` → if found, `create_request(request_type='fee_receipt')` auto-executes as Low risk (a receipt reprint is reversible/non-consequential); if `payment_status != 'paid'`, the agent responds with the outstanding balance instead of fabricating a receipt — this is exactly the "Fee Refund Policy... underspecified edge case" document already in the KB corpus, now backed by real queryable data.

### 4.4 `hostel_allocations` *(new)*

| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| student_id | UUID FK → students.user_id | |
| hostel_block | TEXT | |
| room_no | TEXT | |
| warden_id | UUID FK → faculty.user_id NULL | ties to a `warden` role user |
| status | TEXT | `active` \| `vacated` |
| allocated_at | DATE | |

### 4.5 `library_records` *(new)*

| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| student_id | UUID FK → students.user_id | |
| book_title | TEXT | |
| issued_at | DATE | |
| due_date | DATE | |
| returned_at | DATE NULL | |
| fine_amount | NUMERIC DEFAULT 0 | |

Backs a "do I have library dues" check, which some institutions gate bonafide-certificate issuance on (a nice conflict-detection demo hook: KB policy says "no dues pending" but the agent must actually check `library_records`/`fee_payments`, not just cite the policy text).

---

## 5. Users & Roles

`users` / `roles` already exist in the schema. The mock data should instantiate every role the demo needs:

| role | maps to | example |
|---|---|---|
| `student` | `students` row | u-stud-1 (CSE 3A), u-stud-2 (ECE 2A) |
| `staff` | `faculty` row, e.g. Academic Section staff processing certificates | u-staff-acad-1 |
| `admin` | no child row required | u-admin-1 |
| `warden` | `faculty` row + `hostel_allocations.warden_id` | u-warden-1 |
| `lab_incharge` | `faculty` row + `lab_resources.lab_incharge_id` | u-fac-1 (dual role: also a subject-teaching faculty) |

Sample `users` rows (fields per existing schema: id, name, email, role, department_id, preferred_language):
```
u-stud-1     Aditi Sharma      aditi.sharma@svc.edu     student       dept-cse
u-stud-2     Rohit Panda       rohit.panda@svc.edu      student       dept-ece
u-fac-1      Dr. R. Nayak      r.nayak@svc.edu          lab_incharge  dept-cse
u-fac-2      Dr. S. Mohanty    s.mohanty@svc.edu        staff         dept-cse   (HOD, also teaches)
u-staff-acad-1 Priya Das       priya.das@svc.edu        staff         dept-acad
u-warden-1   Mr. K. Behera     k.behera@svc.edu         warden        dept-hostel
u-admin-1    Admin User        admin@svc.edu            admin         dept-acad
```

---

## 6. Service Requests, Grievances, Approvals, Notifications

These already exist in the schema (`service_requests`, `request_types`, `workflow_steps`, `approvals`, `grievances`, `notifications`, `audit_logs`). What the mock data needs to add is **realistic linkage** so the agent's queries return non-empty, coherent results:

### 6.1 `request_types` — extend the seed beyond certificate/maintenance/lab_booking/grievance/general_query:
```
fee_receipt        default_risk_level=low   default_sla_hours=24
transcript_request default_risk_level=high  default_sla_hours=120
hostel_maintenance default_risk_level=low   default_sla_hours=48
library_noc        default_risk_level=medium default_sla_hours=48
```

### 6.2 Sample `service_requests` tied to the students above:
```
id=req-1 user_id=u-stud-1 request_type=certificate      department_id=dept-acad status=awaiting_approval description="Bonafide certificate for scholarship application" sla_due_at=+72h
id=req-2 user_id=u-stud-2 request_type=hostel_maintenance department_id=dept-hostel status=pending description="AC not cooling in Block C room 214" sla_due_at=+48h
```

### 6.3 Sample `grievances`:
```
id=griev-1 owner_user_id=u-stud-1 category=academic_evaluation description="Requesting re-evaluation of DBMS mid-sem paper" anonymous=false status=open escalation_level=1
```
Cross-reference: `griev-1` can reference `exam_records.id=exam-1` in its description/evidence, so the agent's retrieval + tool-execution can pull the actual marks record when staff review it.

### 6.4 Approvals & Notifications: no new tables — populate `approvals` for `req-1`'s `issue_certificate` step (High risk) and a `notifications` row once staff act on it, exactly per the existing HITL flow already implemented in `approvals.service.ts`.

---

## 7. Full Relationship Map

```
departments 1──* sections 1──* students (via section_id)
departments 1──* faculty
departments 1──* subjects
departments 1──* lab_resources (nullable → common labs)
departments 1──* seminar_halls (nullable → common halls)

users 1──1 students   (role=student)
users 1──1 faculty    (role=staff|admin|warden|lab_incharge)

sections *──* subjects   (via section_subject_faculty, also linking faculty)

lab_resources 1──* lab_bookings *──1 sections
seminar_halls 1──* seminar_hall_bookings *──1 users

students 1──* exam_records *──1 subjects
students 1──* fee_payments *──1 fee_structure
students 1──* hostel_allocations
students 1──* library_records

users 1──* service_requests
service_requests 1──* workflow_steps 1──* approvals
users 1──* grievances (owner_user_id)
users 1──* notifications
* ──* audit_logs (polymorphic entity_type/entity_id)
```

---

## 8. Query Patterns the Agent Will Actually Run

| Use case | Query path |
|---|---|
| "I need a bonafide certificate" | `users.id` → `students.user_id` (registration_no, section_id) → `sections.department_id` → route to `dept-acad` queue → `service_requests.create()` |
| "Book CSE lab tomorrow 2-4 PM" | resolve dept from "CSE" → `lab_resources WHERE department_id=dept-cse OR department_id IS NULL` → for each, `lab_bookings WHERE resource_id=X AND status='confirmed' AND (start,end) overlaps requested window` → pick first free → `book_lab_slot` with `section_id` from caller |
| "Is my fee paid?" | `students.user_id` → `fee_payments WHERE student_id=... ORDER BY payment_date DESC LIMIT 1` |
| "Re-evaluate my DBMS mid-sem" | `students.user_id` + `subjects.code='CS301'` → `exam_records` lookup → `grievances.create(category='academic_evaluation')`, cite `exam_records.id` as evidence |
| "Book the main auditorium for a seminar" | `seminar_halls WHERE name ILIKE '%auditorium%'` → conflict-check `seminar_hall_bookings` → if `approval_required=true`, route to HITL instead of auto-executing |
| Grievance-policy-conflict demo | agent retrieves both `ADMIN-GRIEV-002` and `CIRC-DEPT-2021-014` KB chunks (already seeded) — no DB change needed, this stays a document-level conflict, but a realistic grievance row (`griev-1`) makes the demo end-to-end instead of KB-only |

---

## 9. Prisma Schema Additions (sketch)

Add to `prisma/schema.prisma` (illustrative — align field casing/mapping with existing conventions):

```prisma
model Section {
  id              String    @id @default(uuid()) @db.Uuid
  departmentId    String    @map("department_id") @db.Uuid
  name            String
  year            Int
  semester        Int
  batchLabel      String    @map("batch_label")
  classTeacherId  String?   @map("class_teacher_id") @db.Uuid
  strength        Int
  students        Student[]
  labBookings     LabBooking[]

  @@map("sections")
}

model Student {
  userId          String    @id @map("user_id") @db.Uuid
  registrationNo  String    @unique @map("registration_no")
  rollNo          String    @map("roll_no")
  sectionId       String    @map("section_id") @db.Uuid
  admissionYear   Int       @map("admission_year")
  status          String    @default("active")
  guardianName    String?   @map("guardian_name")
  guardianPhone   String?   @map("guardian_phone")
  user            User      @relation(fields: [userId], references: [id])
  section         Section   @relation(fields: [sectionId], references: [id])
  examRecords     ExamRecord[]
  feePayments     FeePayment[]

  @@map("students")
}

model Faculty {
  userId          String    @id @map("user_id") @db.Uuid
  employeeId      String    @unique @map("employee_id")
  departmentId    String    @map("department_id") @db.Uuid
  designation     String
  isLabIncharge   Boolean   @default(false) @map("is_lab_incharge")
  isHod           Boolean   @default(false) @map("is_hod")
  user            User      @relation(fields: [userId], references: [id])

  @@map("faculty")
}

model Subject {
  id            String   @id @default(uuid()) @db.Uuid
  departmentId  String   @map("department_id") @db.Uuid
  code          String   @unique
  name          String
  semester      Int
  requiresLab   Boolean  @default(false) @map("requires_lab")

  @@map("subjects")
}

model FeePayment {
  id               String   @id @default(uuid()) @db.Uuid
  studentId        String   @map("student_id") @db.Uuid
  amountPaid       Decimal  @map("amount_paid")
  paymentStatus    String   @map("payment_status")
  paymentDate      DateTime? @map("payment_date") @db.Timestamptz
  receiptNo        String?  @unique @map("receipt_no")
  paymentMode      String?  @map("payment_mode")
  student          Student  @relation(fields: [studentId], references: [userId])

  @@map("fee_payments")
}

model ExamRecord {
  id              String    @id @default(uuid()) @db.Uuid
  studentId       String    @map("student_id") @db.Uuid
  subjectId       String    @map("subject_id") @db.Uuid
  examType        String    @map("exam_type")
  marksObtained   Decimal?  @map("marks_obtained")
  maxMarks        Decimal   @map("max_marks")
  status          String    @default("published")
  student         Student   @relation(fields: [studentId], references: [userId])

  @@map("exam_records")
}

model SeminarHall {
  id            String    @id @default(uuid()) @db.Uuid
  name          String
  departmentId  String?   @map("department_id") @db.Uuid
  capacity      Int
  hasProjector  Boolean   @default(false) @map("has_projector")
  hasAc         Boolean   @default(false) @map("has_ac")
  location      String?
  bookings      SeminarHallBooking[]

  @@map("seminar_halls")
}

model SeminarHallBooking {
  id                String   @id @default(uuid()) @db.Uuid
  hallId            String   @map("hall_id") @db.Uuid
  bookedByUserId    String   @map("booked_by_user_id") @db.Uuid
  purpose           String
  startTime         DateTime @map("start_time") @db.Timestamptz
  endTime           DateTime @map("end_time") @db.Timestamptz
  status            String   @default("confirmed")
  approvalRequired  Boolean  @default(false) @map("approval_required")
  hall              SeminarHall @relation(fields: [hallId], references: [id])

  @@map("seminar_hall_bookings")
}
```

Add `sectionId String? @map("section_id") @db.Uuid` + relation to `LabBooking`, and add a `btree_gist` EXCLUDE constraint on `seminar_hall_bookings` mirroring the one already specified for `lab_bookings`.

---

## 10. Seed Script Notes

Extend `prisma/seed.js` with a second pass (`seedAcademicMockData()`) that:
1. Inserts 3–5 departments, 2–3 sections per department, 8–10 students per section (enough for demo variety, not thousands).
2. Inserts 4–6 faculty, at least one flagged `is_lab_incharge=true` per department.
3. Inserts subjects per department + `section_subject_faculty` links.
4. Inserts 2 labs per department + 1 common lab (`lab-central`, already present) + 2 seminar halls.
5. Inserts a handful of `fee_payments` — mix of `paid`/`unpaid`/`overdue` so the fee-receipt demo can show both branches.
6. Inserts 2–3 `exam_records` per student for at least one subject, to back a grievance re-evaluation demo.
7. Leaves `lab_bookings` mostly empty except one pre-existing booking, so the "book tomorrow 2–4 PM" demo call visibly succeeds (empty slot) and a repeated call on the *same* slot visibly 409s (conflict demo, mirrors the Postman test already documented in the backend annex).

This keeps the corpus small enough for a live demo (fast queries, easy to reason about on stage) while touching every table the Copilot needs to prove out its four core workflows plus the two stretch ones (fee receipt, seminar hall booking).
