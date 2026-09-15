# Run Bug Sheet - plan_realignment_real_r1

## Metadata

- Date: 2026-06-30
- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-30-plan-realignment-real-r1.md`
- Run id: `plan_realignment_real_r1`
- Persona / scenario: `qa-skill` / temporary connection `plan_realign_planrealign_r1`
- Verdict run: `yellow`
- Validite QA: valide, IA reelle locale via `/functions/v1/test-send-message`, `force_full_ai=true`
- Agent owner: `coaching_recommendation` + global dispatcher contract

## Synthese

- Familles dominantes: `BF-INTAKE-04`, secondaire `BF-INTAKE-06`
- Bug le plus bloquant: action precise non resolue classee comme action du Plan.
- Fix architectural prioritaire: rendre `plan_action` inadmissible sans `plan_item_id` resolu.
- Rerun requis: oui, rerun plan_realignment boundary + coaching action source.

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `PR-R1-B01` | T5 | `BF-INTAKE-04` | global dispatcher + `coaching_recommendation` | `skill_signals.coaching_recommendation.context.action_context` et reducer admission | Sophia dit de preparer la carte depuis l'action `mail à Camille` dans le Plan alors qu'aucun `plan_item_id` n'est resolu. | Trace T5: `coaching_type=plan_action`, `action_context.source=plan`, `plan_item_id=null`, `action_title=mail à Camille`; visible `action_plan_coaching`. | Invariant contractuel: `plan_action` exige `action_context.source=plan` ET `plan_item_id` non null. Sinon router vers `no_plan_action` ou `ambiguous`, et bloquer `action_plan_coaching`. | `open` | a creer | positif avec plan_item_id resolu + paraphrase action non plan + anti-FP question produit dans `plan_realignment` actif |

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-30 | Ne pas classer T5 comme bug `plan_realignment`. | Le flow sort proprement avec une note vers global; le mauvais domaine apparait dans le signal/skill coaching suivant. | QA | `2026-06-30-plan-realignment-real-r1.md` |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-30 | `PR-R1-B01` | Run reel local initial | `open` | `tmp/planrealign_r1_trace.json` |
