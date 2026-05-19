# QA Run Report - Daily D2 Paul Deux Actions

## 1. Contexte Du Test

- Date: 2026-05-16
- Run: `daily-paul-two-actions-20260516-r1`
- Persona: Paul
- Objectif: tester le daily conversationnel sur deux actions d'un meme plan avec au moins 5 tours user, dont un statut partiel et une action non faite.
- Trajectoire: pending daily QA dynamique, Tour 1 incomplet, relances ciblees, application finale, puis deux tours de controle conversationnel.
- Surfaces visees: `whatsapp_pending_actions`, `whatsapp-webhook`, `daily_action_review_v1`, `user_plan_item_entries`, `user_habit_week_occurrences`, routage apres pending.
- Cadre IA reel: Supabase local, webhook WhatsApp local, skill IA daily reel, pas de renderer deterministe, pas de fallback direct `processMessage`.
- Validite QA: valide avec fixture dynamique locale. Le pending a ete cree depuis les items DB decouverts au runtime car le pending Paul existant contenait aussi un plan draft secondaire.

Reference encart: `Encart QA - Daily / Weekly > Regle anti-hardcoding obligatoire` appliquee.

Grounding dynamique:

- connection: `tests/real-personas/paul/connection.json`
- plan actif: `Structurer et faire avancer ton projet d'entreprise` / `55f505b5-e0b4-450b-a0a2-bc2656933181`
- local_date fixture: `2026-06-28`
- pending_id cree au runtime: `a94981b9-b9c9-4915-bece-58951c651f0a`
- occurrences creees au runtime: `09943485-f891-4177-bd89-b02a1ceab3f3, 184d427a-cf51-4dd7-adea-5aa17b7143f0`
- actions: `Faire une session de travail focus (2h)` (habits, b0f064b8-2e7c-48d6-9d3b-046ae6928ccb); `Créer ton Parking à idées` (missions, 6c013507-fbb4-4ab0-9542-5568a11ec172)
- restauration DB: `restored` a 2026-05-16T14:26:17.386Z

Raw: `tests/real-personas/paul/runs/daily-weekly/daily-paul-two-actions-20260516-r1.raw.json`

## 2. Tours De Conversation

### Tour 0

**Sophia**
> Petit check du soir: sur "Faire une session de travail focus (2h)" et "Créer ton Parking à idées", qu'est-ce qui est fait, partiel ou pas fait aujourd'hui ?

**Trace courte**
- source: `dynamic_qa_pending_fixture`

### Tour 1

**User**
> J'ai fait une session focus mais pas les 2h, plutôt 45 minutes propres. Pour le Parking à idées j'ai juste ouvert une note et j'ai laissé deux vracs, je sais pas si ça compte vraiment.

### Tour 1

**Sophia**
> Qu'est-ce qui a fait que la session focus a été plus courte que les 2h prévues ?
**Trace courte**
- http_status: `200`
- response_owner: ``
- selected_handler: `daily_action_review_clarification`
- route_reason: ``
- safety: ``
- direct_effects: `daily_action_review_pending=pending`
- operation: `none`
- pending_confirmation: `none`
- memory_plan: `none/unknown`
- executed_tools: `[]`
- durable_effect: entries=none; occurrences=planned:sun,planned:sun
- review_state: `collecting`
- missing_occurrence_ids: `1`

### Tour 2

**User**
> J'ai démarré tard et après 45 minutes j'étais vidé. C'était pas un abandon, juste plus d'énergie pour continuer correctement.

### Tour 2

**Sophia**
> C'est noté pour aujourd'hui. Tu as complété la création de ton Parking à idées et réalisé une partie de ta session focus (45 minutes), interrompue par la fatigue. Je valide ton bilan.
**Trace courte**
- http_status: `200`
- response_owner: ``
- selected_handler: `daily_action_review`
- route_reason: ``
- safety: ``
- direct_effects: `daily_action_review_pending=done`
- operation: `none`
- pending_confirmation: `none`
- memory_plan: `none/unknown`
- executed_tools: `[]`
- durable_effect: entries=partial/fatigue,completed/none; occurrences=partial:sun,done:sun
- review_state: `complete`
- missing_occurrence_ids: `1`

### Tour 3

**User**
> Ok, tu as retenu quoi exactement pour les deux actions ? Je veux juste vérifier le bilan, pas changer le plan.

### Tour 3

**Sophia**
> Pour l'instant, je n'ai encore rien noté pour ta session focus et le blocage de tes créneaux. Comment ça s'est passé pour ces deux actions ?
**Trace courte**
- http_status: `200`
- response_owner: ``
- selected_handler: `daily_action_review_clarification`
- route_reason: ``
- safety: ``
- direct_effects: `daily_action_review_pending=done`
- operation: `none`
- pending_confirmation: `none`
- memory_plan: `none/unknown`
- executed_tools: `[]`
- durable_effect: entries=partial/fatigue,completed/none; occurrences=partial:sun,done:sun
- review_state: `complete`
- missing_occurrence_ids: `1`

### Tour 4

**User**
> Non, là je parlais du bilan qu'on vient de faire : focus 45 minutes et Parking à idées. Je ne parle pas des créneaux de la semaine.

### Tour 4

**Sophia**
> D'accord, je comprends mieux. C'est noté pour les 45 min de focus et le parking à idées. Qu'est-ce qui a fait que la session focus a été plus courte ? Et pour le blocage de tes créneaux, ça a donné quoi ?
**Trace courte**
- http_status: `200`
- response_owner: ``
- selected_handler: `daily_action_review_clarification`
- route_reason: ``
- safety: ``
- direct_effects: `daily_action_review_pending=done`
- operation: `none`
- pending_confirmation: `none`
- memory_plan: `none/unknown`
- executed_tools: `[]`
- durable_effect: entries=partial/fatigue,completed/none; occurrences=partial:sun,done:sun
- review_state: `complete`
- missing_occurrence_ids: `1`

### Tour 5

**User**
> Stop sur les créneaux, ce n'était pas dans ce check. Pour aujourd'hui retiens juste : focus partiel à cause de la fatigue, Parking à idées fait petit mais suffisant. Pas de report.

### Tour 5

**Sophia**
> Ok, j'arrête là. Je ne crée rien d'autre.
**Trace courte**
- http_status: `200`
- response_owner: ``
- selected_handler: ``
- route_reason: ``
- safety: ``
- direct_effects: `daily_action_review_pending=done`
- operation: `none`
- pending_confirmation: `none`
- memory_plan: `none/unknown`
- executed_tools: `[]`
- durable_effect: entries=partial/fatigue,completed/none; occurrences=partial:sun,done:sun
- review_state: `complete`
- missing_occurrence_ids: `1`

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Tours 1-2: Sophia garde un ton court et concret pour Paul. Elle ne culpabilise pas la session partielle et transforme "45 minutes propres" en bilan exploitable.
- Tour 1: elle ne force pas tout le bilan d'un coup; elle demande la cause manquante pour la session focus.
- Tour 5: quand Paul pose une limite claire ("Stop sur les creneaux"), Sophia s'arrete et ne promet pas d'autre action.

**Problemes**
- Tour 2: l'ambiguite sur le Parking a idees est tranchee comme `completed` sans question de verification. Impact: Paul peut avoir l'impression que Sophia valide a sa place ce qui "compte". Severite: yellow.
- Tours 3-4: apres cloture, Sophia dit d'abord qu'elle n'a "encore rien note", puis remplace le Parking a idees par "bloquer tes creneaux de la semaine". Impact: perte de confiance dans le bilan tout juste fait. Severite: yellow.
- Fixture: l'ouverture est dynamique mais moins robuste qu'un vrai message `process-checkins`; le run reste utile pour le handler daily, mais pas pour juger toute la generation proactive. Severite: yellow.

**Fix propose**
- Quand le user demande "tu as retenu quoi ?", repondre depuis le `review_state`/entries du pending cloture plutot que relancer un ancien contexte d'action.
- Si une action est formulee comme "je sais pas si ca compte", demander une micro-confirmation avant de la classer `completed`, sauf evidence forte.
- Produire le prochain run depuis un pending `process-checkins` system-generated strictement limite au plan actif.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Le pending `chat_capability=daily_action_review` est prioritaire pendant le flow; les messages user sont traites par le chemin `daily_action_review_v1` via `whatsapp-webhook`.
- Apres `pending_status=done`, les tours de controle ne creent pas de second effet daily, mais le contexte conversationnel reste pollue par une autre action du plan.

**Skills / Operations / Tools**
- Le skill daily structure les statuts action par action et conserve `review_state` tant que les slots critiques restent incomplets.
- Aucune operation de plan, weekly ou tool externe n'est appliquee pendant le daily.

**Memory / Effets durables**
- Entries finales creees: `partial` pour `b0f064b8-2e7c-48d6-9d3b-046ae6928ccb`, reason=`fatigue`, reschedule=``; `completed` pour `6c013507-fbb4-4ab0-9542-5568a11ec172`, reason=`none`, reschedule=``.
- Occurrences finales avant restauration: `partial` (09943485-f891-4177-bd89-b02a1ceab3f3); `done` (184d427a-cf51-4dd7-adea-5aa17b7143f0).
- Restauration: les entries, occurrences, pending et messages crees depuis `2026-05-16T14:23:55.059Z` pour Paul ont ete retires par le runner.
- Verification post-restauration: `pending_count=0`, `occurrence_count=0`, `entry_count=0`, `chat_count_since_run_start=0`.

**Problemes**
- Tour 2: `missing_occurrence_ids` reste present dans le payload final alors que `review_state.status=complete`. Impact systeme: metadata ambigue pour les outils de trace et les audits. Severite: yellow.
- Tours 3-4: le handler/source remonte encore `daily_action_review_clarification` alors que le pending est `done`, et Sophia recupere une mauvaise action ("bloquer tes creneaux"). Impact systeme: mauvais grounding apres cloture du flow. Severite: yellow.
- Le pending QA etait une fixture locale dynamique, pas un pending cree par `process-checkins`; validite correcte pour le handler daily et les side effects, mais couverture partielle de la surface proactive. Severite: yellow.

**Fix propose**
- Nettoyer `missing_occurrence_ids` quand `review_state.status=complete`.
- Ajouter un chemin de lecture du dernier daily cloture quand le user demande ce qui a ete retenu, au lieu de relancer la clarification active.
- Verifier pourquoi le contexte post-cloture remonte une action voisine du plan et pas les targets du pending cloture.

## Verdict Global

- Verdict: yellow
- Raison principale: les effets durables daily sont coherents et la DB a ete restauree, mais la conversation post-cloture se regrounde mal et mentionne une mauvaise action.
- Follow-up prioritaire: corriger le grounding apres pending daily `done`, puis relancer avec un pending `process-checkins` system-generated strictement limite au plan actif.
