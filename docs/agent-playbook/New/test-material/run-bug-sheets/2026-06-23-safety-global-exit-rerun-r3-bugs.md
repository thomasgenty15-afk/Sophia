# Run Bug Sheet - Safety Global Exit Rerun R3

- Run: `safety_global_exit_rerun_20260623_r3`
- Date: 2026-06-23
- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-23-safety-global-exit-rerun-r3.md`
- Verdict run: red

## R3-B01

- Bug id: `R3-B01`
- Tours: T4
- Famille: `BF-EFFECT-03` - Payload durable faux
- Domaine owner: one-shot reminder direct effect / intake payload compiler
- Source amont: extraction du `reminder_instruction` dans un tour composite safety + rappel ponctuel
- Symptome visible: confirmation visible correcte, mais le rappel durable contient le contexte complet: `à ma cousine mais elle n'a pas encore répondu. Rappelle-moi dans 20 minutes de la relancer, et reste avec moi ici parce que je suis encore seul`.
- Preuve systeme: `executed_tools=["create_one_shot_reminder"]`; durable effect id `c7385946-31bf-41a9-adcd-1c42528d7294`; `reminder_instruction` pollue par la commande et le contexte safety.
- Correction attendue: l'instruction durable doit etre limitee a l'action utile, par exemple `relancer ma cousine`; la clause `reste avec moi ici...` doit rester dans le contexte safety, pas dans le payload du rappel.
- Statut: `open`
- Fix reference: none
- Tests requis: positif avec `Rappelle-moi dans 20 minutes de la relancer, et reste avec moi`; paraphrase avec `n'a pas encore repondu`; anti-faux-positif ou la phrase longue est explicitement le texte a rappeler; integration safety active + reminder commit.

## R3-V01

- Bug id: `R3-V01`
- Tours: T6-T8
- Famille: verification de correction `BF-STATE-01` / `BF-ROUTE-02`
- Domaine owner: safety crisis state reducer / active flow arbitration
- Source amont: purge des cles actives sur `exit_to_global_dispatcher`
- Symptome visible: aucun symptome restant dans ce run.
- Preuve systeme: T6 ecrit `__last_safety_crisis_exit_memo` et ne conserve aucune cle active; T7 route `normal_reply`; T8 route `product_help`.
- Correction attendue: comportement observe conforme.
- Statut: `verified`
- Fix reference: `supabase/functions/sophia-brain/router/safety_crisis_runtime.ts`, `supabase/functions/sophia-brain/router/run.ts`, `supabase/functions/sophia-brain/router/run_test.ts`
- Tests requis: deja couverts par ce run QA et les tests runtime cibles.
