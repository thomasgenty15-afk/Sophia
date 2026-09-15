# Bug Sheet - 2026-06-09-safety-crisis-local-doctrine-r1

## R1-B01

- Bug id: `R1-B01`
- Tours: 1
- Famille: `BF-TEST-01`
- Domaine owner: routeur runtime local / graphe `test-send-message`
- Source amont: imports et contrats transverses charges par `supabase/functions/sophia-brain/router/run.ts`
- Symptome visible: le premier tour retourne `An unexpected error occurred` avec HTTP `500`.
- Preuve systeme: aucune `route_decision`, aucun `turn_frame`, aucun message DB ecrit; `deno check supabase/functions/sophia-brain/router/run.ts` echoue hors safety sur `adjust_plan_item`, `clarification`, `demotivation_repair`, `select_state_potion`.
- Correction attendue: remettre le graphe runtime local en etat de chargement, sans fallback de test ni renderer deterministe, puis relancer le run safety reel.
- Statut: `open`
- Fix reference: none
- Tests requis: `deno check supabase/functions/sophia-brain/router/run.ts`; rerun local `/functions/v1/test-send-message` avec `force_full_ai=true`; verifier `response_owner=safety`, `selected_handler=safety_crisis`, `global_dispatcher_skipped=true`, aucun side effect.

