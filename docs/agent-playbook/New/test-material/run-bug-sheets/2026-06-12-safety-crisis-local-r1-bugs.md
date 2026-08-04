# Bug Sheet - 2026-06-12-safety-crisis-local-r1

## R1-B01

- Bug id: `R1-B01`
- Tours: 4
- Famille: `BF-LEDGER-01`
- Domaine owner: final response pipeline / safety visible guard
- Source amont: reponse visible produite malgre `direct_effects=[]`, `executed_tools=[]`, `durable_effect=[]`
- Symptome visible: Sophia dit "je te mets un rappel dans 30 minutes" alors qu'aucun rappel n'est cree.
- Preuve systeme: tour 4 `response_owner=safety`, `selected_handler=safety_crisis`, `direct_effects=[]`, `executed_tools=[]`, `durable_effect=[]`.
- Correction attendue: interdire tout claim de creation/programmation sans commit EffectLedger; pendant safety, repondre que le rappel est differe et recentrer sur aide humaine/urgence.
- Statut: `open`
- Fix reference: none
- Tests requis: QA local avec demande de rappel pendant safety; unit/integration guard qui refuse les formulations de creation quand `committed=[]`.

## R1-B02

- Bug id: `R1-B02`
- Tours: 4
- Famille: `BF-STATE-01`
- Domaine owner: `safety_crisis` reducer/runtime handoff
- Source amont: sortie/resolution safety avec `local_flow_exit_handoff` alors que le meme message contient une demande de tool creation sensible.
- Symptome visible: la contrainte `deferred_product_or_tool_request` existe dans la note/handoff, mais la reponse finale ne l'applique pas.
- Preuve systeme: `local_flow_exit_handoff.note_information.structured_context.deferred_product_or_tool_request.attempted=true`, `attempt_kind=tool_creation`, `defer_reason` present; reponse visible affirme pourtant la creation du rappel.
- Correction attendue: si `product_tool_boundary.attempted=true`, garder une visible task de boundary ou propager une contrainte finale bloquante; ne pas laisser un second passage global produire un claim produit/outil.
- Statut: `open`
- Fix reference: none
- Tests requis: safety actif + demande de rappel/potion/statut; verifier `visible_task.kind=product_tool_boundary` ou equivalent, aucun handoff global contournant le defer, aucun claim sans commit.

