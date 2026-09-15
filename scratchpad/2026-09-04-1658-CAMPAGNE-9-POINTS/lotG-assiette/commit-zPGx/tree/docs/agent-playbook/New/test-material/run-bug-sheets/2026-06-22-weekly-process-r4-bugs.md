# Run Bug Sheet - Weekly Process R4

Run: `weekly-qa-20260622-r4-partial_habits_mission_partial`  
Report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-22-weekly-process-r4.md`  
Date: 2026-06-22

## R4-B01

- Bug id: `R4-B01`
- Tours: 1-7
- Famille: `BF-TEST-01` - Trace/test incoherent ou suite malsaine
- Domaine owner: router / active flow arbitration observability
- Source amont: mapping `route_decision.response_owner` et `active_flow_arbitration` apres selection effective d'un active skill local.
- Symptome visible: les reponses sont produites par `weekly_adaptive_review_v1`, mais la trace indique `response_owner=normal_reply`, `route_reason=normal_reply_default`, `active_owner=none`.
- Preuve systeme: chaque tour a `tool_skill_run.selected_handler=weekly_adaptive_review_v1`; les metadata assistant ont `route_owner=weekly_adaptive_review_v1`; la trace haute reste `normal_reply`.
- Correction attendue: quand le local flow weekly est selectionne depuis active state, propager l'owner effectif dans `response_owner`, `route_decision`, `active_flow_arbitration` et metadata.
- Statut: `open`
- Fix reference: none
- Tests requis: process-checkins weekly -> premier reply user -> `selected_handler=weekly_adaptive_review_v1` et `response_owner=weekly_adaptive_review_v1`; sortie explicite product/status -> owner global coherent; conversation normale hors weekly -> `normal_reply`.

## R4-B02

- Bug id: `R4-B02`
- Tours: 4
- Famille: `BF-EFFECT-02` - Effet attendu absent; `BF-ROUTE-02` - Ancien flow capture une nouvelle intention
- Domaine owner: TurnAgenda / direct-effect lane / weekly runtime integration
- Source amont: l'intention "rappelle-moi demain a 18h" n'est pas extraite/executed comme direct-effect transverse pendant weekly.
- Symptome visible: Sophia ignore le rappel et continue la clarification weekly.
- Preuve systeme: `turn_frame.direct_effects=[]`, `EffectLedger.requested=0`, `committed=0`, `scheduled_checkins` ne contient que l'ouverture weekly, `whatsapp_pending_actions=0`.
- Correction attendue: les reminders ponctuels explicites pendant weekly doivent passer par la direct-effect lane, creer l'effet durable, injecter une confirmation unique, puis reprendre le weekly.
- Statut: `open`
- Fix reference: none
- Tests requis: rappel explicite pendant weekly; paraphrase "demain soir"; anti-faux-positif "il faudrait que je pense a..." sans demande de rappel; verification DB scheduled checkin + EffectLedger.

## R4-B03

- Bug id: `R4-B03`
- Tours: 5-7
- Famille: `BF-STATE-01` - Mauvaise transition de flow; `BF-INTAKE-01` - Slot fourni mais redemande
- Domaine owner: `weekly_adaptive_review_v1` reducer / slot filling / visible task selection
- Source amont: le reducer capture les gates mais la visible task reste sur `explore_action_blocker` ou `clarify_human_signal`.
- Symptome visible: Sophia redemande trois fois le blocage du soir alors que le user a deja donne le slot et demande une synthese.
- Preuve systeme: au tour 7, `synthesis_status=captured`, `closure_status=missing`, `stage=action_blocker`, `turn_count=7`, `max_turns=6`; reponse visible redemande une clarification.
- Correction attendue: si `solution_fit_status=captured` et que le user donne une decision/synthese, passer a `weekly_synthesis` ou `weekly_closure`; au `max_turns`, ne plus poser de nouvelle question de diagnostic.
- Statut: `open`
- Fix reference: none
- Tests requis: user donne solution fit explicite -> synthese; user demande "synthese + confirmation avant modification" -> confirmation visible; anti-faux-positif user donne une vraie ambiguite -> clarification autorisee.

## R4-B04

- Bug id: `R4-B04`
- Tours: 7
- Famille: `BF-PROACTIVE-01` - Daily/weekly preuve -> decision cassee
- Domaine owner: weekly proactive flow / confirmation gate
- Source amont: mismatch entre `pending_confirmation.kind=plan_patch` en memoire et absence de demande de confirmation visible.
- Symptome visible: le user demande confirmation avant modification; Sophia ne presente pas le patch ni une question de confirmation, et laisse `validation_unlock` bloque.
- Preuve systeme: `plan_patch.requires_confirmation=true`, `pending_confirmation.status=pending`, `validation_unlock.status=locked_until_weekly_complete`, mais reponse visible = nouvelle question de clarification.
- Correction attendue: rendre la demande de confirmation visible obligatoire quand un plan patch pending existe et que le user demande explicitement de valider/synthetiser.
- Statut: `open`
- Fix reference: none
- Tests requis: pending plan patch + user demande confirmation -> render confirmation; refus -> pas d'effet durable; oui explicite -> handoff/confirmation selon contrat, pas de patch direct par weekly.
