# TicketMind

TicketMind automatically reads, categorizes, and suggests resolutions for IT support tickets — backed by a deterministic fallback so it never leaves a ticket stuck on an unreliable AI response.

Designed for IT teams, MSPs, and internal helpdesks, it provides faster, more consistent first-line ticket triage without the risk of LLM hallucinations blocking critical workflows.

## What It Does
- **REST API**: Accepts support tickets programmatically.
- **Reliable Queue**: In-process queuing with retries and dead-letter tracking.
- **AI Pipeline**: 3-step structured execution (Extraction, Classification, Resolution).
- **Deterministic Fallback**: Automatically takes over if model output is low-confidence or invalid.
- **Strict Validation**: All AI outputs are schema-validated (Zod) before persistence.
- **Dashboard**: React UI for ticket submission, status polling, and manual reprocessing.

## Status & Roadmap

**Live Now:**
- Core 3-stage AI pipeline (extraction, classification, resolution), with optional Groq API integration.
- Strict schema validation & deterministic fallback.
- In-memory retry/dead-letter queue.
- Basic Multi-tenancy & Workspace isolation.
- Ticket submission & status UI with Login/Signup.
- Stripe subscription integration with Customer Portal and automated plan/quota webhook syncing.
- Hard quota safeguard (falls back to deterministic analyzer if monthly limit exceeded or if subscription is past due / canceled).

**Planned:**
- Persistent queue (e.g., Redis/BullMQ) for HA and multi-node scaling.
- Additional external LLM providers (Groq is supported; mock mode remains the default).
- OAuth / SSO / Password reset flows.
- Organization settings UI and user management.

## Known Gaps for Production Use

Before using TicketMind in a production environment, be aware of the following architectural gaps:

- **Security Review needed**: This pass adds basic authentication and tenant isolation, but the application has not had a full security review.
- **No rate limiting on login**: There is no brute-force protection or rate-limiting on login/signup endpoints.
- **No password reset flow**: Forgotten passwords cannot currently be recovered.
- **Single-node architecture**: The queue (`TicketQueue`) and state are entirely in-memory. A restart loses queued jobs, and multiple instances will not share queue state.
- **Billing is NOT production-ready**: The Stripe integration handles the happy path, but has not been tested against Stripe's test-clock tooling for subscription lifecycle edge cases (trial-to-paid transitions, mid-cycle upgrades). No proration testing has been done beyond Stripe's defaults. There is no handling for a customer with multiple subscriptions (shouldn't be possible via this flow, but not defensively checked), and no automated dunning/retry messaging beyond what Stripe's own smart retries do.

## Tech Stack
- **Backend**: Node.js, TypeScript, Express, Mongoose, Zod
- **AI Pipeline**: Structured LLM client interface + fallback analyzer
- **Frontend**: React + Vite + React Router
- **Testing**: Vitest

## Prerequisites
- Node.js 20.11+
- npm 10.2+
- MongoDB (local or remote)

## Environment Variables
Copy the example file and adjust values as needed:
```bash
cp .env.example .env
```

Available variables:
- `NODE_ENV=development`
- `PORT=3000`
- `MONGODB_URI=mongodb://localhost:27017/ticketmind`
- `LOG_LEVEL=info`
- `SERVICE_NAME=ticketmind-api`
- `SERVICE_VERSION=0.1.0`
- `LLM_PROVIDER=mock`
- `LLM_API_KEY=`
- `LLM_MODEL=`
- `LLM_TIMEOUT_MS=10000`
- `LLM_MAX_RETRIES=2`
- `LLM_TEMPERATURE=0.2`

## Installation
```bash
npm install
```

## Development

### 1) Run backend checks
```bash
npm run typecheck
npm run lint
npm test
```

### 2) Build backend
```bash
npm run build
```

### 3) Start backend (after build)
```bash
node dist/server.js
```

### 4) Run frontend (Vite)
From the repository root:
```bash
npx vite --config frontend/vite.config.ts
```
Frontend dev server defaults to `http://localhost:5173` and proxies API requests under `/auth`, `/billing`, `/tickets`, and `/health` to `http://localhost:3000`. Browser navigation to ticket and billing pages stays on the frontend.

### 5) Build frontend
```bash
npx vite build --config frontend/vite.config.ts
```
This emits static assets to `frontend-dist/` for production serving by the backend.

## API Overview
Base URL: `http://localhost:3000`

Ticket endpoints require a login session cookie or a valid `X-API-Key`.

### Health
- `GET /health/live`: public process liveness, used by Docker. Does not check MongoDB readiness.
- `GET /health`: authenticated workspace queue details.
- Optional query params:
  - `job_id=<uuid>`
  - `include_dead_letter=true|false`

### Tickets
- `POST /tickets`
- `GET /tickets/:id`
- `POST /tickets/:id/process`

#### Create Ticket Example
Request:
```json
{
  "title": "VPN not connecting",
  "description": "Client times out after login",
  "user_role": "employee",
  "timestamp": "2026-03-26T10:15:00.000Z"
}
```
Accepted roles: `student`, `employee`, `admin`

Create/Process responses return:
```json
{
  "id": "<ticket-id>",
  "status": "queued",
  "job_id": "<queue-job-uuid>"
}
```

## Testing
Run the full test suite:
```bash
npm test
```
Run tests in watch mode:
```bash
npm run test:watch
```
Run a single test name pattern:
```bash
npm run test:one -- "AiPipelineService"
```

## Processing Flow
1. Ticket is created and marked pending.
2. A job is enqueued.
3. Queue worker processes with retry/backoff.
4. AI pipeline executes extraction -> classification -> resolution.
5. If any stage fails confidence/validation, fallback analyzer is used.
6. Ticket is updated to processed or failed.

## College demo setup and free AI

1. Copy `.env.example` to `.env` if you do not already have a `.env` file. The backend now loads it automatically. Keep your existing secrets when editing it.
2. Start local MongoDB, or start Docker Desktop and run `docker compose up --build`. Compose uses the `mongo` service address automatically. The Docker app is at http://localhost:3000.
3. For development with local MongoDB, run `npm run build` then `npm start`. In another terminal run `npm run frontend:dev` and open http://localhost:5173.
4. An administrator first opens `/setup` to create a helpdesk. In Support queue, generate a requester signup link. Students/employees use that link to create requester accounts, raise tickets, and view their analysis. `LLM_PROVIDER=mock` runs without external API calls; results are visibly labeled as a demo mock.

Stripe is separate from AI. The example Stripe placeholders allow the ticket demo to start without a paid subscription or a Stripe account; checkout/portal operations require real Stripe test credentials. Avoid the billing upgrade buttons for the college demo. Set a random `SESSION_SECRET` locally.

### Enable Groq on the Free plan

Create an API key at https://console.groq.com/keys and confirm that your account is on the **Free** plan. Do not upgrade to Developer or add billing for this demo. Set these server-side values in `.env`:

```dotenv
LLM_PROVIDER=groq
LLM_API_KEY=your_groq_key_here
LLM_MODEL=openai/gpt-oss-20b
LLM_TIMEOUT_MS=20000
LLM_MAX_RETRIES=0
LLM_TEMPERATURE=0.2
```

Restart the backend. Each successful ticket makes three model requests. Zero retries keeps demo usage low; any timeout, rate limit, invalid JSON, invalid schema, or low-confidence output uses the rule-based fallback. No paid provider is used as a backup. A Free-plan key is important: the application cannot detect whether you have enabled billing on your provider account.

Results display their source: Groq/model, demo mock, or rule-based fallback. To confirm real AI was used, check the source on the result card. Confidence is a model estimate, not a measured accuracy score. Ticket text is sent to Groq when enabled; use synthetic college-demo tickets.

Current provider references (plans and model availability can change):
- [API key setup](https://console.groq.com/docs/quickstart)
- [Free-plan limits](https://console.groq.com/docs/rate-limits)
- [Billing and plan upgrades](https://console.groq.com/docs/billing-faqs)
- [JSON output mode](https://console.groq.com/docs/structured-outputs)

`APP_URL` controls Stripe return links: use `http://localhost:5173` in development and your public frontend URL when deployed. Compose sets it to `http://localhost:3000` for local Docker use.

### Usage renewal and verification

Ticket quotas renew on the first day of each UTC calendar month, independently of Stripe invoice dates. Renewal is applied when the next ticket is processed. Existing organizations without a reset date are migrated using their creation month. The queue still supports only one application process; it is not a durable multi-instance queue.

Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `npm run frontend:build`. The frontend build now includes typechecking, so incorrect imports fail the build. Provider tests simulate HTTP responses; they do not consume API credits or establish live model accuracy.

## Frontend design

The workspace uses Aceternity UI's [Bento Grid](https://ui.aceternity.com/components/bento-grid), adapted to plain CSS, plus a CSS adaptation of its [Spotlight](https://ui.aceternity.com/components/spotlight) pattern. Components are in `frontend/src/components/ui`. No paid Aceternity assets or additional runtime dependencies are required. The interface supports mobile layouts, keyboard focus, and reduced-motion preferences.

## Human support handoff

After updating, run `npm run build` and restart `npm start`. Restart the Vite development server too, because the `/support` API proxy is new.

Ticket analysis and ticket resolution are separate:
- `status` tracks processing: pending, processing, processed, failed.
- `workflow.status` tracks the actual issue: awaiting_ai, awaiting_confirmation, needs_human, in_progress, resolved.

AI suggestions never automatically close a ticket. A low-risk, sufficiently confident self-service suggestion waits for requester confirmation. High/Critical priorities, low confidence, mock/fallback output, unsuccessful processing, and results that are not suitable for self-service enter the human queue. Requesters can also select **I still need help**. Requesters can confirm their own suggestions or reopen their own resolved tickets; support staff can perform these actions too. The form's student/employee/admin field is issue context, not an account permission.

Category routing uses named queues within each workspace:
- Network → Network Support
- Login, Access, Email → Account Support
- Hardware → Hardware Support
- Software → Application Support
- Database → Database Support
- Other/processing failure → IT Helpdesk

Open **Support queue** as an owner, admin, or agent. Filter by team/status, open a ticket, select a team and optional agent, then save the assignment. A team-only assignment stays unassigned until claimed. Agents can **Claim & start work** and **Mark resolved** with a required resolution note. Existing processed/failed tickets also appear in the human queue. Reprocessing does not overwrite assignments or resolutions. Concurrent edits return a conflict so a stale screen cannot overwrite newer work.

Owners/admins can expand **Add a support agent** on the queue page and create a login in their own workspace. This is manual account provisioning: share credentials securely yourself. No invitation email is sent, and password reset/change and invitation links are not yet implemented. Support agents cannot manage billing or create accounts. Teams are routing queues, not separate permission groups; workspace support staff can work across those queues. Requester ticket reads are restricted to tickets they created; support staff retain workspace-wide access. Requesters cannot reprocess AI results or inspect queue health.

New endpoints:
- `GET /support/tickets?status=needs_human&team=Network%20Support&page=1` (25 per page)
- `GET /support/agents` (eligible assignees and supported teams)
- `POST /support/agents` (owner/admin only; email and password)
- `PATCH /tickets/:id/handoff` (session required; action and expected_revision)

The normal test suite uses mock AI regardless of your `.env`, so it cannot consume your Groq quota. An optional MongoDB integration check creates and drops a uniquely named temporary database on the configured MongoDB service, leaving application data unchanged:

```bash
RUN_MONGO_INTEGRATION=1 npm test -- src/__tests__/support.integration.test.ts
```

## Requester and administrator separation

There are two distinct onboarding paths:

- **Requester:** `/signup?invite=...` joins an existing organization with the `member` role. A requester can raise tickets, see **My tickets**, view their own analysis and progress, confirm a self-service fix, ask for help, or reopen a resolved request. They cannot assign tickets, choose support agents, manage users/billing, view other requesters’ tickets, or rerun AI analysis.
- **Administrator:** `/setup` creates a new organization with an `owner` account. Administrators land on **Support queue**, generate requester signup links, provision agents, and manage support and billing. Support agents also land on the queue but cannot create accounts or manage billing.

An admin generates a link with **Invite requesters** on the queue page. Its random code is stored only as a SHA-256 hash. Generating another link invalidates the previous link for new signups, without removing existing members. This shared link is intended for distribution inside your college/organization; no email is sent automatically.

The server assigns requester roles itself and rejects extra role/organization fields. A separate `POST /auth/workspace` endpoint handles administrator setup. `POST /auth/signup` now requires `invite`, `email`, and `password`; it no longer creates workspaces. `GET /tickets/mine` lists only the signed-in user's tickets with pagination. `POST /support/requester-invite` is owner/admin-only.

Existing owner accounts and tickets are preserved. To test both sides, keep your owner account in one browser and use the requester signup link with a different email in a private/incognito window. The ticket form's reporter type is context for analysis, not a way to change account permissions.

### Image evidence screening

Tickets can include two private images screened by Sightengine's hosted `genai` model. See [the image screening setup guide](docs/IMAGE_INFERENCE_SETUP.md) for free-account credentials, testing and limitations. No local AI server is required. Screening is advisory and never approves or rejects refunds.
