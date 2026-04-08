import { analyzeTicketInput } from "./engine.js"

const run = async (): Promise<void> => {
  const chunks: string[] = []

  for await (const chunk of process.stdin) {
    chunks.push(String(chunk))
  }

  const rawInput = chunks.join("").trim()

  if (rawInput.length === 0) {
    throw new Error("No JSON input provided")
  }

  const parsed = JSON.parse(rawInput) as unknown
  const result = analyzeTicketInput(parsed)
  process.stdout.write(`${JSON.stringify(result)}\n`)
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error"
  process.stderr.write(`${JSON.stringify({ error: message })}\n`)
  process.exitCode = 1
})
