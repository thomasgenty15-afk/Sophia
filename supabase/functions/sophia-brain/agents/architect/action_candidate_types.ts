/**
 * ActionCandidate Types
 * 
 * Single source of truth for action creation flow state.
 * Used by the simplified "juste milieu" Create Action v2 flow.
 */

export type ActionCandidateStatus =
  | "exploring"        // User is exploring the idea, not committed
  | "awaiting_confirm" // Sophia suggested, waiting for intent confirmation
  | "previewing"       // Params proposed, waiting for user validation
  | "created"          // Successfully inserted in DB
  | "abandoned"        // User declined or max clarifications reached

export type ActionCandidateType = "habit" | "mission" | "framework" | "unknown"

export type ActionCandidateProposedBy = "sophia" | "user"

export interface ActionCandidateParams {
  title?: string
  description?: string
  target_reps?: number
  time_of_day?: "morning" | "afternoon" | "evening" | "night" | "any_time"
  scheduled_days?: string[]  // e.g., ["mon", "wed", "fri"]
  tips?: string
}

export interface ActionCandidate {
  /** Unique ID for this candidate flow (e.g., "cand_1706123456789") */
  id: string
  
  /** Human-readable label for the action (e.g., "Méditation 10min") */
  label: string
  
  /** Type of action: habit (recurring), mission (one-shot), framework (journaling), or unknown */
  type: ActionCandidateType
  
  /** Who proposed this action */
  proposed_by: ActionCandidateProposedBy
  
  /** Current status in the flow */
  status: ActionCandidateStatus
  
  /** Parameters to validate before creation (populated during preview phase) */
  params_to_validate?: ActionCandidateParams
  
  /** Number of clarification rounds (max 1 before abandonment) */
  clarification_count: number
  
  /** Last clarification reason (if user said no/modify) */
  last_clarification_reason?: string
  
  /** When the candidate was created */
  started_at: string
  
  /** Last update timestamp */
  updated_at: string
  
  /** Optional: rationale for why this action was suggested */
  rationale?: string
}

/**
 * Create a new ActionCandidate with sensible defaults.
 */
export function createActionCandidate(opts: {
  label: string
  type?: ActionCandidateType
  proposed_by: ActionCandidateProposedBy
  status?: ActionCandidateStatus
  params?: ActionCandidateParams
  rationale?: string
  now?: Date
}): ActionCandidate {
  const now = opts.now ?? new Date()
  const ts = now.toISOString()
  return {
    id: `cand_${now.getTime()}`,
    label: opts.label.trim().slice(0, 120),
    type: opts.type ?? "unknown",
    proposed_by: opts.proposed_by,
    status: opts.status ?? "exploring",
    params_to_validate: opts.params,
    clarification_count: 0,
    started_at: ts,
    updated_at: ts,
    rationale: opts.rationale?.slice(0, 300),
  }
}

/**
 * Update an ActionCandidate immutably.
 */
export function updateActionCandidate(
  candidate: ActionCandidate,
  updates: Partial<Omit<ActionCandidate, "id" | "started_at">>,
  now?: Date
): ActionCandidate {
  return {
    ...candidate,
    ...updates,
    updated_at: (now ?? new Date()).toISOString(),
  }
}

/**
 * Check if the candidate has reached max clarifications (should abandon).
 */
export function shouldAbandonCandidate(candidate: ActionCandidate): boolean {
  return candidate.clarification_count >= 1
}

/**
 * Format ActionCandidate params for display in a preview message.
 */
export function formatCandidatePreview(candidate: ActionCandidate): string {
  const p = candidate.params_to_validate
  if (!p) return candidate.label

  const lines: string[] = []
  if (p.title) lines.push(`→ ${p.title}`)
  if (p.target_reps) {
    const freq = candidate.type === "mission" ? "1 fois" : `${p.target_reps}×/semaine`
    lines.push(`→ Fréquence: ${freq}`)
  }
  if (p.time_of_day && p.time_of_day !== "any_time") {
    const tod: Record<string, string> = {
      morning: "le matin",
      afternoon: "l'après-midi",
      evening: "le soir",
      night: "la nuit",
    }
    lines.push(`→ Moment: ${tod[p.time_of_day] ?? p.time_of_day}`)
  }
  if (p.scheduled_days && p.scheduled_days.length > 0) {
    const dayMap: Record<string, string> = {
      mon: "Lundi", tue: "Mardi", wed: "Mercredi", thu: "Jeudi",
      fri: "Vendredi", sat: "Samedi", sun: "Dimanche",
    }
    const days = p.scheduled_days.map((d) => dayMap[d] ?? d).join(", ")
    lines.push(`→ Jours: ${days}`)
  }

  return lines.join("\n")
}


