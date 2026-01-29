/**
 * Breakdown Action Flow v2 - Type definitions
 * 
 * This flow manages the breakdown of an existing action into a micro-step
 * with explicit user consent and preview validation.
 */

export type BreakdownCandidateStatus =
  | "awaiting_target"    // Waiting for user to specify which action
  | "awaiting_blocker"   // Waiting for user to describe the problem
  | "generating"         // Calling break-down-action edge function
  | "previewing"         // Micro-step proposed, waiting for validation
  | "applied"            // Micro-step inserted in DB
  | "abandoned"          // User declined or max clarifications

export interface ProposedStep {
  id?: string
  title: string
  description?: string
  tip?: string
  type?: string           // "mission" | "habit" | "framework"
  targetReps?: number
  tracking_type?: string
  time_of_day?: string
}

export interface BreakdownCandidate {
  /** Unique ID for this candidate flow (e.g., "brk_1706123456789") */
  id: string
  
  /** The action being broken down */
  target_action: {
    id?: string
    title: string
  }
  
  /** User's description of what's blocking them */
  blocker?: string
  
  /** Generated micro-step (from break-down-action edge function) */
  proposed_step?: ProposedStep
  
  /** Whether to insert in plan JSON + DB (default true) */
  apply_to_plan: boolean
  
  /** Current status in the flow */
  status: BreakdownCandidateStatus
  
  /** Number of clarification rounds (max 1 before abandonment) */
  clarification_count: number
  
  /** Last clarification reason (if user said no/modify) */
  last_clarification_reason?: string
  
  /** When the candidate was created */
  started_at: string
  
  /** Last update timestamp */
  updated_at: string
}

// ═══════════════════════════════════════════════════════════════════════════
// Helper functions
// ═══════════════════════════════════════════════════════════════════════════

export function createBreakdownCandidate(opts: {
  target_action?: { id?: string; title: string }
  blocker?: string
  apply_to_plan?: boolean
  status?: BreakdownCandidateStatus
  now?: Date
}): BreakdownCandidate {
  const now = opts.now ?? new Date()
  const ts = now.toISOString()
  
  const status: BreakdownCandidateStatus = opts.status ??
    (!opts.target_action?.title ? "awaiting_target" :
     !opts.blocker ? "awaiting_blocker" :
     "generating")
  
  return {
    id: `brk_${now.getTime()}`,
    target_action: opts.target_action ?? { title: "" },
    blocker: opts.blocker,
    apply_to_plan: opts.apply_to_plan !== false, // default true
    status,
    clarification_count: 0,
    started_at: ts,
    updated_at: ts,
  }
}

export function updateBreakdownCandidate(
  candidate: BreakdownCandidate,
  updates: Partial<Omit<BreakdownCandidate, "id" | "started_at">>,
  now?: Date
): BreakdownCandidate {
  return {
    ...candidate,
    ...updates,
    updated_at: (now ?? new Date()).toISOString(),
  }
}

export function shouldAbandonBreakdownCandidate(candidate: BreakdownCandidate): boolean {
  return candidate.clarification_count >= 1
}

export function hasProposedStep(candidate: BreakdownCandidate): boolean {
  return Boolean(candidate.proposed_step?.title)
}


