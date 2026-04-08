import type {
  AnalyzedTicket,
  IncomingTicket,
  TicketCategory,
  TicketPriority
} from "./types.js"

type RuleMatch = {
  score: number
  matched: string[]
}

const CATEGORY_KEYWORDS: Record<TicketCategory, string[]> = {
  Network: [
    "wifi",
    "wi-fi",
    "vpn",
    "network",
    "internet",
    "latency",
    "packet loss",
    "connection",
    "dns",
    "router"
  ],
  Login: [
    "login",
    "log in",
    "sign in",
    "signin",
    "password",
    "mfa",
    "2fa",
    "authentication",
    "auth",
    "cannot access account",
    "locked out"
  ],
  Hardware: [
    "laptop",
    "desktop",
    "monitor",
    "keyboard",
    "mouse",
    "printer",
    "battery",
    "fan",
    "hardware",
    "screen",
    "broken",
    "overheating"
  ],
  Software: [
    "app",
    "application",
    "crash",
    "bug",
    "error",
    "fails",
    "stuck",
    "install",
    "update",
    "not responding"
  ],
  Email: [
    "email",
    "outlook",
    "gmail",
    "mailbox",
    "inbox",
    "smtp",
    "imap",
    "delivery",
    "bounce",
    "attachment"
  ],
  Access: [
    "access denied",
    "permission",
    "forbidden",
    "unauthorized",
    "role",
    "privilege",
    "grant access",
    "cannot open",
    "restricted"
  ],
  Database: [
    "database",
    "db",
    "sql",
    "query",
    "table",
    "record",
    "connection pool",
    "deadlock",
    "timeout",
    "migration"
  ],
  Other: []
}

const CRITICAL_HINTS = [
  "system down",
  "outage",
  "production down",
  "all users",
  "everyone",
  "entire team",
  "cannot work",
  "sev1",
  "critical"
]

const HIGH_HINTS = [
  "blocked",
  "unable to work",
  "urgent",
  "asap",
  "today",
  "no workaround",
  "stopped working",
  "fails every time"
]

const MEDIUM_HINTS = [
  "slow",
  "intermittent",
  "sometimes",
  "degraded",
  "workaround",
  "temporary fix"
]

const LOW_HINTS = [
  "minor",
  "cosmetic",
  "small issue",
  "nice to have",
  "question",
  "how to"
]

const COMMON_AUTO_RESOLVE = new Set([
  "password reset",
  "reset password",
  "forgot password",
  "unlock account",
  "clear cache",
  "reconnect wifi",
  "vpn reconnect"
])

const sanitizeText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()

const contains = (text: string, phrase: string): boolean => text.includes(phrase)

const matchRule = (text: string, patterns: string[]): RuleMatch => {
  const matched = patterns.filter((pattern) => contains(text, pattern))
  return {
    score: matched.length,
    matched
  }
}

const chooseCategory = (text: string): { category: TicketCategory; evidence: string[] } => {
  let bestCategory: TicketCategory = "Other"
  let bestScore = 0
  let evidence: string[] = []

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as [
    TicketCategory,
    string[]
  ][]) {
    if (category === "Other") {
      continue
    }

    const result = matchRule(text, keywords)
    if (result.score > bestScore) {
      bestCategory = category
      bestScore = result.score
      evidence = result.matched
    }
  }

  return {
    category: bestCategory,
    evidence
  }
}

const inferPriority = (text: string): TicketPriority => {
  if (matchRule(text, CRITICAL_HINTS).score > 0) {
    return "Critical"
  }

  if (matchRule(text, HIGH_HINTS).score > 0) {
    return "High"
  }

  if (matchRule(text, MEDIUM_HINTS).score > 0) {
    return "Medium"
  }

  if (matchRule(text, LOW_HINTS).score > 0) {
    return "Low"
  }

  return "Medium"
}

const oneSentence = (title: string, category: TicketCategory): string => {
  const safeTitle = title.trim() || "Support issue reported"
  return `${safeTitle} (${category} issue).`
}

const inferRootCause = (category: TicketCategory): string => {
  switch (category) {
    case "Network":
      return "Likely unstable network path, VPN misconfiguration, or local connectivity failure."
    case "Login":
      return "Likely authentication failure from invalid credentials, expired password, or account lockout."
    case "Hardware":
      return "Likely physical device component degradation or peripheral malfunction."
    case "Software":
      return "Likely application defect, corrupted local state, or incompatible software update."
    case "Email":
      return "Likely mailbox configuration or mail service routing/delivery issue."
    case "Access":
      return "Likely missing permission assignment or incorrect role-based access configuration."
    case "Database":
      return "Likely database connectivity, query, or schema-related failure."
    case "Other":
      return "Cause is unclear from the provided ticket details and needs triage."
  }
}

const inferResolution = (category: TicketCategory): string => {
  switch (category) {
    case "Network":
      return "1) Verify local internet and VPN status. 2) Reconnect to trusted network and retry. 3) Flush DNS/restart network adapter. 4) If still failing, escalate with traceroute/ping evidence."
    case "Login":
      return "1) Confirm username and account domain. 2) Perform password reset/unlock workflow. 3) Re-enroll MFA if prompted. 4) If still blocked, verify identity and escalate to IAM admin."
    case "Hardware":
      return "1) Reboot device and check peripheral connections/power. 2) Run hardware diagnostics. 3) Swap known-good cable/device if available. 4) If failed, create repair/replacement request."
    case "Software":
      return "1) Capture exact error and reproduction steps. 2) Restart app and clear local cache/config. 3) Reinstall or roll back to stable version. 4) Escalate to application owner with logs."
    case "Email":
      return "1) Check mailbox quota and account sign-in health. 2) Validate SMTP/IMAP or Outlook profile settings. 3) Test send/receive to internal and external addresses. 4) Escalate with message trace IDs."
    case "Access":
      return "1) Identify required resource and expected permission level. 2) Verify current role/group membership. 3) Submit or approve access grant through standard workflow. 4) Retest access and audit logs."
    case "Database":
      return "1) Validate DB endpoint/credentials and service availability. 2) Re-run failing query with safe diagnostics. 3) Check locks, timeouts, and recent schema changes. 4) Escalate to DBA with query/error IDs."
    case "Other":
      return "1) Gather missing details, screenshots, and error text. 2) Confirm impact scope and reproducibility. 3) Route to appropriate support queue for triage."
  }
}

const toConfidence = (categoryEvidence: string[], priority: TicketPriority): number => {
  const evidenceScore = Math.min(categoryEvidence.length * 0.15, 0.45)
  const priorityScore =
    priority === "Critical" ? 0.2 : priority === "High" ? 0.15 : priority === "Medium" ? 0.1 : 0.05

  const total = 0.35 + evidenceScore + priorityScore
  return Number(Math.min(total, 0.98).toFixed(2))
}

const inferAutoResolve = (text: string, confidence: number, priority: TicketPriority): boolean => {
  const common = [...COMMON_AUTO_RESOLVE].some((phrase) => contains(text, phrase))
  return common && confidence >= 0.85 && (priority === "Low" || priority === "Medium")
}

export const analyzeTicket = (ticket: IncomingTicket): AnalyzedTicket => {
  const mergedText = sanitizeText(`${ticket.title} ${ticket.description}`)
  const categoryResult = chooseCategory(mergedText)
  const priority = inferPriority(mergedText)
  const summary = oneSentence(ticket.title, categoryResult.category)
  const rootCause = inferRootCause(categoryResult.category)
  const suggestedResolution = inferResolution(categoryResult.category)
  const confidence = toConfidence(categoryResult.evidence, priority)
  const autoResolve = inferAutoResolve(mergedText, confidence, priority)

  return {
    category: categoryResult.category,
    priority,
    summary,
    root_cause: rootCause,
    suggested_resolution: suggestedResolution,
    confidence,
    auto_resolve: autoResolve
  }
}
