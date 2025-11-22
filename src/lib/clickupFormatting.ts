export type ParsedClickUpDescription = {
  objective: string
  acceptanceCriteria: string
  raw: string
}

function normalizeSectionContent(content: string | undefined | null): string {
  if (!content) {
    return ""
  }
  return content.replace(/^\s+|\s+$/g, "")
}

/**
 * Build the markdown description used in ClickUp tasks created from this app.
 * Keeps the Objective section mandatory and adds Acceptance Criteria when provided.
 */
export function buildClickUpDescription(title: string, objective: string, acceptanceCriteria?: string): string {
  const safeObjective = objective?.trim() || ""
  const safeAcceptance = acceptanceCriteria?.trim() || ""

  const sections = ["## Objective", safeObjective || title?.trim() || "Objective pending"]

  if (safeAcceptance) {
    sections.push("", "## Acceptance Criteria", safeAcceptance)
  }

  return sections.join("\n")
}

/**
 * Parse a markdown description that follows the Objective / Acceptance Criteria template.
 */
export function parseClickUpDescription(description: string | null | undefined): ParsedClickUpDescription {
  if (!description?.trim()) {
    return {
      objective: "",
      acceptanceCriteria: "",
      raw: "",
    }
  }

  const raw = description
  const objectiveMatch = raw.match(/##\s*Objective\s*([\s\S]*?)(?=##\s*[A-Za-z]|$)/i)
  const acceptanceMatch = raw.match(/##\s*Acceptance\s+Criteria\s*([\s\S]*?)(?=##\s*[A-Za-z]|$)/i)

  const objective = normalizeSectionContent(objectiveMatch?.[1] ?? raw)
  const acceptanceCriteria = normalizeSectionContent(acceptanceMatch?.[1] ?? "")

  return {
    objective,
    acceptanceCriteria,
    raw,
  }
}
