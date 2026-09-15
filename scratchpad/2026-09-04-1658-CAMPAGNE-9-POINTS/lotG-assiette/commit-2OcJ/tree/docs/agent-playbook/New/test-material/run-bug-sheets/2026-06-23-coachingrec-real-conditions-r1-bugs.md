# Bug Sheet - Coaching Recommendation Real Conditions R1

## Run

- Date: 2026-06-23
- Run id: `coachingrec-real-conditions-20260623-r1`
- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-23-coaching-recommendation-real-conditions-r1.md`
- Verdict global: red

## Bugs

### R1-B01

- Tours: T1
- Famille: `BF-STATE-01` - Mauvaise transition de flow; consequence `BF-ROUTE-01` - Mauvais owner selectionne
- Domaine owner: `coaching_recommendation`
- Source amont: local dispatcher / reducer / enforcement des exits in-scope au premier tour
- Symptome visible: le user demande "quoi dans Sophia" pour une action concrete du plan; Sophia donne un conseil generique et ne recommande pas de levier Sophia.
- Preuve systeme:
  - `selected_skill_id=coaching_recommendation`
  - `skill_status=exit`
  - `route_reason=coaching_recommendation_exit_to_global`
  - `response_owner=normal_reply`
  - `exit_reason=topic_change`
- Correction attendue: action du plan concrete + demande de levier Sophia ne peut pas sortir en `topic_change`; forcer `action_plan_coaching`, meme sans previous state.
- Statut: fixed
- Fix reference: `coaching_recommendation` reducer enforcement: non-critical `off_topic/topic_change` exits are neutralized when a first-turn structured coaching signal is clearly in-scope; stale `coaching_intent.kind=off_topic` is rewritten before reduction. Test: `coaching blocks initial exit for clear plan action coaching signal`.
- Tests requis:
  - Positif: initial user "j'ai [action] dans mon plan, je bloque, tu me conseillerais quoi dans Sophia ?" -> `coaching_recommendation`, `action_plan_coaching`.
  - Paraphrase: sans citer "carte", avec "quel levier", "quoi dans Sophia", "comment Sophia peut aider".
  - Anti-faux-positif: demande vraiment hors coaching peut sortir vers global.

### R1-B02

- Tours: T2
- Famille: `BF-TEST-01` - Trace/test incoherent ou suite malsaine
- Domaine owner: runtime local / Edge Function / LLM call path
- Source amont: endpoint `/functions/v1/test-send-message`
- Symptome visible: HTTP 502, reponse assistant vide.
- Preuve systeme:
  - `http_status=502`
  - `ok=false`
  - `response_owner=null`
  - aucune trace skill/router exploitable.
- Correction attendue: analyser les logs runtime si recurrent; le runner QA a correctement documente et repris sans fallback.
- Statut: open
- Fix reference: a creer si reproduction
- Tests requis:
  - Rejouer un tour similaire et verifier absence de 502.
  - Sur recurrence: inspecter logs Edge Function/LLM gateway.

### R1-B03

- Tours: T4-T6
- Famille: aucune bug family active, verification de fix
- Domaine owner: `coaching_recommendation`
- Source amont: comparaison leviers + ownership follow-up produit
- Symptome visible: correction validee; la potion est comparee mais non recommandee car l'emotion est liee a l'action du plan.
- Preuve systeme:
  - T4 `response_owner=coaching_recommendation`, `route_reason=active_coaching_recommendation`, `last_visible_decision.lever=attack_card`.
  - T5-T6 restent `active_coaching_recommendation`.
- Correction attendue: conserver comme invariant de regression.
- Statut: verified
- Fix reference: bloc comparaison leviers + garde anti-exit in-scope.
- Tests requis:
  - Garder le test local `coaching blocks exit when plan action user compares potion with active action card`.
  - Garder un rerun reel couvrant T4-T6.
