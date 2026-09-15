# Bug Sheet - normal-conversation-25t-20260613-r7-reminder-trace-fix

Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-13-normal-conversation-25t-r7-reminder-trace-fix.md`

## R7-V01 - Faux positif reminder durée conversationnelle

- Bug id: `R7-V01`
- Tours: T2, T5, T14, T19, T20
- Famille: `BF-ROUTE-01`
- Domaine owner: dispatcher global / direct-effect arbitration
- Source amont: `create_one_shot_reminder` direct_effect admission
- Symptôme visible: aucun bug observé sur ce run.
- Preuve système: tous ces tours ont `direct_effects=[]`, `direct_effects_to_run=[]`, `executed_tools=[]`, `response_owner=normal_reply`.
- Correction attendue: déjà appliquée; une durée/heure ne suffit pas sans intention de rappel.
- Statut: `verified`
- Fix reference: dispatcher prompt + direct_effect local context, 2026-06-13.
- Tests requis: maintenus par `dispatcher_prompt_contract_test.ts` et `direct_effect_local_context_test.ts`.

## R7-V02 - Trace flow_opportunity_verification quand normal_reply domine

- Bug id: `R7-V02`
- Tours: T4
- Famille: `BF-TEST-01`
- Domaine owner: operation runtime trace
- Source amont: `routeDecisionForOperationTrace`
- Symptôme visible: aucun bug observé sur ce run.
- Preuve système: T4 reste `response_owner=normal_reply`, `selected_handler=null`, `route_reason=normal_reply_default`; aucun `flow_opportunity_verification`.
- Correction attendue: déjà appliquée; ne pas écraser une route `normal_reply_fit_dominates`.
- Statut: `verified`
- Fix reference: `operation_runtime_response_handler.ts`, test `operation runtime trace keeps normal reply when normal fit dominates`.
- Tests requis: conserver le test unitaire et rerun conversationnel si le pipeline flow opportunity change.

## R7-B01 - status_recap restitue trop large pour "ce qui a été créé"

- Bug id: `R7-B01`
- Tours: T7
- Famille: `BF-STATUS-01`
- Domaine owner: `status_recap`
- Source amont: local dispatcher read_scope / visible restitution scope
- Symptôme visible: Sophia ajoute les préférences coach dans une réponse à "qu'est-ce qui a été créé exactement".
- Preuve système: `selected_handler=status_recap`, réponse visible inclut "Tes préférences coach".
- Correction attendue: pour un status "créé / enregistré pendant l'échange", restituer les effets créés/committés et exclure les préférences existantes non modifiées sauf demande explicite.
- Statut: `open`
- Fix reference: none
- Tests requis:
  - "qu'est-ce qui a été créé exactement" après un rappel => rappel seulement, pas préférences coach.
  - "quelles préférences coach sont actives" => préférences coach incluses.

## R7-B02 - status_recap reste owner malgré "hors statut"

- Bug id: `R7-B02`
- Tours: T24
- Famille: `BF-ROUTE-02`
- Domaine owner: `status_recap`
- Source amont: active local flow exit policy / local dispatcher prompt
- Symptôme visible: le user dit "hors statut maintenant", mais la trace reste `active_status_recap_local_dispatcher` et Sophia parle encore de rappel et préférences coach.
- Preuve système: `response_owner=tool_skill`, `selected_handler=status_recap`, `route_reason=active_status_recap_local_dispatcher`.
- Correction attendue: `status_recap` doit produire `exit_to_global_dispatcher` quand le message courant demande explicitement une réponse humaine, méta-conversationnelle ou hors récap.
- Statut: `open`
- Fix reference: none
- Tests requis:
  - Après status explicite, "hors statut maintenant, réponds comme une personne" => `normal_reply`.
  - Après status explicite, "sans récap ni préférences coach" => `normal_reply`.

## R7-W01 - Confirmation reminder grammaticalement maladroite

- Bug id: `R7-W01`
- Tours: T6
- Famille: `BF-LEDGER-02`
- Domaine owner: one_shot_reminder confirmation addon / visible response
- Source amont: formulation de l'instruction avec infinitif commençant par voyelle.
- Symptôme visible: "je te rappellerai de ouvrir le dossier administratif".
- Preuve système: outil exécuté correctement; seul le rendu visible est maladroit.
- Correction attendue: permettre au visible agent de reformuler naturellement "d'ouvrir" ou "pour ouvrir".
- Statut: `open`
- Fix reference: none
- Tests requis:
  - rappel "ouvrir le dossier" => confirmation naturelle.
  - rappel "appeler Paul" => pas de régression.
