# Run Bug Sheet - product-help bridges adjust/defense 20260612

## Metadata

- Date: 2026-06-12.
- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-12-product-help-bridges-adjust-defense-r1.md`.
- Run ids: `product-help-to-adjust-plan-20260612-r1`, `product-help-to-prepare-defense-20260612-r2`.
- Persona / scenario: Rose pour product_help -> adjust_plan_item; Alex pour product_help -> prepare_defense_card.
- Verdict run: yellow.
- Validite QA: valide, IA reelle locale, `/functions/v1/test-send-message`, `force_full_ai=true`, 10 tours HTTP 200 sur les runs retenus.
- Agent owner: bug restant owner `adjust_plan_item`.

## Synthese

- Familles dominantes: `BF-STATE-01`.
- Bug le plus bloquant: `adjust_plan_item` echoue sur question de frontiere d'effet apres handoff plateforme.
- Fix architectural prioritaire: stage local non-mutant pour questions "est-ce applique / dois-je le faire moi-meme" apres handoff.
- Rerun requis: oui, rerun IA reel product_help -> adjust_plan_item 5 tours, en conservant le test T5 frontiere d'effet.

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `PH-BRIDGES-ADJDEF-R1-B01` | Adjust T5 | `BF-STATE-01` | `adjust_plan_item` local dispatcher / reducer | Continuation post-handoff, question de frontiere d'effet | Sophia affiche un fallback d'echec: `je n'arrive pas a traiter correctement ce tour` au lieu de dire si le Plan a ete modifie | `selected_handler=adjust_plan_item`, `route_reason=active_adjust_plan_item_local_dispatcher`, `operation_status=blocked`, `operation_reason=adjust_plan_item_local_dispatcher_failed`, `direct_effects=[]`, `executed_tools=[]` | Ajouter une action/stage local pour `effect_boundary_question` ou mapper vers `repeat_handoff`: reponse courte "non, rien n'a ete modifie depuis le chat; voici ou le faire" | `open` | Rapport `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-12-product-help-bridges-adjust-defense-r1.md` | Positif: "tu l'as deja modifie ?" apres handoff; paraphrase: "c'est applique ?", "je dois le faire moi-meme ?"; anti-FP: demande claire de nouveau sujet sort global; integration: product_help -> adjust conserve `product_help_exit_to_global_dispatcher` |

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-12 | Ne pas modifier product_help | Les deux ponts demandes sont verts: `product_help_exit_to_global_dispatcher` vers `adjust_plan_item` et `prepare_defense_card` | `product_help` | Runs A2 et B2 |
| 2026-06-12 | Classer le bug adjust en downstream | Le bug apparait apres reprise active du dispatcher `adjust_plan_item`, au T5 | `adjust_plan_item` | Run A5 |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-12 | `PH-BRIDGES-ADJDEF-R1-B01` | Run IA reel local | Reproduit: 5 tours HTTP 200, T5 blocked | `product-help-to-adjust-plan-20260612-r1` |
| 2026-06-12 | n/a | Defense bridge control run | Vert: 5 tours HTTP 200, handoff + reprise active + frontiere d'effet OK | `product-help-to-prepare-defense-20260612-r2` |
