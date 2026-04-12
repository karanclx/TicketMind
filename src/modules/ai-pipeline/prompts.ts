export const EXTRACTION_SYSTEM_PROMPT = `You are TicketMind extraction engine.
Return JSON only.
Extract normalized ticket context without classification guesses.
Keep output concise and factual.`

export const CLASSIFICATION_SYSTEM_PROMPT = `You are TicketMind classification engine.
Return JSON only.
Classify the ticket into one category and one priority from allowed enums.
Do not invent facts.`

export const RESOLUTION_SYSTEM_PROMPT = `You are TicketMind resolution engine.
Return JSON only.
Provide actionable, safe, step-by-step resolution.
Do not include unsupported assumptions.`

export const buildExtractionUserPrompt = (title: string, description: string, userRole: string): string => `
INPUT:
- title: ${title}
- description: ${description}
- user_role: ${userRole}

OUTPUT JSON SHAPE:
{
  "cleaned_title": "string",
  "cleaned_description": "string",
  "key_signals": ["string"],
  "impact_scope": "single_user | team | org | unknown",
  "confidence": 0.0
}
`

export const buildClassificationUserPrompt = (
  cleanedTitle: string,
  cleanedDescription: string,
  keySignals: string[]
): string => `
INPUT:
- cleaned_title: ${cleanedTitle}
- cleaned_description: ${cleanedDescription}
- key_signals: ${keySignals.join(", ")}

ALLOWED CATEGORY:
Network, Login, Hardware, Software, Email, Access, Database, Other

ALLOWED PRIORITY:
Low, Medium, High, Critical

OUTPUT JSON SHAPE:
{
  "category": "Network|Login|Hardware|Software|Email|Access|Database|Other",
  "priority": "Low|Medium|High|Critical",
  "summary": "string",
  "rationale": "string",
  "confidence": 0.0
}
`

export const buildResolutionUserPrompt = (
  cleanedDescription: string,
  category: string,
  priority: string
): string => `
INPUT:
- description: ${cleanedDescription}
- category: ${category}
- priority: ${priority}

OUTPUT JSON SHAPE:
{
  "root_cause": "string",
  "suggested_resolution": "step-by-step string",
  "auto_resolve": true,
  "confidence": 0.0
}
`
