# Bug Sheet - Product Help Local 5T R1

Run: `product-help-local-5t-20260617-r1`

Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-17-product-help-local-5t-r1.md`

## Bugs

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `PH5T-R1-B01` | T4 | `BF-ROUTE-01` | Dispatcher global + admission `adjust_plan_item` | Politique de routing des platform handoff skills | Une demande explicite "aide-moi a ajuster l'action du Plan" recoit une reponse coach normale au lieu d'un handoff Plan | `response_owner=normal_reply`, `selected_handler=null`, `route_reason=normal_reply_default`, aucun `toolExecution=platform_handoff`, aucun `no_chat_mutation=true` | Aligner le dispatcher/admission avec le contrat `adjust_plan_item`: demande explicite d'ajustement Plan -> owner `adjust_plan_item`, mode `platform_handoff`, sans mutation chat | open |  | Positif: "ajuste l'action X du Plan" -> `adjust_plan_item`; paraphrase: "rends cette action plus concrete sans ajouter d'action" -> `adjust_plan_item`; anti-faux-positif: "explique le principe d'ajuster une action" -> `product_help`; integration product_help -> adjust -> explain handoff |
| `PH5T-R1-B02` | T5 | `BF-ROUTE-03` | Dispatcher global + policy product/tool; secondairement `adjust_plan_item` actif attendu | Frontiere product/status/tool apres mauvais owner T4 | Sophia explique correctement que rien n'est modifie, mais reste vague sur la destination produit et ne passe pas par `adjust_plan_item.explain_handoff` | `response_owner=normal_reply`, `route_reason=normal_reply_default`, aucun etat actif `adjust_plan_item`; `temp_memory.companion_question_rhythm` present apres les tours normal reply | Quand T4 cree le handoff actif, T5 doit etre traite par `adjust_plan_item` comme `explain_handoff`; si la question est strictement produit, `product_help` inline doit repondre puis retourner au parent | open |  | Positif apres handoff: "est-ce deja modifie ou je dois copier ?" -> `adjust_plan_item.explain_handoff`; anti-faux-positif hors flow: question produit generale -> `product_help`; verifier aucun `committed_effects` |

## Notes De Classification

- `B01` est classe en `BF-ROUTE-01` plutot qu'en intake local, car `adjust_plan_item` n'est jamais selectionne.
- `B02` est une consequence runtime de `B01`, mais conserve une ligne separee car il touche la frontiere product/tool apres proposition Plan.
- Aucun bug d'effet durable n'est ouvert: le run ne montre pas de mutation non consentie ni de claim "c'est fait".

## References Contractuelles Lues

- `docs/agent-playbook/New/runtime-contracts/00-architecture-doctrine.md`
- `docs/agent-playbook/New/runtime-contracts/conversation-skills/product-help.md`
- `docs/agent-playbook/New/runtime-contracts/conversation-skills/product-help-local-flow-architecture.md`
- `docs/agent-playbook/New/runtime-contracts/tools/adjust-plan-item.md`
- `docs/agent-playbook/New/contract-prompts/anti-patching-qa-charter.md`
- `docs/agent-playbook/New/test-material/familly-bugs.md`
