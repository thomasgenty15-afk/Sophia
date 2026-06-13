# Bug Sheet - prepare_attack_card local dispatcher r8

## R8-B01

- Bug id: `R8-B01`
- Tours: Tour 7
- Famille: `BF-EFFECT-04` - Executor ou fallback technique fragile
- Domaine owner: `adjust_plan_item`
- Source amont: EffectLedger / platform handoff contract admission pour un tour de clarification
- Symptome visible: aucun symptome utilisateur bloquant; Sophia repond correctement a la priorisation.
- Preuve systeme: `selected_handler=adjust_plan_item`; `reason_code=adjust_plan_item_get_info_db`; `toolExecution=none`; `committed_effects=[]`; EffectLedger contient un blocked effect `platform_handoff.adjust_plan_item` avec `missing_platform_handoff_contract`.
- Correction attendue: ne pas emettre de blocked platform handoff contract lorsque `adjust_plan_item` est en clarification non-mutante sans transfert a rendre.
- Statut: `fixed`
- Fix reference: `supabase/functions/sophia-brain/router/effect_ledger_adapter.ts` + `supabase/functions/sophia-brain/router/effect_ledger_adapter_test.ts`
- Tests requis:
  - positif: sortie de `prepare_attack_card` vers priorisation doit router vers `adjust_plan_item` sans ancien flow capture;
  - positif: `adjust_plan_item_get_info_db` en clarification ne doit pas produire `missing_platform_handoff_contract`;
  - anti-faux-positif: un vrai handoff incomplet doit rester bloque;
  - integration: run IA reel avec `committed_effects=[]` et aucun blocked effect parasite.
