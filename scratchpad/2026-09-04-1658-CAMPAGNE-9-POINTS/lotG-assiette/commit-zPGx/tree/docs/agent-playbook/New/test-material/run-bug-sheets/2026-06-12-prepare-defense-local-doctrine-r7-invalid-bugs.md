# Bug Sheet - prepare_defense_card Local Doctrine R7 Invalid

Cadre: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, persona `alex`, run `prepare-defense-local-doctrine-r7`. Aucun fallback utilise. Aucun code modifie pendant le run.

## Bugs

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R7-B01 | T1 | BF-TEST-01 | Sophia Brain function boot | `router/adjust_plan_operation_bridge.ts` / `skills/weekly_review/runtime.ts` | Sophia ne repond pas; HTTP 503 `BOOT_ERROR` | Raw T1: `{"code":"BOOT_ERROR","message":"Worker failed to boot (please check logs)"}`. Diagnostic: `deno check supabase/functions/sophia-brain/index.ts` -> `TS2305` import manquant `isExplicitPendingApplyConfirmation` depuis `weekly_review/runtime.ts`. Aucun `route_decision`, aucun `operation_flow_run`, aucun effet durable. | Restaurer la coherence du module graph Brain en alignant l'import/export, puis relancer un health check IA reel local avant le run `prepare_defense_card`. | open |  | Positif: `deno check supabase/functions/sophia-brain/index.ts` vert. Integration: `/functions/v1/test-send-message` HTTP 200 avec `force_full_ai=true`. Rerun QA: entree defense -> rythme premier tour -> handoff -> apply non-mutant -> exit local propre vers global puis attaque. Anti-FP: ne pas utiliser fallback `processMessage`, renderer ou staging. |

## Notes

- Ce bug est hors `prepare_defense_card`: le flow defense n'est jamais atteint.
- Le run doit etre repris avec un nouveau run id apres correction du boot.
