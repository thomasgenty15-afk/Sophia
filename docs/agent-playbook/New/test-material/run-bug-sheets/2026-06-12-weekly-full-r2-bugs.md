# Run Bug Sheet — weekly-full-r2

Run: `weekly-full-r2-partial_habits_mission_partial`  
Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-12-weekly-full-r2.md`  
Date: 2026-06-12

## R2-B01

- Tours: Tour 1
- Famille: a classifier — product_help destination grounding
- Domaine owner: `product_help`
- Source amont: visible/context grounding pour `where_is_it` en mode inline depuis weekly.
- Symptome visible: Sophia repond que les cartes d'attaque sont dans "ton espace personnel", mais ne donne pas la surface utile attendue.
- Preuve systeme: `weekly_adaptive_review_v1` -> `inline_tool_roundtrip`, `target_dispatcher=product_help`, aucun `prepare_attack_card`, aucun effet durable.
- Correction attendue: transmettre et faire utiliser les surfaces catalogue exactes dans `visible_task.conversation_context` pour les questions de destination produit.
- Statut: open
- Fix reference: none
- Tests requis: question `ou retrouver carte d'attaque` en product_help standalone et inline weekly; verifier pas de handoff et mention destination catalogue utile.

## R2-B02

- Tours: Tour 3
- Famille: BF-STATE-01 — mauvaise transition de flow
- Domaine owner: `weekly_review`
- Source amont: prompt visible stage-specific `complete_no_change` apres `complete_flow`.
- Symptome visible: le weekly est ferme systemiquement mais Sophia finit par "On se retrouve dans ton plan pour démarrer ?", ce qui ressemble a une relance de flow.
- Preuve systeme: `flow_action=complete_flow`, `status=closed`, `validation_unlock_status=available`, `child_flow.status=completed`, aucun effet durable.
- Correction attendue: quand le reducer ferme le weekly, le visible agent doit produire une cloture explicite, sans nouvelle question ni relance Plan.
- Statut: open
- Fix reference: none
- Tests requis: weekly avec child flow completed puis user dit "on peut conclure"; verifier `complete_flow` + message final sans question.

## R2-B03

- Tours: setup/ouverture
- Famille: BF-TEST-01 — trace/test incoherent ou suite malsaine
- Domaine owner: testability weekly/process-checkins
- Source amont: absence de mode QA cible pour generer une ouverture weekly via `process-checkins` sans traiter la file globale et sans wrapper de secrets hors Edge Runtime.
- Symptome visible: ouverture du run seedee via fixture scoped avec texte IA deja genere, pas regeneree dans ce run.
- Preuve systeme: tentative de setup IA fraiche `weekly-full-r1` echoue faute `OPENAI_API_KEY`; wrapper d'injection secrets refuse par garde-fou; run final utilise `opening_override`.
- Correction attendue: ajouter un mode QA interne cible par `user_id` ou `scheduled_checkin_id`, ou un harness officiel d'ouverture weekly qui passe par Edge Runtime sans traiter les checkins hors scope.
- Statut: open
- Fix reference: none
- Tests requis: process-checkins weekly cible un seul user QA, produit l'ouverture, puis conversation full IA jusqu'a cloture avec cleanup scoped.
