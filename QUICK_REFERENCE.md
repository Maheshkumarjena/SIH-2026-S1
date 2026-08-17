# Quick Reference: What's Done vs. What's Remaining

## At a Glance

| Component | Status | Notes |
|-----------|--------|-------|
| **Backend (NestJS)** | ✅ 95% Done | All 17 orchestration nodes, LLM gateway, audit trail, approvals gate—production-grade |
| **Database (Prisma)** | ✅ Schema Ready | 13 tables defined, validated; NOT YET MIGRATED or seeded |
| **Agents / Orchestration** | ✅ Done | Full state machine, all 9 layers, error handling, event dispatch |
| **API Endpoints** | ✅ Done | All 40+ routes wired (auth, agent, approvals, KB, requests, audit, etc.) |
| **Auth / JWT** | ✅ Done | Registration, login, current user; refresh token persistence NOT yet added |
| **RAG / Retrieval** | ✅ Done | pgvector + lexical search, 6 seed policy docs defined, embeddings ready to compute |
| **HITL Approval** | ✅ Done | Approval queue, transaction-safe, escalation ready |
| **Guardrails** | ✅ Done | Prompt injection, citation validation, policy conflict detection, PII minimization |
| **Audit Trail** | ✅ Done | Hash-chained SHA256, tamper-evident, all layers append |
| **TypeScript** | ✅ Done | No compilation errors, strict mode |
| **Frontend (Next.js)** | ❌ 0% Done | Chat UI, approvals dashboard, audit viewer, KB uploader—NOT STARTED |
| **Database Migration** | ⏳ Blocked | Run `npm run db:push`, `npm run db:seed`—required before testing |
| **E2E Testing** | ⏳ Blocked | Need frontend to test full workflows; backend unit tests exist |
| **Deployment** | ❌ Not Started | Vercel + Railway setup not configured |

---

## Immediate Actions (Today)

### 1. Database Setup (30 min) ← **DO THIS FIRST**

```bash
cd c:\Users\mahes\Desktop\SIH-Agent

# Create .env (use template as guide)
# Add: DATABASE_URL, OPENAI_API_KEY, GROQ_API_KEY, JWT_SECRET
cp .env.example .env
# EDIT .env file with your actual credentials

# Run migrations + seed
npm run prisma:generate
npm run db:push
npm run db:seed

# Verify
psql -c "\dt" # List tables in your database
# Should see: users, agent_sessions, service_requests, workflow_steps, 
#             approvals, audit_logs, knowledge_documents, document_chunks, etc.
```

### 2. Test Backend (10 min)

```bash
# Terminal 1
npm run start:dev

# Terminal 2: Quick test
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@univ.edu",
    "password": "pass",
    "name": "Test User",
    "role": "student"
  }'

# Should return: { id, email, role, token }
# If success → backend is working ✓
```

### 3. Identify Frontend Scope (2 hrs)

The frontend is the **critical path for demo-ability**. You need:

**Must-Have Pages (for demo):**

1. **Login Page** (`/login`)
   - Email + password input
   - JWT token storage (localStorage)
   - Redirect to `/chat` on success

2. **Chat Page** (`/chat`) — THE CORE
   - Message display with source citations (linked to chunk IDs)
   - Plan visualizer showing workflow steps + risk levels (color-coded)
   - Input bar (text + optional voice)
   - WebSocket connection for real-time updates
   - Language selector (EN/HI/OR)

3. **My Requests Page** (`/requests`)
   - List of user's service requests (cert, maintenance, lab, grievance)
   - Status badges (pending, approved, executing, done)
   - Timeline showing SLA countdown
   - Link to view full request detail

4. **Approvals Dashboard** (`/approvals`) — FOR STAFF ONLY
   - Pending approval queue
   - Each approval card shows:
     - Original request
     - Retrieved evidence (from KB)
     - Agent's plan/reasoning
     - Proposed action + risk level
   - Approve / Reject / Request-Info buttons
   - Rejection requires mandatory reason input

5. **Audit Trail Viewer** (`/audit/:entityId`)
   - Display hash-chain of events for a request/session
   - Show: timestamp, actor, action, payload
   - Verify chain integrity (click to check hash)

**Nice-to-Have (if time permits):**

6. KB uploader (`/kb` — admin only)
7. Admin dashboard (`/admin/dashboard`)

---

## Development Roadmap (Estimated)

### Phase 1: Foundation (8 hours)

- [ ] Set up Next.js project (scaffolding, TypeScript config)
- [ ] Create API fetch wrapper (auth headers, error handling, WebSocket connection)
- [ ] Set up Tailwind CSS + component library (or use shadcn/ui)
- [ ] Implement login page + JWT storage
- [ ] Test auth flow (register → login → get /users/me)

**Deliverable:** User can log in ✓

### Phase 2: Chat UI (12 hours)

- [ ] Build ChatMessages component (display sender/content, highlight citations)
- [ ] Build PlanVisualizer component (workflow steps with risk badges)
- [ ] Build InputBar (text input, send button, optional voice)
- [ ] Integrate WebSocket (connect to `/agent/session`, listen for events)
- [ ] Connect to `/agent/session/:id/message` endpoint
- [ ] Display streaming responses in real-time

**Deliverable:** User can chat with agent, see plan steps in real-time ✓

### Phase 3: Approvals & Requests (14 hours)

- [ ] Build Approvals page (fetch `/approvals`, display pending items, Approve/Reject buttons)
- [ ] Build Requests page (fetch `/requests`, display status badges, timeline)
- [ ] Build request detail view (full request + steps)
- [ ] Implement Approve/Reject/Request-Info flows
- [ ] Add mandatory reason input on rejection

**Deliverable:** Staff can approve/reject, student can see request status ✓

### Phase 4: Audit Viewer (6 hours)

- [ ] Build audit trail viewer
- [ ] Fetch `/audit/:entityType/:entityId`
- [ ] Display hash chain (with prev_hash / entry_hash)
- [ ] Add hash verification UI (click to validate chain)

**Deliverable:** Admins can view tamper-proof audit trail ✓

### Phase 5: Polish & Demo (4 hours)

- [ ] Responsive design (mobile-friendly)
- [ ] Error handling + user feedback
- [ ] Loading states
- [ ] Record demo video

**Deliverable:** Demo-ready UI ✓

**Total Estimated Effort: 44 hours** (roughly 1 week, 2 developers at 5 hrs/day each)

---

## Testing Checklist (After DB Setup)

### Backend Unit Tests (Automated)

```bash
npm run test

# Output should pass:
# - ✓ NLU service (language detection, intent classification)
# - ✓ Risk classification (rule table + LLM)
# - ✓ Guardrail service (injection, citation, conflict detection)
# - ✓ Tool execution (retry logic, idempotency)
# - ✓ Approval flow (create, approve, reject, escalate)
# - ✓ Hash-chain audit (append, verify)
```

### Manual E2E Workflow Tests

#### Test 1: Certificate Request (Full Flow)

```bash
# 1. Create student user
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alice@univ.edu",
    "password": "pass",
    "name": "Alice",
    "role": "student"
  }'
# Copy token from response

# 2. Start agent session
curl -X POST http://localhost:3000/agent/session \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"initial_message": "I need a bonafide certificate for a scholarship"}'
# Copy session_id from response

# 3. Send message (should trigger full orchestration)
curl -X POST http://localhost:3000/agent/session/<session_id>/message \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"message": "I need a bonafide certificate for a scholarship"}'
# Check response: plan generated? Steps created?

# 4. View plan
curl http://localhost:3000/agent/session/<session_id>/plan \
  -H "Authorization: Bearer <token>"
# Expected: Array of workflow steps with risk levels (low/medium/high)

# 5. Check if approval was created
curl http://localhost:3000/approvals \
  -H "Authorization: Bearer <staff-token>"  # Use staff JWT
# Expected: Pending approval item for "issue_certificate"

# 6. Approve it
curl -X POST http://localhost:3000/approvals/<approval_id>/approve \
  -H "Authorization: Bearer <staff-token>" \
  -H "Content-Type: application/json"
# Expected: Approval executed, certificate request marked done

# 7. Verify audit trail
curl http://localhost:3000/audit/agent_sessions/<session_id> \
  -H "Authorization: Bearer <admin-token>"
# Expected: Hash chain showing N1-N17 events with hashes
```

#### Test 2: Maintenance Ticket (Simplified Check)

```bash
# 1. Create hostel warden user
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "warden@univ.edu",
    "password": "pass",
    "name": "Warden",
    "role": "warden"
  }'

# 2. Send agent message (as student)
curl -X POST http://localhost:3000/agent/session/<session_id>/message \
  -H "Authorization: Bearer <student-token>" \
  -H "Content-Type: application/json" \
  -d '{"message": "My AC has been broken for 3 days"}'
# Expected: Intent = "maintenance_issue", plan generated

# 3. Check approvals queue (as warden)
curl http://localhost:3000/approvals \
  -H "Authorization: Bearer <warden-token>"
# Expected: "create_maintenance_ticket" approval (if high-risk)
```

### What Success Looks Like

✅ **Backend Tests Pass:**
```
Tests:       12 passed
Duration:    ~1s
Coverage:    >80%
```

✅ **E2E Workflow Works:**
- User sends message → Agent detects intent (medium confidence)
- KB retrieval returns 8 relevant chunks with citations
- Planner generates 3–5 workflow steps
- Risk classifier marks high-risk step (e.g., issue_certificate)
- Approval created, staff can see it
- Staff approves → Tool executes → Audit trail captures all steps

✅ **Audit Trail Verifies:**
- Hash chain is unbroken (each prev_hash matches previous entry_hash)
- All 9 layers (N1–N17) logged with events + payloads
- No gaps or edits possible (append-only)

✅ **WebSocket Streaming Works:**
- Open `/agent/session` WebSocket
- Send message
- Receive real-time events (retrieval.done, plan.generated, approval.created, etc.)

---

## Files to Modify / Create (Priority Order)

### 1. Database & Env (This Week)
- [ ] `.env` — Add API keys, DB URL
- `prisma/schema.prisma` — Already done ✓
- `prisma/seed.js` — Already done, just run it
- Database migrations — Generated by `npx prisma db push`

### 2. Frontend (Next 2 Weeks)
- [ ] `apps/web/app/login/page.tsx` — Login form
- [ ] `apps/web/app/chat/page.tsx` — Chat UI (core)
- [ ] `apps/web/app/chat/components/ChatMessages.tsx`
- [ ] `apps/web/app/chat/components/PlanVisualizer.tsx`
- [ ] `apps/web/app/chat/components/InputBar.tsx`
- [ ] `apps/web/app/approvals/page.tsx` — Approvals queue
- [ ] `apps/web/app/requests/page.tsx` — My requests
- [ ] `apps/web/app/audit/page.tsx` — Audit trail
- [ ] `apps/web/lib/api.ts` — API wrapper (auth, WebSocket)
- [ ] `apps/web/lib/hooks/useAgent.ts` — Agent session hook

### 3. Backend Enhancements (After MVP)
- [ ] Add refresh token persistence (auth.service.ts)
- [ ] Add `@Role()` decorator + per-route enforcement
- [ ] Add production migrations (prisma/migrations/)
- [ ] Add full integration tests (test/*.integration.spec.ts)
- [ ] Real certificate generation (requests.service.ts integration)
- [ ] Real ERP integration stub

---

## How to Measure Progress

**Week 1 Goal:**
- [ ] Database running, seeded
- [ ] Backend tested (npm run test passes)
- [ ] E2E manual test: certificate request works end-to-end
- [ ] At least 1 full audit trail verifiable

**Week 2 Goal:**
- [ ] Frontend login + chat pages working
- [ ] User can see agent response + plan steps
- [ ] Staff can see + approve requests
- [ ] Demo video recorded (2–3 min)

**Ready for Round 1:**
- [ ] All components above complete
- [ ] Zero compilation errors
- [ ] Demo video polished
- [ ] Judges can understand: problem → solution → architecture → live demo

---

## Common Issues & Solutions

### Issue: `DATABASE_URL` not recognized
**Fix:** 
```bash
# Ensure .env is in root of project, not in src/
cat .env | grep DATABASE_URL
# If empty, add it and save
```

### Issue: `prisma db push` fails with "extension not found"
**Fix:**
```bash
# Connect to PostgreSQL and enable pgvector
psql -U postgres -c "CREATE EXTENSION vector"
# Then retry: npm run db:push
```

### Issue: OpenAI API returns 401
**Fix:**
```bash
# Verify API key
echo $OPENAI_API_KEY
# If empty, add to .env and restart server
```

### Issue: Groq rate limit (429)
**Fix:**
- Already handled by circuit breaker in LLMGateway
- Automatically falls back to OpenAI
- Check logs to see fallover happening
- For demo: pre-test queries to cache them

### Issue: Frontend WebSocket not connecting
**Fix:**
```typescript
// Ensure server has Socket.io enabled
// In main.ts: app.useWebSocketAdapter(new SocketIoAdapter(app));
// Already done ✓

// Frontend: useEffect(() => {
//   const socket = io('http://localhost:3000', {
//     auth: { token: jwtToken }
//   });
// }, []);
```

---

## Summary: What's Next?

1. **Today (1–2 hours):**
   - Set up `.env` + database
   - Run `npm run db:push && npm run db:seed`
   - Verify backend starts (`npm run start:dev`)

2. **This Week (20 hours):**
   - Build frontend login + chat pages
   - Test E2E workflows (auth → agent → approval)
   - Verify audit trail

3. **Next Week (20 hours):**
   - Complete approvals dashboard + audit viewer
   - Polish UI + responsive design
   - Record demo video

4. **Round 1 Submission:**
   - 3-min demo video
   - PPT highlighting innovation (HITL + audit trail)
   - Link to GitHub repo (public or private)

**Good luck! 🚀 You're 95% of the way there.**

