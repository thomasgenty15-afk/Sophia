# Run Bug Sheet - prepare-defense-local-dispatcher-rqa1

## Metadata

- Date: 2026-06-08
- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-08-prepare-defense-local-dispatcher-rqa1.md`
- Run id: `prepare-defense-local-dispatcher-rqa1`
- Persona / scenario: `alex` / prepare_defense_card local dispatcher, handoff, revision, apply attempt, exit to attack
- Verdict run: yellow
- Validite QA: valide, IA reelle locale via `/functions/v1/test-send-message`, `force_full_ai=true`
- Agent owner: Codex

## Synthese

- Familles dominantes: `BF-ROUTE-02`, `BF-LEDGER-01`
- Bug le plus bloquant: T6 active defense flow returned `active_prepare_defense_card_local_runtime_null` instead of allowing local dispatcher exit to attack.
- Fix architectural prioritaire: ensure explicit local route admission cannot be blocked by stale/pending memory before local dispatcher runs.
- Rerun requis: variante courte defense active -> explicit attack exit; one paraphrase of support_need revision.

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `RQA1-B01` | T6, verified T7 | `BF-ROUTE-02` | `prepare_defense_card` runtime routing | `prepare_defense_card.router.operationRouteIsSelected` | Sophia dit qu'elle n'arrive pas a traiter le tour au lieu de sortir vers attaque | T6: `reason_code=active_prepare_defense_card_local_runtime_null`, `global_dispatcher_skipped=true`; T7: `selected_handler=prepare_attack_card` | Prioriser `routeDecision.response_owner=tool_skill` + `selected_handler=prepare_defense_card` avant les checks pending/active memory; le dispatcher local doit recevoir le message et retourner `exit_to_global_dispatcher` si besoin | `verified` | `supabase/functions/sophia-brain/tools/operations/prepare_defense_card/router.ts`; test `prepare_defense_card explicit local route is not blocked by unrelated pending memory` | positif: defense active -> attaque; paraphrase: "je veux quitter defense"; anti-FP: pending autre op ne bloque pas route locale explicite |
| `RQA1-B02` | T4 | `BF-LEDGER-01` | `prepare_defense_card.visible_agent` | Prompt visible revision/handoff | "j'ai bien pris en compte" peut sonner comme une prise en charge persistante malgre no-create ensuite | T4: no executed tools, no pending, `reason=revised_platform_handoff`; visible phrase ambigue | Dans les prompts visibles de revision, preferer "voici la nouvelle formulation a recopier" et eviter les verbes de prise en charge persistante | `open` |  | positif: revision support_need; anti-FP: ne pas bloquer les confirmations purement conversationnelles; guard visible claims ambigus |

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-08 | Corriger immediatement `RQA1-B01` pendant la session QA et verifier par reprise conversationnelle T7 | Le bug bloquait l'exception contractuelle `exit_to_global_dispatcher` | `prepare_defense_card.router` | Run report T6/T7 |
| 2026-06-08 | Garder `RQA1-B02` ouvert | Warning de fluidite faible, non bloquant systeme, a traiter via prompt visible plutot que patch de phrase | `prepare_defense_card.visible_agent` | Run report T4 |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-08 | `RQA1-B01` | `deno test supabase/functions/sophia-brain/tools/operations/prepare_defense_card/local_flow_test.ts` | 16/16 passed | Test `prepare_defense_card explicit local route is not blocked by unrelated pending memory` |
| 2026-06-08 | `RQA1-B01` | Reprise QA reelle T7 apres fix | verified: `selected_handler=prepare_attack_card`, no executed tools, no pending confirmation | `tests/real-personas/alex/runs/operations/2026-06-08-prepare-defense-prepare-defense-local-dispatcher-rqa1.summary.json` |
