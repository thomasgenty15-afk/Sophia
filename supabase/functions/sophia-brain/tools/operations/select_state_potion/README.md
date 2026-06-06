Select state-potion tool skill target for S5.

Architecture constraints:

- User-message understanding lives in internal sub-skills called by
  `fillSelectStatePotionSlotsWithAi`: `subskills/potion_router.ts` for
  emotional-state/potion routing, then the detail progression sub-skill for the
  selected potion fields.
- When a handoff is already active, `subskills/local_flow_dispatcher.ts`
  interprets the message against the active flow before the global dispatcher
  can regain ownership.
- `runSelectStatePotionIntake` only reads structured JSON, validates enums,
  merges `intake_state`, checks missing slots, routes between internal
  sub-skills, and calls the potion generator.
- No regex, keyword fallback, or hardcoded slot extraction should be added to
  the intake.
- If the slot filler cannot produce structured output, the operation keeps the
  intake active and asks one neutral recovery question; it must not guess a
  potion from text. Recommendation payloads with explicit missing structured
  fields still exit as invalid instead of inventing missing structure.
- Recommendation payloads must already provide valid structured `state` and
  `potion_type` values.
- If the user asks for a potion without naming one, the slot filler proposes
  the best matching potions in `shortlist.options`; the visible agent clarifies
  by need, not by product-name list.
- If the user names a valid potion, `explicit_potion_request` and
  `selected_potion` are set directly; no shortlist is needed.
- Once a potion is selected, the runtime must first expose a structured
  `potion_selected` stage. Potion-specific detail fields belong to the next
  stage/sub-skill and must not be collected before selection is visible.
  Detail field identities are chosen from the canonical front questionnaire and
  owned by potion-specific sub-skills:
  - `rappel` technical id / visible `Potion anti-décrochage`: `drift_target`,
    `drift_style`
  - `courage`: `avoidance_target`, `blocker_kind`
  - `guerison`: `recent_hurt`, `dominant_feeling`
  - `clarte`: `plan_meaning_loss_reason`
  - `amour`: `love_lack_context`, `love_state`
  - `apaisement`: `pressure_source`, `pressure_state`
- Visible user messages come from `visible_agents/agent.ts`, selected by stage
  from structured flow state. `renderer.ts` is disabled for visible handoff
  prose and must not be reintroduced as a template renderer. Deterministic code
  may validate labels, platform fields, platform path and no activation claim,
  but it must not write the conversation.
- There is no draft validation or executable confirmation path for this skill.
  A user attempt to launch from chat becomes a non-mutant `apply_attempt`.
- Front (`activate-potion-v1`) and chat (`select_state_potion`) both inject the
  same DB base context through `_shared/potion-base-context.ts`: transformation
  summaries, phase 1 deep-why answers, plan strategy, current plan items,
  same-type prior potions, and active potion reminders.
- The DB base context is prompt material only. It must not become a deterministic
  slot filler or a second classifier for the user's emotional state.
- `catalog.ts` is the prompt-facing catalogue for this tool skill. It must be
  derived from `_shared/v2-potions.ts` so the IA sees the canonical potion
  descriptions, emotional triggers, example questions, and follow-up rationale
  without creating a second source of truth.
- Question examples are context for tone and targeting. They must not become
  chat templates. The visible agent should ask at most one short
  WhatsApp-friendly question during intake.
