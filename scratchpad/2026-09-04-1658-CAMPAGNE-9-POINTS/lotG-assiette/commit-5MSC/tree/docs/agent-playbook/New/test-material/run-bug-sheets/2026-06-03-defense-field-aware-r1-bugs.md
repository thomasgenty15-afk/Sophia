# Bug Sheet — defense-field-aware-r1

## Contexte

- Date: 2026-06-03
- Run: `defense-field-aware-r1`
- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-03-defense-field-aware-r1.md`
- Statut global: `yellow`

## Bugs

### R1-B01 — Handoff défense trop répétitif

- Tours: 1
- Famille: `BF-LEDGER-02` — rendu visible mal aligné avec l'état réel
- Domaine owner: `prepare_defense_card`
- Source amont: `tools/operations/prepare_defense_card/renderer.ts`
- Symptôme visible: Sophia répète la cible, le risque, la destination, les étapes et les mêmes valeurs dans les champs UI.
- Preuve système: `tool_skill_run.status=handoff_ready`, `platform_handoff.no_chat_mutation=true`, `executed_tools=[]`, `committed_effects=[]`; le problème est uniquement le wording visible.
- Correction attendue: rendre le handoff depuis les champs UI à remplir, sans résumé cible/risque redondant ni lignes `Réponse :` répétées.
- Statut: `fixed`
- Fix reference: renderer compact + tests `prepare_defense_card handoff renderer includes full platform content without duplicate model wording`
- Tests requis: positif handoff compact, paraphrase avec champs explicites, anti-faux-positif no-mutation et destination présente.
- Preuve de fix: `deno test --allow-read --allow-env supabase/functions/sophia-brain/tools/operations/prepare_defense_card/tests.ts supabase/functions/sophia-brain/tools/operations/prepare_defense_card/prepare_defense_card_fallback_test.ts` — 41 passed.

### R1-B02 — apply_attempt répète tout le handoff

- Tours: 2
- Famille: `BF-LEDGER-02` — rendu visible mal aligné avec l'état réel
- Domaine owner: `prepare_defense_card`
- Source amont: `tools/operations/prepare_defense_card/renderer.ts`
- Symptôme visible: après "Ok crée-la", Sophia réaffiche tout le handoff au lieu de répondre brièvement que la création chat est impossible.
- Preuve système: `route_reason=active_handoff_apply_attempt`, `tool_skill_run.status=apply_attempt`, `requested_effects=[]`, `allowed_effects=[]`, `committed_effects=[]`, `user_defense_cards=0`.
- Correction attendue: spécialiser `apply_attempt` en redirect court : pas d'exécution, destination plateforme, référence aux réponses déjà préparées.
- Statut: `fixed`
- Fix reference: renderer `apply_attempt` + tests `prepare_defense_card apply_attempt does not execute`
- Tests requis: positif apply_attempt court, paraphrase "ok fais-le", anti-faux-positif repeat_handoff continue de réafficher les champs.
- Preuve de fix: `deno test --allow-read --allow-env supabase/functions/sophia-brain/tools/operations/prepare_defense_card/tests.ts supabase/functions/sophia-brain/tools/operations/prepare_defense_card/prepare_defense_card_fallback_test.ts` — 41 passed.
