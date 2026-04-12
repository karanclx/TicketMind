import { assertValidAiOutput, validateAiOutput } from "./output-validation.js"

const rawOutput: unknown = {
  category: "login",
  priority: "high",
  summary: "  User cannot sign in to portal  ",
  root_cause: "  Account authentication failure due to credential or lock state.  ",
  suggested_resolution:
    " 1) Reset password. 2) Verify MFA enrollment. 3) Retry login and escalate IAM if still blocked. ",
  confidence: "0.91",
  auto_resolve: true
}

const validation = validateAiOutput(rawOutput, {
  minimumConfidence: 0.8,
  autoCorrect: true
})

if (!validation.valid) {
  throw new Error(`Rejected AI output: ${(validation.errors ?? []).join(", ")}`)
}

const trustedOutput = assertValidAiOutput(rawOutput, {
  minimumConfidence: 0.8,
  autoCorrect: true
})

export const exampleValidation = {
  corrected: validation.corrected,
  trustedOutput
}
