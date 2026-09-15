# QA Run Report - Weekly Process R4

## 1. Contexte Du Test

- Date: 2026-06-22
- Run: `weekly-qa-20260622-r4-partial_habits_mission_partial`
- Persona: connexion temporaire locale `qa-weekly-deep-weekly-qa-20260622-r4-partial_habits_mission_partial@example.com`
- Objectif: tester le flow weekly en conditions IA reelle locale, en partant de `process-checkins`.
- Trajectoire: fixture weekly dynamique semaine 2026-06-15 -> 2026-06-21, Tour 0 par `process-checkins` reel, ouverture WhatsApp simulee, puis 7 tours utilisateur via `/functions/v1/test-send-message`.
- Surfaces visees: proactive weekly opening, `weekly_adaptive_review_v1`, active flow state WhatsApp, direct-effect reminder pendant flow local, confirmation plan patch, EffectLedger, DB.
- Cadre IA reel: Supabase local, hors sandbox, `force_full_ai=true`, `disable_debounce=true`, aucun renderer deterministe, aucun fallback direct `processMessage`.
- Validite QA: valide. Le run demarre par `process-checkins`; le weekly n'est pas recupere a froid par le global dispatcher. Le scheduled checkin weekly est `sent` avant le premier tour utilisateur.

Artefacts:
- Setup: `tmp/weekly-real-conversation-qa/weekly-qa-20260622-r4-partial_habits_mission_partial/setup.json`
- Transcript brut: `tmp/weekly-real-conversation-qa/weekly-qa-20260622-r4-partial_habits_mission_partial/whatsapp-run.json`
- Verification DB: `tmp/weekly-real-conversation-qa/weekly-qa-20260622-r4-partial_habits_mission_partial/db-after-run.json`
- Cleanup: `tmp/weekly-real-conversation-qa/weekly-qa-20260622-r4-partial_habits_mission_partial/cleanup.json`
- Feuille bugs: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-22-weekly-process-r4-bugs.md`

Preuves de demarrage par `process-checkins`:
- `process_checkins.success=true`, `processed=1`
- `scheduled_checkins.id=35311354-6bc0-4ff0-831c-ca491d6a2203`
- `scheduled_checkins.status=sent`
- `event_context=weekly_progress_review_v2`
- `chat_messages.scope=whatsapp`, `source=scheduled_checkin`
- opening visible:
> C’est le moment de faire le point sur ta semaine.
> J’ai l’impression qu’il y a eu de beaux élans, avec aussi quelques moments plus lourds.
> Comment tu l’as vécue dans l’ensemble ?

Preuves setup weekly:
- `daily_evidence_summary.source=daily_action_review_v1`
- `week_strategy.decision=bridge_week`
- `plan_patch.requires_confirmation=true`
- `plan_patch.operations=[insert_bridge_week]`
- `user_chat_states.scope=whatsapp`
- `__active_skill_state.skill_id=weekly_adaptive_review_v1`, `status=open`

Cleanup:
- Supprime: `scheduled_checkins=1`, `chat_messages=16`, `user_chat_states=2`, `user_plan_item_entries=6`, `user_habit_week_occurrences=6`, `user_habit_week_plans=3`, `user_plan_items=4`, `user_plans_v2=1`, `profiles=1`, `user_cycles=1`.
- Verification finale ciblee: `scheduled_checkins=0`, `chat_messages=0`, `user_plan_items=0`, `user_plans_v2=0`, `profiles=0`, `user_chat_states=[]`.
- Auth user delete: `200 OK`.

## 2. Tours De Conversation

### Tour 0 - Process Checkins / Ouverture Weekly

**Verdict du tour:** green

**User**
> Aucun message utilisateur. Declenchement proactif via `process-checkins`.

**Sophia**
> C’est le moment de faire le point sur ta semaine.
> J’ai l’impression qu’il y a eu de beaux élans, avec aussi quelques moments plus lourds.
> Comment tu l’as vécue dans l’ensemble ?

**Trace courte**
- http_status: 200 sur `process-checkins`
- process_checkins: `success=true`, `processed=1`
- scheduled_checkin_id: `35311354-6bc0-4ff0-831c-ca491d6a2203`
- scheduled_checkin_status: `sent`
- event_context: `weekly_progress_review_v2`
- delivery: WhatsApp simule, `chat_messages.scope=whatsapp`, `source=scheduled_checkin`
- active_skill_state: `skill_id=weekly_adaptive_review_v1`, `status=open`
- weekly_payload: `daily_evidence_summary.source=daily_action_review_v1`, `week_strategy.decision=bridge_week`
- plan_patch: `requires_confirmation=true`, `operations=[insert_bridge_week]`
- durable_effect: ouverture weekly persistée; aucun patch de plan applique

**Note de validite**
- Ce tour est obligatoire pour que le test weekly ait une valeur QA: le flow weekly est amorce par `process-checkins`, pas par une detection spontanee du global dispatcher.
- Les tours suivants testent la reprise conversationnelle apres cette ouverture proactive.

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-TEST-01 - Trace/test incoherent ou suite malsaine

**User**
> Je l'ai vécue comme une semaine assez inégale : j'ai eu deux bons débuts, puis la fatigue du soir a pris le dessus. J'aimerais garder ce qui a marché, mais rendre la prochaine semaine plus légère.

**Sophia**
> Sur cette semaine un peu inégale, avec la fatigue du soir qui a pesé, tu sens quelle avancée par rapport à ton objectif global ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `normal_reply_default`
- safety: none
- direct_effects: []
- operation: `confirm_weekly_diagnostic`
- pending_confirmation: none
- memory_plan: none
- executed_tools: []
- durable_effect: none

**Analyse si yellow/red**
- Symptome: le handler weekly repond bien, mais la trace de routing expose encore `response_owner=normal_reply` et `active_owner=none`.
- Source amont probable: observability / mapping route decision apres reprise par active skill.
- Owner runtime: router / active flow arbitration trace.
- Meilleure correction selon les guidelines: aligner `response_owner`, `active_flow_arbitration.selected_owner` et metadata assistant sur le handler reel quand `weekly_adaptive_review_v1` est selectionne.
- Pourquoi ce n'est pas un patch local: le probleme n'est pas une phrase visible; c'est un contrat de trace et d'ownership qui rend les runs QA ambigus.

### Tour 2

**Verdict du tour:** green

**User**
> Par rapport à l'objectif global, je dirais que c'est un petit progrès : j'ai vu que les repères du début de semaine m'aident vraiment, mais dès que la journée finit tard je décroche vite.

**Sophia**
> Je vois surtout un levier utile : alléger la fin de journée pour garder l’élan du début. Tu veux que je parte sur un ajustement du rythme du soir, ou sur des repères plus simples à tenir quand la fatigue monte ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `normal_reply_default`
- safety: none
- direct_effects: []
- operation: `confirm_weekly_diagnostic`
- pending_confirmation: none
- memory_plan: none
- executed_tools: []
- durable_effect: none

### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow

**User**
> Plutôt des repères plus simples quand la fatigue monte. Je veux éviter une grande réorganisation : garder les deux habitudes utiles, réduire l'exigence le soir, et laisser la mission du signal de pause comme petit pas à terminer.

**Sophia**
> Je vois surtout un levier simple : garder les repères du début de semaine et alléger ce qui arrive le soir. Si tu veux, on peut préciser ce qui te fatigue le plus en fin de journée.

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `normal_reply_default`
- safety: none
- direct_effects: []
- operation: `confirm_weekly_diagnostic`
- pending_confirmation: none
- memory_plan: none
- executed_tools: []
- durable_effect: none

**Analyse si yellow/red**
- Symptome: le user donne deja le fit de solution et la contrainte "pas de grande reorganisation"; Sophia reste optionnelle et ne converge pas vers synthese ou confirmation.
- Source amont probable: reducer weekly / gate transition entre `solution_fit` et synthese.
- Owner runtime: `weekly_adaptive_review_v1` reducer + visible task selection.
- Meilleure correction selon les guidelines: rendre explicite l'invariant "solution_fit captured + user demande principe leger => passer a `weekly_synthesis` ou confirmation", sans detection lexicale locale.
- Pourquoi ce n'est pas un patch local: la correction doit porter sur les gates weekly et leur transition, pas sur cette formulation exacte.

### Tour 4

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-EFFECT-02 - Effet attendu absent; BF-ROUTE-02 - Ancien flow capture une nouvelle intention

**User**
> Avant de continuer, rappelle-moi demain à 18h de relire cette version allégée. Et après ça, on continue : ce qui me fatigue le plus le soir, c'est de devoir encore réfléchir à quoi faire.

**Sophia**
> Je vois surtout un blocage du soir lié à la fatigue et au moment où tu rentres tard. C’est plutôt le démarrage, le contexte, ou le fait que l’action te paraît trop lourde à ce moment-là ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `normal_reply_default`
- safety: none
- direct_effects: []
- operation: `clarify_human_signal`
- pending_confirmation: none
- memory_plan: none
- executed_tools: []
- durable_effect: no reminder; `scheduled_checkins` reste limite au weekly opening; `whatsapp_pending_actions=0`

**Analyse si yellow/red**
- Symptome: demande explicite de rappel ponctuel pendant weekly ignoree; aucun direct-effect, aucun commit DB, aucune confirmation.
- Source amont probable: agenda/direct-effect lane non propagee quand le local dispatcher weekly est actif depuis `process-checkins`.
- Owner runtime: TurnAgenda + direct-effect lane + weekly runtime integration.
- Meilleure correction selon les guidelines: representer l'intention reminder comme direct-effect transverse, l'executer via l'executor normal, injecter `direct_effect_confirmation_context` dans la reponse visible, puis reprendre le weekly.
- Pourquoi ce n'est pas un patch local: ajouter un check dans le prompt weekly ou une regex "rappelle-moi" casserait l'ownership; le rappel doit rester un effet transverse auditable par EffectLedger.

### Tour 5

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-INTAKE-01 - Slot fourni mais redemande

**User**
> C'est surtout le fait de devoir décider encore quoi faire. Si les options sont déjà prêtes, en deux choix simples, je pense que je peux tenir sans me mettre trop de pression.

**Sophia**
> Je vois mieux le frein du soir : ce n’est pas seulement la fatigue, c’est aussi le fait de devoir encore choisir quoi faire. Quand ça arrive, qu’est-ce qui t’aide le plus à repartir plus facilement ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `normal_reply_default`
- safety: none
- direct_effects: []
- operation: `clarify_human_signal`
- pending_confirmation: none
- memory_plan: none
- executed_tools: []
- durable_effect: none

**Analyse si yellow/red**
- Symptome: Sophia capte le frein mais ne reutilise pas assez le slot deja donne "options deja pretes, deux choix simples".
- Source amont probable: weekly slot filling / visible task `clarify_human_signal`.
- Owner runtime: weekly intake + reducer.
- Meilleure correction selon les guidelines: faire reconnaitre dans la sortie structuree weekly que le slot "solution aidante" est rempli, puis avancer vers synthese.
- Pourquoi ce n'est pas un patch local: le probleme est la representation du slot, pas la formulation visible.

### Tour 6

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow; BF-INTAKE-01 - Slot fourni mais redemande

**User**
> Ce qui m'aide le plus, c'est d'avoir une option par défaut : par exemple dix minutes de préparation simple, ou juste noter le prochain pas si je suis trop fatigué. Je veux valider ce principe, pas refaire tout le plan maintenant.

**Sophia**
> Je vois un levier recommandé : simplifier la décision du soir. Est-ce que ça bloque surtout au démarrage, quand tu rentres tard, ou parce que les options ne sont pas assez claires ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `normal_reply_default`
- safety: none
- direct_effects: []
- operation: `confirm_weekly_diagnostic`
- pending_confirmation: none
- memory_plan: none
- executed_tools: []
- durable_effect: none

**Analyse si yellow/red**
- Symptome: apres une demande explicite de validation de principe, le flow revient au diagnostic.
- Source amont probable: reducer weekly bloque en `action_blocker`; `turn_count=6`, `max_turns=6`, `closure_status=missing`.
- Owner runtime: weekly reducer + max-turn/closure policy.
- Meilleure correction selon les guidelines: ajouter un invariant de progression: au `max_turns`, ou quand tous les gates sauf closure sont remplis, produire synthese + confirmation plutot qu'une nouvelle clarification.
- Pourquoi ce n'est pas un patch local: il faut fixer la politique de transition du flow weekly, pas optimiser une phrase.

### Tour 7

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-STATE-01 - Mauvaise transition de flow; BF-PROACTIVE-01 - Daily/weekly preuve -> decision cassee

**User**
> C'est parce que les options ne sont pas assez claires. Donc ma décision weekly est : garder les repères du début de semaine, et préparer une option du soir ultra simple. Tu peux me faire la synthèse et me demander confirmation avant toute modification ?

**Sophia**
> Ce qui ressort le plus, c’est le blocage de décision le soir : quand la journée finit tard, tu décroches surtout parce qu’il faut encore choisir quoi faire. Est-ce que c’est plutôt le moment tardif, le trop de choix, ou le fait de devoir encore réfléchir ?

**Trace courte**
- http_status: 200
- response_owner: `normal_reply`
- selected_handler: `weekly_adaptive_review_v1`
- route_reason: `normal_reply_default`
- safety: none
- direct_effects: []
- operation: `recap_weekly`
- pending_confirmation: `weekly_adaptive_review.pending_confirmation={kind: plan_patch, status: pending}`
- memory_plan: none
- executed_tools: []
- durable_effect: no plan patch applied; `plan_patch.requires_confirmation=true`; `plan_items` restent actifs/inchanges

**Analyse si yellow/red**
- Symptome: operation interne `recap_weekly` et `synthesis_status=captured`, mais reponse visible redemande une clarification deja donnee; `turn_count=7` depasse `max_turns=6`, `closure_status=missing`.
- Source amont probable: mismatch reducer/visible task: state synthese capturee, visible task reste `explore_action_blocker`.
- Owner runtime: weekly reducer + visible runtime prompt/context pack.
- Meilleure correction selon les guidelines: faire deriver la visible task du gate canonique apres reducer, puis obliger une sortie synthese/confirmation quand synthesis est captured et closure missing.
- Pourquoi ce n'est pas un patch local: la trace montre une contradiction structurelle entre l'etat weekly et la reponse visible.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- L'ouverture weekly issue de `process-checkins` est naturelle et contextualisee.
- Les deux premiers tours suivent bien le bilan hebdo: experience de semaine, progression globale, levier de semaine allegee.
- Sophia ne refait pas tout le bilan action par action; elle s'appuie sur les causes deja connues.

**Problemes**
- Tour 4: la demande de rappel ponctuel est ignoree. Famille: BF-EFFECT-02 / BF-ROUTE-02. Impact: l'utilisateur perd une commande concrete claire pendant le flow. Severite: red.
- Tours 5-7: Sophia boucle sur le blocage du soir malgre des reponses explicites et une demande de synthese/confirmation. Famille: BF-STATE-01 / BF-INTAKE-01. Impact: conversation frustrante, impossibilite de terminer le weekly. Severite: red.
- Tour 7: le user demande explicitement "synthese et confirmation avant modification"; Sophia redemande encore une clarification. Famille: BF-PROACTIVE-01. Impact: le weekly ne respecte pas son contrat de progression. Severite: red.

**Fix propose**
- Source amont: weekly reducer + visible task selection + direct-effect lane transverse.
- Correction recommandee: representer les slots weekly captures comme gates canoniques; quand `solution_fit` et `synthesis` sont captured ou quand `turn_count >= max_turns`, forcer synthese/confirmation/closure au lieu d'une clarification. Brancher en parallele les direct-effects explicites pendant weekly.
- Tests d'invariant attendus: rappel ponctuel pendant weekly committe un reminder et reprend le flow; user donne solution fit explicite -> synthese; user demande confirmation avant modification -> pas de patch DB sans confirmation, mais une vraie demande de confirmation visible.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Le run part correctement de `process-checkins`: scheduled checkin weekly `sent`, message WhatsApp simule, active state `weekly_adaptive_review_v1` ouvert.
- Le handler reel selectionne dans tous les tours est `weekly_adaptive_review_v1`.
- Warning systeme: la trace haute expose encore `response_owner=normal_reply`, `route_reason=normal_reply_default`, `active_owner=none`. Les metadata assistant disent pourtant `route_owner=weekly_adaptive_review_v1`. C'est incoherent pour l'audit.

**Skills / Operations / Tools**
- Weekly produit des operations locales (`confirm_weekly_diagnostic`, `clarify_human_signal`, `recap_weekly`) mais la visible task reste bloquee sur la clarification.
- Aucun executor engageant de plan n'est appele directement depuis le skill conversationnel.
- Le direct-effect reminder attendu au tour 4 n'est pas admis dans la lane d'effet.

**Memory / Effets durables**
- `plan_patch.requires_confirmation=true` est bien present.
- `weekly_adaptive_review.pending_confirmation={kind: plan_patch, status: pending}` reste en memoire weekly.
- Aucun patch de plan n'est applique sans confirmation: `user_plan_items` restent actifs et inchanges; pas de nouveau plan/entry durable hors fixture.
- Aucun rappel ponctuel n'est cree pour "demain a 18h"; `scheduled_checkins` ne contient que l'ouverture weekly et `whatsapp_pending_actions=0`.
- Cleanup cible R4 termine sans erreur; suppression Auth OK.

**Problemes**
- Tour 4: effet reminder absent. Famille: BF-EFFECT-02 / BF-ROUTE-02. Impact systeme: une intention transverse explicite est avalee par le flow weekly. Severite: red.
- Tours 6-7: flow weekly depasse `max_turns=6` sans closure. Famille: BF-STATE-01. Impact systeme: state machine bloquee; validation unlock reste `locked_until_weekly_complete`. Severite: red.
- Tous les tours: trace route incoherente. Famille: BF-TEST-01. Impact systeme: le QA ne peut pas se fier a `response_owner` seul pour prouver l'owner. Severite: yellow.

**Fix propose**
- Source amont: `weekly_adaptive_review_v1` reducer/visible runtime + TurnAgenda/direct-effect integration + route trace mapping.
- Correction recommandee: 1) faire passer les direct-effects explicites avant la reponse weekly et injecter leur confirmation visible; 2) synchroniser reducer gates et visible task; 3) imposer une transition de cloture/synthese au depassement de budget; 4) aligner la trace d'owner sur le handler effectif.
- Tests d'invariant attendus: process-checkins weekly -> `response_owner` coherent; reminder pendant weekly -> EffectLedger committed + scheduled checkin reminder + continuation weekly; weekly avec slots remplis -> synthese + confirmation; anti-faux-positif demande vague "on verra demain" -> pas de reminder.

## Verdict Global

**RED.** Le run est valide et demarre bien par `process-checkins`. Le weekly est correctement ouvert et le plan patch reste bloque derriere confirmation, mais le flow n'est pas conforme en production conversationnelle: reminder direct-effect ignore, boucle de clarification, depassement de `max_turns`, closure manquante et trace owner incoherente.
