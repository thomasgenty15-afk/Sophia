# 2026-06-01 — update_coach_preferences 3 runs bugs

## R1-B01

- Tours: r1b-composite-apply T2
- Famille: `BF-STATE-03` — Draft lifecycle casse
- Domaine owner: `update_coach_preferences`
- Source amont: state handoff / renderer `apply_attempt`
- Symptome visible: apres un handoff composite avec `coach.tone` et
  `coach.question_tendency`, "Ok applique" ne repete que `Ton global`.
- Preuve systeme: T1 handoff delivered avec deux reglages recommandes; T2
  `status=apply_attempt`, `executed_tools=[]`, `committed_effects=[]`, mais
  visible "Reglage a reprendre : Ton global sur Tres direct."
- Correction attendue: `apply_attempt` doit relire le draft actif complet et
  repeter tous les reglages recommandes, plus la destination plateforme.
- Statut: `fixed`
- Fix reference:
  `supabase/functions/sophia-brain/tools/operations/update_coach_preferences/router.ts`;
  test `apply_attempt repeats every recommended setting from active draft`.
- Tests requis: apply_attempt composite avec au moins deux supported_settings;
  repeat_handoff composite; anti-regression no DB write.
