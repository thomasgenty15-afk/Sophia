# Run Bug Sheet - demotivation-repair-local-doctrine-r9

## Metadata

- Date: 2026-06-11
- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-11-demotivation-repair-local-doctrine-r9.md`
- Run id: `demotivation-repair-local-doctrine-r9`
- Persona / scenario: connexion temporaire `demotivation_repair_local_doctrine_r9`, demotivation repair local doctrine
- Verdict run: yellow
- Validite QA: valide, run local Sophia IA reel avec `force_full_ai=true`
- Agent owner: Sophia Brain local flow runtime

## Synthese

- Familles dominantes: `BF-INTAKE-03`
- Bug le plus bloquant: note d'exit local trop pauvre pour transmettre la contrainte "j'arrete la pour aujourd'hui" au second passage global.
- Fix architectural prioritaire: enrichir la compilation `note_information` du handoff local -> global avec `user_words` et `structured_context` semantiques.
- Rerun requis: oui, meme trajectoire avec paraphrase d'arret et verification trace.

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `R9-B01` | T4 | `BF-INTAKE-03` | `demotivation_repair` local runtime / exit handoff compiler | `note_information` generee lors de `demotivation_repair_exit_to_global_dispatcher` | Sophia ajoute encore une micro-consigne apres une contrainte d'arret explicite | `local_flow_exit_handoff.consumed_by=global_dispatcher_second_pass`, `response_owner=normal_reply`, `note_information.user_words=[]`, `structured_context` limite au runtime technique | Compiler une note semantique: message courant, contrainte d'arret, micro-geste retenu, limites de reponse finale; ne pas changer le chemin doctrinal exit -> global -> normal reply | `fixed` | `note_information.v1` guard + local exit handoff userMessage fallback + normal_reply handoff priority | positif exit, paraphrase "je m'arrete la", anti-FP continuation active, integration trace |

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-11 | Garder le chemin exit local -> global second pass -> normal reply | Conforme a la doctrine: le probleme n'est pas l'utilisation de `normal_reply`, mais la pauvrete de la note transmise | Sophia Brain runtime | `2026-06-11-demotivation-repair-local-doctrine-r9.md` |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-11 | `R9-B01` | Run QA local full-AI r9 | `open`: bug observe, non corrige pendant le run | `2026-06-11-demotivation-repair-local-doctrine-r9.md` |
| 2026-06-11 | `R9-B01` | Tests contractuels et runtime locaux | `fixed`: note fallback complete user_words/structured_context et normal_reply consomme la note locale en priorite; reste a verifier par run IA reel | `note_information_test.ts`, `demotivation_repair/local_flow_test.ts`, `run_product_help_guard.test.ts` |
