# Bug Sheet — Clarification Corrections Validation

## R3-B01

- Tours: Tour 3 — `clarification-corrections-20260603-r3-product-help-antifp`
- Famille: `BF-RENDER-01` — Réponse incomplète ou surface mal rendue
- Domaine owner: product_help
- Source amont: knowledge/renderer product_help pour la comparaison attack card
  vs defense card
- Symptome visible: Sophia route correctement vers `product_help`, mais explique
  surtout la carte de défense au lieu de comparer clairement attaque et défense.
- Preuve systeme: `response_owner=product_help`,
  `selected_handler=product_help`, `executed_tools=[]`, réponse centrée sur
  `Carte de defense`.
- Correction attendue: ajouter une ressource product_help comparative
  attaque/défense et vérifier que les demandes d'explication ne produisent pas
  de tool_skill_intent.
- Statut: `reopened`
- Fix reference: `resources.attack_vs_defense_cards`,
  `product_help_prompt_v2_structured_intake_s26_compare_catalog`, tests
  `product_help compares attack and defense cards as a catalog resource` +
  `product_help compare resource has paraphrase coverage without replacing single-card help`,
  runs réels `clarification-product-help-compare-20260603-r1` +
  `product-help-antipatch-matrix-20260603-r1`.
- Tests requis: run réel “Explique-moi la différence entre une carte d'attaque
  et une carte de défense” vert; paraphrase “attaque vs défense” verte; test
  product_help knowledge/renderer vert; anti-faux-positif “créer une carte de
  défense et une carte d'attaque” vert via `orientation_clarification`;
  résolution vers `prepare_defense_card` sans exécution durable; interruption
  produit/status verte.

## R3-B02

- Tours: Tour 2 — `product-help-antipatch-matrix-20260603-r1`
- Famille: `BF-RENDER-01` — Réponse incomplète ou surface mal rendue
- Domaine owner: product_help
- Source amont: intake/renderer `product_help` pour `compare_features`
- Symptome visible: Sophia répète presque texto la comparaison du tour 1 alors
  que le user demande “je choisis quoi quand je veux juste me mettre à l'action
  ?”.
- Preuve systeme: `response_owner=product_help`,
  `selected_handler=product_help`, `executed_tools=[]`, réponse identique au
  bloc catalogue comparatif précédent.
- Correction attendue: rendre `compare_features` capable de produire une réponse
  contextualisée ou un fallback court de choix, sans regex de routing et sans
  mutation.
- Statut: `reopened`
- Fix reference: renderer `compare_features`,
  `product_help_prompt_v2_structured_intake_s27_targeted_rendering`, tests
  `product_help compare fallback is a targeted choice, not a catalog block` +
  `product_help compare accepts a structured targeted reply`, run réel
  `product-help-render-fix-20260603-r1`; réouvert par le rerun réel
  `product-help-render-rerun-20260603-r2`, où le follow-up a de nouveau rendu le
  bloc catalogue au lieu d'une réponse de choix.
- Tests requis: paraphrase “attaque vs défense, je choisis quoi pour me mettre à
  l'action ?” non identique au bloc catalogue; réponse oriente vers carte
  d'attaque pour démarrer; anti-faux-positif création attack+defense reste
  clarification.

## R3-B03

- Tours: Tour 5 — `product-help-antipatch-matrix-20260603-r1`
- Famille: `BF-RENDER-01` — Réponse incomplète ou surface mal rendue
- Domaine owner: product_help
- Source amont: renderer `product_help` pour `where_is_it` / localisation
  conditionnelle
- Symptome visible: Sophia répond par une fiche catalogue complète au lieu de
  répondre directement à “où je la retrouverai si elle existe”.
- Preuve systeme: `response_owner=product_help`,
  `selected_handler=product_help`, `executed_tools=[]`, réponse longue “Carte
  d'attaque / Comment l'utiliser / Ce que ça apporte / Important”.
- Correction attendue: pour `where_is_it`, rendre une réponse courte
  localisation + limite d'existence, sans dérouler le modèle complet.
- Statut: `reopened`
- Fix reference: renderer `where_is_it`, test
  `product_help where_is_it answers conditional card location without the full template`,
  run réel `product-help-render-fix-20260603-r1`; réouvert par le rerun réel
  `product-help-render-rerun-20260603-r2`, où la réponse est restée non mutante
  mais trop vague sur la localisation et a posé une question inutile.
- Tests requis: question “où je retrouverai une carte d'attaque si elle existe”
  rend localisation conditionnelle et limite d'existence; ne rend pas
  `Ce que ca apporte`; n'exécute aucun tool.
