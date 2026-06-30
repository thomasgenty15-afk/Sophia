# QA Run Report - Weekly Process R5

## 1. Contexte Du Test

- Date: 2026-06-23
- Run: `weekly-qa-20260623-r5-partial_habits_mission_partial`
- Persona: connexion temporaire locale `qa-weekly-deep-weekly-qa-20260623-r5-partial_habits_mission_partial@example.com`
- Objectif: retester le flow weekly en conditions IA reelle locale, en partant explicitement de `process-checkins`.
- Trajectoire: fixture weekly dynamique semaine 2026-06-15 -> 2026-06-21, Tour 0 via `process-checkins`, ouverture WhatsApp simulee, puis 7 tours utilisateur via `/functions/v1/test-send-message`.
- Surfaces visees: `process-checkins`, `scheduled_checkins`, active skill state WhatsApp, `weekly_adaptive_review_v1`, direct-effect reminder pendant weekly, confirmation weekly, EffectLedger, DB.
- Cadre IA reel: Supabase local, hors sandbox, `/functions/v1/test-send-message` avec `force_full_ai=true`, `disable_debounce=true`, aucun renderer deterministe, aucun fallback direct `processMessage`.
- Validite QA: valide pour le weekly runtime. Le run exploitable demarre bien par `process-checkins`; le weekly n'est pas recupere a froid par le global dispatcher.

Incident avant run exploitable:
- Une premiere tentative R5 sans `opening-file` a echoue avant `setup.json` sur `OPENAI_API_KEY missing` dans le helper local de setup.
- Nettoyage cible effectue sur le user temporaire partiel `9c7abe90-4ae1-496f-962b-01d43d1703fb`: entries=6, occurrences=6, week_plans=3, plan_items=4, plan=1, profile=1, cycle=1, auth delete OK.
- Le run R5 exploitable a ensuite ete recree proprement. Le helper `weekly_ai_opening_postprocess.mjs` remet `draft_message=null` avant `process-checkins`; l'opening final ci-dessous vient donc du Tour 0 runtime.

Artefacts:
- Setup: `tmp/weekly-real-conversation-qa/weekly-qa-20260623-r5-partial_habits_mission_partial/setup.json`
- Tour 0 DB: `tmp/weekly-real-conversation-qa/weekly-qa-20260623-r5-partial_habits_mission_partial/tour0-db.json`
- Transcript brut: `tmp/weekly-real-conversation-qa/weekly-qa-20260623-r5-partial_habits_mission_partial/whatsapp-run.json`
- Verification DB post-run: `tmp/weekly-real-conversation-qa/weekly-qa-20260623-r5-partial_habits_mission_partial/db-after-run.json`
- Cleanup: `tmp/weekly-real-conversation-qa/weekly-qa-20260623-r5-partial_habits_mission_partial/cleanup.json`
- Feuille bugs: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-23-weekly-process-r5-bugs.md`

Preuves Tour 0:
- `process_checkins.success=true`, `processed=1`
- `scheduled_checkins.id=1fe0072b-e01d-4d66-a46b-84da23f5ec15`
- `scheduled_checkins.status=sent`
- `event_context=weekly_progress_review_v2`
- `chat_messages.scope=whatsapp`, `metadata.source=scheduled_checkin`
- `user_chat_states.scope=whatsapp`, `__active_skill_state.skill_id=weekly_adaptive_review_v1`, `status=open`

Cleanup:
- Supprime: `scheduled_checkins=1`, `chat_messages=16`, `user_chat_states=2`, `user_plan_item_entries=6`, `user_habit_week_occurrences=6`, `user_habit_week_plans=3`, `user_plan_items=4`, `user_plans_v2=1`, `profiles=1`, `user_cycles=1`.
- Verification finale ciblee: `user_chat_states=0`, `scheduled_checkins=0`, `chat_messages=0`, `user_plan_items=0`, `user_plans_v2=0`, `profiles=0`.
- Auth user delete: `200 OK`.

## 2. Tours De Conversation

### Tour 0 - Process Checkins / Ouverture Weekly

**Verdict du tour:** green

**User**
> Aucun message utilisateur. Declenchement proactif via `process-checkins`.

**Sophia**
> C’est le moment du bilan de la semaine, et je vois qu’il y a eu du mouvement avec quelques points bien tenus et d’autres restés plus lourds.
> J’ai envie de faire le point avec toi simplement : comment tu l’as vécue, dans l’ensemble ?

**Trace courte**
- http_status: 200 sur `process-checkins`
- process_checkins: `success=true`, `processed=1`
- scheduled_checkin_status: `sent`
- active_skill_state: `weekly_adaptive_review_v1`, `status=open`, `scope=whatsapp`
- weekly_payload: `daily_evidence_summary.source=daily_action_review_v1`, `week_strategy.decision=bridge_week`
- plan_patch: `requires_confirmation=true`, `operations=[insert_bridge_week]`
- durable_effect: ouverture weekly persistée; aucun patch de plan applique

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-TEST-01 - Trace/test incoherent ou suite malsaine

**User**
> Je l'ai vécue comme une semaine en dents de scie. Les premiers repères m'ont aidé, mais dès que les soirées sont devenues longues j'ai lâché plus vite. J'aimerais garder ce qui a marché sans me remettre une grosse pression.

**Sophia**
> J’ai repéré que ça a surtout coincé quand la fatigue montait ou en fin de journée. Pour toi, le blocage principal, c’est plutôt le démarrage, le moment critique, la charge, ou le fait que l’action te paraisse trop lourde ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `normal_reply_default`
- active_owner: `none`
- safety: none
- direct_effects: []
- operation: `answer_weekly_question`
- pending_confirmation: none
- memory_plan: none
- executed_tools: []
- durable_effect: none

**Analyse si yellow/red**
- Symptome: le handler weekly repond, mais la trace haute dit encore `normal_reply` / `active_owner=none`.
- Source amont probable: route trace mapping apres active skill state.
- Owner runtime: router / active flow arbitration observability.
- Meilleure correction selon les guidelines: propager l'owner effectif `weekly_adaptive_review_v1` dans `response_owner`, `route_decision` et `active_flow_arbitration`.
- Pourquoi ce n'est pas un patch local: c'est un contrat de trace/ownership, pas un probleme de formulation.

### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-INTAKE-01 - Slot fourni mais redemande

**User**
> C'est surtout le moment critique du soir : quand je rentre tard, choisir encore quoi faire me paraît trop lourd. Si c'est déjà préparé en version minimale, je pense que je peux garder l'élan.

**Sophia**
> Je vois surtout un blocage au moment du soir, quand tu rentres tard et que l’énergie tombe. La version minimale t’aide déjà ; si tu veux, on peut préciser ce qui bloque le plus à ce moment-là : le démarrage, la charge, ou le contexte ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `normal_reply_default`
- active_owner: `none`
- safety: none
- direct_effects: []
- operation: `confirm_weekly_diagnostic`
- pending_confirmation: none
- memory_plan: none
- executed_tools: []
- durable_effect: none

**Analyse si yellow/red**
- Symptome: le user donne le blocage et une solution fit; Sophia redemande une decomposition proche.
- Source amont probable: weekly slot filling / reducer gates.
- Owner runtime: `weekly_adaptive_review_v1` intake + reducer.
- Meilleure correction selon les guidelines: marquer le slot "blocage soir + version minimale" comme capture et avancer vers progression globale ou synthese.
- Pourquoi ce n'est pas un patch local: la correction doit porter sur le gate canonique, pas sur une phrase exacte.

### Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-EFFECT-02 - Effet attendu absent; BF-ROUTE-02 - Ancien flow capture une nouvelle intention

**User**
> Le plus gros blocage, c'est le démarrage : si je dois réfléchir, je reporte. Et avant de continuer, rappelle-moi demain à 18h de relire la version minimale de ma semaine.

**Sophia**
> Sur l’ensemble de la semaine, tu sens plutôt un pas en avant vers ton objectif global, ou surtout un ajustement pour tenir dans la durée ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `normal_reply_default`
- active_owner: `none`
- safety: none
- direct_effects: []
- operation: `confirm_weekly_diagnostic`
- pending_confirmation: none
- memory_plan: none
- executed_tools: []
- durable_effect: no reminder; `EffectLedger.requested=0`, `committed=0`

**Analyse si yellow/red**
- Symptome: demande explicite de rappel ponctuel pendant weekly ignoree; aucun direct-effect, aucun scheduled reminder.
- Source amont probable: direct-effect lane non branchee pendant `weekly_adaptive_review_v1`.
- Owner runtime: TurnAgenda / direct-effect lane / weekly runtime integration.
- Meilleure correction selon les guidelines: extraire le reminder comme effet transverse, le committer via l'executor normal, injecter une confirmation visible, puis reprendre le weekly.
- Pourquoi ce n'est pas un patch local: une regex dans le weekly casserait l'ownership; le rappel doit rester auditable par EffectLedger.

### Tour 4

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-PROACTIVE-01 - Daily/weekly preuve -> decision cassee

**User**
> Je dirais un petit pas en avant, surtout parce que j'ai compris que le problème n'est pas la motivation mais la décision du soir. Pour la suite, je veux garder les deux repères utiles et réduire l'ambition quand je rentre tard.

**Sophia**
> Pour chaque action de la semaine, dis-moi si c’est fait, partiel ou pas fait, et ce qui a bloqué quand ce n’est pas fait : partager un point positif, respiration de pause, convenir d’un signal de pause ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `normal_reply_default`
- active_owner: `none`
- safety: none
- direct_effects: []
- operation: `confirm_weekly_diagnostic`
- pending_confirmation: none
- memory_plan: none
- executed_tools: []
- durable_effect: none

**Analyse si yellow/red**
- Symptome: Sophia demande de refaire le bilan action par action alors que les preuves daily sont presentes et completes.
- Source amont probable: weekly evidence reducer ne reconnait pas suffisamment `daily_evidence_summary` / `item_decisions`.
- Owner runtime: weekly proactive flow / evidence projection.
- Meilleure correction selon les guidelines: si daily evidence coverage est complete, interdire le retour action-by-action sauf correction explicite utilisateur.
- Pourquoi ce n'est pas un patch local: le contrat weekly dit de ne pas refaire tout le bilan action par action si les causes sont deja disponibles dans les daily.

### Tour 5

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-PROACTIVE-01 - Daily/weekly preuve -> decision cassee; BF-INTAKE-03 - Contrainte explicite perdue

**User**
> Normalement tu as déjà ces infos avec les points daily : deux repères faits, plusieurs soirs bloqués par fatigue ou charge, et le signal de pause seulement commencé. Je ne veux pas refaire action par action ; fais plutôt la synthèse weekly et demande-moi confirmation avant toute modification.

**Sophia**
> Je vois surtout 3 points à clarifier : le point positif, la respiration de pause et le signal de pause. Pour chacun, tu le considères fait, partiel ou pas fait, et pourquoi ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `normal_reply_default`
- active_owner: `none`
- safety: none
- direct_effects: []
- operation: `recap_weekly`
- pending_confirmation: none
- memory_plan: none
- executed_tools: []
- durable_effect: none

**Analyse si yellow/red**
- Symptome: Sophia ignore la contrainte explicite "je ne veux pas refaire action par action".
- Source amont probable: prompt visible / reducer weekly ne priorise pas la correction utilisateur et les daily evidence.
- Owner runtime: weekly reducer + visible task selection.
- Meilleure correction selon les guidelines: traiter la correction utilisateur comme signal de sortie de `review_action_gaps`, puis produire synthese/confirmation.
- Pourquoi ce n'est pas un patch local: c'est une regle de flow et de contrainte utilisateur, pas un wording a ajuster.

### Tour 6

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow

**User**
> D'accord : point positif fait une fois puis partiel puis raté par fatigue ; respiration faite une fois puis ratée en rentrant tard ; signal de pause partiel, brouillon fait mais pas envoyé. Maintenant je veux qu'on garde le principe d'une semaine plus légère.

**Sophia**
> Ta semaine a été en dents de scie, avec un début aidé par tes repères, puis plus difficile dès que les soirées se sont allongées. Côté actions, deux repères ont tenu, mais plusieurs soirs ont buté sur la fatigue, la charge et le démarrage; le signal de pause est resté seulement amorcé. Tu avances quand même d’un petit pas, surtout parce que tu as mieux vu que le blocage est dans la décision du soir, pas dans la motivation. Le levier le plus utile reste de garder une version minimale déjà prête pour les soirs tardifs. Je peux clôturer la synthèse sur cette base, et attendre ta confirmation avant toute suite ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `normal_reply_default`
- active_owner: `none`
- safety: none
- direct_effects: []
- operation: `confirm_weekly_diagnostic`
- pending_confirmation: asks confirmation visibly
- memory_plan: none
- executed_tools: []
- durable_effect: none

**Analyse si yellow/red**
- Symptome: la synthese devient enfin correcte, mais seulement apres avoir force l'utilisateur a redonner les statuts daily deja connus; `turn_count=6`, `max_turns=6`.
- Source amont probable: weekly action review gate.
- Owner runtime: weekly reducer.
- Meilleure correction selon les guidelines: avancer vers synthese avant d'atteindre le budget de tours quand les preuves daily sont suffisantes.
- Pourquoi ce n'est pas un patch local: c'est une politique de progression du flow.

### Tour 7

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow; BF-PROACTIVE-01 - Daily/weekly preuve -> decision cassee

**User**
> Oui, tu peux clôturer cette synthèse sur cette base. Je confirme le principe : garder les repères utiles et préparer une version minimale pour les soirs tardifs, sans appliquer de changement de plan tant que je n'ai pas validé le détail.

**Sophia**
> Je vois la synthèse : un point positif fait une fois, puis partiel, puis raté ; la respiration faite une fois, puis ratée le soir tard ; le signal de pause est encore partiel. Le blocage qui ressort le plus, c’est surtout le démarrage et le moment critique du soir. Qu’est-ce qui a le plus pesé pour toi : démarrer, la charge, ou le calibrage trop ambitieux en rentrant tard ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `normal_reply_default`
- active_owner: `none`
- safety: none
- direct_effects: []
- operation: `complete_weekly_no_change`
- pending_confirmation: `weekly_adaptive_review.pending_confirmation={kind: plan_patch, status: pending}`
- memory_plan: none
- executed_tools: []
- durable_effect: no plan patch applied; no reminder created

**Analyse si yellow/red**
- Symptome: l'etat dit `synthesis_status=complete` et `closure_status=complete`, mais le visible repart en question de diagnostic; `stage=action_review`, `turn_count=7`, `max_turns=6`, `status=open`.
- Source amont probable: mismatch reducer/visible task/state persistence.
- Owner runtime: weekly reducer + visible runtime prompt/context.
- Meilleure correction selon les guidelines: quand closure est complete, rendre une cloture visible ou exit propre; ne pas selectionner `review_action_gaps`.
- Pourquoi ce n'est pas un patch local: la contradiction est structurelle entre state machine et rendu visible.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Tour 0 est propre: le weekly est vraiment lance par `process-checkins`.
- L'ouverture est naturelle et contextualisee.
- Le tour 6 produit enfin une synthese utile et demande confirmation avant suite.

**Problemes**
- Tour 3: le rappel ponctuel est ignore. Famille: BF-EFFECT-02 / BF-ROUTE-02. Impact: commande concrete perdue. Severite: red.
- Tours 4-5: Sophia force un bilan action par action malgre les daily evidence et une correction utilisateur explicite. Famille: BF-PROACTIVE-01 / BF-INTAKE-03. Impact: experience lourde et non conforme weekly. Severite: red.
- Tour 7: apres confirmation, Sophia ne cloture pas visiblement et repart en diagnostic. Famille: BF-STATE-01. Impact: le flow parait bloque ou incoherent. Severite: red.

**Fix propose**
- Source amont: weekly evidence reducer, visible task selection, direct-effect integration.
- Correction recommandee: utiliser `daily_evidence_summary` comme source suffisante pour eviter action-by-action; propager les direct-effects pendant weekly; verrouiller la visible task sur cloture quand `closure_status=complete`.
- Tests d'invariant attendus: process-checkins weekly -> reprise active owner coherent; reminder pendant weekly -> commit DB + confirmation + reprise; daily evidence complete -> pas de review action-by-action; closure complete -> message de cloture ou exit, pas nouvelle question.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Le bootstrap est conforme: `process-checkins` traite 1 checkin, `scheduled_checkins.status=sent`, active skill state `weekly_adaptive_review_v1` ouvert sur `scope=whatsapp`.
- Le handler selectionne sur tous les tours utilisateur est `weekly_adaptive_review_v1`.
- Warning recurrent: `response_owner=normal_reply`, `route_reason=normal_reply_default`, `active_owner=none` sur tous les tours, malgre le handler weekly.

**Skills / Operations / Tools**
- Operations weekly observees: `answer_weekly_question`, `confirm_weekly_diagnostic`, `recap_weekly`, `complete_weekly_no_change`.
- Aucun executor engageant de plan n'est appele directement depuis le skill conversationnel.
- La direct-effect lane ne capture pas le rappel ponctuel explicite du tour 3.

**Memory / Effets durables**
- `plan_patch.requires_confirmation=true` reste present.
- Aucun patch de plan applique sans confirmation: `user_plan_items` restent actifs; pas de nouveau plan durable.
- Aucun reminder n'est cree pour "demain a 18h"; `scheduled_checkins` ne contient que l'ouverture weekly, `whatsapp_pending_actions=0`, `EffectLedger.committed=0`.
- Etat final pre-cleanup: `status=open`, `stage=action_review`, `turn_count=7`, `max_turns=6`, `closure_status=complete`, `validation_unlock=locked_until_weekly_complete`.
- Cleanup cible R5 termine sans erreur; verification finale ciblee a 0 sur les tables du user temporaire.

**Problemes**
- Tour 3: effet reminder absent. Famille: BF-EFFECT-02 / BF-ROUTE-02. Impact systeme: intention transverse avalee par weekly. Severite: red.
- Tours 4-5: daily evidence ignoree. Famille: BF-PROACTIVE-01. Impact systeme: weekly ne respecte pas son invariant "ne pas refaire tout le bilan action par action". Severite: red.
- Tour 7: state machine incoherente. Famille: BF-STATE-01. Impact systeme: closure complete mais flow encore open, visible task diagnostic. Severite: red.
- Tous les tours utilisateur: trace owner incoherente. Famille: BF-TEST-01. Impact systeme: audit route difficile. Severite: yellow.

**Fix propose**
- Source amont: `weekly_adaptive_review_v1` reducer / visible agent / direct-effect lane / route observability.
- Correction recommandee: 1) rendre les daily evidence contraignantes dans le reducer; 2) brancher direct-effect lane avant la reponse weekly; 3) synchroniser stage/gates/visible task a la cloture; 4) aligner `response_owner` sur le handler effectif.
- Tests d'invariant attendus: weekly process-checkins R5 variant; paraphrase avec rappel; anti-faux-positif sans demande de rappel; daily evidence complete; confirmation de cloture; sortie explicite global dispatcher.

## Verdict Global

**RED.** Le run est valide et part bien de `process-checkins`. Le bootstrap weekly fonctionne, mais le flow reste non conforme: direct-effect reminder absent, daily evidence ignoree au profit d'un bilan action par action, cloture visible incoherente et trace owner non fiable.
