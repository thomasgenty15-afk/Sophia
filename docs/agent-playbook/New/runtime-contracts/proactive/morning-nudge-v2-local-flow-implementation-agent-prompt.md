# Implementation Agent Prompt - morning_nudge_v2 Local Followup Architecture

```txt
Mission : mettre en place l'architecture globale de followup local pour
`morning_nudge_v2`, sans encore ecrire les prompts complets des trois
dispatchers locaux.

Repo :
/Users/ahmedamara/Dev/Sophia 2

Document principal a lire avant de coder :
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/proactive/morning-nudge-v2-local-flow-architecture.md

Documents connexes utiles :
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/proactive/daily-review.md
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/proactive/weekly-review.md
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/tools/select-state-potion-local-dispatcher-prompts.md
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/tools/prepare-attack-card-local-dispatcher-prompts.md
/Users/ahmedamara/Dev/Sophia 2/docs/agent-playbook/New/runtime-contracts/tools/prepare-defense-card-local-dispatcher-prompts.md

Code a inspecter :
/Users/ahmedamara/Dev/Sophia 2/supabase/functions/sophia-brain/momentum_morning_nudge.ts
/Users/ahmedamara/Dev/Sophia 2/supabase/functions/sophia-brain/momentum_morning_nudge_test.ts
/Users/ahmedamara/Dev/Sophia 2/supabase/functions/sophia-brain/cooldown_engine.ts
/Users/ahmedamara/Dev/Sophia 2/supabase/functions/sophia-brain/repair_mode_engine.ts
/Users/ahmedamara/Dev/Sophia 2/supabase/functions/process-checkins/index.ts
/Users/ahmedamara/Dev/Sophia 2/supabase/functions/whatsapp-webhook/
/Users/ahmedamara/Dev/Sophia 2/supabase/functions/sophia-brain/router/run.ts

But

`morning_nudge_v2` doit devenir la seule surface nominale du morning nudge.
Selon le payload du nudge envoye, il peut ouvrir un mini-flow local de suivi :

- `post_morning_nudge.action`
- `post_morning_nudge.suppressed_action`
- `post_morning_nudge.emotional_presence`

Ou ne pas ouvrir de flow :

- `no_action_greeting`

Le but de cette mission est de poser l'architecture runtime globale :

morning_nudge_v2 sent
-> payload structure persiste
-> optional active post_morning_nudge state
-> next user message
-> local dispatcher choisi par payload si flow actif
-> global dispatcher interdit sauf exit local explicite

Ne pas encore ecrire les prompts complets des 3 dispatchers locaux. Preparer les
interfaces, l'etat, le routing et les points d'integration pour que ces prompts
puissent etre ajoutes proprement ensuite.

Contraintes absolues

Ne pas faire :
- regex metier pour interpreter la reponse user ;
- `message.includes(...)` metier ;
- renderer visible deterministe ;
- template visible fixe ;
- dispatcher global pendant un post-flow actif ;
- creation d'action, carte, potion, rappel, scheduled_checkin, preference ou
  patch plan depuis `post_morning_nudge` ;
- mutation durable depuis le followup local ;
- suppression destructive DB ;
- `supabase db reset`.

Le resolver initial peut etre deterministe uniquement parce qu'il lit le payload
structure du nudge envoye. Il ne doit pas lire le texte user.

Etape 1 - Decrire les nouveaux types

Ajouter ou centraliser des types pour :

```txt
MorningNudgeKind =
  action_nudge
  suppressed_action_nudge
  emotional_presence_nudge
  no_action_greeting

PostMorningNudgeFlowKind =
  action
  suppressed_action
  emotional_presence

PostMorningNudgeStatus =
  active
  closing
  closed
  exit_to_global
  safety
```

Ajouter un payload canonique :

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

Etape 2 - Debrancher la V1 du chemin nominal

Identifier tous les chemins qui utilisent encore :

```txt
morning_active_actions_nudge
MORNING_ACTIVE_ACTIONS_EVENT_CONTEXT
```

Objectif :

- `morning_nudge_v2` devient le chemin nominal ;
- la V1 n'est plus selectionnee pour les nouveaux sends ;
- si la V1 reste pour compatibilite, elle doit etre marquee legacy et non
  appelee nominalement ;
- les tests doivent verifier que le nouveau chemin nominal n'emet pas
  `morning_active_actions_nudge`.

Ne pas supprimer brutalement une constante si elle est necessaire a la lecture
historique/cooldown. Dans ce cas, conserver la lecture legacy mais pas l'emission
nominale.

Etape 3 - Classifier le nudge au moment de l'envoi

Dans le chemin `buildMorningNudgePlanV2` / orchestration d'envoi, produire les
champs :

- `nudge_kind`;
- `opens_local_flow`;
- `intended_followup_flow`;
- `coach_intent`;
- `target_*`;
- `suppressed_*`;
- `suppression_reason`.

Rappel de logique cible :

- item prevu + message pousse l'item -> `action_nudge`;
- item prevu + message choisit de ne pas pousser pour proteger -> `suppressed_action_nudge`;
- pas d'item cible + besoin de soutien/presence -> `emotional_presence_nudge`;
- pas d'item cible + salutation simple -> `no_action_greeting`;
- celebration pure -> pas de flow local par defaut.

Important :
Le code actuel skippe quand il n'y a aucun item (`morning_nudge_v2_no_items`).
Adapter la policy selon le contrat :

- si no items + signal emotionnel/relationnel suffisant : permettre
  `emotional_presence_nudge`;
- si no items + pas de signal suffisant : soit `no_action_greeting`, soit skip,
  selon la policy produit existante. Si le produit ne veut pas de greeting, le
  skip peut rester, mais le contrat doit savoir representer `no_action_greeting`
  quand un message est envoye.

Etape 4 - Persister le payload structure

Au moment de l'envoi WhatsApp, persister le payload dans la trace deja utilisee
pour les proactives / scheduled checkins / metadata.

Le prochain message utilisateur doit pouvoir retrouver :

- le dernier `morning_nudge_v2` envoye ;
- son `nudge_kind`;
- son `intended_followup_flow`;
- ses targets/suppressed targets ;
- son `sent_at`.

Ne pas inventer une table si un emplacement structure existe deja. Lire
`process-checkins/index.ts`, `whatsapp-send/index.ts`, les metadata et les tests
avant de choisir.

Etape 5 - Creer l'etat actif post_morning_nudge

Quand `opens_local_flow=true`, enregistrer un etat actif :

```json
{
  "skill_id": "post_morning_nudge",
  "flow_kind": "action|suppressed_action|emotional_presence",
  "status": "active",
  "source_nudge": {},
  "local_assessment": {
    "action_readiness": "unknown",
    "motivation_need": "unknown",
    "emotional_load": "unknown",
    "user_wants_conversation": false
  },
  "turn_count": 0,
  "max_turns": 3,
  "created_at": "iso",
  "updated_at": "iso"
}
```

Le post-flow doit etre court. Default `max_turns=3`.

Etape 6 - Ajouter le resolver local

Au prochain message user, si un `post_morning_nudge` actif existe :

```txt
flow_kind=action
  -> post_morning_nudge.action_dispatcher

flow_kind=suppressed_action
  -> post_morning_nudge.suppressed_action_dispatcher

flow_kind=emotional_presence
  -> post_morning_nudge.emotional_presence_dispatcher
```

Dans cette mission, si les prompts complets ne sont pas encore ecrits, ajouter
des stubs contractuels/testables qui permettent de brancher les dispatchers
ensuite sans refaire l'orchestration.

Ne pas router par analyse du texte user dans le resolver.

Etape 7 - Bloquer le dispatcher global pendant flow actif

Regle absolue :

Si `post_morning_nudge` est actif, le dispatcher global ne doit pas fonctionner.

Exception unique :

Le dispatcher local retourne :

```txt
flow_action = exit_to_global_dispatcher
```

Alors le meme message user est reanalyse par le dispatcher global dans une
seconde passe.

Etape 8 - Ajouter le contrat `exit_memo`

Quand un dispatcher local retourne `exit_to_global_dispatcher`, il doit fournir
un memo non visible :

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

Ce memo doit etre integre a la trace et transmis au dispatcher global lors de la
seconde analyse.

Etape 9 - Ajouter logs / trace

Ajouter des logs lisibles :

- `morning_nudge_v2.nudge_kind`;
- `morning_nudge_v2.posture`;
- `morning_nudge_v2.opens_local_flow`;
- `morning_nudge_v2.intended_followup_flow`;
- `post_morning_nudge.flow_kind`;
- source dispatcher local ;
- `flow_action`;
- `visible_task.kind`;
- `global_dispatcher_skipped_due_post_morning_nudge`;
- `exit_to_global_dispatcher`;
- `exit_memo.reason`;
- `global_dispatcher_second_pass_after_local_exit`.

Objectif QA :
Comprendre en un coup d'oeil si le global a ete appele alors qu'il ne devait pas.

Etape 10 - Tests

Ajouter des tests unitaires pour :

- V1 non nominale ;
- V2 payload enrichi ;
- `action_nudge` ouvre `post_morning_nudge.action`;
- `suppressed_action_nudge` ouvre `post_morning_nudge.suppressed_action`;
- `emotional_presence_nudge` ouvre `post_morning_nudge.emotional_presence`;
- `no_action_greeting` n'ouvre aucun flow ;
- resolver lit le payload, pas le message user ;
- flow actif skip global dispatcher ;
- `exit_to_global_dispatcher` appelle le global en seconde passe ;
- `exit_memo` est present et transmis ;
- max turns ferme ou sort proprement ;
- celebration pure n'ouvre pas local flow par defaut ;
- high emotional load + planned item peut produire suppressed action ;
- high emotional load + no item peut produire emotional presence ;
- no item + no support signal ne cree pas de flow local.

Etape 11 - QA reel minimal

Preparer au moins ces scenarios :

1. Action nudge
   - action prevue ;
   - morning nudge envoye avec `nudge_kind=action_nudge`;
   - user repond "ok je m'y mets";
   - attendu : local action flow, fermeture rapide, pas de global.

2. Suppressed action
   - action prevue + charge emotionnelle haute ;
   - nudge ne pousse pas l'action ;
   - user repond "je peux pas aujourd'hui";
   - attendu : local suppressed flow, soutien/protection, pas de culpabilisation.

3. Emotional presence
   - pas d'action cible + besoin de soutien ;
   - nudge de presence ;
   - user repond "en vrai ca va pas";
   - attendu : local emotional flow, pas de retour brutal a l'action.

4. No-action greeting
   - pas d'action + pas de signal fort ;
   - greeting envoye ou skip selon policy ;
   - si greeting envoye, `opens_local_flow=false`;
   - user repond "merci";
   - attendu : pas de local flow.

5. Exit vers tool
   - post-flow actif ;
   - user dit "prepare-moi une carte de defense";
   - attendu : local exit_to_global_dispatcher avec exit_memo, puis global
     route vers le bon flow.

Critere d'acceptation

- `morning_nudge_v2` est le chemin nominal.
- La V1 `morning_active_actions_nudge` n'est plus emise nominalement.
- Chaque nudge envoye a un payload structure suffisant.
- Les nudges qui ouvrent un followup creent un `post_morning_nudge` actif.
- Les greetings/no-action simples n'ouvrent pas de flow.
- Le global dispatcher ne tourne jamais pendant un post-flow actif.
- Le global dispatcher ne tourne qu'apres `exit_to_global_dispatcher`.
- L'exit contient une justification exploitable par le global.
- Aucun parsing metier par regex ou `message.includes`.
- Aucun renderer visible deterministe.
- Aucun effet durable cree par `post_morning_nudge`.
```

