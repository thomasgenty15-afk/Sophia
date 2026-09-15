# Bug Sheet — status-recap-real-r4

## R4-B01

- Bug id: `R4-B01`
- Tours: Tours 1-4
- Famille: `BF-TEST-01` — Trace/test incoherent ou suite malsaine
- Domaine owner: `sophia-brain` boot / weekly bridge runtime
- Source amont: import `isExplicitPendingApplyConfirmation` dans `router/adjust_plan_operation_bridge.ts`
- Symptome visible: `/functions/v1/test-send-message` retourne `503 BOOT_ERROR`; Sophia ne repond pas.
- Preuve systeme: les quatre tours r4 ont `http_status=503` et `raw_body.code=BOOT_ERROR`; `deno check` echoue avec `TS2305` car `skills/weekly_review/runtime.ts` n'exporte pas `isExplicitPendingApplyConfirmation`.
- Correction attendue: aligner l'import/export weekly bridge pour que `sophia-brain` boote, puis relancer le run IA reel status recap.
- Statut: `open`
- Fix reference: n/a
- Tests requis: `deno check supabase/functions/sophia-brain/index.ts supabase/functions/sophia-brain/router/agent_exec.ts supabase/functions/sophia-brain/agents/companion.ts`; rerun `status-recap-real-r5` avec `/functions/v1/test-send-message`, `force_full_ai=true`.

## Notes De Verification

- Le run r4 ne valide ni n'invalide la correction de style `status_recap`, car le flow n'a jamais ete atteint.
- La connexion r4 est propre cote artefacts de run apres cleanup, mais les preferences coach system defaults creees automatiquement restent hors perimetre fixture.
