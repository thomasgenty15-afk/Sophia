# Bug Sheet - Demotivation Local Flow Real R1

Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-08-demotivation-repair-local-flow-real-r1.md`

## R1-B01

- Bug id: `R1-B01`
- Tours: 2
- Famille: `BF-STATE-01` - mauvaise transition de flow
- Domaine owner: `flow_opportunity_verification` / activation `demotivation_repair`
- Source amont: local dispatcher + runtime launch target flow
- Symptome visible: apres consentement, Sophia dit qu'elle n'arrive pas a lancer le flow cible.
- Preuve systeme: `tool_skill_run.status=blocked`, `reason_code=flow_opportunity_verification_target_flow_launch_failed`, `blocked_effects=[{ type: "target_flow", reason_code: "target_flow_launch_failed" }]`, `target_flow=demotivation_repair`.
- Correction attendue: rendre `demotivation_repair` launchable depuis le verifier d'opportunite ou bypasser ce verifier quand le signal conversationnel peut entrer directement dans le flow local.
- Statut: `open`
- Fix reference: none
- Tests requis: positif acceptation explicite, paraphrase de consentement, anti-faux-positif refus "pas maintenant", integration endpoint `test-send-message` avec `force_full_ai=true`.

## R1-B02

- Bug id: `R1-B02`
- Tours: 3
- Famille: `BF-ROUTE-01` - mauvais owner selectionne
- Domaine owner: route policy / active flow recovery
- Source amont: arbitration apres echec de lancement target flow
- Symptome visible: Sophia recupere humainement, mais le flow `demotivation_repair` n'est pas repris malgre un signal lifecycle high.
- Preuve systeme: `response_owner=normal_reply`, `route_reason=normal_reply_default`, `skill_signals.lifecycle.demotivation_repair.detected=true`, confidence high.
- Correction attendue: apres un launch failure ou un signal lifecycle high, router vers le flow local cible si disponible, ou produire une sortie de recovery explicite sans perdre l'ownership.
- Statut: `open`
- Fix reference: none
- Tests requis: reprise apres target launch failed, lifecycle signal high -> owner demotivation, anti-faux-positif normal reply quand signal faible.

## R1-B03

- Bug id: `R1-B03`
- Tours: 4
- Famille: `BF-INTAKE-03` - contrainte explicite perdue
- Domaine owner: `select_state_potion.clarte`
- Source amont: intake constraints + slot filler
- Symptome visible: l'utilisateur demande "courte" et "sans refaire tout le diagnostic", mais Sophia redemande une clarification diagnostique.
- Preuve systeme: `tool_skill_intent.operation_input.constraints=["courte","sans refaire tout le diagnostic"]`, puis `tool_skill_run.status=clarifying`, `reason_code=clarte_field_missing`.
- Correction attendue: consommer les contraintes extraites dans la policy de slot; utiliser le contexte conversationnel comme evidence si suffisant.
- Statut: `open`
- Fix reference: none
- Tests requis: contrainte "sans diagnostic" respectee, variante "fais court", anti-faux-positif quand le champ essentiel est vraiment absent.

## R1-B04

- Bug id: `R1-B04`
- Tours: 5
- Famille: `BF-INTAKE-01` - slot fourni mais redemande
- Domaine owner: `select_state_potion.clarte`
- Source amont: reducer / draft lifecycle
- Symptome visible: apres avoir donne le champ demande, l'utilisateur doit encore confirmer une reformulation au lieu d'obtenir la potion courte.
- Preuve systeme: `tool_skill_run.status=clarifying`, `reason_code=clarte_field_proposed`, aucun effet demande ou bloque.
- Correction attendue: distinguer validation de champ avant effet durable et generation visible sans commit; eviter une deuxieme question si le user demande explicitement la sortie courte.
- Statut: `open`
- Fix reference: none
- Tests requis: champ fourni -> sortie courte, confirmation exigee seulement quand commit durable prevu, paraphrases du slot fourni.

## R1-B05

- Bug id: `R1-B05`
- Tours: 6
- Famille: `BF-EFFECT-02` - effet attendu absent
- Domaine owner: `select_state_potion` handoff / effect bridge
- Source amont: chat execution policy + effect adapter
- Symptome visible: Sophia dit avoir prepare une Potion de clarte mais renvoie vers l'onglet Etat / Potions pour saisie manuelle.
- Preuve systeme: `tool_skill_run.status=apply_attempt`, `reason_code=clarte_apply_attempt_no_chat_execution`, `committed_effects=[]`, DB `user_potion_sessions=0`.
- Correction attendue: soit supporter un commit chat via effect ledger avec confirmation claire, soit rendre le wording produit explicitement manuel/prefill sans claim de preparation active.
- Statut: `open`
- Fix reference: none
- Tests requis: demande explicite de potion -> commit ou prefill contractuel, no-claim sans commit, DB assertion `user_potion_sessions` / ledger.
