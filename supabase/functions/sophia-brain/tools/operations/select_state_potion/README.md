Select state-potion tool skill target for S5.

Architecture constraints:

- User-message understanding lives in internal sub-skills called by
  `fillSelectStatePotionSlotsWithAi`: `subskills/potion_router.ts` for
  emotional-state/potion routing, then one potion-specific detail sub-skill from
  `subskills/potions/*`.
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
  exactly two best matching potions in `shortlist.options` and asks the user to
  choose.
- If the user names a valid potion, `explicit_potion_request` and
  `selected_potion` are set directly; no shortlist is needed.
- Once a potion is selected, chat requires exactly two detail fields before
  draft generation. These fields are chosen from the canonical front
  questionnaire and owned by potion-specific sub-skills:
  - `rappel`: `drift_target`, `drift_style`
  - `courage`: `avoidance_target`, `blocker_kind`
  - `guerison`: `recent_hurt`, `dominant_feeling`
  - `clarte`: `clarity_problem`, `clarity_need`
  - `amour`: `self_talk`, `love_need`
  - `apaisement`: `pressure_source`, `pressure_state`
- Visible draft/execution messages come from the draft generator JSON, including
  the immediate reassurance message and the separate potion/reminder info
  message.
- Draft validation is isolated in `draft_validation.ts`; the global dispatcher
  must not interpret approve/reject/revise/explain for this tool skill.
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
- Question examples are context for tone and targeting; the tool should ask at
  most one short WhatsApp-friendly question during intake unless it is
  presenting the two-potion shortlist.
