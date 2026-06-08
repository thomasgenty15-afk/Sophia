# morning_nudge_v2 Local Followup Architecture

Document de cadrage pour transformer `morning_nudge_v2` en surface proactive
capable d'ouvrir un mini-flow local de suivi, selon la nature du nudge envoye.

Ce document ne definit pas encore les prompts complets des trois dispatchers
locaux. Il stabilise l'architecture globale, les payloads, les invariants et le
handoff vers le dispatcher global.

## Mental Model

`morning_nudge_v2` est un evenement proactif, pas automatiquement un flow
conversationnel.

Un nudge du matin peut :

- ouvrir un mini-flow local si la reponse utilisateur doit etre interpretee
  dans le contexte exact du nudge ;
- ne rien ouvrir si le message est seulement relationnel ou salutation simple.

Forme cible :

```txt
morning_nudge_v2 sent
  -> persist structured nudge payload
  -> maybe create post_morning_nudge active flow

next user message
  -> if post_morning_nudge active:
       resolver reads source_nudge.flow_kind
       -> matching local dispatcher
       -> reducer
       -> visible prompt
       -> close or exit_to_global_dispatcher
     else:
       global dispatcher normal
```

## Why This Exists

La meme reponse utilisateur change de sens selon le nudge envoye.

Exemple :

```txt
User: je peux pas aujourd'hui
```

Apres un nudge d'action :

```txt
Le sujet probable est l'execution: reduire le scope, choisir une premiere
marche, traiter un bloqueur.
```

Apres un nudge ou une action a ete volontairement supprimee :

```txt
Le sujet probable est la protection: confirmer qu'on ne force pas, proposer
seulement une version minimale si le user la veut.
```

Apres un nudge de presence emotionnelle sans action cible :

```txt
Le sujet probable est le soutien: accueillir, ne pas ramener brutalement vers
une action.
```

Apres une salutation sans action :

```txt
Pas de flow local. Le prochain message revient au dispatcher global normal.
```

## Current Runtime To Change

Le code actuel contient deux contextes :

- `morning_active_actions_nudge` : V1 historique, centree actions actives.
- `morning_nudge_v2` : surface cible.

Le chemin nominal doit devenir `morning_nudge_v2` uniquement.

La V1 `morning_active_actions_nudge` doit etre debranchee du chemin nominal,
puis supprimee ou reduite a une compatibilite legacy non appelee.

Point important : aujourd'hui `buildMorningNudgePlanV2` skippe quand il n'y a
aucun item :

```txt
morning_nudge_v2_no_items
```

L'architecture cible introduit explicitement deux cas sans action :

- `emotional_presence_nudge` quand il y a un besoin relationnel/emotionnel ;
- `no_action_greeting` quand il n'y a rien a pousser ni a soutenir fortement.

## Nudge Kinds

### 1. action_nudge

Il y a une action ou un item prevu, et Sophia pousse doucement vers cet item.

Objectif du followup :

- verifier si le user est pret ;
- fermer vite si le user est pret ;
- motiver legerement si besoin ;
- aider a choisir une premiere marche ;
- reduire le scope si la charge est trop forte ;
- router vers un flow outil seulement si le user le demande explicitement ou si
  le dispatcher local juge une sortie necessaire.

Ouvre :

```txt
post_morning_nudge.action
```

### 2. suppressed_action_nudge

Il y avait une action ou un item prevu, mais Sophia choisit de ne pas le pousser
a cause de l'etat emotionnel, fatigue, surcharge ou besoin de protection.

Objectif du followup :

- preserver le choix initial de ne pas forcer ;
- ne pas culpabiliser ;
- confirmer la protection si le user dit qu'il ne peut pas ;
- proposer une version minimale seulement si le user montre qu'il veut sauver
  quelque chose ;
- garder en contexte les actions supprimees sans les imposer.

Ouvre :

```txt
post_morning_nudge.suppressed_action
```

### 3. emotional_presence_nudge

Le nudge n'est pas centre action. Il existe parce que le user semble avoir
besoin de presence, de soutien, de reactivation douce ou d'un espace emotionnel.

Il ne remplace pas une action prevue.

Objectif du followup :

- accueillir la reponse ;
- ne pas ramener automatiquement a l'action ;
- voir si le user veut parler, allegir, etre laisse tranquille, ou reprendre un
  petit cap ;
- sortir vers le dispatcher global si le user demande un autre outil ou un
  autre sujet.

Ouvre :

```txt
post_morning_nudge.emotional_presence
```

Seulement si le nudge ouvre vraiment une porte de soutien. Une salutation simple
sans attente ne doit pas creer ce flow.

### 4. no_action_greeting

Il n'y a pas d'action prevue et pas de signal fort qui justifie un flow de
soutien.

Exemple :

```txt
Hello, il n'y a pas d'action prevue aujourd'hui. Je voulais juste te souhaiter
une belle journee.
```

N'ouvre aucun flow local.

Le prochain message utilisateur passe par le dispatcher global normal.

## Posture Mapping

Le mapping exact peut evoluer, mais la logique cible est :

```txt
focus_today
  -> action_nudge

simplify_today
  -> action_nudge si l'item reste pousse en version faisable
  -> suppressed_action_nudge si le message choisit explicitement de ne pas
     pousser l'item a cause de l'etat du user

pre_event_grounding
  -> action_nudge si l'evenement/action cible est explicite
  -> emotional_presence_nudge si c'est seulement une presence avant evenement

support_softly
  -> suppressed_action_nudge s'il y avait des actions/items prevus
  -> emotional_presence_nudge s'il n'y avait pas d'action cible

protective_pause
  -> suppressed_action_nudge s'il y avait des actions/items prevus
  -> emotional_presence_nudge si c'est une pause de soutien sans action cible

open_door
  -> emotional_presence_nudge sauf si le payload cible clairement un item

celebration_ping
  -> no local flow par defaut si c'est seulement celebratoire
  -> action_nudge seulement si le message invite explicitement a reprendre un
     item du jour

greeting
  -> no_action_greeting
```

## Payload Required At Send Time

Le followup ne doit pas deviner la nature du nudge depuis le message
utilisateur. Le send doit persister un payload structure.

Payload canonique :

```json
{
  "event_context": "morning_nudge_v2",
  "nudge_kind": "action_nudge|suppressed_action_nudge|emotional_presence_nudge|no_action_greeting",
  "posture": "focus_today|simplify_today|open_door|support_softly|protective_pause|celebration_ping|pre_event_grounding|greeting",
  "opens_local_flow": true,
  "intended_followup_flow": "action|suppressed_action|emotional_presence|null",
  "coach_intent": "motivate_action|simplify_action|support_emotion|protect_emotion|celebrate|reactivate|greet|ground_before_event",
  "target_action_ids": [],
  "target_action_titles": [],
  "target_item_ids": [],
  "target_item_titles": [],
  "suppressed_action_ids": [],
  "suppressed_action_titles": [],
  "suppression_reason": "high_emotional_load|fatigue|recent_high_emotion|overloaded|pause_consentie|no_items|null",
  "source_reason": "string",
  "source_grounding": "string|null",
  "sent_at": "iso"
}
```

Required fields:

- `event_context`
- `nudge_kind`
- `posture`
- `opens_local_flow`
- `intended_followup_flow`
- `coach_intent`
- `sent_at`

If `nudge_kind=action_nudge`, at least one target title/id should be present.

If `nudge_kind=suppressed_action_nudge`, at least one suppressed title/id should
be present and `suppression_reason` should not be null.

If `nudge_kind=emotional_presence_nudge`, targets may be empty.

If `nudge_kind=no_action_greeting`, `opens_local_flow=false` and
`intended_followup_flow=null`.

## Active Flow State

Use one active state with a subtype.

```json
{
  "skill_id": "post_morning_nudge",
  "flow_kind": "action|suppressed_action|emotional_presence",
  "status": "active|closing|closed|exit_to_global|safety",
  "source_nudge": {},
  "local_assessment": {
    "action_readiness": "ready|hesitant|blocked|not_today|unknown",
    "motivation_need": "none|light|medium|high|unknown",
    "emotional_load": "low|medium|high|unknown",
    "user_wants_conversation": true
  },
  "turn_count": 0,
  "max_turns": 3,
  "created_at": "iso",
  "updated_at": "iso"
}
```

The post-nudge flow is short by design. Default `max_turns=3`.

## Resolver

The resolver is deterministic and allowed because it reads only structured
payload/state, not user text.

```txt
source_nudge.intended_followup_flow = action
  -> post_morning_nudge.action_dispatcher

source_nudge.intended_followup_flow = suppressed_action
  -> post_morning_nudge.suppressed_action_dispatcher

source_nudge.intended_followup_flow = emotional_presence
  -> post_morning_nudge.emotional_presence_dispatcher

source_nudge.opens_local_flow = false
  -> no local flow; global dispatcher normal
```

No regex, no `message.includes(...)`, no semantic parsing in resolver.

## Global Dispatcher Rule

If a `post_morning_nudge` flow is active, the global dispatcher must not run.

The only exception is:

```txt
local dispatcher returns flow_action = exit_to_global_dispatcher
```

Then the same user message can be analysed by the global dispatcher in a second
pass.

The exit must include an `exit_memo` that helps the global dispatcher route
correctly.

## Exit Memo Contract

`exit_memo` is mandatory when `flow_action=exit_to_global_dispatcher`.

```json
{
  "needed": true,
  "reason": "topic_change|explicit_tool_request|new_goal|product_help|status_question|preference_update|safety|unknown",
  "user_intent_summary": "string",
  "local_flow_context": {
    "skill_id": "post_morning_nudge",
    "flow_kind": "action|suppressed_action|emotional_presence",
    "source_nudge_summary": "string",
    "target_action_titles": [],
    "suppressed_action_titles": [],
    "suppression_reason": "string|null",
    "last_local_assessment": "string"
  },
  "handoff_hint_for_global_dispatcher": {
    "likely_intent": "prepare_attack_card|prepare_defense_card|select_state_potion|update_coach_preferences|product_help|normal_coaching|unknown",
    "why": "string",
    "constraints": [
      "Do not treat this as post_morning_nudge continuation unless selected again."
    ]
  }
}
```

This memo is not visible to the user.

It prevents blind exits where the global dispatcher loses the local context.

## Local Dispatchers To Create Later

Three local dispatchers are required:

```txt
post_morning_nudge.action_dispatcher
post_morning_nudge.suppressed_action_dispatcher
post_morning_nudge.emotional_presence_dispatcher
```

They will have separate prompts because their interpretation goals differ.

The prompt documents will be created separately.

## Visible Agents

Each local dispatcher returns a `visible_task.kind`.

Visible agents write the next message only. They do not decide business state,
do not route, do not fill slots and do not create tools.

No deterministic visible renderer should be introduced.

## Mutation Policy

`post_morning_nudge` is a conversation followup flow.

It must not create:

- action;
- card;
- potion;
- reminder;
- scheduled_checkin;
- preference;
- plan patch;
- confirmation token.

If the user explicitly asks for one of these, the local dispatcher should exit
with an `exit_memo` that explains the likely target flow.

## Logs And Trace

Add trace fields for:

- `morning_nudge_v2.nudge_kind`;
- `morning_nudge_v2.posture`;
- `morning_nudge_v2.opens_local_flow`;
- `morning_nudge_v2.intended_followup_flow`;
- active `post_morning_nudge.flow_kind`;
- local dispatcher source;
- local `flow_action`;
- `visible_task.kind`;
- `exit_to_global_dispatcher`;
- `exit_memo.reason`;
- whether the global dispatcher was skipped because a local flow was active;
- whether the global dispatcher was called after explicit local exit.

The trace should make it possible to verify that no global dispatcher runs
during active local flow except after explicit exit.

## Tests To Add

Architecture tests:

- V1 `morning_active_actions_nudge` is not used in the nominal send path.
- V2 payload includes `nudge_kind`, `opens_local_flow`,
  `intended_followup_flow`.
- `action_nudge` opens `post_morning_nudge.action`.
- `suppressed_action_nudge` opens `post_morning_nudge.suppressed_action`.
- `emotional_presence_nudge` opens `post_morning_nudge.emotional_presence`.
- `no_action_greeting` opens no local flow.
- resolver routes only from structured payload.
- active local flow skips global dispatcher.
- `exit_to_global_dispatcher` triggers second-pass global dispatcher.
- second-pass global dispatcher receives `exit_memo`.
- max turn close prevents post-nudge from becoming an endless flow.

V2 policy tests:

- high emotional load with planned items can become suppressed action.
- high emotional load with no planned items can become emotional presence.
- no items and no support signal can become no-action greeting or skip,
  depending product policy.
- celebration-only nudge does not open local flow by default.

## Implementation Notes

This architecture intentionally separates:

- proactive send decision;
- local followup state;
- local dispatcher;
- visible prompt;
- global dispatcher exit.

Do not put semantic followup decisions in `process-checkins/index.ts` or
`router/run.ts`.

Those files may orchestrate, validate and persist, but they should not infer
from user message text by regex or templates.

