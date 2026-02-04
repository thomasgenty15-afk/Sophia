/**
 * UpdateActionCandidate Types
 * 
 * Single source of truth for update action flow state.
 * Used by the simplified Update Action v2 flow.
 */

export type UpdateCandidateStatus =
  | "awaiting_confirm"  // Preview shown, waiting for user response
  | "applied"           // Changes applied to DB
  | "abandoned"         // User declined or max clarifications

export interface TargetAction {
  id?: string
  title: string
  current_reps?: number
  current_days?: string[]
  current_time_of_day?: string
}

export interface ProposedChanges {
  new_reps?: number
  new_days?: string[]
  new_time_of_day?: string
  new_title?: string
}

export interface UpdateActionCandidate {
  /** Unique ID for this candidate flow (e.g., "upd_1706123456789") */
  id: string
  
  /** The action being modified */
  target_action: TargetAction
  
  /** The proposed changes */
  proposed_changes: ProposedChanges
  
  /** Current status in the flow */
  status: UpdateCandidateStatus
  
  /** Number of clarification rounds (max 1 before abandonment) */
  clarification_count: number
  
  /** Last clarification reason (if user said no/modify) */
  last_clarification_reason?: string
  
  /** When the candidate was created */
  started_at: string
  
  /** Last update timestamp */
  updated_at: string
}

/**
 * Create a new UpdateActionCandidate with sensible defaults.
 */
export function createUpdateCandidate(opts: {
  target_action: TargetAction
  proposed_changes: ProposedChanges
  now?: Date
}): UpdateActionCandidate {
  const now = opts.now ?? new Date()
  const ts = now.toISOString()
  return {
    id: `upd_${now.getTime()}`,
    target_action: {
      ...opts.target_action,
      title: opts.target_action.title.trim().slice(0, 120),
    },
    proposed_changes: opts.proposed_changes,
    status: "awaiting_confirm",
    clarification_count: 0,
    started_at: ts,
    updated_at: ts,
  }
}

/**
 * Update an UpdateActionCandidate immutably.
 */
export function updateUpdateCandidate(
  candidate: UpdateActionCandidate,
  updates: Partial<Omit<UpdateActionCandidate, "id" | "started_at">>,
  now?: Date
): UpdateActionCandidate {
  return {
    ...candidate,
    ...updates,
    updated_at: (now ?? new Date()).toISOString(),
  }
}

/**
 * Check if the candidate has reached max clarifications (should abandon).
 */
export function shouldAbandonUpdateCandidate(candidate: UpdateActionCandidate): boolean {
  return candidate.clarification_count >= 1
}

/**
 * Check if there are actual changes in the candidate.
 */
export function hasActualChanges(candidate: UpdateActionCandidate): boolean {
  const p = candidate.proposed_changes
  return (
    p.new_reps !== undefined ||
    (p.new_days !== undefined && p.new_days.length > 0) ||
    p.new_time_of_day !== undefined ||
    p.new_title !== undefined
  )
}

/**
 * Get a human-readable change type for logging.
 */
export function getChangeType(candidate: UpdateActionCandidate): "frequency" | "days" | "time" | "title" | "mixed" | "none" {
  const p = candidate.proposed_changes
  const changes: string[] = []
  if (p.new_reps !== undefined) changes.push("frequency")
  if (p.new_days !== undefined && p.new_days.length > 0) changes.push("days")
  if (p.new_time_of_day !== undefined) changes.push("time")
  if (p.new_title !== undefined) changes.push("title")
  
  if (changes.length === 0) return "none"
  if (changes.length === 1) return changes[0] as any
  return "mixed"
}




