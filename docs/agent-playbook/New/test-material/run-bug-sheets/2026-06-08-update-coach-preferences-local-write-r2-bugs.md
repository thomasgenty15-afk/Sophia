# Bug Sheet — 2026-06-08-update-coach-preferences-local-write-r2

## R2-B01

- Bug id: R2-B01
- Tours: Tour 1
- Famille: `BF-ROUTE-01` — mauvais owner selectionne
- Domaine owner: dispatcher / routing tool-skill `update_coach_preferences`
- Source amont: detection structurée d'intention durable coach preference dans le dispatcher global / arbitrage route
- Symptome visible: Sophia dit qu'elle va passer en mode direct avec moins de questions, mais aucune préférence durable n'est écrite.
- Preuve systeme:
  - `response_owner=normal_reply`
  - `selected_handler=null`
  - `route_reason=normal_reply_default`
  - `executed_tools=[]`
  - `committed_effects=[]`
  - DB après tour: `coach.question_tendency=normal`, pas `low`
- Correction attendue:
  - Représenter les demandes durables explicites de style coach comme `tool_skill_intents.update_coach_preferences`.
  - Sélectionner `selected_handler=update_coach_preferences` pour les formulations du type "pour la suite / dorénavant / à partir de maintenant" portant sur ton direct, moins de questions ou challenge.
  - Ne pas ajouter de regex métier dans `run.ts`; corriger la source amont dispatcher/contrat de routing.
- Statut: `fixed_prompt_needs_real_qa`
- Fix reference:
  - `supabase/functions/sophia-brain/dispatcher/dispatcher.prompts.ts`
  - `supabase/functions/sophia-brain/dispatcher/active_skill_descriptions.ts`
  - `supabase/functions/sophia-brain/dispatcher/dispatcher.test.ts`
- Tests requis:
  - Positif: "Pour la suite, limite vraiment les questions et réponds plus directement quand je suis bloqué." -> `update_coach_preferences` exécuté + DB.
  - Paraphrase: "Dorénavant, sois plus direct et pose moins de questions quand je bloque." -> `update_coach_preferences` exécuté + DB.
  - Anti-faux-positif: "Là maintenant, réponds direct et sans trop de questions." -> pas de write durable.
  - Integration: `/functions/v1/test-send-message` avec `force_full_ai=true`, vérification `executed_tools`, `committed_effects`, `user_profile_facts`.

## R2-B02

- Bug id: R2-B02
- Tours: Tour 1
- Famille: `BF-LEDGER-01` — claim sans commit
- Domaine owner: final response guard / routing-visible contract
- Source amont: conséquence du mauvais owner; l'intention durable n'étant pas représentée comme tool intent, le guard ne voit pas d'effet attendu non exécuté.
- Symptome visible: "je passe en mode direct: moins de questions" sans preuve `committed_effects`.
- Preuve systeme:
  - `response_owner=normal_reply`
  - `committed_effects=[]`
  - DB inchangée pour `coach.question_tendency`
- Correction attendue:
  - Fix principal via `R2-B01`.
  - Vérifier que les final guards bloquent les claims de préférence durable quand une intention tool-skill est représentée mais non commitée.
- Statut: `partially_addressed_needs_rerun`
- Fix reference:
  - fix principal via `R2-B01`
- Tests requis:
  - Test final guard sur claim visible "je le note / je passe en mode direct" avec intention `update_coach_preferences` non commitée.
  - Rerun QA après correction `R2-B01`.

## R2-B03

- Bug id: R2-B03
- Tours: Tour 2
- Famille: `BF-ROUTE-03` — product/status/tool mal priorises
- Domaine owner: dispatcher / routing `status_recap`
- Source amont: signal status read-only manquant pour les questions sur préférences coach actives
- Symptome visible: Sophia répond à une question de statut sur les préférences coach via `normal_reply` au lieu du runtime `status_recap`.
- Preuve systeme:
  - `response_owner=normal_reply`
  - `selected_handler=null`
  - `route_reason=normal_reply_default`
  - `executed_tools=[]`
  - `committed_effects=[]`
  - `toolSkillRun.selected_handler=status_recap` attendu mais absent
- Correction attendue:
  - Router les questions sur états réels actifs vers `status_recap` / `status_only_no_mutation_check`: préférences coach actives, actions actives, cartes attaque/défense, potions, rappels/statuts déjà supportés.
  - Garder `status_recap` read-only et DB-grounded.
  - Ne pas ajouter de regex métier dans `run.ts`; corriger la source amont dispatcher / skill signal / contrat de routing.
  - Ne pas masquer les commandes mutatives: "je veux changer mes préférences" doit rester éligible à `update_coach_preferences`, pas à `status_recap`.
- Statut: `open`
- Fix reference: n/a
- Tests requis:
  - Positif: "Tu peux me dire ce que tu as comme préférences coach actives maintenant ?" -> `toolSkillRun.selected_handler=status_recap`.
  - Positif: "Quelles actions sont actives maintenant ?" -> `status_recap`.
  - Positif: "Quelles cartes attaque/défense et potions sont actives ?" -> `status_recap`.
  - Anti-faux-positif: "Je veux changer mes préférences coach" -> route mutative `update_coach_preferences`, pas `status_recap`.

## R2-B04

- Bug id: R2-B04
- Tours: Couverture manquante detectee apres revue du Tour 2
- Famille: `BF-ROUTE-03` — product/status/tool mal priorises
- Domaine owner: runtime local `update_coach_preferences`
- Source amont: absence de branche sub-skill inline pour status/product help pendant un flow coach preferences actif
- Symptome visible potentiel: si le user demande "c'est quoi mes préférences coach actuelles ?" ou "à quoi correspondent les niveaux ?" pendant un flow actif `update_coach_preferences`, le système risque soit de sortir vers le global, soit de rendre une réponse interne non DB-grounded / non catalog-grounded.
- Preuve systeme:
  - Le run r2 ne couvre pas ce cas parce que Tour 1 n'a pas créé de flow actif.
  - Avant correction locale, `status_question` utilisait le helper interne `buildCoachPreferencesStatusReply` et `explain_preferences` restait dans le visible agent du flow, sans sub-skill `status_recap` / `product_help`.
- Correction attendue:
  - Pendant un flow actif `update_coach_preferences`, garder le dispatcher global skippe.
  - Pour `flow_action=status_question`, appeler `status_recap` comme sub-skill read-only DB-grounded, focus `coach_preferences`, puis revenir au flow local.
  - Pour `flow_action=explain_preferences`, appeler `product_help` comme sub-skill non-mutant avec `origin_flow=update_coach_preferences`, puis revenir au flow local.
  - Conserver `__coach_preference_flow_state_v1`, ajouter une trace `subskill_run`, et ne produire aucun `executedTools` / `committed_effects`.
- Statut: `fixed_local_unit`
- Fix reference:
  - `supabase/functions/sophia-brain/tools/operations/update_coach_preferences/router.ts`
  - `supabase/functions/sophia-brain/tools/operations/update_coach_preferences/state.ts`
  - `supabase/functions/sophia-brain/tools/operations/update_coach_preferences/tests.ts`
  - `docs/agent-playbook/New/runtime-contracts/tools/update-coach-preferences.md`
- Tests requis:
  - Unit: status question inside coach preference flow delegates to `status_recap` without write.
  - Unit: preference explanation inside coach preference flow delegates to `product_help` and preserves flow.
  - QA reel a rejouer: flow actif coach preferences -> question status -> sub-skill `status_recap`; flow actif coach preferences -> question explication -> sub-skill `product_help`.
