# Bug Sheet - daily-bridge-child-flow-20260630-r1

## R1-B01

- Tours: 5
- Famille: `BF-ROUTE-01`
- Domaine owner: `whatsapp-webhook` pending runtime
- Source amont: `handleActionEveningReviewReply`, branche `parsed.childFlowHandoff`
- Symptome visible: Sophia demande "quelle action precise" alors que le daily vient de cibler `Respiration cinq minutes`.
- Preuve systeme: pending payload contient `child_flow_handoff.child_flow=daily_action_coaching_recommendation_v1`, mais assistant metadata indique `response_owner=coaching_recommendation`, `selected_handler=coaching_recommendation`.
- Correction attendue: le pending handler doit consommer le tour apres handoff child specialise et ne pas laisser le dispatcher global traiter le meme message.
- Statut: `open`
- Fix reference: n/a
- Tests requis: integration webhook daily handoff, assertion aucun `response_owner=coaching_recommendation` sur le tour de handoff specialise.

## R1-B02

- Tours: 7
- Famille: `BF-PROACTIVE-01`
- Domaine owner: `daily_action_review_v1`
- Source amont: target resolution / compiler `child_flow_context`
- Symptome visible: la recommandation semble plausible, mais le contexte structure vise une autre action que celle dont le user parle.
- Preuve systeme: user repond a `Ranger deux papiers administratifs`; daily item update met bien cet item en `missed`, mais `child_flow_context.action_context.title=Préparer la pochette documents`.
- Correction attendue: construire `child_flow_context.action_context` uniquement depuis l'occurrence resolue du message courant; si plusieurs occurrences restent possibles, clarification avant handoff.
- Statut: `open`
- Fix reference: n/a
- Tests requis: unit local flow + integration webhook avec deux targets dans le focus; la target du child context doit etre celle de `resolved_occurrence_ids`.

## R1-B03

- Tours: 6-9
- Famille: `BF-STATE-01`
- Domaine owner: active skill lifecycle / pending daily ownership
- Source amont: state cleanup apres capture globale incorrecte et apres cloture daily
- Symptome visible: pas bloquant dans ce run, mais risque que le prochain message soit capture par un active skill stale.
- Preuve systeme: `__active_skill_state.skill_id=coaching_recommendation` reste present apres retour daily et meme apres pending `done`.
- Correction attendue: une fois le bridge specialise corrige, verifier que le state actif est `daily_action_coaching_recommendation_v1` pendant le child flow puis nettoye au retour parent / cloture daily.
- Statut: `open`
- Fix reference: n/a
- Tests requis: integration lifecycle: apres completion daily, pas d'active skill stale general coaching.
