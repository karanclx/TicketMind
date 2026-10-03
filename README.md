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
- Core 3-stage AI pipeline (extraction, classification, resolution).
- Strict schema validation & deterministic fallback.
- In-memory retry/dead-letter queue.
- Basic Multi-tenancy & Workspace isolation.
- Ticket submission & status UI with Login/Signup.
- Stripe subscription integration with Customer Portal and automated plan/quota webhook syncing.
- Hard quota safeguard (falls back to deterministic analyzer if monthly limit exceeded or if subscription is past due / canceled).

**Planned:**
- Persistent queue (e.g., Redis/BullMQ) for HA and multi-node scaling.
- First-class integrations with external LLM providers (currently uses a mock stub).
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
Frontend dev server defaults to `http://localhost:5173` and proxies `/tickets` and `/health` to `http://localhost:3000`.

### 5) Build frontend
```bash
npx vite build --config frontend/vite.config.ts
```
This emits static assets to `frontend-dist/` for production serving by the backend.

## API Overview
Base URL: `http://localhost:3000`

### Health
- `GET /health`
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
