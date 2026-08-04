# Bug Sheet - select_state_potion x emotional_repair verified rerun - 2026-06-01

## ER-POT-VERIFY-B01

- Bug id: `ER-POT-VERIFY-B01`
- Tours: `qa-potion-emorepair-verified-r3` T2-T3
- Famille: `BF-ROUTE-01`
- Domaine owner: orientation clarification resolver / operation runtime pipeline
- Source amont: resolution du candidat `select_state_potion` qui continue en `normal_reply` au lieu de relancer le handoff operationnel.
- Symptome visible: apres "choisir une potion a reprendre dans la plateforme" puis "A, clarte", Sophia donne une recommandation conversationnelle sans destination stable `section Etat / Potions`, sans renderer proprietaire, sans cloture no-mutation.
- Preuve systeme: `response_owner=normal_reply`, `selected_handler=null`, `route_reason=orientation_clarification_resolved`, `executed_tools=[]`, `tool_execution=none`.
- Correction attendue: quand la clarification choisit `select_state_potion`, appeler `runSelectStatePotionHandoffSkill` ou reconstruire un `tool_skill_intent` `select_state_potion` pour que le renderer handoff proprietaire possede le tour.
- Statut: `open`
- Fix reference: aucune.
- Tests requis: resolution clarification vers potion; choix "A clarte"; handoff contient destination plateforme et no-mutation closing; anti-faux-positif resolution vers soutien reste conversationnelle.

## ER-POT-VERIFY-B02

- Bug id: `ER-POT-VERIFY-B02`
- Tours: `qa-potion-emorepair-verified-r3` T4
- Famille: `BF-LEDGER-01`
- Domaine owner: final response pipeline / ledger guard / orientation clarification continuation
- Source amont: claim d'activation produit par `normal_reply` sans `committed_effects`.
- Symptome visible: Sophia dit `activee "Clarte"` apres "Ok vas-y active-la".
- Preuve systeme: `response_owner=normal_reply`, `tool_execution=none`, `executed_tools=[]`, DB `user_potion_sessions=*/0`, `user_recurring_reminders=*/0`, `scheduled_checkins=*/0`.
- Correction attendue: interdire tout claim visible d'activation potion sans commit; pour `select_state_potion`, retourner le message apply_attempt "Je ne l'active pas depuis le chat..." avec destination plateforme.
- Statut: `open`
- Fix reference: aucune.
- Tests requis: "ok vas-y active-la" apres contexte potion normal_reply; "active-la" apres handoff; assertions no `activee`, no `j'ai lancé`, no executed tools, DB effects a 0.
