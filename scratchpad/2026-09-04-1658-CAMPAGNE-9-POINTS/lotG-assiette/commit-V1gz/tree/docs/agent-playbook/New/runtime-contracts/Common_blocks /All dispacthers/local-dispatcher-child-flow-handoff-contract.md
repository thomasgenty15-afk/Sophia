# Local Dispatcher Child Flow Handoff Contract

Ce bloc est commun a tous les dispatchers locaux.

## Principe

Un handoff vers un autre flow local n'est pas une sortie vers le dispatcher
global.

Le flow source reste le parent logique. Le flow cible devient un child flow
temporaire, traite un besoin specialise, puis rend la main au parent avec un
memo de retour.

```txt
parent local flow
-> handoff_to_child_flow
-> child local flow
-> return_to_parent
-> parent local flow resumes
```

## Regle Centrale

```txt
Never use exit_to_global_dispatcher to start another local flow.
Never use exit_to_global_dispatcher for parent -> child -> parent flows.
exit_to_global_dispatcher means the parent flow gives ownership back to global.
handoff_to_child_flow means the parent flow is paused and must be resumed.
```

`exit_to_global_dispatcher` est reserve aux vraies sorties du flow local :

- stop / refusal / cancel / later ;
- topic change global ;
- product/status/preference/tool request handled by global routing ;
- safety handoff according to the safety contract ;
- unknown exit where global must re-arbitrate.

Il ne doit jamais signifier :

- lancer `coaching_recommendation` ;
- lancer un autre dispatcher local ;
- creer un sous-flow ;
- revenir automatiquement au parent apres une reponse specialisee.

## Scope Actuel

Aujourd'hui, les handoffs parent -> child autorises sont seulement :

- `daily_action_review_v1` -> `coaching_recommendation` ;
- `weekly_adaptive_review_v1` -> `coaching_recommendation`.

Aucun autre parent -> child ne doit etre ajoute sans mettre a jour ce contrat.

## Flow Action Canonique

Le dispatcher local source doit retourner :

```json
{
  "flow_action": "handoff_to_child_flow",
  "child_flow": "coaching_recommendation",
  "return_to_parent": {
    "parent_flow_id": "daily_action_review_v1",
    "return_focus": "resume_daily_after_coaching_recommendation",
    "preserve_parent_state": true
  },
  "child_flow_context": {
    "handoff_reason": "flow_interruption",
    "bridge_reason": "action_blocker",
    "parent_state_summary": "string",
    "action_context": {},
    "known_values": {},
    "missing_or_weak_values": []
  },
  "evidence": ["string"]
}
```

## Required Fields

### `flow_action`

Must be exactly:

```txt
handoff_to_child_flow
```

Do not use:

```txt
exit_to_global_dispatcher
```

### `child_flow`

The local flow that receives temporary ownership.

Allowed now:

```txt
coaching_recommendation
```

### `return_to_parent`

Required for every child handoff.

Fields:

- `parent_flow_id`: source flow id, for example `daily_action_review_v1`.
- `return_focus`: concrete resume instruction for the parent.
- `preserve_parent_state`: must be `true` unless safety overrides everything.

Recommended `return_focus` values:

- `resume_daily_after_coaching_recommendation`
- `resume_weekly_after_coaching_recommendation`

### `child_flow_context`

The filtered context the child needs to do its job.

Required:

- `handoff_reason`
- `bridge_reason`
- `parent_state_summary`

Recommended:

- `action_context`
- `known_values`
- `missing_or_weak_values`
- `affect_context`
- `recommended_next_focus`

Do not include:

- raw DB dumps ;
- raw memory dumps ;
- full prompts ;
- full message history ;
- parent internal state that the child cannot use safely ;
- uncommitted business facts presented as committed facts.

## Bridge Reasons

For `coaching_recommendation`, the source flow should use a concrete reason:

- `action_blocker`
- `recurrent_forgetting`
- `action_too_hard`
- `low_relevance`
- `emotional_friction`
- `needs_lever_choice`
- `dropoff_risk`
- `unknown`

The child flow recommends. It does not mutate the parent state.

## Runtime Responsibilities

When receiving `handoff_to_child_flow`, the runtime must:

1. validate that `child_flow` is allowed for the parent ;
2. preserve the parent flow state ;
3. activate the child flow as current owner ;
4. inject `child_flow_context` into the child ;
5. prevent parent visible rendering on the handoff turn unless the child owns it ;
6. require the child to return a parent memo or explicit completion state ;
7. resume the parent flow from `return_to_parent.return_focus`.

The runtime must not route through the global dispatcher just to start the
child flow.

## Child Return Contract

When the child finishes, it must produce a parent return memo:

```json
{
  "return_to_parent": {
    "needed": true,
    "parent_flow_id": "daily_action_review_v1",
    "return_focus": "resume_daily_after_coaching_recommendation",
    "return_summary": "string",
    "preserve_parent_state": true
  },
  "parent_note_information": {
    "source_flow_id": "coaching_recommendation",
    "target_dispatcher": "daily_action_review_v1",
    "handoff_reason": "return_to_parent",
    "handoff_context_for_next_dispatcher": "string",
    "structured_context": {
      "bridge_kind": "coaching_recommendation_to_parent",
      "recommended_feature": "string",
      "parent_flow_id": "daily_action_review_v1",
      "recommended_next_focus": "resume_daily_after_coaching_recommendation"
    },
    "confidence": "low|medium|high"
  }
}
```

The parent then resumes its own task. For daily, that means returning to the
current target coverage: done / not done for each pending target.

## Visible Policy

The parent flow does not produce a parent visible message on the handoff turn.

The child flow owns the visible response while active.

When the child returns, the parent may produce the next parent visible message
only after the runtime has restored parent ownership.

## Anti Patterns

Do not emit:

```json
{
  "flow_action": "exit_to_global_dispatcher",
  "note_information": {
    "target_dispatcher": "coaching_recommendation"
  }
}
```

This is invalid for parent -> child flow handoff.

Why:

- the name says global but the target is local ;
- QA traces become misleading ;
- return-to-parent is implicit and fragile ;
- the global dispatcher may re-arbitrate the same message incorrectly ;
- reports can mark normal handoffs as routing failures.

## Checklist

Before returning `handoff_to_child_flow`, verify:

- Is the current message still related to the parent flow but needs a specialised support flow?
- Is the child flow allowed by this contract?
- Is the parent state preserved?
- Is `return_to_parent` complete?
- Does the child context contain the exact action / stage / uncertainty that caused the handoff?
- Is there no durable mutation by the parent on this turn?
- Is `exit_to_global_dispatcher` absent?

## Formule Courte

```txt
Global exit = exit_to_global_dispatcher.
Local child flow = handoff_to_child_flow.
Daily/weekly -> coaching = child flow, never global exit.
Child recommends, then returns a memo.
Parent resumes and commits only its own business state.
```
