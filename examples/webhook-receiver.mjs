// Local demonstration receiver. Place behind a public HTTPS tunnel for TicketMind.
// Run: TICKETMIND_WEBHOOK_SECRET=... node examples/webhook-receiver.mjs
import process from 'node:process'
import { Buffer } from 'node:buffer'
import console from 'node:console'
import { createServer } from 'node:http'
import { createHmac, timingSafeEqual } from 'node:crypto'
const secret = process.env.TICKETMIND_WEBHOOK_SECRET
if (!secret) throw new Error('Set TICKETMIND_WEBHOOK_SECRET to the secret shown when saving your webhook')
const seen = new Map()
createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/ticketmind/events') { res.writeHead(404).end(); return }
  try {
    const chunks = []; let size = 0
    for await (const chunk of req) { size += chunk.length; if (size > 65536) { res.writeHead(413).end(); return }; chunks.push(chunk) }
    const body = Buffer.concat(chunks)
    const timestamp = req.headers['x-ticketmind-timestamp']
    const signature = req.headers['x-ticketmind-signature']
    if (typeof timestamp !== 'string' || !/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 || typeof signature !== 'string' || !/^v1=[a-f0-9]{64}$/.test(signature)) { res.writeHead(401).end(); return }
    const expected = createHmac('sha256', secret).update(timestamp + '.').update(body).digest()
    if (!timingSafeEqual(expected, Buffer.from(signature.slice(3), 'hex'))) { res.writeHead(401).end(); return }
    const event = JSON.parse(body.toString('utf8'))
    if (event.id !== req.headers['x-ticketmind-event-id'] || typeof event.id !== 'string') { res.writeHead(400).end(); return }
    for (const [id, time] of seen) if (time < Date.now() - 24 * 60 * 60 * 1000) seen.delete(id)
    if (!seen.has(event.id)) {
      // Production: atomically persist event ID and enqueue business work before ACK.
      console.log(JSON.stringify({ event_id: event.id, type: event.type, ticket_id: event.ticket_id, external_ticket_id: event.external_ticket_id }))
      seen.set(event.id, Date.now())
    }
    res.writeHead(204).end()
  } catch { res.writeHead(400).end() }
}).listen(8787, '127.0.0.1', () => console.log('Demo receiver listening on http://127.0.0.1:8787/ticketmind/events'))
