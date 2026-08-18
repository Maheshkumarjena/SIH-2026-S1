# Frontend Pages, Features, And API Mapping

This document maps the current Campus Service Copilot backend to the frontend screens needed for the SOA IDEATHON-S1 project. It follows the implemented NestJS API, the agentic workflow, and the institutional-doc RAG flow.

## Global Frontend Setup

Use `http://localhost:3000` as the API base URL in development.

Auth should prefer HTTP-only cookies with `credentials: "include"`. Bearer tokens are also returned for clients that store access tokens in memory.

Realtime should connect with Socket.IO to:

```text
/ws?user_id=<current_user_id>&session_id=<active_agent_session_id>
```

Listen to the server event name `event` and branch on `event.type`.

## Public/Auth Pages

### Login Page

Purpose: allow registered students, staff, wardens, lab in-charges, and admins to enter the app.

Features:

- Email/password login.
- Stores user profile from response in app state.
- Uses HTTP-only auth cookies automatically.
- Shows invalid credential errors.

APIs:

- `POST /auth/login`
- `GET /users/me` after refresh or app reload

Expected navigation:

- `student` goes to the student copilot dashboard.
- `staff`, `warden`, and `lab_incharge` go to staff queue dashboard.
- `admin` goes to admin dashboard.

### Register Page

Purpose: create demo/test users.

Features:

- Name, email, password, role, department, preferred language.
- Uses role dropdown: `student`, `staff`, `admin`, `warden`, `lab_incharge`.

APIs:

- `POST /auth/register`

### Session Recovery

Purpose: keep the user signed in after access token expiry.

Features:

- On `401`, call refresh once.
- Retry failed request after successful refresh.
- If refresh fails, redirect to login.

APIs:

- `POST /auth/refresh`
- `POST /auth/logout`

## Student App

### Student Home

Purpose: main landing screen after student login.

Features:

- Shows active service requests.
- Shows unread notifications.
- Opens or resumes copilot chat.
- Quick actions: certificate, maintenance, lab booking, grievance.

APIs:

- `GET /users/me`
- `GET /requests?page=1&limit=10`
- `GET /notifications?unread_only=true`
- `POST /agent/session`

### Campus Copilot Chat

Purpose: primary agentic AI experience.

Features:

- Starts an agent session.
- Sends natural-language messages.
- Streams `message.token` as assistant text.
- Renders final `message.complete`.
- Shows citations from `cited_chunk_ids`.
- Shows current plan from `plan.update`.
- Shows approval pause state when `approval.created` arrives.
- Supports English, Hindi, and Odia input.

APIs:

- `POST /agent/session`
- `POST /agent/session/:id/message`
- `GET /agent/session/:id`
- `GET /agent/session/:id/plan`
- WebSocket `message.token`
- WebSocket `message.complete`
- WebSocket `plan.update`
- WebSocket `approval.created`
- WebSocket `approval.status`
- WebSocket `approval.actioned`

Important UI states:

- `accepted: true`: message queued; keep socket open.
- Low-confidence response: show clarification prompt.
- High-risk step: show "waiting for staff approval".
- Policy conflict: show "flagged for admin review".

### My Requests

Purpose: student tracking for requests created manually or by the agent.

Features:

- List requests by status.
- Open request details and workflow timeline.
- Show SLA due date.
- Link back to originating chat session if `session_id` exists.

APIs:

- `GET /requests?page=1&limit=20&status=<status>`
- `GET /requests/:id`
- WebSocket `status.changed`

### Lab Booking

Purpose: allow students/staff to check and book lab slots.

Features:

- List lab resources.
- Date selector.
- Calendar/list of booked slots.
- Booking form with resource, start, end, course code, faculty reference.
- Cancel own booking.

APIs:

- `GET /lab-resources`
- `GET /lab-bookings?resource_id=<id>&date=YYYY-MM-DD`
- `POST /lab-bookings`
- `DELETE /lab-bookings/:id`
- WebSocket `booking.created`
- WebSocket `booking.cancelled`

Validation to show:

- Booking duration must be 1 to 4 hours.
- Conflicting slot returns `SLOT_CONFLICT`.

### Grievance Center

Purpose: file and track grievances, including anonymous grievances.

Features:

- File grievance with category, description, anonymous toggle, evidence URLs.
- List grievances.
- Detail view with status and escalation level.
- Escalation state display.

APIs:

- `POST /grievances`
- `GET /grievances?page=1&status=<status>&escalation_level=<level>`
- `GET /grievances/:id`
- WebSocket `grievance.escalated`

Student escalation is currently restricted by service SLA behavior and staff route role rules.

### Notifications

Purpose: user inbox for system and agent updates.

Features:

- List notifications.
- Filter unread.
- Mark selected as read.
- Mark all as read.
- Follow `deepLink` to chat/request pages.

APIs:

- `GET /notifications?page=1&unread_only=true`
- `POST /notifications/mark-read`
- WebSocket `notification.new`

### Profile/Settings

Purpose: user preferences.

Features:

- Show profile.
- Update preferred language.
- Update notification preferences.
- Logout current device or all devices.

APIs:

- `GET /users/me`
- `PATCH /users/me`
- `POST /auth/logout`

## Staff App

### Staff Dashboard

Purpose: operational queue for staff, wardens, and lab in-charges.

Features:

- Pending approvals.
- Department requests.
- Notifications.
- Quick links to approval detail and request detail.

APIs:

- `GET /approvals`
- `GET /requests?page=1&limit=20`
- `GET /notifications?unread_only=true`
- WebSocket `approval.created`
- WebSocket `notification.new`

### Approval Queue

Purpose: human-in-the-loop review for medium/high-risk agent actions.

Features:

- List pending approvals.
- Show original request.
- Show retrieved evidence and citations.
- Show reasoning trace.
- Show proposed tool and sanitized arguments.
- Show risk level.
- Approve, reject, or request more information.

APIs:

- `GET /approvals`
- `POST /approvals/:id/approve`
- `POST /approvals/:id/reject`
- `POST /approvals/:id/request-info`
- WebSocket `approval.status`
- WebSocket `approval.actioned`

Critical behavior:

- Approve executes the registered tool server-side.
- Reject requires a reason of at least 10 characters.
- Request-info sends the question back into the originating agent session.

### Request Management

Purpose: staff updates service request status.

Features:

- List department requests.
- View request detail and workflow timeline.
- Update request status.

APIs:

- `GET /requests?page=1&limit=20&status=<status>`
- `GET /requests/:id`
- `PATCH /requests/:id/status`
- WebSocket `status.changed`

### Knowledge Base Management

Purpose: upload and manage institutional documents for RAG.

Features:

- List documents and chunk count.
- Add/update Markdown policy documents.
- Search knowledge base for debugging retrieval.
- Show document version/status.

APIs:

- `GET /kb/documents`
- `POST /kb/documents`
- `POST /kb/search`

Recommended frontend behavior:

- Treat documents as institutional source material, not chat instructions.
- Show chunk source fields: document ID, version, page, clause, similarity.

## Admin App

### Admin Dashboard

Purpose: governance overview.

Features:

- Request counts by type/status.
- Resolution trend.
- Bottleneck list.
- Policy conflict queue.

APIs:

- `GET /admin/analytics/requests-summary`
- `GET /admin/analytics/resolution-time`
- `GET /admin/analytics/bottlenecks`
- `GET /admin/analytics/policy-conflicts`

### Audit Explorer

Purpose: inspect hash-chained audit events.

Features:

- Search audit logs by entity type/action.
- View audit trail for a session/request.
- Verify audit chain integrity.

APIs:

- `GET /audit/search?entity_type=<type>&action=<action>&page=1&limit=20`
- `GET /audit/:entityType/:entityId`
- `GET /audit/verify/:entityType/:entityId`

### Policy Conflict Review

Purpose: admin review when retrieved institutional documents conflict.

Features:

- List conflict flags.
- Show document A and document B metadata.
- Link to knowledge base search/documents.
- Marking conflicts resolved is not implemented yet in the current backend.

APIs:

- `GET /admin/analytics/policy-conflicts`
- `GET /kb/documents`
- `POST /kb/search`

## Demo Flow: Bonafide Certificate

Frontend screens involved:

- Student Login.
- Campus Copilot Chat.
- Staff Approval Queue.
- Student Notifications/My Requests.
- Optional Admin Audit Explorer.

Flow:

1. Student logs in with `POST /auth/login`.
2. Student opens chat and calls `POST /agent/session`.
3. Student sends "I need a bonafide certificate for a scholarship application." to `POST /agent/session/:id/message`.
4. Chat listens for `message.token`, `message.complete`, and `plan.update`.
5. Agent creates high-risk approval and emits `approval.created`.
6. Staff opens Approval Queue with `GET /approvals`.
7. Staff approves with `POST /approvals/:id/approve`.
8. Backend verifies student, creates signed certificate, updates workflow, and emits `approval.actioned`.
9. Student sees final `message.complete` and notification through `notification.new`.
10. Admin can inspect audit through `/audit` endpoints.

## Frontend State Modules

Recommended state slices:

- `auth`: user, access token in memory, auth loading, role routing.
- `agent`: active session, messages, streamed text, plan steps, pending approval state.
- `requests`: request list, selected request, status filters.
- `approvals`: pending approvals, selected approval, decision loading.
- `kb`: documents, search results, upload status.
- `labs`: resources, bookings, selected date/resource.
- `grievances`: list, detail, submission status.
- `notifications`: unread count, inbox items.
- `admin`: analytics, policy conflicts, audit search results.

## Route-Level Access

Student routes:

- `/chat`
- `/requests`
- `/labs`
- `/grievances`
- `/notifications`
- `/settings`

Staff routes:

- `/staff`
- `/staff/approvals`
- `/staff/requests`
- `/staff/kb`

Admin routes:

- `/admin`
- `/admin/audit`
- `/admin/policy-conflicts`
- `/admin/kb`

Backend-enforced route roles already exist for approvals, request status update, KB document upload, grievance escalation, audit, and admin analytics.
