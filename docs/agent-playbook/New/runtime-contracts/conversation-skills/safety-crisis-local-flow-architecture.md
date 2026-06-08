# safety_crisis Local Flow Architecture

Document de cadrage pour migrer `safety_crisis` vers une architecture locale :

```txt
safety pregate / safety route
-> safety_crisis.local_dispatcher
-> safety reducer / safety guards
-> visible prompt stage-specific
-> continue safety / resolved exit
```

Safety reste une exception systeme. Le flow local rend les tours plus fluides,
mais les garde-fous d'escalade, de no-product et de no-tool restent au-dessus du
routing normal.

## Mental Model

`safety_crisis` intervient quand Sophia detecte un risque de crise, d'auto-
agression, de danger immediat ou de detresse critique.

Le flow ne sert pas a :

- coacher le plan ;
- proposer une potion ;
- preparer une carte ;
- expliquer le produit ;
- optimiser une action ;
- enregistrer une preference.

Le flow sert a :

- clarifier la securite immediate ;
- verifier si le user est seul ;
- verifier si des moyens dangereux sont proches ;
- encourager une mise a distance sans surcharger ;
- connecter le user a une aide humaine ;
- rester sur une seule prochaine action de securite ;
- sortir seulement quand les conditions minimales sont reunies.

## Current Shape

Aujourd'hui le systeme ressemble a :

```txt
safety_pregate
-> route safety_crisis
-> structured intake IA
-> reducer deterministe
-> renderer deterministe
-> active_skill_state safety_crisis
```

Fichiers actuels :

- `supabase/functions/sophia-brain/safety/safety_pregate.ts`
- `supabase/functions/sophia-brain/router/safety_crisis_runtime.ts`
- `supabase/functions/sophia-brain/skills/safety_crisis/intake.ts`
- `supabase/functions/sophia-brain/skills/safety_crisis/reducer.ts`
- `supabase/functions/sophia-brain/skills/safety_crisis/renderer.ts`
- `supabase/functions/sophia-brain/skills/safety_crisis/skill.ts`

Le point a changer n'est pas l'existence des guards safety. Le point a changer
est le rendu visible fixe : il doit devenir un prompt conversationnel
stage-specific appele apres le reducer.

## Target Shape

```txt
user message
  -> safety_pregate always-on
  -> if risk is high enough, safety_crisis owns the turn
  -> safety_crisis.local_dispatcher returns JSON structured signals
  -> safety reducer computes phase, risk band, state patch, visible_task
  -> visible prompt for visible_task.kind writes the reply
  -> active safety state persists or resolves
```

Followup :

```txt
active_skill_state.skill_id = safety_crisis
  -> safety_pregate still runs
  -> global dispatcher normal does not own the turn
  -> safety_crisis.local_dispatcher owns the message
  -> reducer
  -> visible prompt
  -> continue / resolved exit
```

Safety may interrupt any active flow. This is not the global dispatcher taking
ownership during a flow. It is the safety pregate / safety override above normal
flow ownership.

## Priority Rule

Priority order :

```txt
safety pregate / active safety caution
-> active safety local dispatcher if safety active
-> active non-safety local flow
-> global dispatcher only when no active flow or after explicit local exit
```

If a non-safety local dispatcher emits `safety_preempt`, the same turn should
enter safety, not the global dispatcher.

If safety is active, product/tool/status inline calls are not allowed.

## State

Recommended active state :

```json
{
  "skill_id": "safety_crisis",
  "status": "active|resolving|exiting",
  "mode": "local_safety_flow",
  "turn_count": 0,
  "max_turns": 12,
  "created_at": "iso",
  "updated_at": "iso",
  "working_state": {
    "phase": "entry|immediate_risk_check|acute_grounding|support_contact|stabilizing|exit_check|resolved",
    "risk_band": "medium|high|critical|low",
    "trigger_summary": "string|null",
    "immediate_danger": true,
    "has_means_nearby": true,
    "user_not_alone": false,
    "emergency_help_mentioned": false,
    "human_support_mentioned": false,
    "consecutive_deescalated_turns": 0,
    "last_user_safety_signal": "string|null",
    "last_assistant_safety_step": "string|null",
    "exit_memo": null
  }
}
```

`max_turns` is not an auto-exit permission. It is only an observability signal.
Safety cannot be forced closed because a turn count is reached.

## Dispatcher Responsibilities

The local dispatcher decides only what the user message contributes to the
safety flow.

It may classify :

- answer to immediate danger check ;
- answer about means nearby / means moved away ;
- answer about being alone ;
- answer about human support ;
- answer about emergency help contacted ;
- deescalation evidence ;
- grounding request / panic escalation ;
- user asks to repeat current safety step ;
- user asks for product/tool/plan during safety ;
- user appears resolved and wants to leave ;
- safety escalation.

It must not :

- produce visible text ;
- choose final phase alone ;
- lower risk deterministically ;
- route to product help ;
- route to status recap ;
- launch a tool ;
- fill tool fields ;
- create memory persistence by default ;
- treat "I am fine" as resolved without safety facts.

## Reducer Responsibilities

The reducer consumes dispatcher JSON and previous state.

It must :

- merge safety signals conservatively ;
- escalate risk bands when needed ;
- never reduce risk on weak evidence ;
- compute the next phase ;
- compute `visible_task.kind` ;
- block all product/tool suggestions ;
- decide if safety can resolve ;
- emit an exit memo only after the resolved conditions are met.

The reducer may stay deterministic because safety invariants are safety-critical.
This is an allowed exception to the no-determinism rule for business flows.

## Visible Prompt Responsibilities

The visible prompt writes the message for the stage chosen by the reducer.

It must :

- be natural and non-templated ;
- ask at most one or two questions according to the response contract ;
- keep product/tool/plan out ;
- include emergency numbers when required by the reducer ;
- preserve exact required resources given by runtime ;
- avoid claiming safety is solved unless reducer stage is `resolved_exit`.

The visible prompt must not :

- reroute ;
- fill state ;
- decide risk ;
- invent emergency resources ;
- make promises about monitoring ;
- produce a product handoff.

## Exit Rule

Safety exits only when the reducer sees enough evidence :

- no immediate danger now ;
- means absent or away if relevant ;
- user is not alone or has a reliable human/support path ;
- prior safety step has happened ;
- no fresh high/critical signal in the current turn.

When resolved, safety writes an exit memo for global runtime :

```json
{
  "reason": "resolved",
  "flow_summary": "Safety crisis deescalated; immediate danger absent, means safe, human support available.",
  "handoff_hint_for_global_dispatcher": {
    "likely_intent": "normal_coaching|previous_flow_resume|unknown",
    "constraints": [
      "Do not resume tools automatically.",
      "Do not treat safety resolution as consent for a product action.",
      "Keep the next turn gentle and low-pressure."
    ]
  }
}
```

## Product / Tool Boundary

During active safety :

- no `get_info_product`;
- no `get_info_db`;
- no platform handoff ;
- no operation suggestion ;
- no pending confirmation ;
- no direct effect ;
- no scheduled followup creation from chat.

If the user asks "lance la potion", "cree la carte", "ouvre mon plan" during
safety, the visible answer should stay on safety and gently defer product/tool
work until safety is resolved.

## Legacy Cleanup

Target cleanup :

- keep `safety_pregate` ;
- keep conservative escalation helpers ;
- keep reducer invariants ;
- replace `renderer.ts` as nominal visible path with stage-specific visible
  prompts ;
- no regex or keyword-based business classifier ;
- no product/tool route inside safety.

