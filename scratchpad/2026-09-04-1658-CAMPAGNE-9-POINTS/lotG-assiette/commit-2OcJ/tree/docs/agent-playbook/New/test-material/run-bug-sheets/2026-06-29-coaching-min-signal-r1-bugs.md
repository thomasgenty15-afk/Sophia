# Bug Sheet - coaching_min_signal_20260629_r1

## R1-B01

- Bug id: `R1-B01`
- Tours: T1
- Famille: `BF-INTAKE-04` - Ambiguite non reconnue
- Domaine owner: global dispatcher
- Source amont: `skill_signals.coaching_recommendation.context.needs_type_confirmation`
- Symptome visible: aucun probleme visible direct; Sophia repond correctement.
- Preuve systeme: contexte minimal correct, mais `needs_type_confirmation=true` alors que `coaching_type=plan_action`, `action_context.source=plan`, `plan_item_id` et `action_title` sont resolus.
- Correction attendue: le dispatcher global doit mettre `needs_type_confirmation=false` quand une action du plan est resolue sans conflit explicite de cible.
- Statut: `open`
- Fix reference: a creer.
- Tests requis: test dispatcher sur plan action resolue; paraphrase avec action du plan nommee; anti-faux-positif avec relation au plan ambigue.

## R1-B02

- Bug id: `R1-B02`
- Tours: T5
- Famille: `BF-TEST-01` - Trace/test incoherent ou suite malsaine
- Domaine owner: QA runtime local / `test-send-message`
- Source amont: upstream Edge/LLM ou gateway local
- Symptome visible: reponse vide, HTTP 502.
- Preuve systeme: raw response `{"message":"An invalid response was received from the upstream server"}`, aucune `route_decision`, aucun `turn_frame`, aucun owner.
- Correction attendue: relancer le cas emotion globale dans un run dedie; si 502 recidive, instrumenter/capturer la cause provider/runtime.
- Statut: `open`
- Fix reference: a creer.
- Tests requis: run IA reel local avec message emotion globale, assertion `response_owner=coaching_recommendation`, `coaching_type=emotional`, visible emotionnel.
