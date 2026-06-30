# QA Run Report - daily-real-rose-20260624-r2

## 1. Contexte Du Test

- Date: 2026-06-24
- Run: `daily-real-rose-20260624-r2`
- Persona: Rose, user `02dc9ae2-4128-412b-b0be-56712bf775a8`
- Objectif: verifier le fonctionnement normal du flow `daily_action_review_v1`, avec une action faite et une action non faite pour raison de fatigue.
- Trajectoire: fixture dynamique DB -> `process-checkins` -> pending `daily_action_review` -> `whatsapp-webhook` local -> commit daily -> message post-daily via `test-send-message` avec `force_full_ai=true`.
- Surfaces visees: `scheduled_checkins`, `whatsapp_pending_actions`, `daily_action_review_v1`, visible daily, reducer/effects daily, `user_plan_item_entries`, statuts occurrences, retour `normal_reply`.
- Cadre IA reel: Supabase local, vrai chemin Sophia, pas de renderer deterministe, pas de fallback direct. Les tours daily actifs passent par `whatsapp-webhook`; la verification post-daily passe par `/functions/v1/test-send-message` avec `force_full_ai=true`.
- Validite QA: valide. La base Rose n'avait que 2 occurrences `planned` actives exploitables au moment du run; le daily a donc ete lance sur 2 targets reelles, sans forcer de 3eme target artificielle.
- Raw state: `tests/real-personas/rose/runs/daily-weekly/daily-real-rose-20260624-r2.raw.json`

Incident de preparation: un vieux pending QA `qa-daily-two-runs-20260618-r1-clarify` bloquait le daily. Il a ete identifie comme artefact QA ancien puis nettoye de facon ciblee: pending `1227b28e-6fb3-430b-97d1-496c888eb642`, scheduled checkin `b4833b86-d72d-402b-8def-422608d7a5da`, message associe `1d3170d3-5599-4bb3-a80d-fec3a2b3cd5b`.

Targets du run:
- `Journée 100% sans cannabis`: "Ne pas consommer de cannabis du lever au coucher."
- `Organiser une soirée 'zéro vide'`: "prévois une soirée à l'extérieur ou une activité très prenante chez toi..."

## 2. Tours De Conversation

### Tour 0 - Ouverture daily

**Verdict du tour:** green

**User**
> N/A - ouverture proactive `process-checkins`.

**Sophia**
> J’aimerais faire le point sur aujourd’hui : ta journée 100% sans cannabis, et l’idée d’organiser une soirée “zéro vide”.  
> Qu’est-ce qui s’est passé pour ces deux actions ?

**Trace courte**
- http_status: `process-checkins` OK
- response_owner: scheduled daily pending
- selected_handler: `daily_action_review_v1`
- route_reason: pending `chat_capability=daily_action_review`
- safety: none
- direct_effects: none
- operation: scheduled checkin `3bdd5e8a-591d-43b0-bff2-61214257cb5d`
- pending_confirmation: pending `e34e52d4-407a-44dd-b894-c83d20d88cd0`
- memory_plan: N/A
- executed_tools: none
- durable_effect: pending created with `target_count=2`

### Tour 1 - Reponse daily complete

**Verdict du tour:** green

**User**
> La journée sans cannabis, oui, tenue jusqu'au coucher. Pour la soirée zéro vide, non : j'étais épuisée, je suis restée chez moi sans organiser quelque chose, mais ça reste utile pour demain.

**Sophia**
> Bien noté : la journée sans cannabis est validée, et la soirée “zéro vide” est notée comme manquée par fatigue.

**Trace courte**
- http_status: 200
- response_owner: `daily_action_review`
- selected_handler: `daily_action_review_v1`
- route_reason: pending daily actif
- safety: none
- direct_effects: `log_daily_action_review x2`
- operation: daily commit
- pending_confirmation: pending passe a `done`
- memory_plan: N/A
- executed_tools: none
- durable_effect:
  - entry 1: outcome `completed`, source `daily_action_review_v1`, occurrence `done`
  - entry 2: outcome `missed`, `reason_text="j'étais épuisée"`, `reason_category="fatigue"`, `blocker_hint="fatigue"`, `still_relevant=true`, occurrence `rescheduled`

### Tour 2 - Message post-daily

**Verdict du tour:** green

**User**
> Merci, c'est tout pour ce soir.

**Sophia**
> Bien noté. Bonne soirée 🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: global minimal / companion
- route_reason: `normal_reply_default`
- safety: none
- direct_effects: none
- operation: none
- pending_confirmation: none
- memory_plan: `response_intent=user_closure_no_action`, `memory_mode=none`
- executed_tools: none
- durable_effect: aucun pending restant

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- L'ouverture est claire et cible les deux actions disponibles sans demander une action inexistante.
- La reponse visible apres commit est courte, lisible, et distingue bien l'action validee de l'action manquee.
- Le wording "manquée par fatigue" reste acceptable dans ce cas: il ne parle pas de "partiel" et reprend la cause utile.
- Le message post-daily est bien traite comme une cloture normale, sans relancer le daily.

**Problemes**
- Aucun probleme conversationnel bloquant observe sur ce run.

**Fix propose**
- Aucun fix requis pour ce run.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- `process-checkins` cree bien un pending `daily_action_review`.
- Le tour entrant WhatsApp est consomme par le pending daily, pas par le dispatcher global.
- Apres commit, le pending est `done`; le tour suivant passe bien en `normal_reply`.

**Skills / Operations / Tools**
- Effet canonique observe: `log_daily_action_review`.
- Aucun `create_one_shot_reminder`, aucun tool hors scope.
- Aucun handoff coaching, product ou safety dans ce run normal.

**Effets durables**
- 2 entries creees avant cleanup:
  - completed pour `Journée 100% sans cannabis`;
  - missed/rescheduled pour `Organiser une soirée 'zéro vide'`.
- Le point corrige precedemment est valide: `reason_text="j'étais épuisée"` est mappe vers `reason_category="fatigue"` et `blocker_hint="fatigue"`.
- Occurrences avant cleanup:
  - completed -> `done`;
  - missed encore pertinent -> `rescheduled`.
- Cleanup cible effectue:
  - entries supprimees: `8dcf4d30-701b-4a52-9b2a-5f443eb0d711`, `aad23bea-d7a3-4faa-9d54-892ab25738da`;
  - pending supprime: `e34e52d4-407a-44dd-b894-c83d20d88cd0`;
  - scheduled checkin supprime: `3bdd5e8a-591d-43b0-bff2-61214257cb5d`;
  - occurrences restaurees en `planned`;
  - verification finale: pending/checkin/entries du run absents, occurrences restaurees.

**Warnings**
- Aucun warning systeme pour le flow teste.
- Note de donnees: ce run ne couvre pas la file d'attente 3+ targets, car la base Rose n'exposait que 2 occurrences `planned` actives au moment du test.

## Verdict Global

green - Run daily valide. Le flow normal fonctionne, le mapping `epuisee -> fatigue` est confirme, le commit est correct, et la sortie post-daily revient au global sans pending residuel.
