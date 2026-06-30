# Bug Sheet - Product Help One-Shot Transverse R2

Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-22-product-help-one-shot-transverse-r2.md`

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `PH-OS-R2-B01` | R2.1 T1, R2.2 T2 | `BF-LEDGER-02` | final response pipeline / direct-effect confirmation rendering / Product Help visible composition | Deux merges ajoutaient une phrase visible operationnelle: `operation_runtime_pipeline.mergeDirectEffectRuntimeIntoVisibleRuntime` puis `router/run.ts::mergeVisibleTextForTest` | Sophia confirme le meme rappel deux fois dans la meme reponse | R2.1: `executed_tools=["create_one_shot_reminder"]`, DB `scheduled_checkins.id=e65a76c6-c113-437d-92f9-660f64667eb3`, reponse contient deux confirmations. R2.2: `executed_tools=["create_one_shot_reminder"]`, DB `scheduled_checkins.id=88f21651-9ff0-4c23-9a2c-152b8c441417`, reponse contient deux confirmations. R4 postfix: `executed_tools=["create_one_shot_reminder"]`, DB `scheduled_checkins.id=db3fccb2-a628-409b-a230-2919c7b23345`, reponse confirme une seule fois et repond au produit. | Rendre la confirmation one-shot idempotente: le runtime garde ledger/trace et les faits structures, le visible agent possede le wording final quand il existe. | `verified` | `supabase/functions/sophia-brain/router/operation_runtime_pipeline.ts`, `supabase/functions/sophia-brain/router/run.ts`, `supabase/functions/sophia-brain/router/direct_effect_local_context.ts`, `supabase/functions/sophia-brain/router/one_shot_reminder_prompt_contract.ts`, `supabase/functions/sophia-brain/skills/product_help/visible_agent.ts` | Tests passes: `deno test --allow-env supabase/functions/sophia-brain/router/run_test.ts supabase/functions/sophia-brain/router/operation_runtime_pipeline_test.ts supabase/functions/sophia-brain/router/direct_effect_local_context_test.ts supabase/functions/sophia-brain/skills/product_help/local_flow_test.ts`; rerun QA reel `product-help-one-shot-postfix2-20260622-r4`. |

## Notes QA

- Le bug ne remet pas en cause l'execution durable: les deux rappels explicites sont bien crees.
- Le bug n'est pas `BF-LEDGER-01`, car il n'y a pas de claim sans commit.
- Le bug est transverse: il apparait quand un commit direct-effect est combine a un visible Product Help.
