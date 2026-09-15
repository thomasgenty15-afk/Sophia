# Bug Sheet - product_help_local_skip_20260622_r1

## R1-B01

- Tours: T2, T6
- Famille: `BF-LEDGER-02`
- Domaine owner: direct effect confirmation pipeline / final response composition
- Source amont: confirmation d'effet durable rendue deux fois, une fois depuis le hint runtime et une fois par le visible agent.
- Symptome visible: Sophia repete deux fois "C'est programme..." dans la meme reponse.
- Preuve systeme: `direct_effect_lane.visible_confirmation_hint` present; `tool_skill_run.committed_effects` present; reponse visible contient deux confirmations.
- Correction attendue: rendre la confirmation d'un direct effect single-owner; si le runtime fournit une confirmation committee, le prompt visible doit seulement continuer le besoin restant sans reformuler la confirmation.
- Statut: `open`
- Fix reference: none
- Tests requis: reminder + question produit meme tour; reminder pendant flow actif; verification qu'une seule confirmation visible apparait.

## R1-B02

- Tours: T6
- Famille: `BF-INTAKE-02`
- Domaine owner: one-shot reminder intake / local parser fallback
- Source amont: extraction du texte de rappel trop large dans une phrase composite.
- Symptome visible: le rappel porte sur "choisir la carte, et sinon pour l'instant je garde cette piste" au lieu de "choisir la carte".
- Preuve systeme: `tool_skill_run.committed_effects[0].reminder_instruction` et `scheduled_checkins.message_payload.reminder_instruction` contiennent la phrase polluee.
- Correction attendue: isoler l'objet utile du rappel et exclure les clauses conversationnelles secondaires non temporelles/non actionnables.
- Statut: `open`
- Fix reference: none
- Tests requis: rappel ponctuel avec clause secondaire; rappel ponctuel + continuation de flow; anti-faux-positif ou la clause secondaire fait reellement partie du rappel.

## R1-B03

- Tours: T5
- Famille: `BF-ROUTE-03`
- Domaine owner: active local flow dispatcher / Product Help inline bridge
- Source amont: question explicitement produit repondue par `coaching_recommendation` sans trace d'enrichissement ou de detour Product Help.
- Symptome visible: reponse correcte, mais owner systeme ambigu.
- Preuve systeme: `response_owner=coaching_recommendation`, `selected_handler=coaching_recommendation`, `route_reason=active_coaching_recommendation`, message user "cote produit".
- Correction attendue: conserver le parent actif, mais exposer explicitement le bridge/enrichment Product Help quand une question produit est traitee pendant un flow parent.
- Statut: `open`
- Fix reference: none
- Tests requis: active coaching + question produit inline; active plan flow + question produit inline; verifier parent conserve et trace de bridge.

## R1-B04

- Tours: T1-T6
- Famille: `BF-TEST-01`
- Domaine owner: trace persistence / test endpoint observability
- Source amont: traces renvoyees par endpoint mais non persistantes dans `conversation_turn_traces` pour ce run; `effect_ledger.counts` a 0 malgre committed effects.
- Symptome visible: aucun impact user direct, mais diagnostic post-run incomplet.
- Preuve systeme: query DB `conversation_turn_traces` par `user_id` et par `turn_id like product_help_local_skip_20260622_r1*` retourne `[]`; raw endpoint contient pourtant `conversation_turn_trace`.
- Correction attendue: garantir persistence trace pour `/test-send-message` force_full_ai local ou documenter explicitement une autre table/source canonique; aligner `effect_ledger` avec `tool_skill_run.committed_effects`.
- Statut: `open`
- Fix reference: none
- Tests requis: run local force_full_ai verifie trace DB; direct effect commit visible dans ledger; active local flow trace persistente.
