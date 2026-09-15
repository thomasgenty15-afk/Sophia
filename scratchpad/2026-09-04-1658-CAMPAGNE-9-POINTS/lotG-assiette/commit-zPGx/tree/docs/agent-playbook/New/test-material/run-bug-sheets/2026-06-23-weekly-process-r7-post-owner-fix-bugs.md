# Run Bug Sheet - Weekly Process R7 Post Owner Fix

Run: `weekly-qa-20260623-r7-real-partial_habits_mission_partial`  
Report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-23-weekly-process-r7-post-owner-fix.md`  
Date: 2026-06-23

## R7-B01

- Bug id: `R7-B01`
- Tours: 3
- Famille: `BF-EFFECT-02` - Effet attendu absent; `BF-ROUTE-02` - Ancien flow capture une nouvelle intention
- Domaine owner: TurnAgenda / direct-effect lane / weekly runtime integration
- Source amont: reminder explicite non extrait/executed pendant active weekly owner.
- Symptome visible: Sophia ignore "rappelle-moi demain a 18h" et continue le weekly.
- Preuve systeme: `direct_effects=[]`, `EffectLedger.requested=0`, `committed=0`, `scheduled_checkins` ne contient que l'ouverture weekly.
- Correction attendue: direct-effect reminder transverse pendant weekly, confirmation visible unique, puis reprise du weekly.
- Statut: `fixed_pending_qa`
- Fix reference: `supabase/functions/sophia-brain/skills/weekly_review/local_flow.ts`, `supabase/functions/sophia-brain/router/operation_runtime_pipeline.ts`
- Tests requis: rappel explicite pendant weekly; paraphrase "demain soir"; anti-faux-positif sans demande de rappel; verification DB scheduled_checkins + EffectLedger.

## R7-B02

- Bug id: `R7-B02`
- Tours: 4-6
- Famille: `BF-STATE-01` - Mauvaise transition de flow; `BF-INTAKE-01` - Slot fourni mais redemande
- Domaine owner: `weekly_adaptive_review_v1` reducer / slot filling / visible task selection
- Source amont: `solution_fit_status` reste `needs_deeper` malgre option minimale explicite et decision weekly.
- Symptome visible: Sophia redemande le meme blocker malgre la solution et la demande de synthese.
- Preuve systeme: `visible_task=explore_action_blocker`, `stage=action_blocker`, `turn_count=6`, `max_turns=6`.
- Correction attendue: solution fit explicite ou demande user de synthese doit avancer vers `weekly_synthesis`; au `max_turns`, ne plus poser de clarification.
- Statut: `open`
- Fix reference: none
- Tests requis: solution fit explicite -> synthesis; demande "arrete la clarification" -> synthesis; anti-faux-positif vraie ambiguite -> clarification autorisee.

## R7-B03

- Bug id: `R7-B03`
- Tours: 8
- Famille: `BF-STATE-01` - Mauvaise transition de flow
- Domaine owner: `weekly_adaptive_review_v1` reducer / visible runtime / state persistence
- Source amont: contradiction entre gates completes et visible task diagnostic.
- Symptome visible: apres confirmation de cloture, Sophia repose une question de diagnostic.
- Preuve systeme: `closure_status=complete`, `synthesis_status=complete`, mais `status=open`, `stage=action_blocker`, `visible_task=explore_action_blocker`, `turn_count=8`, `max_turns=6`.
- Correction attendue: closure complete doit rendre une cloture visible, fermer/sortir le flow et debloquer `validation_unlock`.
- Statut: `open`
- Fix reference: none
- Tests requis: confirmation de cloture -> message de cloture; active state ferme; `validation_unlock` debloque; aucun patch direct de plan sans confirmation.
