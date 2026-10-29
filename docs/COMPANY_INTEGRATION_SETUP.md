# Universal workspaces and company integration

TicketMind provides a shared support workflow with company-specific categories, teams, instructions and escalation rules. College IT remains the default for existing workspaces. Food Delivery and E-commerce are starting templates, not integrations with or endorsements by any real company.

## Configure a workspace

Sign in as owner/admin and open **Workspace** in the navigation.

1. Choose College IT, Food Delivery, E-commerce, or Custom.
2. Edit categories and teams (one label per line). Keep `Other` as the fallback category. The first team is the default.
3. Choose a destination team for each category and enter instructions for resolution suggestions.
4. Configure confidence and priority escalation, or require human review for every ticket.
5. Enable or disable Sightengine image screening. Disabling it retains attachments but makes no image API requests. See [image API setup](IMAGE_INFERENCE_SETUP.md).
6. Save. New processing uses these settings; existing human assignments/resolutions are preserved. If you remove a team, old tickets retain its name until staff reassign them.

Food Delivery and E-commerce default to human review for every ticket. TicketMind does not approve or execute refunds, replacements, payments or order changes. Those actions belong to the company's own authorized systems.

Only owner/admin accounts can change settings, issue/revoke integration keys and manage webhooks. Support agents can use the configured teams. Requesters cannot manage integrations.

## Connect a company backend

In **Workspace → Integration API keys**, create a named key. Copy it immediately; it is shown once and stored as a hash. It grants workspace-wide ticket access, so never embed it in a browser or mobile application. The company's backend must authenticate its own customers and enforce customer-to-ticket ownership. `external_customer_id` is a reference, not an authorization credential.

Set these in your company's backend environment, not TicketMind's frontend:

```bash
export TICKETMIND_BASE_URL='http://localhost:3000'
# Enter without storing the key in shell history:
read -rsp 'TicketMind API key: ' TICKETMIND_API_KEY
export TICKETMIND_API_KEY
```

Create a complaint using the same API used by TicketMind's own UI:

```bash
curl --fail-with-body "$TICKETMIND_BASE_URL/tickets" \
  -H "X-API-Key: $TICKETMIND_API_KEY" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: food-demo-complaint-001' \
  --data '{
    "title": "An item is missing from my delivery",
    "description": "The delivered order did not include the drink.",
    "user_role": "customer",
    "timestamp": "2026-10-29T12:00:00.000Z",
    "external_ticket_id": "complaint-001",
    "external_customer_id": "customer-42",
    "metadata": {"order_id": "order-9001", "channel": "mobile", "item_count": 3}
  }'
```

Response: HTTP 202 with `id`, `job_id`, `status` and `replayed`. For images add `images: [{"name":"evidence.jpg","base64":"<base64 bytes without data-URL prefix>"}]`; existing upload limits apply. `user_role` defaults to `customer` if omitted. It describes the reporter and never grants permissions.

### Idempotency and references

Use an `Idempotency-Key` for every integration submission. Retrying the exact same request (including the same timestamp) returns the original ticket and does not create a new processing job. Reusing that key with changed content or a different requester returns HTTP 409. Keys are scoped to the workspace and retained with the ticket; concurrent duplicate requests are protected by a MongoDB unique index. Metadata key order does not affect the fingerprint.

Use a fresh key for a genuinely new complaint. `external_ticket_id` is searchable but deliberately not unique: one external order may produce several complaints. Prefer a complaint ID here and put the order ID in metadata. Metadata accepts at most 30 flat fields with string/number/boolean/null values; do not submit payment credentials or unnecessary personal data.

Retrieve a ticket, its analysis, images, references, job status and workflow:

```bash
curl --fail-with-body "$TICKETMIND_BASE_URL/tickets/TICKETMIND_TICKET_ID" \
  -H "X-API-Key: $TICKETMIND_API_KEY"
```

Or look up matches by your own reference (URL-encode it):

```bash
curl --fail-with-body "$TICKETMIND_BASE_URL/tickets/external/complaint-001" \
  -H "X-API-Key: $TICKETMIND_API_KEY"
```

The lookup returns up to 100 newest matches in this workspace. The company can poll the detail endpoint, or receive webhooks and then fetch the current detail. Staff use TicketMind's support UI to assign, start and resolve tickets; API keys do not impersonate agents for human resolution.

Reprocess through `POST /tickets/:id/process` with the key. An already queued/processing/retrying job is not duplicated. Reprocessing can consume text/image credits again.

## Receive signed webhook events

1. Deploy a receiver with a public HTTPS URL on port 443.
2. In **Workspace → Signed webhooks**, save that URL.
3. Copy the newly generated signing secret into the receiver's environment. It is different from the API key.
4. Subscribe by configuration: TicketMind sends `analysis.completed` and `ticket.updated` automatically. There is one receiver per workspace.
5. Watch **Recent deliveries** for attempts and HTTP status. Failed deliveries can be retried manually.

Saving the webhook again rotates its secret. Pending deliveries using the previous endpoint/secret are canceled when processed. Disabling the webhook also cancels such deliveries. Events occurring while the webhook is disabled are not retained for future subscription. Configuration changes cannot retract an HTTP request already in flight.

An example event:

```json
{
  "id": "a-unique-event-uuid",
  "type": "analysis.completed",
  "created_at": "2026-10-29T12:00:01.000Z",
  "organization_id": "workspace-object-id",
  "ticket_id": "ticket-object-id",
  "external_ticket_id": "complaint-001",
  "data": {"ai_version": 1}
}
```

`ticket.updated` includes the action, workflow patch and revision. Events are notifications, not a complete ordered replica; fetch the current ticket for its latest state. Images, credentials and full AI results are not included in event payloads.

Headers:

- `X-TicketMind-Event-Id`: stable across retries.
- `X-TicketMind-Timestamp`: Unix seconds for this attempt.
- `X-TicketMind-Signature`: `v1=<hex HMAC-SHA256>` over `timestamp + "." + raw_request_body`, using the signing secret.

Verify the exact raw bytes before parsing JSON. Reject timestamps more than five minutes away from the receiver's clock, compare signatures in constant time, and persist processed event IDs to deduplicate retries. Return 2xx only after durable receipt. No ordering guarantee is made; compare `ai_version` or workflow revision where relevant.

A runnable local receiver is provided:

```bash
read -rsp 'Webhook signing secret: ' TICKETMIND_WEBHOOK_SECRET
export TICKETMIND_WEBHOOK_SECRET
node examples/webhook-receiver.mjs
```

Expose its `/ticketmind/events` path through your own HTTPS tunnel for a demo, and configure the public URL in TicketMind. The example logs event IDs and uses in-memory deduplication only; replace that with durable receipt before using it beyond a demo. TicketMind deliberately rejects local/private destinations and does not follow redirects. IPv4 public destinations are supported; IPv6-only receivers are not currently supported.

## Persistence, retries and deployment

Ticket processing jobs are stored atomically with their tickets in MongoDB. Workers poll automatically when `npm start` runs, claim jobs with a lease, and renew that lease while processing. A crashed worker's job becomes eligible again after its ten-minute lease expires. Failures retry up to three attempts, then appear as dead letters in `/health?include_dead_letter=true` for support sessions. Staff can reprocess them. Startup migrates old pending/processing tickets without job state.

Webhook notifications use an embedded ticket outbox. Workflow changes and their event are written atomically. Analysis completion and its event are also written atomically. The dispatcher upserts delivery records using unique event IDs before removing outbox entries, preventing the usual save-then-notify crash gap. Deliveries have one-minute leases, six attempts with exponential backoff, and persisted status. A successful receiver response followed by a sender crash can produce a duplicate: delivery is **at least once**, not exactly once.

AI processing is also at least once: a crash after a provider request may cause repeat inference and credit usage. The current implementation is intended for a single backend process; MongoDB claims help recovery, but provider rate limiting and monthly usage counters are not distributed. Do not claim production-scale guarantees. Webhook records currently need a retention policy for long-running deployments.

Webhook secrets are encrypted using a key derived from `SESSION_SECRET`, including snapshots in delivery records. Keep that secret stable and securely backed up; after changing it, re-save webhook settings to issue new signing secrets. Receivers must update their secret accordingly. Keep MongoDB private and backed up; it contains ticket images and delivery data.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run frontend:build
```

For real database tests (mock AI and mocked outgoing webhook HTTP), explicitly opt in:

```bash
RUN_MONGO_INTEGRATION=1 npm test -- src/__tests__/universal.integration.test.ts
RUN_MONGO_INTEGRATION=1 npm test -- src/__tests__/support.integration.test.ts
```

Each test suite creates and removes its own temporary database, never the app database. The universal test covers template changes, real API-key authentication/revocation, concurrent idempotency, cross-workspace access, private images, expired-job recovery, outbox deduplication and webhook retry/cancellation. Live Groq/Sightengine and your actual receiver still require separate smoke tests.
