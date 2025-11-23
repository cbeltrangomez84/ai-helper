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
 * Handles both markdown format (## Objective) and plain text format (Objective).
 */
export function parseClickUpDescription(description: string | null | undefined): ParsedClickUpDescription {
  if (!description?.trim()) {
    return {
      objective: "",
      acceptanceCriteria: "",
      raw: "",
    }
  }

  const raw = description.trim()
  
  // Try to match Objective section with markdown header (## Objective)
  let objectiveMatch = raw.match(/##\s*Objective\s*\n+([\s\S]*?)(?=\n##\s*(?:Acceptance\s+Criteria|[A-Za-z])|$)/i)
  
  // If not found, try plain text format (Objective without ##)
  if (!objectiveMatch) {
    objectiveMatch = raw.match(/^Objective\s*\n+([\s\S]*?)(?=\n\s*Acceptance\s+Criteria\s*\n|$)/i)
  }
  
  // Try to match Acceptance Criteria section with markdown header (## Acceptance Criteria)
  let acceptanceMatch = raw.match(/##\s*Acceptance\s+Criteria\s*\n+([\s\S]*?)(?=\n##\s*[A-Za-z]|$)/i)
  
  // If not found, try plain text format (Acceptance Criteria without ##)
  if (!acceptanceMatch) {
    acceptanceMatch = raw.match(/\n\s*Acceptance\s+Criteria\s*\n+([\s\S]*?)$/i)
  }

  // Extract objective
  let objective = ""
  if (objectiveMatch && objectiveMatch[1]) {
    objective = normalizeSectionContent(objectiveMatch[1])
  } else {
    // If no Objective header found, check if there's content before Acceptance Criteria
    // Try both markdown and plain text formats
    const beforeAcceptanceMarkdown = raw.split(/##\s*Acceptance\s+Criteria/i)[0]
    const beforeAcceptancePlain = raw.split(/\n\s*Acceptance\s+Criteria\s*\n/i)[0]
    const beforeAcceptance = beforeAcceptanceMarkdown.length < beforeAcceptancePlain.length 
      ? beforeAcceptanceMarkdown 
      : beforeAcceptancePlain
    
    if (beforeAcceptance && beforeAcceptance.trim()) {
      // Remove any "Objective" header if present (with or without ##)
      const cleaned = beforeAcceptance.replace(/^##?\s*Objective\s*\n+/i, "").trim()
      if (cleaned) {
        objective = normalizeSectionContent(cleaned)
      }
    }
  }

  // Extract acceptance criteria
  const acceptanceCriteria = normalizeSectionContent(acceptanceMatch?.[1] ?? "")

  return {
    objective,
    acceptanceCriteria,
    raw,
  }
}
