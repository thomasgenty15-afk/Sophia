# Bug Sheet - Coaching Recommendation Active Ownership R1

## Run

- Date: 2026-06-18
- Run id: `coachingrec-active-ownership-20260618-r1`
- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-18-coaching-recommendation-active-ownership-r1.md`
- Cadre: IA reelle locale, `/functions/v1/test-send-message`, `force_full_ai=true`

## Bugs

### R1-B01

- Tours: 1
- Famille: `BF-STATE-01` - Mauvaise transition de flow
- Domaine owner: `coaching_recommendation`
- Source amont: reducer/local dispatcher de `coaching_recommendation`, transition de sortie `handoff`
- Symptome visible: Sophia ne repond pas; HTTP 409 et assistant vide.
- Preuve systeme: `response_owner=coaching_recommendation`, `selected_handler=coaching_recommendation`, `safety=none`, mais `skill_run.status="handoff"`; temp memory contient `handoff_reason="safety"` et `target_dispatcher="safety_crisis"`.
- Correction attendue: un blocage de lancement d'action doit rester dans le flow coaching et produire un visible agent; aucune transition safety ne doit etre emise sans safety pregate ou signal safety explicite.
- Statut: `open`
- Fix reference: a faire
- Tests requis: test positif premier tour `launch_blocker`; test anti-faux-positif safety avec `safety=none`; test integration HTTP 200 + assistant non vide + active state coaching.

### R1-B02

- Tours: 5
- Famille: `BF-LEDGER-02` - Commit reel mal rendu
- Domaine owner: final response pipeline / direct effect confirmation pipeline
- Source amont: composition de la confirmation `create_one_shot_reminder` avec la reponse du visible agent coaching.
- Symptome visible: confirmation de rappel rendue deux fois avant le conseil coaching.
- Preuve systeme: `route_reason=active_coaching_recommendation_with_direct_effects`, `executed_tools=["create_one_shot_reminder"]`, `tool_execution=success`, un seul `scheduled_checkin` cree, mais texte visible contient deux confirmations.
- Correction attendue: le direct effect doit fournir une confirmation unique au visible agent ou au final composer; le renderer final doit dedupliquer les confirmations de commit tout en gardant la reponse coaching.
- Statut: `open`
- Fix reference: a faire
- Tests requis: integration multi-intention "rappel ponctuel + coaching" avec checkin count = 1, confirmation visible unique, owner `coaching_recommendation`, conseil coaching present.

## Verifications Positives A Garder

- Tour 3: un signal `product_help` pendant flow coaching actif ne vole pas l'owner; `active_owner=coaching_recommendation`, `route_reason=active_coaching_recommendation`.
- Tour 5: un direct effect `create_one_shot_reminder` peut etre execute tout en gardant `response_owner=coaching_recommendation`.
