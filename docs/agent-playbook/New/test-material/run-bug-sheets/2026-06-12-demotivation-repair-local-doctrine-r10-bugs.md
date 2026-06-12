# Bug Sheet - demotivation-repair-local-doctrine-r10

## Run

- Date: 2026-06-12
- Report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-12-demotivation-repair-local-doctrine-r10.md`
- Verdict: yellow

## Bugs

### DMR-R10-B01

- Tours: 5
- Famille: `BF-INTAKE-03` - Contrainte explicite perdue
- Domaine owner: `normal_reply` apres `local_exit_to_global_dispatcher`
- Source amont: contexte filtre issu de `note_information` / final response post-exit
- Symptome visible: Sophia ajoute "Fais-le maintenant ?" alors que le user dit "je fais juste ca et apres j'arrete pour aujourd'hui".
- Preuve systeme: trace detaillee tour 5: local flow actif, `note_information.source_flow_id=demotivation_repair`, `target_dispatcher=global`, `handoff_reason=topic_change`, `consumed_by=global_dispatcher_second_pass`, `response_owner=normal_reply`.
- Correction attendue: conserver le chemin doctrinal d'exit, mais transmettre explicitement les contraintes de cloture au contexte normal reply et bloquer une question supplementaire d'engagement quand le user a deja pose `stop_after_micro_step` / `no_extra_prompt`.
- Statut: verified
- Fix reference: `normal_reply` prompt renforce dans `supabase/functions/sophia-brain/agents/companion.ts` et addon de reprise dans `supabase/functions/sophia-brain/router/run.ts`; verifie par `demotivation-repair-local-doctrine-r11`.
- Tests requis: integration locale `demotivation_repair` sortie vers global avec note; normal reply doit clore sans nouvelle question; anti-faux-positif ou le user demande explicitement un check-in/action doit rester autorise.
