# clarification Local Flow Architecture

Document de conception pour transformer `clarification` en flow local
multi-tour.

```txt
global dispatcher ou local dispatcher
-> detects 2+ strong competing structured signals
-> clarification.local_dispatcher
-> reducer non-mutant
-> visible prompt stage-specific
-> resolved handoff to target dispatcher with note_information
```

Le point central : `clarification` n'est pas un routeur global bis. Il ne part
pas du message brut pour inventer une intention. Il arbitre uniquement entre
des signaux candidats deja produits par un dispatcher ou un flow actif.

## Mental Model

`clarification` intervient quand Sophia a plusieurs directions plausibles avec
confiance elevee, et qu'il serait dangereux ou rigide de choisir trop vite.

Exemples :

- `one_shot_reminder` vs `create_recurring_reminder` ;
- `product_help` vs `prepare_attack_card` ;
- `prepare_attack_card` vs `prepare_defense_card` ;
- `select_state_potion` vs `emotional_repair` ;
- `adjust_plan_item` vs `track_progress_plan_item` ;
- deux plans, deux actions, deux surfaces ou deux scopes plausibles ;
- readiness de handoff ambigue.

Le role de `clarification` :

- exposer le conflit de maniere simple ;
- poser une question discriminante ;
- accepter une reponse en plusieurs tours ;
- stabiliser le candidat choisi ;
- annuler proprement si le user abandonne ;
- sortir vers global seulement si le user apporte un autre sujet clair ;
- passer une `note_information` au dispatcher cible.

## Current Shape

Aujourd'hui `clarification_tool` existe comme primitive LLM transverse :

```txt
TurnFrame
-> clarification_candidate_builder
-> clarification_arbitrator
-> runClarificationTool
-> renderClarificationQuestion
-> writeClarificationState
```

Fichiers actuels :

- `supabase/functions/sophia-brain/clarification/contract.ts`
- `supabase/functions/sophia-brain/clarification/tool.ts`
- `supabase/functions/sophia-brain/clarification/renderer.ts`
- `supabase/functions/sophia-brain/clarification/state.ts`
- `supabase/functions/sophia-brain/router/clarification_candidate_builder.ts`
- `supabase/functions/sophia-brain/router/clarification_arbitrator.ts`
- `supabase/functions/sophia-brain/skills/_shared/clarification_adapter.ts`

La limite actuelle : le runtime traite souvent `orientation_clarification`
comme une question ponctuelle. Mais certains conflits ont besoin de plusieurs
tours, avec abandon, revision, explication ou topic change.

## Target Shape

Start :

```txt
source dispatcher produces candidate_signals
-> clarification.local_dispatcher receives candidate_signals + note_information
-> visible prompt asks discriminating question
-> write __clarification_flow_state
```

Followup :

```txt
active clarification state exists
-> skip normal global dispatcher
-> clarification.local_dispatcher
-> reducer
-> visible prompt or target handoff
```

Resolution :

```txt
clarification.local_dispatcher
-> flow_action=resolved_to_candidate
-> reducer validates selected_candidate_id exists
-> note_information for target dispatcher
-> target dispatcher receives ownership
```

The target dispatcher then fills its own JSON. `clarification` does not execute
the target action directly.

## Active Flow Ownership

When `clarification` is active :

- the normal global dispatcher must not run ;
- only `clarification.local_dispatcher` interprets the user's answer ;
- safety can preempt through `safety_preempt` ;
- product/status inline tools are allowed only as roundtrips if the user asks
  for an explanation/status needed to choose ;
- global dispatcher runs only after `exit_to_global_dispatcher` with
  `note_information` ;
- local stop does not call global on the same turn.

## Candidate Signal Contract

The source dispatcher or flow must provide closed candidates :

```json
{
  "clarification_id": "string",
  "source_dispatcher": "global|local",
  "source_flow_id": "string|null",
  "ambiguity_kind": "intent|target|scope|surface|timing|confirmation|handoff_readiness",
  "conflict_summary": "string",
  "candidate_signals": [
    {
      "candidate_id": "string",
      "label": "string",
      "target_dispatcher": "global|safety_crisis|product_help|status_recap|prepare_attack_card|prepare_defense_card|select_state_potion|create_recurring_reminder|one_shot_reminder|adjust_plan_item|track_progress_plan_item|emotional_repair|demotivation_repair|other",
      "operation_type": "string|null",
      "surface_id": "string|null",
      "confidence": "medium|high",
      "why_plausible": "string",
      "structured_payload_hint": {}
    }
  ],
  "known_context": {},
  "note_information": {
    "source_flow_id": "string",
    "source_flow_presentation": "string",
    "handoff_context_for_next_dispatcher": "string"
  }
}
```

Rules :

- `clarification` can only select a `candidate_id` present in
  `candidate_signals`.
- It can mark the conflict as still ambiguous.
- It can cancel or stop.
- It can exit to global if the user brings another clear topic.
- It cannot create a new candidate from the message text.
- It cannot mutate DB, tools, reminders, cards, potions or plan.

## Clarification State

```json
{
  "skill_id": "clarification",
  "mode": "local_flow",
  "clarification_id": "string",
  "status": "asking|still_ambiguous|resolved|cancelled|topic_change|safety",
  "turn_count": 0,
  "max_turns": 4,
  "source_dispatcher": "global|local",
  "source_flow_id": "string|null",
  "ambiguity_kind": "intent|target|scope|surface|timing|confirmation|handoff_readiness",
  "conflict_summary": "string",
  "candidate_signals": [],
  "selected_candidate_id": "string|null",
  "user_words": ["string"],
  "inbound_note_information": {},
  "outbound_note_information": {}
}
```

`max_turns` is a guardrail, not a business decision. If the model still cannot
resolve after several turns, the dispatcher should produce `still_ambiguous`
and the visible prompt should ask a simpler final choice or acknowledge that the
flow cannot choose.

## Note Information

Every ownership transfer out of clarification requires `note_information`.

For resolved candidate :

```json
{
  "source_flow_id": "clarification",
  "source_flow_presentation": "clarification arbitre un conflit entre plusieurs signaux forts avant de rendre l'ownership au bon dispatcher.",
  "handoff_reason": "clarification_resolved",
  "target_dispatcher": "string",
  "handoff_context_for_next_dispatcher": "Le user a choisi ou clarifie X. Reprendre les candidates initiales, la reponse user et le payload structure du candidat selectionne.",
  "structured_context": {
    "clarification_id": "string",
    "selected_candidate_id": "string",
    "selected_candidate_label": "string",
    "original_conflict_summary": "string",
    "user_words": ["string"],
    "selected_candidate_payload_hint": {}
  }
}
```

For topic change :

- target is global ;
- note explains the previous conflict and the new user direction.

For safety :

- target is `safety_crisis` ;
- note includes source context and risk summary.

For inline product/status :

- target is product/status inline ;
- note includes active clarification conflict and the user question ;
- after inline answer, the parent clarification state resumes.

## Stop Local Without Handoff

If the user says only that they do not want to answer or continue :

- `laisse tomber` ;
- `arrete les questions` ;
- `je sais pas, oublie` ;
- `on s'en fout` ;

the dispatcher should return `exit_to_global_dispatcher` or
`cancel_clarification`.

The reducer should :

- clear `__clarification_flow_state` ;
- produce a short acknowledgement ;
- not call the global dispatcher on the same turn ;
- not ask another question ;
- not route to a target candidate.

## Runtime Flow

```txt
user message
-> active flow lookup
-> if active clarification:
     clarification.local_dispatcher
   else if source dispatcher produced 2+ strong candidates:
     start clarification.local_dispatcher
-> reducer
-> visible prompt or target handoff
```

## Invariants To Test

- two strong candidates start clarification ;
- one clear candidate does not start clarification ;
- clarification can stay active over multiple turns ;
- user answer can resolve to candidate ;
- selected candidate must be in candidate_signals ;
- resolved candidate does not execute directly ;
- resolved candidate transfers to target dispatcher with note_information ;
- cancellation stops locally without global ;
- topic change exits to global with note_information ;
- safety exits to safety local dispatcher with note_information ;
- product help inline keeps clarification parent state ;
- no regex business logic ;
- no renderer deterministic visible in nominal path ;
- no DB write or tool execution from clarification.

