# QA Run Report - daily-bridge-child-flow-20260630-r1

## 1. Contexte Du Test

- Date: 2026-06-30
- Run: `daily-bridge-child-flow-20260630-r1`
- Persona: Rose, Supabase local
- Objectif: tester en conditions reelles le chemin `daily_action_review_v1 -> daily_action_coaching_recommendation_v1 -> reprise daily -> commit daily`.
- Trajectoire: fixture daily dynamique 2 plans / 4 actions -> `process-checkins` -> pending WhatsApp -> `/functions/v1/whatsapp-webhook` en loopback -> demandes d'explication -> 2 demandes explicites d'aide -> commit daily.
- Surfaces visees: `process-checkins`, `whatsapp-webhook`, pending daily, dispatcher local daily, child flow local daily action coaching, visible coaching plan action, reducer/effects `log_daily_action_review`, entries DB.
- Cadre IA reel: Supabase local, webhook WhatsApp local, IA reelle appelee par les handlers, aucun `test-send-message`, aucun fallback deterministe.
- Validite QA: valide pour le chemin runtime pending/webhook et les effets DB. Reserve: le runner utilise une sequence de messages predefinie, donc ce rapport vaut surtout comme test systeme reel du bridge, pas comme evaluation conversationnelle totalement adaptative.
- Raw: `tests/real-personas/rose/runs/daily-weekly/daily-bridge-child-flow-20260630-r1.raw.json`
- Cleanup: effectue et verifie (`cleanup_ok=true`).

Targets du run:

- Plan cannabis: `Journée sans fumer`
- Plan cannabis: `Respiration cinq minutes`
- Plan administratif: `Ranger deux papiers administratifs`
- Plan administratif: `Préparer la pochette documents`

## 2. Tours De Conversation

### Tour 0 - Ouverture daily

**Verdict du tour:** green

**User**
> N/A - ouverture proactive daily depuis pending QA.

**Sophia**
> Je passe prendre des nouvelles avant de dormir.  
> Aujourd’hui, comment ça s’est passé pour la journée sans fumer et les 5 minutes de respiration quand l’envie montait ?

**Trace courte**
- http_status: opening fixture OK
- response_owner: pending daily
- selected_handler: `daily_action_review_v1`
- route_reason: pending `chat_capability=daily_action_review`
- durable_effect: pending cree avec 4 targets, ouverture sur les 2 premieres

### Tour 1

**Verdict du tour:** green

**User**
> Oui, vas-y pour le bilan.

**Sophia**
> Je passe prendre des nouvelles avant de dormir.  
> Aujourd’hui, comment ça s’est passé pour la journée sans fumer et les 5 minutes de respiration quand l’envie montait ?

**Trace courte**
- http_status: `200`
- response_owner: `scheduled_checkin`
- selected_handler: `daily_action_review_v1`
- pending_confirmation: `pending`
- durable_effect: entries_count=`0`

### Tour 2

**Verdict du tour:** green

**User**
> Je ne me souviens plus : « Journée sans fumer », ça devait faire quoi exactement ?

**Sophia**
> « Journée sans fumer », ça veut dire tenir la journée sans fumer de joint, en restant attentif au moment où l’envie de craquer arrive.
>
> C’était fait aujourd’hui ou pas fait aujourd’hui ?

**Trace courte**
- http_status: `200`
- response_owner: `daily_action_review_clarification`
- selected_handler: `daily_action_review_v1`
- durable_effect: entries_count=`0`

### Tour 3

**Verdict du tour:** green

**User**
> Ok, alors pas faite : j’ai fumé après une contrariété en fin d’après-midi. Oui, ça reste à garder.

**Sophia**
> Merci, je note que ce n’est pas fait.  
> Pour « Respiration cinq minutes », tu veux le marquer fait ou pas fait ?

**Trace courte**
- http_status: `200`
- response_owner: `daily_action_review_clarification`
- selected_handler: `daily_action_review_v1`
- review_status: `needs_clarification`
- durable_effect: entries_count=`0`

### Tour 4

**Verdict du tour:** green

**User**
> Et « Respiration cinq minutes », je ne vois plus trop ce que ça devait m’apporter. Tu peux me rappeler ?

**Sophia**
> « Respiration cinq minutes », c’est une pause de cinq minutes pour faire redescendre l’envie et traverser le moment sans fumer.  
> Ça sert surtout à te donner un peu d’air avant de réagir.  
> C’est fait ou pas fait aujourd’hui ?

**Trace courte**
- http_status: `200`
- response_owner: `daily_action_review_clarification`
- selected_handler: `daily_action_review_v1`
- durable_effect: entries_count=`0`

### Tour 5

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-ROUTE-01` - Mauvais owner selectionne

**User**
> Pas faite non plus : j’oublie à chaque fois quand l’envie monte. Je n’y arrive pas, tu peux m’aider à trouver le bon levier Sophia pour réussir celle-là ?

**Sophia**
> Tu veux te débloquer par rapport à quelle action précise, là ?

**Trace courte**
- http_status: `200`
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- pending_confirmation: `pending`
- local_flow_transfer: `handoff_to_child_flow`
- child_flow_handoff: `daily_action_coaching_recommendation_v1`
- child_flow_context.action_context.title: `Respiration cinq minutes`
- active_skill_state.skill_id observe apres tour: `coaching_recommendation`
- durable_effect: entries_count=`0`

**Analyse si yellow/red**
- Symptome: le daily avait identifie l'action cible et emit le bon child flow specialise, mais le message visible est rendu par le flow global `coaching_recommendation`, qui redemande l'action.
- Source amont probable: `handleActionEveningReviewReply` retourne `false` apres avoir pose `child_flow_handoff`, ce qui laisse `whatsapp-webhook` continuer vers le pipeline global sur le meme message.
- Owner runtime: `whatsapp-webhook/handlers_pending.ts` + activation child flow local.
- Meilleure correction selon les guidelines: quand un pending daily emit `handoff_to_child_flow`, le pending handler doit consommer le tour et faire executer le child flow specialise, ou au minimum ne pas laisser le global re-router le meme message.
- Pourquoi ce n'est pas un patch local: le bug est une transition d'ownership runtime, pas une formulation visible.

### Tour 6

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATE-01` - Mauvaise transition de flow

**User**
> Pour « Ranger deux papiers administratifs », j’ai oublié l’idée. Ça servait à quoi déjà ?

**Sophia**
> « Ranger deux papiers administratifs », c’était pour choisir deux courriers, les trier puis les ranger ou les jeter. L’idée était juste d’alléger un peu tes papiers et de remettre de l’ordre.  
> Fait ou pas faite aujourd’hui ?

**Trace courte**
- http_status: `200`
- response_owner: `daily_action_review_clarification`
- selected_handler: `daily_action_review_v1`
- active_skill_state.skill_id reste: `coaching_recommendation`
- durable_effect: entries_count=`0`

**Analyse si yellow/red**
- Symptome: la reponse visible daily est correcte, mais l'etat actif global reste pollue par `coaching_recommendation`.
- Source amont probable: le global a ecrase l'active skill au tour 5 et le retour daily ne le nettoie pas.
- Owner runtime: active skill lifecycle / pending daily ownership.
- Meilleure correction selon les guidelines: le child flow specialise ne doit jamais etre remplace par le general sur le meme tour; apres retour parent, l'active child state doit etre consomme/nettoye.

### Tour 7

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-PROACTIVE-01` - Daily/weekly preuve -> decision cassee

**User**
> Non, pas fait : je bloque complètement et je repousse dès que je vois les papiers. Aide-moi à trouver quoi faire pour y arriver.

**Sophia**
> Je partirais sur une carte d’attaque, technique ancre visuelle : prépare un repère très visible près des papiers pour te rappeler tout de suite le premier geste et casser le réflexe de repousser.

**Trace courte**
- http_status: `200`
- response_owner: `coaching_recommendation`
- selected_handler: `coaching_recommendation`
- local_flow_transfer: `handoff_to_child_flow`
- child_flow_handoff: `daily_action_coaching_recommendation_v1`
- daily item update observe: `Ranger deux papiers administratifs` -> missed, reason_category=`too_hard`
- child_flow_context.action_context.title observe: `Préparer la pochette documents`
- active_skill_state.dispatcher_signal_context.action_title observe: `Ranger le matériel hors de vue`
- durable_effect: entries_count=`0`

**Analyse si yellow/red**
- Symptome: le visible donne une recommandation acceptable en surface, mais le contexte structure est faux: le child context cible `Préparer la pochette documents` alors que le user parle de `Ranger deux papiers administratifs`, puis le global utilise en plus une action stale hors run (`Ranger le matériel hors de vue`).
- Source amont probable: target resolution daily pour le `child_flow_context` prend la prochaine target au lieu de la target resolue du message, puis le global general remplace le child specialise et reconstruit son propre contexte.
- Owner runtime: daily local dispatcher / handoff context compiler, plus same-turn global fallthrough.
- Meilleure correction selon les guidelines: le child context doit etre construit uniquement depuis `resolved_occurrence_ids` du message courant; si ambigu, clarification daily, pas handoff. Le runtime doit interdire le fallthrough global apres handoff child.

### Tour 8

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATE-01` - Mauvaise transition de flow

**User**
> Et la pochette documents, pareil, je ne sais plus ce que c’était censé régler. Tu m’expliques ?

**Sophia**
> Préparer la pochette documents, c’était pour regrouper tous les papiers utiles dans un seul endroit visible, afin de les retrouver plus vite et de te simplifier le tri.
>
> Tu l’as faite aujourd’hui ou pas faite aujourd’hui ?

**Trace courte**
- http_status: `200`
- response_owner: `daily_action_review_clarification`
- selected_handler: `daily_action_review_v1`
- active_skill_state.skill_id reste: `coaching_recommendation`
- durable_effect: entries_count=`0`

**Analyse si yellow/red**
- Symptome: la conversation visible est correcte, mais l'active skill global reste stale.
- Source amont probable: lifecycle child/global non nettoye apres reprise daily.
- Owner runtime: active skill state cleanup.

### Tour 9

**Verdict du tour:** green

**User**
> Pas faite : un imprévu familial m’a pris le créneau. Je veux la garder pour demain.

**Sophia**
> C’est noté pour les 4 actions de la journée. Merci, je clôture ce daily.

**Trace courte**
- http_status: `200`
- response_owner: `daily_action_review`
- selected_handler: `daily_action_review_v1`
- pending_confirmation: `done`
- review_status: `complete`
- durable_effect: `log_daily_action_review x4`
- final entries: `emotional`, `forgot`, `too_hard`, `external`

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Les explications d'action sont naturelles et nomment correctement l'action.
- Le daily continue jusqu'aux 4 actions, meme si l'ouverture ne couvre que 2 actions.
- La cloture finale est courte et contient le nombre exact d'actions.

**Problemes**
- Tour 5: Sophia redemande l'action alors que le contexte daily la rend identifiable. Famille: `BF-ROUTE-01`. Impact: friction utilisateur et impression que Sophia oublie le fil. Severite: red.
- Tour 7: la recommandation visible est plausible, mais le contexte structure est faux. Famille: `BF-PROACTIVE-01`. Impact: risque de recommander ou tracer le mauvais objet. Severite: red.

**Fix propose**
- Source amont: runtime pending child handoff + daily child context compiler.
- Correction recommandee: consommer le tour dans le pending handler quand `handoff_to_child_flow` est produit, executer le child flow specialise, puis revenir au parent via note structuree. Construire `child_flow_context.action_context` depuis l'occurrence resolue du message courant.
- Tests d'invariant attendus: un message daily explicite "aide-moi pour celle-la" apres une question sur une action precise doit produire `daily_action_coaching_recommendation_v1`, jamais `coaching_recommendation`, et `child_flow_context.action_context.occurrence_id` doit etre l'occurrence resolue.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Le daily detecte bien `handoff_to_child_flow`.
- Le payload pending contient bien `child_flow_handoff.child_flow = daily_action_coaching_recommendation_v1`.
- Le meme tour continue pourtant vers le dispatcher global, qui choisit `response_owner=coaching_recommendation`.
- L'active skill observe apres handoff est `coaching_recommendation`, pas `daily_action_coaching_recommendation_v1`.

**Skills / Operations / Tools**
- `log_daily_action_review` est correctement execute en fin de run.
- Aucun `create_one_shot_reminder` observe.
- Le child flow specialise n'est pas celui qui rend le visible sur les tours d'aide; le global `coaching_recommendation` capture le tour.

**Memory / Effets durables**
- Entries finales:
  - `Journée sans fumer`: outcome=`missed`, reason_category=`emotional`, reason_text=`j’ai fumé après une contrariété en fin d’après-midi`
  - `Respiration cinq minutes`: outcome=`missed`, reason_category=`forgot`, reason_text=`j’oublie à chaque fois quand l’envie monte`
  - `Ranger deux papiers administratifs`: outcome=`missed`, reason_category=`too_hard`, reason_text=`je bloque complètement et je repousse dès que je vois les papiers`
  - `Préparer la pochette documents`: outcome=`missed`, reason_category=`external`, reason_text=`un imprévu familial m’a pris le créneau`
- Pending final: `done`.
- Cleanup final: OK, artefacts QA supprimes.

**Problemes**
- Tour 5: fallthrough global apres handoff child. Famille: `BF-ROUTE-01`. Impact systeme: mauvais owner visible et mauvais active skill.
- Tour 7: `child_flow_context` pointe vers la mauvaise action. Famille: `BF-PROACTIVE-01`. Impact systeme: risque de reco/trace sur mauvais item.
- Tours 6-9: active skill stale `coaching_recommendation` persiste apres retour daily. Famille: `BF-STATE-01`. Impact systeme: risque sur le prochain message hors pending.

**Fix propose**
- Source amont: `supabase/functions/whatsapp-webhook/handlers_pending.ts`, branche `parsed.childFlowHandoff`, et compiler daily `child_flow_context`.
- Correction recommandee:
  - `handleActionEveningReviewReply` ne doit pas retourner `false` apres `parsed.childFlowHandoff` si cela laisse le global traiter le meme message.
  - Le runtime doit executer ou deleguer le child flow specialise sans fabriquer de faux message user.
  - Le daily doit remplir `child_flow_context.action_context` avec l'occurrence resolue du message courant, jamais avec la prochaine target.
  - Nettoyer l'active skill apres retour parent / cloture daily.
- Tests d'invariant attendus:
  - integration webhook: handoff daily child consomme le tour et ne produit aucun `response_owner=coaching_recommendation`;
  - integration webhook: `child_flow_context.action_context.occurrence_id === resolved_occurrence_id`;
  - lifecycle: apres cloture daily, aucun `__active_skill_state.skill_id=coaching_recommendation` ne reste.

## Verdict Global

- Verdict: red
- Raison principale: les entries daily finales sont correctes, mais le bridge n'est pas fiable: le handoff specialise est ecrit dans le pending puis le global `coaching_recommendation` capture le meme tour.
- Follow-up prioritaire: corriger la consommation du handoff child dans `handlers_pending.ts`, puis rerun le meme scenario.

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-30-daily-bridge-child-flow-r1-bugs.md`
