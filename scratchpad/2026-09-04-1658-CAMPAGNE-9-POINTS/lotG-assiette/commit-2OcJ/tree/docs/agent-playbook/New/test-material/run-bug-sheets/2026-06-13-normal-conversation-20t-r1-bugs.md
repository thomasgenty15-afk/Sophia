# Run Bug Sheet - normal conversation 20t R1

- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-13-normal-conversation-20t-r1.md`
- Raw/state: `tmp/qa-normal-conversation/normal-conversation-20t-20260613-r1/state.json`
- Validite QA: valide, IA reelle locale, `force_full_ai=true`, 20 tours HTTP 200, aucun fallback.

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `R1-B01` | T2-T5 | `BF-ROUTE-01` / `BF-ROUTE-02` | router / `flow_opportunity_verification` / `prepare_defense_card` | active flow admission + refusal/interruption policy | Sophia propose puis force une carte alors que l'utilisateur demande explicitement une discussion normale et du concret immediat. | T2-T4 `response_owner=tool_skill`, `selected_handler=flow_opportunity_verification`; T5 `selected_handler=prepare_defense_card`, `tool_execution=blocked`. | Respecter "pas de carte / pas tout de suite / parle simplement" comme contrainte forte; sortir vers conversation handler tant que le consentement outil n'est pas clair. | open |  | Test local real: refus outil puis demande concrete; unit routing: no `tool_skill` owner after recent explicit refusal. |
| `R1-B02` | T9, T19 | `BF-INTAKE-06` | `demotivation_repair` | skill intake / prompt grounding | Reponses generiques "outil/equipement" puis "tache/machine" hors sujet grignotage/biscuits. | T9/T19 `selected_handler=demotivation_repair`, no tools, visible text hors domaine. | Grounder les propositions sur les entities recentes du dialogue: 16h, biscuits, grignotage, faim, commande. | open |  | Tests paraphrase: demande "un seul truc demain" apres contexte alimentaire; recap final doit reprendre le dernier domaine. |
| `R1-B03` | T12-T13 | `BF-INTAKE-04` | `demotivation_repair` | ambiguity / nuance policy faim-stress | Sophia propose "pas de la faim"; l'utilisateur doit corriger que la faim peut etre reelle. | T12 phrase binaire; T13 reparation apres correction user. | Eviter les formulations qui nient la faim; proposer une phrase compatible avec faim reelle et pression emotionnelle. | open |  | Tests: stress + faim possible; invariant anti-restriction et anti-binarisation. |

