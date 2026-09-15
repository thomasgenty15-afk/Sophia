# QA Run Report — status-recap-real-r1

## 1. Contexte Du Test

- Date: 2026-06-12 Europe/Paris
- Run: `status-recap-real-r1`
- Persona: `qa-skill`, connexion temporaire `status_recap_status_recap_20260612_r1`, user `8f280189-35fd-47db-913b-46b92c07d26b`
- Objectif: verifier en IA reelle locale que le flow `status_recap` repond aux demandes d'etat factuel, garde l'ownership sur les follow-ups, reste read-only, et expose des traces coherentes.
- Trajectoire: demande de point factuel -> confirmation -> follow-up rappels annules -> demande de sources.
- Surfaces visees: dispatcher global, `flow_opportunity_verification`, `status_recap`, active flow state, DB projection, visible agent, EffectLedger/no mutation.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun renderer/fallback deterministe. Services locaux non critiques signales arretes: imgproxy, analytics, vector, pooler; Auth/API/Functions disponibles.
- Validite QA: valide. Cleanup final verifie: `chat_messages`, `scheduled_checkins`, `user_recurring_reminders`, `user_profile_facts`, `user_attack_cards`, `user_defense_cards`, `user_chat_states` a 0 pour le user temporaire.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-ROUTE-01` — Mauvais owner selectionne

**User**
> Peux-tu me faire un point factuel sur ce qui existe vraiment dans mon espace, sans rien modifier ?

**Sophia**
> Je peux te faire un point précis sur l'état actuel de ton espace sans rien changer. On regarde ça ensemble ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `flow_opportunity_verification`
- route_reason: null
- safety: null
- direct_effects: null
- operation: null
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: []
- flow_action: `offer_opportunity`
- visible_task: `offer_status_recap`

**Analyse si yellow/red**
- Symptome: Sophia demande une confirmation alors que la demande status est explicite.
- Source amont probable: arbitration entree skill status vs flow opportunity verification.
- Owner runtime: dispatcher / `flow_opportunity_verification`.
- Meilleure correction selon les guidelines: router directement les demandes explicites de status DB read-only vers `status_recap` avec `note_information`; garder la verification pour les opportunites implicites.
- Pourquoi ce n'est pas un patch local: le probleme est l'owner selectionne avant le dispatcher local, pas la formulation visible.

### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-STATUS-01` — Projection DB mal lue / mal rendue

**User**
> Oui, fais-le maintenant, uniquement factuel et sans rien modifier.

**Sophia**
> Voici l'état actuel de tes rappels et préférences :
>
> Fait : Aucune activité récente n'est enregistrée.
> Prévu : Ton rappel pour le dossier budget le 13 juin à 09h30 et ton point hebdo chaque lundi à 08h45.
> Fragile : Aucun blocage ou échec n'est à signaler.
>
> Est-ce que tu veux que je regarde un autre sujet ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `status_recap`
- route_reason: null
- safety: null
- direct_effects: null
- operation: null
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: []
- flow_action: `answer_object_status`
- visible_task: `object_status`
- projection_summary: `one_shot_pending_count=1`, `recurring_reminder_count=1`, `coach_preference_count=1`, `one_shot_cancelled_recent_count=0`
- reason_code: `status_recap_local_answer_object_status`

**Analyse si yellow/red**
- Symptome: le status fonctionne et reste read-only, mais la reponse annonce "rappels et preferences" sans detailler la preference coach presente en DB (`coach.tone=warm_direct`).
- Source amont probable: visible context / prompt visible `object_status` ou choix de `read_scope`.
- Owner runtime: `status_recap`.
- Meilleure correction selon les guidelines: si `coach_preference_count>0` et la reponse annonce les preferences, le contexte visible doit inclure/faire rendre la preference; sinon ne pas annoncer la categorie.
- Pourquoi ce n'est pas un patch local: il faut aligner projection, `read_scope` et prompt stage-specific, pas ajouter une phrase fixe.

### Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-STATE-01` — Mauvaise transition de flow

**User**
> Et côté rappels annulés, tu vois quelque chose ou rien du tout ?

**Sophia**
> Je vois rien à signaler côté rappels annulés : à la date actuelle, tes rappels visibles sont actifs (dont le point hebdo du lundi à 08:45) et je ne vois pas d’info indiquant des rappels annulés. ✅🙂

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: null
- route_reason: null
- safety: null
- direct_effects: null
- operation: null
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: null
- flow_action: null
- visible_task: null

**Analyse si yellow/red**
- Symptome: la reponse est globalement dans le sujet, mais le dispatcher local `status_recap` ne possede plus le tour.
- Source amont probable: lifecycle local `status_recap` mis en `closing` apres T2; active-flow policy ne reprend que `status=active`.
- Owner runtime: `status_recap` reducer/local state + router active flow.
- Meilleure correction selon les guidelines: garder l'ownership local sur les follow-ups status directs, ou traiter `closing` comme resumable tant que le message courant est une suite status.
- Pourquoi ce n'est pas un patch local: la doctrine dit que le dispatcher global normal ne doit pas fonctionner pendant un flow actif; c'est une transition d'etat/ownership, pas une phrase.

### Tour 4

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-STATE-01` — Mauvaise transition de flow

**User**
> Tu peux me dire sur quelles sources tu t’es basé pour ce point factuel ?

**Sophia**
> Je me base sur les informations de ton suivi et nos échanges précédents. On fait un point rapide sur l'état actuel de tes offres ?

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `flow_opportunity_verification`
- route_reason: null
- safety: null
- direct_effects: null
- operation: null
- pending_confirmation: null
- memory_plan: null
- executed_tools: []
- durable_effect: []
- flow_action: `offer_opportunity`
- visible_task: `offer_status_recap`
- reason_code: `flow_opportunity_verification_offer_opportunity`
- DB state after run: `__status_recap_flow_state_v1.status=closing`, `__flow_opportunity_verification_state_v1.status=waiting_confirmation`

**Analyse si yellow/red**
- Symptome: une demande de sources qui devrait etre `status_recap.explain_sources` relance une verification d'opportunite, et parle d'`offres`, sujet non present dans le run.
- Source amont probable: meme perte d'ownership `status_recap` que T3, puis mauvais reciblage par `flow_opportunity_verification`.
- Owner runtime: active flow policy / `flow_opportunity_verification` arbitration.
- Meilleure correction selon les guidelines: `explain_sources` doit etre une continuation locale de `status_recap`; si `status_recap` est en `closing`, le follow-up sources doit le rouvrir localement sans global normal ni verification.
- Pourquoi ce n'est pas un patch local: la faute vient de l'ownership et de la reprise de flow, pas du wording de la reponse.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Quand `status_recap` est finalement appele au T2, Sophia reste read-only et donne les rappels actifs/recurrent sans side effect.
- Le ton reste globalement simple et comprehensible.

**Problemes**
- Tour 1: confirmation inutile pour une demande explicite. Famille: `BF-ROUTE-01`. Impact: friction et lenteur. Severite: yellow.
- Tour 2: reponse annonce les preferences mais ne les detaille pas. Famille: `BF-STATUS-01`. Impact: confiance reduite dans le point factuel. Severite: yellow.
- Tour 3: follow-up status traite hors dispatcher local. Famille: `BF-STATE-01`. Impact: l'utilisateur obtient une reponse mais le flow n'est plus fiable. Severite: red.
- Tour 4: demande de sources mal reprise, question sur des "offres" hors contexte. Famille: `BF-STATE-01`. Impact: confusion conversationnelle nette. Severite: red.

**Fix propose**
- Source amont: active flow lifecycle `status_recap` + arbitration initiale status.
- Correction recommandee: entree explicite status -> `status_recap` direct; follow-ups status/sources/categories doivent rester locaux meme apres un etat `closing`.
- Tests d'invariant attendus: run multi-tour `status_recap` avec T1 status direct, T2 categorie, T3 sources, anti-faux-positif nouveau sujet -> `exit_to_global_dispatcher`.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- T1 route vers `flow_opportunity_verification` au lieu de `status_recap` direct.
- T2 route correctement vers `status_recap`.
- T3 tombe en `normal_reply`, alors qu'une suite locale `answer_cancelled_objects` etait attendue.
- T4 repasse par `flow_opportunity_verification`, alors qu'une suite locale `explain_sources` etait attendue.

**Skills / Operations / Tools**
- Aucun tool durable execute.
- `status_recap` lit bien une projection: 1 rappel ponctuel pending, 1 rappel recurrent, 1 preference coach.
- `flow_opportunity_verification` capture a tort l'entree initiale explicite et la demande de sources finale.

**Memory / Effets durables**
- Fixtures avant cleanup: 2 `scheduled_checkins`, 1 `user_recurring_reminders`, 1 `user_profile_facts`.
- Aucun effet durable cree par Sophia pendant le run (`executed_tools=[]`, `durable_effect=[]`).
- Cleanup final verifie a 0 sur les tables QA ciblees.

**Problemes**
- T1: `BF-ROUTE-01`. Impact systeme: mauvais owner initial pour demande explicite status. Severite: yellow.
- T2: `BF-STATUS-01`. Impact systeme: projection partiellement rendue. Severite: yellow.
- T3-T4: `BF-STATE-01`. Impact systeme: violation doctrine active flow, global/verification reprennent alors que `status_recap` devrait rester owner. Severite: red.

**Fix propose**
- Source amont: `status_recap` reducer/local state (`closing`) + router active-flow policy + flow opportunity verification gating.
- Correction recommandee: ne pas clore l'ownership status apres une premiere reponse si le user pose une suite status; considerer `closing` comme resumable pour `repeat`, `explain_sources`, categories status, ou maintenir `active` jusqu'a stop/exit explicite.
- Tests d'invariant attendus: unitaires reducer state `closing` follow-up, integration `/test-send-message force_full_ai=true` T1/T2/T3/T4, assertion trace `selected_handler=status_recap` sur follow-ups status.

## Verdict Global

- Verdict: red
- Raison principale: le flow `status_recap` fonctionne sur un tour apres confirmation, mais ne garde pas l'ownership sur les follow-ups status/sources; T3/T4 repassent hors dispatcher local.
- Follow-up prioritaire: corriger lifecycle/active-flow policy `status_recap` pour que les suites status restent locales, puis rerun IA reel multi-tour.
