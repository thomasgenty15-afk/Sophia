# Bug Sheet — Adjust Plan Handoff R3

## Run

- Date: 2026-06-01
- Report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-01-adjust-plan-handoff-rerun-r3.md`
- Runs:
  - `adjust-plan-action-20260601-r3`
  - `adjust-plan-level-20260601-r3`
  - `adjust-plan-whole-20260601-r3`
- Verdict: yellow

## Bugs

### R3-B01 — Revision handoff trop litterale

- Tours: action T5/T6, niveau T2/T5/T6, whole-plan T5/T6
- Famille: `BF-INTAKE-03` — Contrainte explicite perdue ou mal integree
- Domaine owner: `adjust_plan_item`
- Source amont: `tools/operations/adjust_plan_item/handoff.ts`, revision du draft handoff actif
- Symptome visible: Sophia produit des recommandations du type `Ajuster ... avec cette contrainte : <message user>.` ou `Reviser la trajectoire globale avec cette contrainte : <message user>.`
- Preuve systeme:
  - `status=revise_handoff`
  - `executed_tools=[]`
  - `committed_effects=[]`
  - `pending_confirmation=null`
  - Le champ `handoff_draft.recommendation.recommended_change` stocke la phrase mecanique et les repeats la propagent.
- Correction attendue: recomposer une recommandation semantique de revision par scope, sans citer brutalement le message utilisateur ni produire de double ponctuation.
- Statut: verified
- Fix reference: `supabase/functions/sophia-brain/tools/operations/adjust_plan_item/handoff.ts`, `router_test.ts`, `handoff_runtime_test.ts`; verified by R4 action T5/T6, niveau T2/T5/T6, whole-plan T5/T6
- Tests requis:
  - positif: action revisee `30 secondes` -> recommandation naturelle et precise;
  - positif: current_level `cette semaine seulement` -> reco periodisee, pas niveau complet;
  - positif: whole_plan `tester une semaine` -> reco prudente de test, pas reorganisation definitive;
  - anti-regression: aucune sortie ne contient `avec cette contrainte : <message user>`;
  - integration: repeat apres revision reprend la reco semantique, pas le message brut.

### R3-B02 — Handoff current-level expose un diagnostic interne

- Tours: niveau T1
- Famille: `BF-INTAKE-03`
- Domaine owner: `adjust_plan_item`
- Source amont: handoff draft generation pour `current_level_partial_scope_platform_handoff`
- Symptome visible: la phrase `techniquement, il manque encore le contenu precis a alleger` apparait dans `Ce que je comprends`.
- Preuve systeme:
  - `reason_code=current_level_partial_scope_platform_handoff`
  - `missing_slots=["current_level.affected_items"]`
  - `executed_tools=[]`
  - `committed_effects=[]`
- Correction attendue: garder le missing slot dans la trace/draft `missing_decisions`, mais rendre le texte visible en langage utilisateur: "il reste a choisir quelles actions alleger dans Plan".
- Statut: fixed
- Fix reference: `supabase/functions/sophia-brain/tools/operations/adjust_plan_item/handoff.ts`, `router_test.ts`
- Tests requis:
  - positif: demande current level vague -> handoff utile + point a trancher dans Plan;
  - anti-regression: pas de wording `techniquement` / `slot` / `missing` dans la reponse visible.

## Invariants Verifies

- Aucun `executeAdjustPlanItem`.
- Aucun writer plan observe.
- Aucun `committed_effects`.
- Aucun `executed_tools`.
- Aucun pending confirmation executable.
- Les `ok applique` deviennent `apply_attempt` et restent handoff/no-mutation.
- Les demandes destination-only restent dans `adjust_plan_item` et repondent `Dans Plan`.
