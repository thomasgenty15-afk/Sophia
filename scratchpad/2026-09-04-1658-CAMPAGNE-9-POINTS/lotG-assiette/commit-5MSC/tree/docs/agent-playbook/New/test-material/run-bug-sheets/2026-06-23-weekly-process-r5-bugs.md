# Run Bug Sheet - Weekly Process R5

Run: `weekly-qa-20260623-r5-partial_habits_mission_partial`  
Report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-23-weekly-process-r5.md`  
Date: 2026-06-23

## R5-B01

- Bug id: `R5-B01`
- Tours: 1-7
- Famille: `BF-TEST-01` - Trace/test incoherent ou suite malsaine
- Domaine owner: router / active flow arbitration observability
- Source amont: mapping `response_owner` et `active_flow_arbitration` apres selection effective du weekly active skill.
- Symptome visible: le handler reel est `weekly_adaptive_review_v1`, mais la trace indique `response_owner=normal_reply`, `route_reason=normal_reply_default`, `active_owner=none`.
- Preuve systeme: `tool_skill_run.selected_handler=weekly_adaptive_review_v1` sur tous les tours; `user_chat_states.scope=whatsapp.__active_skill_state.skill_id=weekly_adaptive_review_v1`.
- Correction attendue: propager l'owner effectif weekly dans la trace route et les metadata.
- Statut: `fixed_pending_qa`
- Fix reference: `supabase/functions/sophia-brain/contracts/route_decision.v1.ts`, `supabase/functions/sophia-brain/routers/routers.ts`, `supabase/functions/sophia-brain/router/run.ts`, `supabase/functions/sophia-brain/router/run_test.ts`
- Tests requis: Tour 0 process-checkins -> Tour 1 user naturel -> `response_owner=weekly_adaptive_review_v1`; sortie explicite global dispatcher -> owner global; conversation normale hors weekly -> `normal_reply`.

## R5-B02

- Bug id: `R5-B02`
- Tours: 3
- Famille: `BF-EFFECT-02` - Effet attendu absent; `BF-ROUTE-02` - Ancien flow capture une nouvelle intention
- Domaine owner: TurnAgenda / direct-effect lane / weekly runtime integration
- Source amont: reminder explicite non extrait comme direct-effect pendant active weekly.
- Symptome visible: Sophia ignore "rappelle-moi demain a 18h" et continue le weekly.
- Preuve systeme: `turn_frame.direct_effects=[]`, `EffectLedger.requested=0`, `committed=0`, `scheduled_checkins` ne contient que l'ouverture weekly, `whatsapp_pending_actions=0`.
- Correction attendue: direct-effect reminder transverse pendant weekly, confirmation visible unique, puis reprise du flow weekly.
- Statut: `open`
- Fix reference: none
- Tests requis: rappel explicite pendant weekly; paraphrase "demain soir"; anti-faux-positif "je devrais me rappeler"; verification DB et EffectLedger.

## R5-B03

- Bug id: `R5-B03`
- Tours: 4-5
- Famille: `BF-PROACTIVE-01` - Daily/weekly preuve -> decision cassee; `BF-INTAKE-03` - Contrainte explicite perdue
- Domaine owner: `weekly_adaptive_review_v1` evidence reducer / visible task selection
- Source amont: daily evidence complete non utilisee comme source suffisante; correction utilisateur non priorisee.
- Symptome visible: Sophia force un bilan action par action, puis insiste apres "je ne veux pas refaire action par action".
- Preuve systeme: setup contient `daily_evidence_summary.source=daily_action_review_v1`, `coverage=complete`, item decisions; trace reste `visible_task=review_action_gaps`, `action_review_status=needs_deeper`.
- Correction attendue: daily evidence complete doit eviter `review_action_gaps`, sauf correction explicite de l'utilisateur sur un item.
- Statut: `open`
- Fix reference: none
- Tests requis: daily evidence complete -> pas de review action-by-action; user refuse action-by-action -> synthese; anti-faux-positif daily evidence missing -> question autorisee.

## R5-B04

- Bug id: `R5-B04`
- Tours: 7
- Famille: `BF-STATE-01` - Mauvaise transition de flow
- Domaine owner: `weekly_adaptive_review_v1` reducer / visible runtime
- Source amont: contradiction entre gates de cloture et visible task.
- Symptome visible: apres confirmation de cloture, Sophia repart en question de diagnostic.
- Preuve systeme: `closure_status=complete`, `synthesis_status=complete`, mais `stage=action_review`, `visible_task=review_action_gaps`, `status=open`, `turn_count=7`, `max_turns=6`.
- Correction attendue: quand closure est complete, rendre une cloture visible et exit/resume policy propre; ne plus poser de question de diagnostic.
- Statut: `open`
- Fix reference: none
- Tests requis: confirmation de cloture -> message de cloture; max turns atteint -> pas de nouvelle clarification; pending plan patch -> confirmation/handoff explicite ou no-change coherent.
