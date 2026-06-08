# create_recurring_reminder Local Flow Architecture

Document de conception pour migrer `create_recurring_reminder` vers une
architecture locale :

```txt
global_dispatcher
  -> start create_recurring_reminder
  -> create_recurring_reminder.local_dispatcher
  -> reducer non-mutant
  -> visible prompt stage-specific
  -> platform handoff Rappels
```

Le dispatcher global ne doit pas fonctionner quand le flow
`create_recurring_reminder` est actif, sauf si le dispatcher local retourne
explicitement `exit_to_global_dispatcher`.

Le point particulier de ce flow : il ressemble a un outil de creation, mais son
chemin nominal est un `platform_handoff_skill`. Le chat ne cree pas le rappel
recurrent. Il prepare la version a saisir dans la plateforme.

## Mental Model

`create_recurring_reminder` intervient quand le user veut un rappel repete :

- tous les jours ;
- chaque semaine ;
- certains jours ;
- les jours de semaine ;
- tous les matins / soirs ;
- une routine recurrente liee ou non au plan.

Le flow doit clarifier :

- la recurrence ;
- l'heure locale ;
- le message exact/actionnable ;
- la destination produit ;
- le binding eventuel au plan, a une action ou a une famille d'habitude.

Il ne doit jamais :

- creer un rappel recurrent en DB depuis le chat ;
- creer une confirmation executable ;
- creer un pending confirmation token ;
- dire `c'est cree`, `je l'ai programme`, `c'est active`,
  `je te relancerai` ;
- generer un rappel recurrent si la demande est ponctuelle ;
- transformer une tache non-habitude en `action_family` ;
- faire du parsing metier par regex ou string includes.

## Current Shape

Aujourd'hui le flow existe deja :

```txt
maybeRunCreateRecurringReminderOperation
-> loadRecurringReminderFrameFromTempMemory
-> runCreateRecurringReminderIntake
-> fillCreateRecurringReminderSlotsWithAi
-> runRecurringReminderBuilder
-> writeRecurringReminderHandoffState
-> renderRecurringReminderPlatformHandoff
```

Fichiers actuels :

- `supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/contract.ts`
- `supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/intake.ts`
- `supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/state.ts`
- `supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/generator.ts`
- `supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/router.ts`
- `supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/renderer.ts`
- `supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/executor.ts`
- `supabase/functions/sophia-brain/tools/operations/create_recurring_reminder/persistence.ts`

Le probleme architectural n'est pas que tout est faux. Le probleme est que le
chemin nominal reste structure comme :

```txt
slot_filler / renderer / active handoff arbitration
```

La cible est :

```txt
local_dispatcher JSON
-> reducer
-> visible prompt IA stage-specific
-> platform_handoff non-mutant
```

## Target Shape

Standalone entry :

```txt
global dispatcher selects create_recurring_reminder
-> create_recurring_reminder.local_dispatcher
-> reducer
-> visible prompt
-> write active state __recurring_reminder_handoff_state
```

Followup :

```txt
active create_recurring_reminder state exists
-> skip normal global dispatcher
-> create_recurring_reminder.local_dispatcher
-> reducer
-> visible prompt / inline tool / local stop / handoff
```

Ownership transfer :

```txt
local dispatcher
-> note_information
-> target dispatcher
```

Every ownership transfer requires `note_information`, except internal
presentation-only rendering and local stops with no new target dispatcher.

Reference :

- `docs/agent-playbook/New/runtime-contracts/Note d'information`
- `docs/agent-playbook/New/runtime-contracts/note-information-cross-dispatcher-agent-prompts.md`

## Core Fields

The local dispatcher owns these structured fields :

```json
{
  "recurrence": {
    "status": "missing|ambiguous|identified",
    "frequency": "daily|weekly|specific_days|weekdays|custom|null",
    "days": ["lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche"],
    "time": "HH:mm|null",
    "timezone": "string",
    "cadence_label": "string|null",
    "confidence": "low|medium|high"
  },
  "reminder_content": {
    "status": "missing|ambiguous|identified",
    "message": "string|null",
    "subject_hint": "string|null",
    "confidence": "low|medium|high"
  },
  "destination": {
    "status": "missing|ambiguous|identified",
    "value": "base_de_vie|current_plan|null",
    "related_plan_item_id": "string|null",
    "target_kind": "none|transformation|plan_item|action_family|null",
    "target_plan_item_id": "string|null",
    "target_action_family_key": "string|null",
    "target_generated_temp_id": "string|null",
    "target_binding_policy": "none|snapshot|live_action|live_action_family|null",
    "target_lifecycle_policy": "independent|while_target_active|while_family_in_current_plan|null",
    "target_label": "string|null",
    "confidence": "low|medium|high"
  }
}
```

Minimum for handoff :

- recurrence identified ;
- time identified ;
- reminder content identified ;
- destination identified or safely defaulted to `base_de_vie` by the dispatcher
  from context ;
- no one-shot conflict ;
- no safety ;
- no user constraint blocking reminder preparation.

## Field Semantics

### Recurrence

The dispatcher should understand user-provided cadence through IA reasoning, not
regex :

- `daily` : every day ;
- `weekdays` : Monday to Friday / workdays ;
- `weekly` : weekly rhythm, with optional day ;
- `specific_days` : several named days ;
- `custom` : any other recurring pattern that is still platform-usable.

If the user gives a cadence but no time, ask only for time.
If the user gives a time but no cadence, ask only for cadence.
If both are present and usable, lock them.

### Reminder Content

The content must be the exact message or action to be reminded.

Vague examples that need clarification :

- `rappelle-moi de faire ça` with no referent in state ;
- `rappelle-moi mon truc` ;
- `un rappel motivation` with no usable phrase ;
- `comme avant` when no prior draft exists.

Usable examples :

- `Respire 2 minutes avant d'ouvrir Slack` ;
- `Relis ton intention du plan Phoenix` ;
- `Envoie le message a Camille`.

### Destination And Binding

The dispatcher may use platform context to decide where the reminder belongs :

- `base_de_vie` for general life routines, mindset reminders, journaling,
  meditation, relationship reminders, generic quotes, or anything not clearly
  tied to a current plan item ;
- `current_plan` when the reminder clearly refers to an active plan, active
  action, transformation, or recurring habit ;
- `plan_item` when it targets a specific action/mission ;
- `action_family` only when the item is truly a recurring habit/family and the
  platform context provides the family key ;
- `transformation` when the reminder targets the plan transformation without a
  specific action.

The dispatcher must not invent plan item ids or action family keys. It can only
use ids present in platform context.

## One-Shot Boundary

`create_recurring_reminder` must not absorb punctual reminders.

If the user clearly wants a one-shot reminder, the local dispatcher returns a
handoff action toward `one_shot_reminder` with `note_information`.

Recommended action :

```json
{
  "flow_action": "handoff_to_one_shot",
  "target_dispatcher": "one_shot_reminder",
  "note_information": {
    "source_flow_id": "create_recurring_reminder",
    "source_flow_presentation": "create_recurring_reminder prepare un rappel recurrent a reprendre dans la plateforme, sans le creer depuis le chat.",
    "handoff_context_for_next_dispatcher": "Le user vient de clarifier que la demande est ponctuelle. Reprendre le contenu et le timing deja compris pour le flow one_shot_reminder.",
    "handoff_reason": "explicit_user_request"
  }
}
```

If punctual vs recurring is ambiguous, stay inside
`create_recurring_reminder` and use the visible prompt
`clarify_one_shot_vs_recurring`.

## Inline Tools

During the active flow, the local dispatcher may route to inline information
tools without ending the parent flow :

- `get_info_product` for "c'est quoi un rappel recurrent ?", "ou je le trouve
  ?", "comment ca marche ?" ;
- `get_info_db` / status recap for "j'en ai deja combien ?", "quels rappels
  j'ai deja ?", "est-ce que j'en ai un actif ?" ;

Each inline roundtrip requires `note_information` containing :

- active flow id ;
- current recurring draft summary ;
- user question ;
- what the inline skill should answer ;
- instruction to return to parent flow afterwards.

## Stop Local Without Handoff

If the user only wants to stop the reminder flow without another subject :

- `laisse tomber` ;
- `arrete les questions` ;
- `j'ai plus envie` ;
- `on annule` ;
- `pas maintenant` ;

the local dispatcher should return `stop_local_no_handoff` or `cancel_flow`.

The reducer should :

- clear or defer `__recurring_reminder_handoff_state` ;
- produce a short visible acknowledgement ;
- not call the global dispatcher on the same turn ;
- not ask another question ;
- not suggest another tool ;
- not create any reminder.

## Platform Handoff Contract

When all fields are usable, the reducer produces a handoff state :

```json
{
  "operation_type": "create_recurring_reminder",
  "mode": "platform_handoff",
  "no_chat_mutation": true,
  "executable_from_chat": false,
  "reminder_summary": "string",
  "cadence_summary": "string",
  "time_summary": "string|null",
  "content_summary": "string",
  "recommendation": {
    "platform_destination": "section Rappels",
    "platform_steps": ["string"],
    "preserve": ["string"],
    "avoid": ["string"]
  },
  "missing_decisions": []
}
```

The visible handoff must say :

- it is a recurring reminder ;
- the message exact ;
- cadence ;
- time ;
- destination platform ;
- no creation from chat if the user asks to apply.

It should not repeat heavy no-mutation wording unless the user requests
activation/programming from chat.

## Active Flow Ownership

When `create_recurring_reminder` is active :

- skip the normal global dispatcher ;
- run `create_recurring_reminder.local_dispatcher` ;
- safety can still preempt through local dispatcher output ;
- global dispatcher can run only after local `exit_to_global_dispatcher` with
  `note_information` ;
- product/status are inline roundtrips with note and parent flow resume ;
- one-shot handoff uses note and does not generate a recurring draft.

## Runtime Flow

```txt
user message
-> active flow lookup
-> create_recurring_reminder.local_dispatcher
-> contract validation
-> reducer
   -> missing slot visible prompt
   -> clarification prompt
   -> handoff prompt
   -> revise/repeat/apply prompt
   -> inline product/status handoff
   -> one-shot handoff
   -> local stop
   -> exit global with note
   -> safety with note
```

## Invariants To Test

- recurring clear input reaches handoff without extra confirmation ;
- missing time asks only time ;
- missing content asks only content ;
- ambiguous one-shot vs recurring asks boundary clarification ;
- clear one-shot exits to one-shot with note and no recurring draft ;
- apply_attempt does not mutate ;
- repeat_handoff stays local ;
- revise_handoff updates structured draft ;
- stop local does not call global ;
- topic change calls global with note ;
- product help inline receives note and returns to parent flow ;
- status recap inline receives note and returns to parent flow ;
- no renderer visible deterministic in nominal path ;
- no business regex in nominal path ;
- no wrong wording : no `c'est cree`, no `programme`, no `je te relancerai`.

