# Run Bug Sheet - product-help-local-bridges-20260612-r4-rawtrace

## Metadata

- Date: 2026-06-12.
- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-12-product-help-local-bridges-r4-rawtrace.md`.
- Run id: `product-help-local-bridges-20260612-r4-rawtrace`.
- Persona / scenario: QA local product_help bridge vers `prepare_attack_card`, user dedie `d1e2cd50-c441-440b-bd8f-7702eb91da0d`.
- Verdict run: yellow.
- Validite QA: valide, IA reelle locale, `force_full_ai=true`, 4 tours HTTP 200.
- Agent owner: `product_help` pour le bridge; bug restant owner `prepare_attack_card`.

## Synthese

- Familles dominantes: `BF-INTAKE-05`.
- Bug le plus bloquant: elargissement visible des techniques au T3 apres reprise correcte du dispatcher `prepare_attack_card`.
- Fix architectural prioritaire: renforcer le stage `choose_technique` / `ask_or_confirm_technique` pour respecter strictement les candidates du dispatcher et recommander quand le contexte est suffisant.
- Rerun requis: oui, rerun IA reel product_help -> prepare_attack_card avec raw IA trace active.

## Bug Ledger

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `PH-LB-R4-B01` | T3 | `BF-INTAKE-05` | `prepare_attack_card` local dispatcher / visible agent | Stage `choose_technique` et rendu `ask_or_confirm_technique` | Sophia demande de choisir parmi six techniques alors que le user a donne target + blocker et que le dispatcher avait seulement trois candidates | `response_owner=tool_skill`, `selected_handler=prepare_attack_card`, `route_reason=active_prepare_attack_card_local_dispatcher`; raw DB `prepare_attack_card.local_dispatcher` a `candidate_options=["preparer_terrain","texte_recadrage","visualisation_matinale"]`, raw visible liste les six techniques | Le visible doit respecter `candidate_options` et ne jamais elargir a toute la liste produit; si une option est clairement adaptee, demander confirmation courte de la recommandation | `fixed_pending_real_rerun` | `supabase/functions/sophia-brain/tools/operations/prepare_attack_card/local_flow.ts`; `supabase/functions/sophia-brain/tools/operations/prepare_attack_card/visible_agent.ts`; `supabase/functions/sophia-brain/tools/operations/prepare_attack_card/local_flow_test.ts` | Positif: target+blocker papier -> recommandation ou max candidates dispatcher; paraphrase: surcharge visuelle/pile de papiers; anti-FP: vraie demande "quelles sont toutes les techniques ?" peut lister; integration: product_help handoff garde `route_reason=product_help_handoff_to_local_dispatcher` |

## Decisions / Arbitrages

| Date | Decision | Pourquoi | Owner | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-12 | Ne pas modifier product_help pour ce bug | Le run prouve que product_help handoff correctement vers `prepare_attack_card`; l'anomalie apparait apres reprise active du dispatcher cible | `prepare_attack_card` | T2/T3 traces du run R4 |
| 2026-06-12 | Conserver les artefacts QA du run | Le user a explicitement demande un run sans suppression finale pour acceder aux resultats | QA | Scope `qa-normal-conversation-product-help-local-bridges-20260612-r4-rawtrace` |

## Verification

| Date | Bug id | Verification | Resultat | Reference |
| --- | --- | --- | --- | --- |
| 2026-06-12 | `PH-LB-R4-B01` | Raw IA trace DB verifiee sur `llm_raw_response_events` | 7 lignes presentes, JSON dispatcher et visible accessibles, pas de troncature observee | `request_id like product-help-local-bridges-20260612-r4-rawtrace%` |
| 2026-06-12 | `PH-LB-R4-B01` | Unit tests `prepare_attack_card` apres fix | 39 passed, 0 failed; couvre `allowed_technique_labels` dans `conversation_context` et rejet des labels hors candidates | `/usr/local/bin/deno test --allow-read=supabase/functions/sophia-brain/tools/operations/prepare_attack_card/router.ts supabase/functions/sophia-brain/tools/operations/prepare_attack_card/local_flow_test.ts` |
