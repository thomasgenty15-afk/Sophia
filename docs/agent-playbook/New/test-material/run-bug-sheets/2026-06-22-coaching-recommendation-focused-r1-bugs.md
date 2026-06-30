# Bug Sheet - coachingrec-focused-20260622-r1

## R1-B01

- Bug id: R1-B01
- Tours: 4, 5
- Famille: BF-TEST-01 - Trace/test incoherent ou suite malsaine
- Domaine owner: runtime local / edge function QA
- Source amont: incidents HTTP locaux pendant `/functions/v1/test-send-message`.
- Symptome visible: deux `502` consecutifs, reponse assistant vide, aucune trace de routage exploitable.
- Preuve systeme:
  - T4 `http_status=502`, `assistant=""`, `executed_tools=[]`
  - T5 `http_status=502`, `assistant=""`, `executed_tools=[]`
  - T6 retry du meme message reussit en 200.
- Correction attendue: si recurrent, analyser logs runtime; ne pas masquer par fallback.
- Statut: open
- Fix reference: none
- Tests requis: verifier absence d'effet durable sur 502 et stabilite du retry.

## R1-B02

- Bug id: R1-B02
- Tours: 6
- Famille: BF-STATE-01 - Mauvaise transition de flow
- Domaine owner: `coaching_recommendation` local state lifecycle
- Source amont: apres reprise du tour en erreur, le flow produit une bonne reponse visible mais vide l'etat local.
- Symptome visible: T6 repond correctement "defense", mais l'etat apres tour a `visible_task=null`, `coaching_type=null`, `last_visible_decision=null`.
- Preuve systeme:
  - T6 `response_owner=coaching_recommendation`
  - T6 `route_reason=active_coaching_recommendation`
  - T6 state apres tour: `visible_task_after_turn=null`, `coaching_type_after_turn=null`
  - T7 perd ensuite l'ownership vers `product_help`.
- Correction attendue: T6 doit conserver `coaching_type=no_plan_action`, `visible_task=no_plan_coaching`, `last_visible_decision=free_defense_card`.
- Statut: open
- Fix reference: none
- Tests requis:
  - `coaching_only` puis "j'ouvre mais je ferme quand phrase froide" -> state actif conserve.
  - meme scenario apres retry technique -> state actif conserve.

## R1-B03

- Bug id: R1-B03
- Tours: 7
- Famille: BF-ROUTE-03 - Product/status/tool mal priorises
- Domaine owner: global dispatcher / active flow ownership
- Source amont: `product_help` reprend une question de destination qui est un follow-up direct d'une feature recommandee par coaching.
- Symptome visible: reponse textuelle correcte mais `response_owner=product_help`.
- Preuve systeme:
  - T7 `response_owner=product_help`
  - T7 `route_reason=product_help_signal`
  - User T7 demande "cette defense" juste apres la reclassification defense du coaching.
- Correction attendue: guidance produit liee a une recommendation coaching active doit rester `response_owner=coaching_recommendation`.
- Statut: open
- Fix reference: none
- Tests requis:
  - defense libre recommandee -> "ou la preparer ?" -> owner coaching, destination Ressources.
  - anti-FP: question produit standalone sans flow actif peut rester product_help.

## R1-B04

- Bug id: R1-B04
- Tours: 8
- Famille: BF-STATE-01 - Mauvaise transition de flow
- Domaine owner: global dispatcher -> `coaching_recommendation` local dispatcher
- Source amont: re-entree sans contexte local fiable classe l'action hors plan en `plan_action` et appelle `change_confirm_coaching_type`.
- Symptome visible: Sophia redemande le moment alors que "phrase froide" est deja fourni, et l'etat interne indique `coaching_type=plan_action`.
- Preuve systeme:
  - T8 `response_owner=coaching_recommendation`
  - T8 `visible_task=change_confirm_coaching_type`
  - T8 `coaching_type=plan_action`
  - Aucun `plan_item_id` ni action du plan n'a ete etablie dans le run.
- Correction attendue: reconstruire `no_plan_action` depuis le contexte recent; ne jamais produire `plan_action` sans action du plan canonique.
- Statut: open
- Fix reference: none
- Tests requis:
  - action hors plan -> perte/reprise -> reste `no_plan_action`.
  - "moment precis ?" apres phrase froide -> utilise le moment fourni, pas de clarification globale.
