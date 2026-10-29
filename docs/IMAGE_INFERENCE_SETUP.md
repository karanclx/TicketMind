# Hosted image screening setup — Sightengine

TicketMind uses Sightengine's `genai` model for image evidence and keeps Groq for text analysis. There is no Python service, Mac inference server, model download, or local GPU requirement.

## 1. Get free-account credentials

1. Create an account at https://dashboard.sightengine.com/ and select the **Free** plan.
2. Find your **API user** and **API secret** in the dashboard.
3. Check the free allowance shown for your account. The public pricing page confirms a Free plan without an expiry, but does not clearly specify its current monthly operations allowance. Do not assume unlimited requests or a fixed number of images per operation.
4. Stay on Free for the college demonstration. Do not upgrade to a paid plan if you need zero API charges: paid plans can charge overages. TicketMind cannot enforce your provider's billing plan.

## 2. Configure TicketMind

Add these variables to the existing `.env` in the project root:

```dotenv
SIGHTENGINE_API_USER=your_api_user
SIGHTENGINE_API_SECRET=your_api_secret
SIGHTENGINE_TIMEOUT_MS=30000
```

Both credentials are backend-only. Do not use `VITE_` prefixes, commit `.env`, or paste secrets into chat. Missing either credential disables hosted screening; image uploads still work and require human review.

Delete any old `IMAGE_INFERENCE_URL`, `IMAGE_INFERENCE_KEY`, and `IMAGE_INFERENCE_TIMEOUT_MS` entries from your `.env`; they are no longer used. You can stop the old Python server if you started it.

From the project root:

```bash
npm install
npm run build
npm run frontend:build
npm start
```

For development, use your usual backend workflow plus `npm run frontend:dev`. Restart the backend after changing `.env`. MongoDB must still be available as before. Outbound HTTPS access to `api.sightengine.com` is required.

## 3. Try a ticket

1. Sign in as a requester and open **New ticket**.
2. Attach up to two still JPEG, PNG or WebP images, each at most 4 MB, at least 224 pixels on each side, and no more than 20 megapixels. These are TicketMind's upload limits.
3. Submit the ticket and wait for **Evidence screening** to finish.
4. A successful result shows `sightengine/genai`, a score, and a check time. Check your Sightengine dashboard to see the operations consumed.
5. Sign in as support to review flagged, inconclusive, or unavailable results.

To test failure handling without spending quota, leave both credentials blank, restart, and submit a ticket with an image. It should show **Screening unavailable — review needed**. Restore the credentials, restart and use **Reprocess** as support to try again.

## How screening works

```text
Browser → TicketMind → private MongoDB image storage
                 ↓ HTTPS multipart upload
          Sightengine /1.0/check.json (models=genai)
                 ↓ type.ai_generated
          Evidence panel + support workflow
```

The backend uploads image bytes, rather than exposing a public image URL. Requesters can view only their own ticket images; support can access images within their workspace. The upload form explains that images are sent to Sightengine. They are therefore shared with an external processor; use appropriate demo images.

Only `genai` is requested. Requests are spaced at least 1.1 seconds apart within a backend process. Missing credentials, authentication failures, rate/quota limits, timeouts, invalid responses and provider failures all produce **unavailable**, never a fabricated score. There are no automatic image API retries and no alternate paid-provider fallback. Staff reprocessing reruns both image and text analysis and can consume additional quota.

| Detector score/result | TicketMind behavior |
| --- | --- |
| ≤ 0.2 | Low synthetic signal; normal text triage controls the initial workflow |
| Between 0.2 and 0.8 | Inconclusive; support review |
| ≥ 0.8 | Synthetic signal; support review |
| Unavailable | Support review |

These thresholds are illustrative and have not been calibrated on refund/food photos. A low score does not verify authenticity; a high score does not prove fraud. No automatic refund approval or rejection is implemented. Existing assignments, work in progress and resolved decisions are preserved during reprocessing; newly concerning evidence can move a ticket awaiting requester confirmation to support review.

## Troubleshooting

- **Unavailable:** verify both credentials, dashboard quota, outbound network access and restart after `.env` changes. Wait for rate limits to clear before reprocessing.
- **Upload rejected:** check format, dimensions, count and size. File extensions alone are not trusted; images must decode successfully.
- **After backend restart:** MongoDB-backed jobs resume automatically; interrupted processing waits for its lease to expire (up to ten minutes). Support can reprocess dead-lettered jobs.
- **Multiple backend instances:** the pacing is per process, not distributed. Use one backend instance for the demo or add a shared limiter before scaling.

Tests: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run frontend:build`. The test scripts clear image credentials; provider tests use mocked responses and do not spend your quota. A successful live upload with your own credentials is still needed to verify account access; mocked tests do not measure detector accuracy.

Images remain private MongoDB data (up to 8 MB of image bytes per ticket). For a larger SaaS, add private object storage, retention/deletion and storage quotas. Jobs now persist in MongoDB. See [company integration setup](COMPANY_INTEGRATION_SETUP.md). This feature does not include duplicate-image matching, C2PA verification or order validation.

Official references: [API request and response documentation](https://sightengine.com/docs/ai-generated-image-detection), [Free and paid plan details](https://sightengine.com/pricing).
