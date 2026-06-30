# Bug Sheet - Coaching Recommendation Postfix R1

Run: `coachingrec-postfix-20260618-r1`

## R1-B01

- Tours: 1-2
- Famille: BF-ROUTE-01 - Mauvais owner selectionne
- Domaine owner: `coaching_recommendation` + active flow routing
- Source amont: local reducer/state persistence, active flow ownership
- Symptome visible: le suivi "ou ajuster cette action" part vers `product_help`.
- Preuve systeme: T1 `route_reason=coaching_recommendation_exit_to_global`; T2 `response_owner=product_help`, `route_reason=product_help_signal`.
- Correction attendue: apres une recommandation coaching non close, conserver l'active state coaching; les questions "ou trouver/comment preparer" liees au levier recommande doivent aller au visible agent courant.
- Statut: open
- Fix reference: a faire
- Tests requis: run reel T1 plan action recommendation puis T2 guidance; unit test active state non null apres recommandation initiale.

## R1-B02

- Tours: 1
- Famille: BF-STATE-01 - Mauvaise transition de flow
- Domaine owner: `coaching_recommendation` local reducer
- Source amont: mapping `flow_action` / `close_after_visible` / complete-vs-continue
- Symptome visible: la premiere recommandation semble clore ou sortir le flow alors que le user a naturellement un suivi produit.
- Preuve systeme: `response_owner=normal_reply`, `route_reason=coaching_recommendation_exit_to_global`, pas de `selected_skill_id`.
- Correction attendue: distinguer "recommandation donnee mais flow ouvert pour suivi" de "coaching termine"; ne sortir que sur signal utilisateur de cloture ou off-topic.
- Statut: open
- Fix reference: a faire
- Tests requis: reducer conserve `coaching_recommendation_local_state` apres `recommend_feature` non clos.

## R1-B03

- Tours: 5
- Famille: BF-INTAKE-01 - Slot fourni mais redemande
- Domaine owner: `coaching_recommendation` local dispatcher
- Source amont: changement de type vers emotional trop clarifie
- Symptome visible: Sophia demande si c'est emotionnel alors que le user dit "état émotionnel" et "potion".
- Preuve systeme: T5 `response_owner=coaching_recommendation`, reply de clarification type.
- Correction attendue: si le signal entrant est explicitement emotionnel/potion avec confidence suffisante, router directement `emotion_coaching`; `change_confirm` seulement pour ambiguite reelle.
- Statut: open
- Fix reference: a faire
- Tests requis: active no-plan puis user "ce n'est plus l'action, c'est mon état émotionnel/potion" -> `emotion_coaching` direct.

## Verifications Positives

- T3: carte d'attaque libre hors plan autorisee par `coaching_recommendation`.
- T4: suivi "ou preparer" d'une carte libre garde `active_coaching_recommendation`.
- T6: confirmation "état émotionnel" consommee et potion recommandee.
