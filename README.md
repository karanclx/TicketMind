# TicketMind

TicketMind is an AI-assisted IT support ticket triage system.

It accepts tickets, processes them through a multi-step AI pipeline (with safe fallbacks), stores results in MongoDB, and provides a React UI to submit and inspect ticket status/results.

## What It Does

- Accepts support tickets through a REST API.
- Queues processing jobs with retries and dead-letter tracking.
- Runs a 3-step AI pipeline:
	- Extraction
	- Classification
	- Resolution
- Falls back to deterministic analysis when model output is low-confidence or invalid.
- Validates AI output using strict schemas.
- Exposes health and queue metrics.
- Provides a frontend for ticket submission, status polling, and manual reprocessing.

## Tech Stack

- Backend: Node.js, TypeScript, Express, Mongoose, Zod
- AI pipeline: structured LLM client interface + fallback analyzer
- Frontend: React + Vite + React Router
- Testing: Vitest

## Project Structure

```text
.
|- src/
|  |- app.ts                    # Express app setup
|  |- server.ts                 # API server bootstrap
|  |- config/
|  |  |- db.ts                  # MongoDB connection
|  |- modules/
|  |  |- health/                # /health endpoint
|  |  |- tickets/               # ticket API, queue, service
|  |  |- ai-pipeline/           # LLM + schema validation pipeline
|  |- ticket-intelligence/      # deterministic analyzer + CLI
|  |- __tests__/                # backend/unit tests
|- frontend/
|  |- src/
|     |- pages/                 # submit/detail pages
|     |- components/            # UI components
|     |- api.ts                 # frontend API client
```

## Prerequisites

- Node.js 20.11+
- npm 10.2+
- MongoDB (local or remote)

## Environment Variables

Copy the example file and adjust values as needed:

```bash
cp .env.example .env
```

Available variables (from .env.example):

- NODE_ENV=development
- PORT=3000
- MONGODB_URI=mongodb://localhost:27017/ticketmind
- LOG_LEVEL=info
- SERVICE_NAME=ticketmind-api
- SERVICE_VERSION=0.1.0
- LLM_PROVIDER=mock
- LLM_API_KEY=
- LLM_MODEL=
- LLM_TIMEOUT_MS=10000
- LLM_MAX_RETRIES=2
- LLM_TEMPERATURE=0.2

## Installation

```bash
npm install
```

## Development

### 1) Run backend checks

```bash
npm run typecheck
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

Frontend dev server defaults to http://localhost:5173 and proxies /tickets and /health to http://localhost:3000.

### 5) Build frontend

```bash
npx vite build --config frontend/vite.config.ts
```

This emits static assets to frontend-dist/ for production serving by the backend.

## API Overview

Base URL: http://localhost:3000

### Health

- GET /health
- Optional query params:
	- job_id=<uuid>
	- include_dead_letter=true|false

### Tickets

- POST /tickets
- GET /tickets/:id
- POST /tickets/:id/process

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

Accepted roles:

- student
- employee
- admin

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
npm run test:one -- "output validation"
```

## Processing Flow

1. Ticket is created and marked pending.
2. A job is enqueued.
3. Queue worker processes with retry/backoff.
4. AI pipeline executes extraction -> classification -> resolution.
5. If any stage fails confidence/validation, fallback analyzer is used.
6. Ticket is updated to processed or failed.

## Notes

- The backend serves frontend-dist/ in production mode.
- Queue state and dead-letter jobs are inspectable via /health.
- AI outputs are schema-validated before persistence.
