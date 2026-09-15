# QA Run Report - Weekly Process R7 Post Owner Fix

## 1. Contexte Du Test

- Date: 2026-06-23
- Run: `weekly-qa-20260623-r7-real-partial_habits_mission_partial`
- Persona: connexion temporaire locale `qa-weekly-deep-weekly-qa-20260623-r7-real-partial_habits_mission_partial@example.com`
- Objectif: retester le flow weekly en conditions reelles apres correction de l'active owner weekly.
- Trajectoire: fixture weekly dynamique semaine 2026-06-15 -> 2026-06-21, Tour 0 via `process-checkins`, ouverture WhatsApp simulee, puis 8 tours utilisateur via `/functions/v1/test-send-message`.
- Surfaces visees: `process-checkins`, active owner weekly, `weekly_adaptive_review_v1`, direct-effect reminder pendant weekly, gates de synthese/cloture, absence de patch de plan non confirme, DB cleanup.
- Cadre IA reel: Supabase local, hors sandbox, `/functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun fallback deterministe.
- Validite QA: valide. Le weekly demarre par `process-checkins`; les tours utilisateur passent par le chemin IA reel local.

Artefacts:
- Setup: `tmp/weekly-real-conversation-qa/weekly-qa-20260623-r7-real-partial_habits_mission_partial/setup.json`
- Tour 0 DB: `tmp/weekly-real-conversation-qa/weekly-qa-20260623-r7-real-partial_habits_mission_partial/tour0-db.json`
- Transcript brut: `tmp/weekly-real-conversation-qa/weekly-qa-20260623-r7-real-partial_habits_mission_partial/whatsapp-run.json`
- Verification DB post-run: `tmp/weekly-real-conversation-qa/weekly-qa-20260623-r7-real-partial_habits_mission_partial/db-after-run.json`
- Cleanup: `tmp/weekly-real-conversation-qa/weekly-qa-20260623-r7-real-partial_habits_mission_partial/cleanup.json`
- Feuille bugs: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-23-weekly-process-r7-post-owner-fix-bugs.md`

Preuves Tour 0:
- `process_checkins.success=true`, `processed=1`
- `scheduled_checkins.id=629a2603-f64a-4881-83d6-1af5577c34f9`
- `scheduled_checkins.status=sent`
- `event_context=weekly_progress_review_v2`
- `chat_messages.scope=whatsapp`, `metadata.source=scheduled_checkin`
- `user_chat_states.scope=whatsapp`, `__active_skill_state.skill_id=weekly_adaptive_review_v1`, `status=open`

Cleanup:
- Supprime: `scheduled_checkins=1`, `chat_messages=18`, `user_chat_states=2`, `user_plan_item_entries=6`, `user_habit_week_occurrences=6`, `user_habit_week_plans=3`, `user_plan_items=4`, `user_plans_v2=1`, `profiles=1`, `user_cycles=1`.
- Verification finale ciblee: `user_chat_states=0`, `scheduled_checkins=0`, `chat_messages=0`, `user_plan_items=0`, `user_plans_v2=0`, `profiles=0`.
- Auth user delete: `200 OK`.

## 2. Tours De Conversation

### Tour 0 - Process Checkins / Ouverture Weekly

**Verdict du tour:** green

**User**
> Aucun message utilisateur. Declenchement proactif via `process-checkins`.

**Sophia**
> C’est le moment du bilan de la semaine, et je vois qu’il reste quelques points encore ouverts.
> J’aimerais bien savoir comment tu l’as vécue dans l’ensemble.

**Trace courte**
- http_status: 200 sur `process-checkins`
- process_checkins: `success=true`, `processed=1`
- scheduled_checkin_status: `sent`
- active_skill_state: `weekly_adaptive_review_v1`, `status=open`, `scope=whatsapp`
- plan_patch: `requires_confirmation=true`, `operations=[insert_bridge_week]`
- durable_effect: ouverture weekly persistée; aucun patch de plan applique

### Tour 1

**Verdict du tour:** green

**User**
> Je l'ai vécue comme une semaine un peu partagée : au début les repères m'ont vraiment aidé, puis les soirées tardives m'ont fait décrocher. J'aimerais garder ce qui a marché, mais rendre la suite plus légère.

**Sophia**
> Tu sens que cette semaine t’a rapproché de ton objectif global, ou plutôt que ça t’a surtout aidé à tenir le cap sans trop avancer ?

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- active_owner: `weekly_adaptive_review_v1`
- direct_effects: []
- operation: `confirm_weekly_diagnostic`
- pending_confirmation: none
- executed_tools: []
- durable_effect: none

### Tour 2

**Verdict du tour:** green

**User**
> Je dirais que ça m'a un peu rapproché de l'objectif, surtout parce que j'ai compris que les repères du début de semaine marchent. Ce qui bloque, c'est quand je rentre tard et que je dois encore décider quoi faire.

**Sophia**
> Je vois deux freins qui ressortent : les soirées tardives et la charge de décision. Qu’est-ce qui te bloque le plus à ce moment-là : te lancer, l’heure, le contexte, ou le fait de devoir encore choisir quoi faire ?

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- active_owner: `weekly_adaptive_review_v1`
- direct_effects: []
- operation: `confirm_weekly_diagnostic`
- pending_confirmation: none
- executed_tools: []
- durable_effect: none

### Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-EFFECT-02 - Effet attendu absent; BF-ROUTE-02 - Ancien flow capture une nouvelle intention

**User**
> Le plus dur, c'est de devoir encore choisir quoi faire. Si j'ai une option minimale déjà prête, je pense que je tiens mieux. Et avant de continuer, rappelle-moi demain à 18h de relire cette version allégée.

**Sophia**
> Je vois surtout un blocage de décision quand tu rentres tard. Si tu devais garder une seule option minimale déjà prête pour ces soirs-là, ce serait quoi ?

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- active_owner: `weekly_adaptive_review_v1`
- direct_effects: []
- operation: `confirm_weekly_diagnostic`
- pending_confirmation: none
- executed_tools: []
- durable_effect: no reminder; `EffectLedger.requested=0`, `committed=0`

**Analyse si yellow/red**
- Symptome: demande explicite de rappel ponctuel ignoree pendant le weekly.
- Source amont probable: direct-effect lane non branchee/priorisee pendant active owner weekly.
- Owner runtime: TurnAgenda / direct-effect lane / weekly runtime integration.
- Meilleure correction selon les guidelines: extraire le reminder comme effet transverse, l'executer via l'executor normal, confirmer l'effet, puis reprendre le weekly.
- Pourquoi ce n'est pas un patch local: le rappel doit rester un effet transverse auditable, pas une regex dans le visible weekly.

### Tour 4

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-INTAKE-01 - Slot fourni mais redemande

**User**
> L'option minimale serait : dix minutes pour préparer le prochain petit pas, ou juste noter ce que je ferai demain si je suis trop fatigué. Je veux garder les deux repères utiles et rendre les soirs tardifs moins ambitieux.

**Sophia**
> Je vois surtout un blocage de charge de décision le soir tard. Le levier recommandé, c’est une option minimale déjà prête pour éviter d’avoir à choisir. Quand ça coince, c’est plutôt au moment de démarrer, dans le contexte du retour tardif, ou parce que l’option n’est pas assez simple ?

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- active_owner: `weekly_adaptive_review_v1`
- direct_effects: []
- operation: `answer_weekly_question`
- pending_confirmation: none
- executed_tools: []
- durable_effect: none

**Analyse si yellow/red**
- Symptome: Sophia comprend l'option minimale mais redemande une clarification proche.
- Source amont probable: weekly slot filling / gate `solution_fit_status=needs_deeper`.
- Owner runtime: weekly reducer + visible task selection.
- Meilleure correction selon les guidelines: marquer le fit solution comme capture quand le user donne l'option minimale et le principe de semaine allegee.
- Pourquoi ce n'est pas un patch local: le probleme est la transition de gate, pas une phrase.

### Tour 5

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow; BF-INTAKE-01 - Slot fourni mais redemande

**User**
> C'est surtout parce que l'option n'est pas assez simple au moment où je rentre. Si elle est déjà écrite en deux choix maximum, je peux juste appliquer sans réfléchir. Ça me suffit comme décision weekly.

**Sophia**
> Le blocage semble surtout venir de la charge de décision au moment critique du soir, plus que du reste. Qu’est-ce qui te fait décrocher le plus souvent : rentrer tard, être trop fatigué, ou avoir trop d’options ?

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- active_owner: `weekly_adaptive_review_v1`
- direct_effects: []
- operation: `answer_weekly_question`
- pending_confirmation: none
- executed_tools: []
- durable_effect: none

**Analyse si yellow/red**
- Symptome: le user dit que la decision weekly suffit, mais le flow reste sur `explore_action_blocker`.
- Source amont probable: reducer weekly ne respecte pas le signal de decision/sortie utilisateur.
- Owner runtime: weekly reducer.
- Meilleure correction selon les guidelines: user decision + all earlier gates captured doit passer a synthese/confirmation, pas nouvelle clarification.
- Pourquoi ce n'est pas un patch local: c'est un invariant de progression du flow.

### Tour 6

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow; BF-INTAKE-03 - Contrainte explicite perdue

**User**
> C'est avoir trop d'options quand je suis fatigué. Je veux qu'on arrête la clarification ici : fais-moi la synthèse weekly et demande-moi confirmation avant toute modification du plan.

**Sophia**
> Je vois surtout un blocage de calibrage au moment du retour tardif : l’option n’est pas assez simple à appliquer sans réfléchir. Est-ce que le vrai point dur, c’est le démarrage, le moment où tu rentres, ou le fait de devoir encore choisir ?

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- active_owner: `weekly_adaptive_review_v1`
- direct_effects: []
- operation: `recap_weekly`
- pending_confirmation: none
- executed_tools: []
- durable_effect: none

**Analyse si yellow/red**
- Symptome: contrainte explicite "arrête la clarification" ignoree; `turn_count=6`, `max_turns=6`.
- Source amont probable: visible task derivee de l'ancien stage au lieu des gates et du signal user courant.
- Owner runtime: weekly reducer + visible agent context.
- Meilleure correction selon les guidelines: au max turns ou sur demande explicite de synthese, forcer `weekly_synthesis`.
- Pourquoi ce n'est pas un patch local: la trace montre une contradiction de state machine.

### Tour 7

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow

**User**
> Le vrai point dur est de devoir encore choisir. Je confirme la décision : deux options maximum déjà écrites pour le soir tardif. Clôture le weekly maintenant, sans appliquer de changement de plan.

**Sophia**
> Je te fais la synthèse : ton blocage, c’est surtout d’avoir trop d’options quand tu es fatigué, surtout quand tu rentres tard et que tu dois encore décider. L’option minimale en deux choix semble mieux calibrée pour ce moment-là. Tu me confirmes que c’est bien ça que tu veux garder comme synthèse du weekly ?

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- active_owner: `weekly_adaptive_review_v1`
- direct_effects: []
- operation: `recap_weekly`
- pending_confirmation: asks visible confirmation
- executed_tools: []
- durable_effect: none

**Analyse si yellow/red**
- Symptome: la synthese arrive tard, apres depassement du budget, et `visible_task` reste `explore_action_blocker`.
- Source amont probable: stage/visible task non synchronises avec la synthese.
- Owner runtime: weekly reducer.
- Meilleure correction selon les guidelines: passer officiellement a synthesis/closure quand le visible fait une synthese.
- Pourquoi ce n'est pas un patch local: c'est une coherence state/visible.

### Tour 8

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow

**User**
> Oui, je confirme que c'est la synthèse à garder. Tu peux clôturer le weekly maintenant, sans appliquer de changement de plan.

**Sophia**
> Je retiens le blocage principal : devoir encore choisir quand tu es fatigué. Le plus utile maintenant, c’est d’identifier à quel moment ça coince le plus : au démarrage, au moment critique, ou parce que c’est trop lourd ?

**Trace courte**
- http_status: 200
- response_owner: `weekly_adaptive_review_v1`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `active_weekly_adaptive_review`
- active_owner: `weekly_adaptive_review_v1`
- direct_effects: []
- operation: `complete_weekly_no_change`
- pending_confirmation: `weekly_adaptive_review.pending_confirmation={kind: plan_patch, status: pending}`
- executed_tools: []
- durable_effect: no plan patch applied; no reminder created

**Analyse si yellow/red**
- Symptome: `closure_status=complete`, `synthesis_status=complete`, mais la reponse visible repart en clarification; state final `status=open`, `stage=action_blocker`, `turn_count=8`, `max_turns=6`.
- Source amont probable: mismatch reducer/visible task/state persistence.
- Owner runtime: weekly reducer + visible runtime.
- Meilleure correction selon les guidelines: quand closure complete, rendre une cloture visible et sortir/fermer le flow; ne pas relancer une question de diagnostic.
- Pourquoi ce n'est pas un patch local: contradiction structurelle entre gates et message visible.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Le lancement proactive est naturel.
- Les deux premiers tours suivent bien le weekly: experience de semaine puis progression globale.
- Le fix d'ownership weekly est valide: les traces affichent `response_owner=weekly_adaptive_review_v1`.

**Problemes**
- Tour 3: la demande de rappel ponctuel est ignoree. Famille: BF-EFFECT-02 / BF-ROUTE-02. Impact: commande concrete perdue. Severite: red.
- Tours 4-6: boucle de clarification autour du meme blocker malgre solution et demande explicite de synthese. Famille: BF-STATE-01 / BF-INTAKE-01. Impact: experience frustrante. Severite: red.
- Tour 8: apres confirmation de cloture, Sophia repose une question de diagnostic. Famille: BF-STATE-01. Impact: flow incoherent et non cloture visible. Severite: red.

**Fix propose**
- Source amont: direct-effect lane weekly + reducer/visible task weekly.
- Correction recommandee: brancher les direct-effects pendant active weekly; faire avancer les gates vers synthese sur solution fit capturee ou demande user; fermer/sortir quand `closure_status=complete`.
- Tests d'invariant attendus: rappel pendant weekly; solution fit explicite; demande de synthese; confirmation de cloture; aucun patch sans confirmation.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Corrige: `response_owner=weekly_adaptive_review_v1`, `route_response_owner=weekly_adaptive_review_v1`, `active_owner=weekly_adaptive_review_v1`, `selected_owner=weekly_adaptive_review_v1` sur tous les tours utilisateur.
- `route_reason=active_weekly_adaptive_review` et `selected_handler=weekly_adaptive_review_v1` sont coherents.

**Skills / Operations / Tools**
- Weekly est bien owner du tour.
- Operations observees: `confirm_weekly_diagnostic`, `answer_weekly_question`, `recap_weekly`, `complete_weekly_no_change`.
- La direct-effect lane ne voit pas le rappel explicite: `direct_effects=[]`, `EffectLedger.requested=0`.

**Memory / Effets durables**
- `plan_patch.requires_confirmation=true` reste present.
- Aucun patch de plan applique sans confirmation; `user_plan_items` restent `active`.
- Aucun reminder cree pour "demain a 18h"; `scheduled_checkins` ne contient que l'ouverture weekly.
- Etat final pre-cleanup: `status=open`, `stage=action_blocker`, `turn_count=8`, `max_turns=6`, `closure_status=complete`, `validation_unlock=locked_until_weekly_complete`.
- Cleanup cible R7 termine sans erreur; verification finale ciblee a 0.

**Problemes**
- Tour 3: direct-effect absent. Famille: BF-EFFECT-02 / BF-ROUTE-02. Impact systeme: une intention transverse explicite est avalee par le weekly. Severite: red.
- Tours 5-8: state machine weekly incoherente. Famille: BF-STATE-01. Impact systeme: max_turns depasse, closure complete mais flow open et visible diagnostic. Severite: red.

**Fix propose**
- Source amont: TurnAgenda/direct-effect integration + weekly reducer/visible runtime.
- Correction recommandee: faire passer les direct-effects explicites avant la reponse weekly, puis synchroniser `stage`, `visible_task`, `closure_status`, `status` et `validation_unlock`.
- Tests d'invariant attendus: active weekly + reminder explicite; closure complete -> flow closed/exited; max_turns -> pas de nouvelle clarification.

## Verdict Global

**RED.** Le fix d'active owner weekly fonctionne en conditions reelles. Le run reste rouge parce que le rappel direct-effect est ignore et la cloture weekly reste incoherente apres confirmation.
