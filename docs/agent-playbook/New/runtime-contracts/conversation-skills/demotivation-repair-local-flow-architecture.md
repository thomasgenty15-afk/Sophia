# demotivation_repair Local Flow Architecture

Document de cadrage pour migrer `demotivation_repair` vers une architecture
locale :

```txt
demotivation repair route / active repair state
-> demotivation_repair.local_dispatcher
-> reducer non-mutant
-> visible prompt stage-specific
-> optional structured handoff to select_state_potion
```

Le point particulier de ce flow : `demotivation_repair` peut ouvrir un bridge
consenti vers trois potions seulement :

- `clarte`
- `courage`
- `rappel` avec label visible `Potion anti-décrochage`

Le bridge doit transmettre assez de contexte pour que `select_state_potion` et
le sous-skill potion cible ne reposent pas les questions deja clarifiees pendant
la reparation motivationnelle.

Ce bridge doit aussi respecter le contrat de `Note d'information` :

- presentation succincte du flow qui vient d'etre quitte ;
- contexte utile au prochain dispatcher pour remplir son JSON sans repartir du
  texte brut ni refaire diagnostiquer le user.

Reference :
`docs/agent-playbook/New/runtime-contracts/Note d'information`

## Mental Model

`demotivation_repair` intervient quand le user exprime :

- fatigue motivationnelle ;
- perte de sens ;
- accumulation d'echecs ;
- evitement ;
- surcharge ;
- "je n'y arrive plus" ;
- "ca sert a rien" ;
- "je repousse encore" ;
- demande d'un plus petit geste ou d'un soutien d'elan.

Le flow ne doit pas transformer la demotivation en probleme d'execution trop
vite. Il doit d'abord comprendre ce qui casse l'elan : energie, sens, peur,
surcharge, repetition d'echec ou glissement d'un repere connu.

Une potion devient pertinente seulement quand :

- le diagnostic motivationnel est assez clair ;
- le besoin durable est nomme ;
- le user consent explicitement au bridge potion ;
- la potion soutient la suite, sans remplacer le repair conversationnel.

## Current Shape

Aujourd'hui le skill existe deja :

```txt
runDemotivationRepairStructuredIntake
-> DemotivationRepairDecision
-> normalizeDemotivationRepairDecision
-> reduceDemotivationRepairTurn
-> renderer
-> ConversationSkillOutput
```

Fichiers actuels :

- `supabase/functions/sophia-brain/skills/demotivation_repair/contract.ts`
- `supabase/functions/sophia-brain/skills/demotivation_repair/intake.ts`
- `supabase/functions/sophia-brain/skills/demotivation_repair/reducer.ts`
- `supabase/functions/sophia-brain/skills/demotivation_repair/renderer.ts`
- `supabase/functions/sophia-brain/skills/demotivation_repair/skill.ts`
- `supabase/functions/sophia-brain/skills/demotivation_repair/prompt.ts`

Le contrat connait deja les suggestions `select_state_potion`, mais le bridge
doit devenir un passage de baton structure vers les sous-skills potion locaux.

## Target Shape

Standalone entry :

```txt
global dispatcher selects demotivation_repair
-> demotivation_repair.local_dispatcher
-> reducer
-> visible prompt
-> write __active_skill_state.skill_id="demotivation_repair"
```

Followup :

```txt
active demotivation_repair state exists
-> skip global dispatcher normal
-> demotivation_repair.local_dispatcher
-> reducer
-> visible prompt
-> continue / close / handoff_to_potion / exit_to_global_dispatcher
```

Potion bridge :

```txt
demotivation_repair.local_dispatcher
-> flow_action=potion_bridge_offer
-> visible prompt asks consent
-> user confirms
-> flow_action=handoff_to_potion_flow
-> reducer emits structured potion_bridge_context
-> runtime starts select_state_potion with selected_potion + bridge context
-> target potion subskill consumes context as field candidates
```

The global dispatcher should not re-decide the potion from raw text once
`demotivation_repair` has produced a structured `handoff_to_potion_flow`.

If the runtime cannot perform direct owner transfer yet, the fallback bridge is
an explicit local exit memo. In that fallback, the global dispatcher must honor
the structured `potion_bridge_context` and must not infer from the confirmation
text alone.

## Potion Bridge Scope

### Potion de clarté

Use when the durable need is :

- restoring meaning ;
- reconnecting actions to a deeper why ;
- plan feels mechanical ;
- user has clarified what no longer makes sense ;
- a cap / reason / direction needs to stay alive for several days.

Not for :

- "what should I do now ?" ;
- prioritization ;
- action breakdown ;
- next micro-action.

Target subskill fields :

```json
{
  "selected_potion": "clarte",
  "target_fields": {
    "plan_meaning_loss_reason": "why the plan/actions no longer feel meaningful today"
  }
}
```

### Potion de courage

Use when the durable need is :

- crossing a fear ;
- facing an avoided action ;
- fear of result, judgement, discomfort or conflict ;
- protecting momentum while crossing an identified avoidance.

Target subskill fields :

```json
{
  "selected_potion": "courage",
  "target_fields": {
    "avoidance_target": "what the user avoids concretely",
    "blocker_kind": "resultat|regard|inconfort|conflit"
  }
}
```

### Potion anti-décrochage

Internal selected potion id is `rappel`. Visible label must be
`Potion anti-décrochage`, never `Potion rappel`.

Use when the durable need is :

- keep a known gesture alive ;
- protect a known cap ;
- prevent forgetting, postponing or letting a routine slide ;
- reconnect to something already chosen that tends to drift.

Not for deep loss of meaning.

Target subskill fields :

```json
{
  "selected_potion": "rappel",
  "target_fields": {
    "drift_target": "known gesture/cap/routine/action that is slipping",
    "drift_style": "oubli|repousse|laisse_filer|baisse_elan"
  }
}
```

## Bridge Context Contract

`demotivation_repair` must send this context when it bridges to a potion :

```json
{
  "origin_flow": "demotivation_repair",
  "origin_flow_status": "diagnosed|bridge_consented",
  "note_information": {
    "source_flow_presentation": "demotivation_repair vient de clarifier une baisse d'elan, son origine motivationnelle, et le type de soutien durable qui peut aider le user.",
    "handoff_context_for_next_dispatcher": "string",
    "target_flow": "select_state_potion",
    "target_local_dispatcher_hint": "Entrer directement dans la potion selectionnee, consommer les candidats fournis, et ne pas refaire diagnostiquer la demotivation."
  },
  "origin_turn_summary": "string",
  "repair_intent": "fatigue_drop|loss_of_meaning|failure_accumulation|avoidance_loop|overwhelm|asks_smaller_step|unclear",
  "motivation_state": "fatigue|loss_of_meaning|failure_accumulation|avoidance|overwhelm|unclear",
  "action_readiness": "none|hypothetical|ready|already_chosen",
  "demotivation_episode": {
    "summary": "string",
    "user_words": ["string"],
    "identity_freeze_risk": true,
    "already_diagnosed": true
  },
  "durable_need": {
    "kind": "meaning_reconnection|courage_through_avoidance|anti_dropout_anchor",
    "summary": "string"
  },
  "selected_potion": "clarte|courage|rappel",
  "visible_potion_label": "Potion de clarté|Potion de courage|Potion anti-décrochage",
  "selection_reason": "string",
  "prefill_candidates": {
    "plan_meaning_loss_reason": {
      "candidate_value": "string|null",
      "confidence": "low|medium|high",
      "source": "demotivation_repair"
    },
    "avoidance_target": {
      "candidate_value": "string|null",
      "confidence": "low|medium|high",
      "source": "demotivation_repair"
    },
    "blocker_kind": {
      "option_value": "resultat|regard|inconfort|conflit|null",
      "option_label": "Résultat|Regard|Inconfort|Conflit|null",
      "confidence": "low|medium|high",
      "source": "demotivation_repair"
    },
    "drift_target": {
      "candidate_value": "string|null",
      "confidence": "low|medium|high",
      "source": "demotivation_repair"
    },
    "drift_style": {
      "option_value": "oubli|repousse|laisse_filer|baisse_elan|null",
      "option_label": "Oubli|Repousse|Laisse filer|Baisse d'élan|null",
      "confidence": "low|medium|high",
      "source": "demotivation_repair"
    }
  },
  "handoff_instruction_for_potion_subskill": "Use these as candidates, not forced locked values. Ask only for missing or low-confidence details.",
  "no_chat_mutation": {
    "potion_session_created": false,
    "recurring_reminder_created": false,
    "scheduled_checkin_created": false,
    "executable_confirmation_generated": false
  }
}
```

Only fields relevant to the selected potion need to be populated. Other
candidate objects may be omitted or null.

`note_information.handoff_context_for_next_dispatcher` must be written for the
next dispatcher, not for the user. It should explain what has already been
diagnosed, why the selected potion was chosen, which fields can be prefilled,
and what still needs clarification if confidence is low.

## How Potion Subskills Should Consume The Bridge

`select_state_potion` should start directly with :

```json
{
  "selected_potion": "clarte|courage|rappel",
  "origin_bridge_context": {
    "origin_flow": "demotivation_repair",
    "note_information": {
      "source_flow_presentation": "string",
      "handoff_context_for_next_dispatcher": "string"
    }
  }
}
```

Then the target potion subskill should :

- treat bridge values as field candidates ;
- lock high-confidence candidates only if they are platform-usable ;
- propose a cleaned formulation when the value is almost clear ;
- ask only one missing clarification if a field is vague ;
- never ask the user to repeat the demotivation episode wholesale ;
- keep `origin_flow=demotivation_repair` in trace/state for observability.

For `clarte`, the bridge should route to the clarté subflow, not the generic
state potion detail flow.

## Active Flow Ownership

When `demotivation_repair` is active :

- the global dispatcher normal does not run ;
- `demotivation_repair.local_dispatcher` owns followups ;
- product/tool/potion transitions happen only through structured local actions ;
- safety can still interrupt above all flows.

When a bridge to potion is consented :

- `demotivation_repair` stops being the active owner ;
- `select_state_potion` becomes the active owner ;
- the potion subskill receives the bridge context ;
- there is no executable confirmation and no DB mutation.

## Non-Negotiable Invariants

- No moralizing or identity freeze.
- No potion before the motivation source is diagnosed.
- No potion if `no_potion` is present.
- Potion bridge requires user consent.
- Potion bridge is limited to `clarte`, `courage`, `rappel`.
- `rappel` must render as `Potion anti-décrochage`.
- No activation from chat.
- No product help generic bridge for these three potion suggestions.
- No plan/card/priority shortcut unless the user explicitly asks after repair.
- No business regex, no keyword classifier, no deterministic visible renderer in the nominal path.
