# Bug Sheet — Execution Breakdown Real R2

- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-02-execution-breakdown-real-r2.md`
- Cadre: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`
- Persona / scenario: user QA temporaire `qa-skill`, ambiguite `execution_breakdown` vs `adjust_plan_item`, puis decoupage explicite
- Validite QA: valide, 3 tours HTTP 200, traces et DB inspectees

## Bugs

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `EXEC-BREAKDOWN-R2-B01` | T2-T3 | `BF-LEDGER-01` | EffectLedger / final response pipeline | guard `uncommitted_plan_adjust_claim` applique sur une conversation skill sans effet durable | Sophia repond "Je ne l'ai pas modifie." au lieu de donner la micro-etape demandee | T2/T3 `response_owner=conversation_handler`, `selected_handler=execution_breakdown`; `effect_ledger.blocked=1`, reason `uncommitted_plan_adjust_claim`; T3 `__active_skill_state.skill_id=execution_breakdown`; internal reply utile produit mais non visible | Si un claim de modification de plan est bloque alors qu'aucun commit n'existe, filtrer/regenerer la reponse sans claim durable et laisser passer la reponse conversationnelle du skill | `open` | none | Positif: clarification -> `execution_breakdown` -> demande de micro-etape affiche la micro-etape; continuation "ne modifie rien" reste dans le skill; anti-FP: vraie affirmation de modification sans commit reste bloquee sans produire une phrase hors contexte |

## Verification Runs

| Date | Scope | Preuve | Verdict | Notes |
| --- | --- | --- | --- | --- |
| 2026-06-02 | R2 | `tmp/qa-execution-breakdown-20260602-r2/*.raw.json`, DB REST read on `chat_messages`, `scheduled_checkins`, `user_chat_states` | `red` | Routing conversation skill verifie; guard final response toujours bloquant |
