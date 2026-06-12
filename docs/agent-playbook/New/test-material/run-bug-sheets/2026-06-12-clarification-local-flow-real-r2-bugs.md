# Bug Sheet - Clarification Local Flow Real R2

Cadre: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, connexions QA temporaires `clarification_local_clarif_local_20260612_r1` et `clarification_local_clarif_local_20260612_r2`, cleanup cible effectue. Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-12-clarification-local-flow-real-r2.md`.

| ID | Tour | Famille | Surface | Symptome | Evidence | Correction attendue | Statut |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CLARIF-R2-B01 | R1 T2 | BF-HANDOFF-01 | `product_help` -> `prepare_attack_card` local handoff | Sophia annonce la preparation de la carte, mais le dispatcher cible `prepare_attack_card` n'est pas execute sur ce tour. L'utilisateur doit redemander au T3 pour obtenir la premiere question utile. | R1 T2: `response_owner=product_help`, `selected_handler=product_help`, `flow_action=handoff_to_local_dispatcher`, `note_information.target_dispatcher=prepare_attack_card`, visible: "Ça marche, on s'occupe..." ; R1 T3 seulement: `selected_handler=prepare_attack_card`, `visible_task=ask_blocker`. | Quand un flow local conversationnel produit `handoff_to_local_dispatcher`, enchaîner vers le dispatcher local cible ou enregistrer une transition active consommée automatiquement au tour suivant sans redemande explicite. | open |
| CLARIF-R2-B02 | R1 T3 | BF-TRACE-01 | Runtime trace / note information | La trace `prepare_attack_card` indique `note_information_consumed` avec `source_flow_id=global_dispatcher` alors que le handoff utile venait de `product_help`. | R1 T2 contient `product_help_note_information.source_flow_id=product_help`; R1 T3 runtime_trace contient `note_information_consumed`, `source_flow_id=global_dispatcher`. | Préserver `source_flow_id` et `handoff_reason` réels quand une note issue d'un dispatcher local est consommée par le dispatcher cible. | open |

## Non-Bugs Confirmes

- Tutoiement: OK sur R1 et R2, aucun `vous/votre/souhaitez-vous/préférez-vous` visible.
- Effets durables: OK, aucun `user_attack_cards` ou `user_defense_cards` cree pendant clarification.
- Clarification stricte attaque vs defense: OK, R2 T1 `orientation_clarification`, R2 T2 `orientation_clarification_resolved_tool_skill`.
