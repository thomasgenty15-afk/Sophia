# Run Bug Sheet - product-help-adjust-observability-20260613-r2

## R2-B01

- Bug id: R2-B01
- Tours: T1
- Famille: BF-ROUTE-03 - Product/status/tool mal priorises
- Domaine owner: `dispatcher-v2-llm` + `product_help.local_dispatcher`
- Source amont: note_information globale et arbitration Product Help entre `resources.attack_card` et `plan.adjustment`
- Symptome visible: Sophia conseille Carte d'attaque pour rendre une action du Plan plus concrete sans toucher au reste du Plan.
- Preuve systeme: `dispatcher-v2-llm` T1 recommande "Explain the Attack Card mechanism"; `product_help.local_dispatcher` T1 retourne `target.feature_id=resources.attack_card`, `object_type=attack_card`, alors que `grounding.catalog_feature_ids` contient aussi `plan.adjustment`.
- Correction attendue: le dispatcher global doit envoyer Product Help vers un cadrage `plan.adjustment` pour ce cas. Product Help doit faire primer le message courant sur une note_information amont polluee et choisir `feature_id=plan.adjustment`, `object_type=plan_item`.
- Statut: open
- Fix reference: none
- Tests requis: question informative Plan trop flou -> `plan.adjustment`; meme question avec note_information amont Carte d'attaque -> `plan.adjustment`; demande explicite Carte d'attaque -> `resources.attack_card`.

## R2-B02

- Bug id: R2-B02
- Tours: T2
- Famille: BF-STATE-01 - Mauvaise transition de flow
- Domaine owner: `adjust_plan_item.local_dispatcher`
- Source amont: stage decision / completeness threshold
- Symptome visible: apres demande d'ajuster une action trop vague, le flow livre directement un brouillon generique avec exemple au lieu de demander le contenu concret manquant.
- Preuve systeme: T2 `adjust_plan_item.local_dispatcher` retourne `flow_action=prepare_plan_handoff`, `visible_task=plan_handoff_ready`, alors que le user n'a pas encore donne les options concretes.
- Correction attendue: si le user indique seulement "rendre plus concret" sans contenu concret, rester en `clarify_adjustment_need`; passer a `prepare_plan_handoff` seulement apres collecte du contenu ou de la contrainte suffisante.
- Statut: open
- Fix reference: none
- Tests requis: demande vague d'ajustement -> clarification; demande avec contenu concret -> handoff ready; anti-faux-positif: ne pas redemander si le contenu concret est deja fourni.
