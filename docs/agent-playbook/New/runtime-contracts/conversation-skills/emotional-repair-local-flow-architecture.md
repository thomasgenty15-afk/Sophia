# emotional_repair Local Flow Architecture

Document de cadrage pour migrer `emotional_repair` vers une architecture locale :

```txt
emotional repair route / active repair state
-> emotional_repair.local_dispatcher
-> reducer non-mutant
-> visible prompt stage-specific
-> optional structured handoff to select_state_potion
```

Le point particulier de ce flow : `emotional_repair` peut ouvrir un bridge
consenti vers trois potions seulement :

- `amour`
- `guerison`
- `apaisement`

Le bridge doit transmettre assez de contexte pour que `select_state_potion` et
le sous-skill potion cible ne repetent pas inutilement ce qui a deja ete compris
pendant la reparation emotionnelle.

## Mental Model

`emotional_repair` intervient quand l'emotion domine :

- honte ;
- culpabilite ;
- auto-attaque ;
- panique/anxiete non safety ;
- douleur relationnelle ;
- besoin de douceur ou de presence ;
- besoin de reparer une trace emotionnelle avant de revenir a l'action.

Le flow ne doit pas transformer trop vite une emotion en outil. La conversation
de reparation reste proprietaire tant que l'emotion est aigue ou que le user se
parle comme un verdict identitaire.

Une potion devient pertinente seulement quand :

- l'emotion est suffisamment stabilisee ;
- le besoin durable est nomme ;
- le user consent explicitement au bridge potion ;
- la potion vise a soutenir la suite, pas a eviter la reparation immediate.

## Current Shape

Aujourd'hui le skill existe deja :

```txt
runEmotionalRepairStructuredIntake
-> EmotionalRepairSkillDecision
-> reduceEmotionalRepairTurn
-> renderer fallback if needed
-> ConversationSkillOutput
```

Fichiers actuels :

- `supabase/functions/sophia-brain/skills/emotional_repair/contract.ts`
- `supabase/functions/sophia-brain/skills/emotional_repair/intake.ts`
- `supabase/functions/sophia-brain/skills/emotional_repair/reducer.ts`
- `supabase/functions/sophia-brain/skills/emotional_repair/renderer.ts`
- `supabase/functions/sophia-brain/skills/emotional_repair/skill.ts`
- `supabase/functions/sophia-brain/skills/emotional_repair/prompt.ts`

Le contrat connait deja le bridge vers `select_state_potion`, mais la cible
doit devenir plus structuree pour alimenter les sous-skills potion locaux.

## Target Shape

Standalone entry :

```txt
global dispatcher selects emotional_repair
-> emotional_repair.local_dispatcher
-> reducer
-> visible prompt
-> write __active_skill_state.skill_id="emotional_repair"
```

Followup :

```txt
active emotional_repair state exists
-> skip global dispatcher normal
-> emotional_repair.local_dispatcher
-> reducer
-> visible prompt
-> continue / close / handoff_to_potion / exit_to_global_dispatcher
```

Potion bridge :

```txt
emotional_repair.local_dispatcher
-> flow_action=potion_bridge_offer
-> visible prompt asks consent, with one potion or a small choice if needed
-> user confirms
-> flow_action=handoff_to_potion_flow
-> reducer emits structured potion_bridge_context
-> runtime starts select_state_potion with selected_potion + bridge context
-> target potion subskill consumes context as field candidates
```

The global dispatcher should not re-decide the potion from raw text once
`emotional_repair` has produced a structured `handoff_to_potion_flow`.

If the runtime cannot perform direct owner transfer yet, the fallback bridge is
an explicit local exit memo. In that fallback, the global dispatcher must treat
the structured `potion_bridge_context` as the source of truth and must not
re-route from the confirmation text alone.

Every confirmed transfer from `emotional_repair` to another dispatcher requires
`note_information` from `09-note-information-contract.md`. This includes
`handoff_to_potion_flow`, `exit_to_global_dispatcher`, and `safety_preempt`.
Local support actions such as `soft_presence`, `regulation_without_potion`,
`repeat_last_repair`, `cancel_flow` without a new topic, or a local close do not
produce a note and must not call global on the same turn.

## Potion Bridge Scope

Allowed potion bridges :

### Potion d'amour

Use when the durable need is :

- self-kindness ;
- warmth toward self ;
- less harsh inner dialogue ;
- tenderness after an error ;
- feeling alone, empty, or unworthy of care.

Target subskill fields :

```json
{
  "selected_potion": "amour",
  "target_fields": {
    "love_lack_context": "what the user lacks softness/love toward",
    "love_state": "dur|seul|vide"
  }
}
```

### Potion de guerison

Use when the durable need is :

- repair after a painful episode ;
- heal the trace of a shame/guilt episode ;
- recover after a craquage, hurt, failure, discouragement or emotional impact ;
- repair without self-punishment.

Target subskill fields :

```json
{
  "selected_potion": "guerison",
  "target_fields": {
    "recent_hurt": "the episode or emotional aftershock that hurt",
    "dominant_feeling": "culpabilite|honte|decouragement|fatigue"
  }
}
```

### Potion d'apaisement

Use when the durable need is :

- pressure downshift ;
- stress or tension relief ;
- saturation / feeling at breaking point ;
- pressure remains the main theme after emotional stabilization.

Target subskill fields :

```json
{
  "selected_potion": "apaisement",
  "target_fields": {
    "pressure_source": "what is putting pressure on the user",
    "pressure_state": "stresse|a_cran|submerge"
  }
}
```

## Bridge Context Contract

`emotional_repair` must send this context when it bridges to a potion :

```json
{
  "origin_flow": "emotional_repair",
  "origin_flow_status": "stabilized|bridge_consented",
  "note_information": {
    "source_flow_id": "emotional_repair",
    "source_flow_presentation": "Repairs shame, guilt, anxiety, self-attack, relational tension, or acute emotional pressure. It can bridge to limited state potions after consent.",
    "source_flow_state_summary": "string",
    "handoff_reason": "bridge",
    "target_dispatcher": "select_state_potion",
    "handoff_context_for_next_dispatcher": "string",
    "target_local_dispatcher_hint": "Enter the selected potion flow, consume candidates as candidates, and do not make the user repeat the emotional episode wholesale.",
    "user_words": ["string"],
    "structured_context": {},
    "risk_score": 0,
    "no_chat_mutation": {
      "db_write_committed": false,
      "potion_session_created": false,
      "scheduled_checkin_created": false,
      "recurring_reminder_created": false,
      "executable_confirmation_generated": false
    }
  },
  "origin_turn_summary": "string",
  "repair_intent": "acute_self_attack|shame_or_guilt|anxiety_or_panic|relational_repair|asks_concrete_phrase|unclear",
  "context_domain": "relationship|work|body|plan_execution|unknown",
  "emotional_episode": {
    "summary": "string",
    "user_words": ["string"],
    "identity_freeze_risk": true,
    "already_stabilized": true
  },
  "durable_need": {
    "kind": "self_kindness|healing_after_hurt|pressure_relief",
    "summary": "string"
  },
  "selected_potion": "amour|guerison|apaisement",
  "selection_reason": "string",
  "prefill_candidates": {
    "love_lack_context": {
      "candidate_value": "string|null",
      "confidence": "low|medium|high",
      "source": "emotional_repair"
    },
    "love_state": {
      "option_value": "dur|seul|vide|null",
      "option_label": "Dur|Seul|Vide|null",
      "confidence": "low|medium|high",
      "source": "emotional_repair"
    },
    "recent_hurt": {
      "candidate_value": "string|null",
      "confidence": "low|medium|high",
      "source": "emotional_repair"
    },
    "dominant_feeling": {
      "option_value": "culpabilite|honte|decouragement|fatigue|null",
      "option_label": "Culpabilite|Honte|Decouragement|Fatigue|null",
      "confidence": "low|medium|high",
      "source": "emotional_repair"
    },
    "pressure_source": {
      "candidate_value": "string|null",
      "confidence": "low|medium|high",
      "source": "emotional_repair"
    },
    "pressure_state": {
      "option_value": "stresse|a_cran|submerge|null",
      "option_label": "Stresse|A cran|Submerge|null",
      "confidence": "low|medium|high",
      "source": "emotional_repair"
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

## How Potion Subskills Should Consume The Bridge

`select_state_potion` should start directly with :

```json
{
  "selected_potion": "amour|guerison|apaisement",
  "origin_bridge_context": {
    "origin_flow": "emotional_repair"
  }
}
```

Then the target potion subskill should :

- treat bridge values as field candidates ;
- lock high-confidence candidates only if they are already platform-usable ;
- propose a cleaned formulation when the value is almost clear ;
- ask only one missing clarification if a field is vague ;
- never ask the user to repeat the emotional episode wholesale ;
- keep `origin_flow=emotional_repair` in trace/state for observability.

## Active Flow Ownership

When `emotional_repair` is active :

- the global dispatcher normal does not run ;
- `emotional_repair.local_dispatcher` owns followups ;
- product/tool/potion transitions happen only through structured local actions ;
- safety can still interrupt above all flows.
- `exit_to_global_dispatcher`, `safety_preempt`, and
  `handoff_to_potion_flow` require `note_information` ;
- `exit_to_global_dispatcher` actions close or defer locally with a visible
  acknowledgement and no global reroute.

When a bridge to potion is consented :

- `emotional_repair` stops being the active owner ;
- `select_state_potion` becomes the active owner ;
- the potion subskill receives the bridge context ;
- there is no executable confirmation and no DB mutation.

## Non-Negotiable Invariants

- No potion while acute shame, panic, guilt or self-attack dominates.
- No potion if `no_potion` is present.
- Potion bridge requires user consent.
- Potion bridge is limited to `amour`, `guerison`, `apaisement`.
- No activation from chat.
- No product help generic bridge for these three potion suggestions.
- No plan/card/priority shortcut unless user explicitly asks after emotion has lowered.
- No identity-freeze memory persistence by default.
- No business regex, no keyword classifier, no deterministic visible renderer in the nominal path.
