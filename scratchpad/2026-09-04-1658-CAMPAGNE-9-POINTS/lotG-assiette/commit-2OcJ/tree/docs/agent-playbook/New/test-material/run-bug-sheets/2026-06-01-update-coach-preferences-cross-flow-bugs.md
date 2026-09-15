# Bugs - Update Coach Preferences Cross-Flow QA

Cadre: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`,
runs `qa-coach-pref-crossflow-1780348629248` et
`qa-coach-pref-crossflow-focus-1780348860768`.

## CFX-B01

- Bug id: CFX-B01
- Tours: 1
- Famille: `BF-ROUTE-01` - Mauvais owner selectionne
- Domaine owner: dispatcher / central arbitrator
- Source amont: routing tool_skill vs conversation skill
- Symptome visible: "Prepare une carte d'attaque..." recoit "Je ne l'ai pas modifie" et part vers `execution_breakdown`.
- Preuve systeme: `response_owner=conversation_handler`, `selected_handler=execution_breakdown`, aucun `prepare_attack_card`.
- Correction attendue: une creation/preparation explicite de carte d'attaque doit demarrer `prepare_attack_card`, sauf question produit/status claire.
- Statut: fixed
- Fix reference: `turn_intent_arbitrator.ts` + `turn_intent_arbitrator.test.ts`
- Tests requis: demande carte d'attaque simple; demande carte avec "ne cree rien"; anti-FP question produit "ou retrouver une carte".
- Preuve actuelle: tests unitaires cibles verts; pas de rerun QA reel apres correction.

## CFX-B02

- Bug id: CFX-B02
- Tours: 4
- Famille: `BF-ROUTE-03` - Product/status/tool mal priorises
- Domaine owner: central arbitration / status guard
- Source amont: `status_recap_request_blocks_tool_start`
- Symptome visible: une demande de rappel recurrent est traitee comme statut: "Je ne l'ai pas enregistre."
- Preuve systeme: `selected_handler=status_recap`, `route_reason=status_recap_request_blocks_tool_start`, aucun `create_recurring_reminder`.
- Correction attendue: une intention explicite `create_recurring_reminder` doit battre le status guard quand le message demande de mettre en place/programmer un rappel.
- Statut: fixed
- Fix reference: `turn_intent_arbitrator.ts` + `turn_intent_arbitrator.test.ts`
- Tests requis: rappel recurrent hebdo explicite; anti-FP "est-ce que le rappel est enregistre ?".
- Preuve actuelle: tests unitaires cibles verts; pas de rerun QA reel apres correction.

## CFX-B03

- Bug id: CFX-B03
- Tours: 6
- Famille: `BF-ROUTE-02` - Ancien flow capture une nouvelle intention
- Domaine owner: active handoff arbitration / update_coach_preferences router
- Source amont: handoff preference actif
- Symptome visible: "Reprends le rappel recurrent d'avant" est capture par `update_coach_preferences` et finit en erreur technique.
- Preuve systeme: `selected_handler=update_coach_preferences`, `route_reason=active_handoff_revise_handoff`, `turn_frame.tool_skill_intents=create_recurring_reminder explicit/high/none`, `operation_status=blocked`.
- Correction attendue: un handoff preference actif doit laisser sortir une intention tool explicite concurrente non ambigue, surtout quand le message contient "reprends le rappel/la carte".
- Statut: fixed
- Fix reference: `handoff_flow_arbitration.ts`, `run.ts`, `handoff_flow_arbitration_test.ts`
- Tests requis: preference handoff actif + reprise rappel; preference handoff actif + reprise carte; anti-FP "redis-moi quoi changer" reste preference.
- Preuve actuelle: tests unitaires cibles verts; pas de rerun QA reel apres correction.

## CFX-B04

- Bug id: CFX-B04
- Tours: 8
- Famille: `BF-ROUTE-02` - Ancien flow capture une nouvelle intention
- Domaine owner: active handoff arbitration / clarification arbitration
- Source amont: handoff defense actif devant preference durable explicite
- Symptome visible: une demande "Preference coach tres claire : pour la suite..." pendant une carte de defense active demande une clarification au lieu de lancer le handoff preference.
- Preuve systeme: `response_owner=orientation_clarification`, `selected_handler=orientation_clarification`, aucun `tool_skill_intents.update_coach_preferences`.
- Correction attendue: une preference coach explicite durable doit interrompre un handoff plateforme actif et router vers `update_coach_preferences`, sans mutation.
- Statut: fixed
- Fix reference: `handoff_flow_arbitration.ts`, `run.ts`, `handoff_flow_arbitration_test.ts`
- Tests requis: defense handoff + preference coach explicite; attack handoff + preference coach explicite; recurring handoff + preference coach explicite; anti-FP "moins doux" dans preference handoff reste revise_handoff.
- Preuve actuelle: tests unitaires cibles verts; pas de rerun QA reel apres correction.

## CFX-B05

- Bug id: CFX-B05
- Tours: 9
- Famille: `BF-ROUTE-02` - Ancien flow capture une nouvelle intention
- Domaine owner: orientation clarification arbitration / active flow state
- Source amont: resolution de clarification apres conflit defense vs preference
- Symptome visible: apres "Est-ce que tu veux modifier tes preferences ou continuer la carte ?", le user repond "Je choisis les preferences coach..." mais Sophia repete la carte de defense.
- Preuve systeme: `selected_handler=prepare_defense_card`, `route_reason=active_handoff_repeat_handoff`, `operation_status=repeat_handoff`.
- Correction attendue: la reponse explicite a la clarification doit router vers `update_coach_preferences` et suspendre/clear le handoff defense.
- Statut: fixed
- Fix reference: `handoff_flow_arbitration.ts`, `run.ts`, `handoff_flow_arbitration_test.ts`
- Tests requis: clarification conflict defense/preference -> user choisit preferences; user choisit carte; user change de sujet explicite.
- Preuve actuelle: tests unitaires cibles verts; pas de rerun QA reel apres correction.
