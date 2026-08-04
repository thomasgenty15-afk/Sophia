# Bug Sheet - one_shot_local_dispatchers_20260623_r1

## R1-B01

- Bug id: `R1-B01`
- Tours: 3
- Famille: `BF-ROUTE-01`
- Domaine owner: `coaching_recommendation` local dispatcher / active flow policy
- Source amont: sortie `coaching_recommendation_exit_to_global` sur une question encore dans le choix de coaching
- Symptome visible: Sophia donne une reponse utile mais perd l'owner local.
- Preuve systeme: `response_owner=normal_reply`, `selected_handler=null`, `route_reason=coaching_recommendation_exit_to_global`; aucun effet durable.
- Correction attendue: garder `coaching_recommendation` owner tant que le user demande quel levier Sophia choisir pour une action concrete.
- Statut: `open`
- Fix reference: n/a
- Tests requis: integration locale `force_full_ai=true` sur attack-card vs adjust-action; paraphrases avec action concrete; anti-faux-positif vraie sortie hors sujet.

## R1-B02

- Bug id: `R1-B02`
- Tours: 5
- Famille: `BF-LEDGER-02`
- Domaine owner: visible agent `feature_opportunity`
- Source amont: generation visible FR non contrainte
- Symptome visible: mot non francais (`בדיוק`) dans une reponse produit.
- Preuve systeme: `response_owner=feature_opportunity`, `selected_handler=feature_opportunity`, no tool; probleme strictement visible.
- Correction attendue: renforcer la contrainte de langue du visible agent et ajouter une verification anti-mix-language sur sorties FR.
- Statut: `open`
- Fix reference: n/a
- Tests requis: test visible FR pour `feature_opportunity` recurrent context; paraphrases "moment recurrent", "initiative".

## R1-B03

- Bug id: `R1-B03`
- Tours: 6
- Famille: `BF-INTAKE-02`, `BF-EFFECT-03`, `BF-ROUTE-02`
- Domaine owner: direct-effect intake / one-shot reminder payload compiler; `feature_opportunity` active flow policy
- Source amont: fallback `local_parser` utilise alors que le local dispatcher devait fournir `when_hint` et `instruction_hint`
- Symptome visible: Sophia confirme un rappel pour un texte absurde et ne repond pas a la question produit restante.
- Preuve systeme: `payload_hint.raw_text` contient tout le message; `when_hint=null`; `instruction_hint=null`; `reminder_instruction=du dimanche soir, et dis-moi aussi ou je regle la destination...`; `route_reason=feature_opportunity_exit_to_global`.
- Correction attendue: exiger un payload structuré avant commit dans les flows locaux; isoler la clause du rappel et rendre le besoin restant au visible `feature_opportunity`.
- Statut: `open`
- Fix reference: n/a
- Tests requis: integration Feature Opportunity actif + rappel + question produit; assertion DB `reminder_instruction=noter le message du dimanche soir`; assertion visible repond a la destination.

## R1-B04

- Bug id: `R1-B04`
- Tours: 7
- Famille: `BF-ROUTE-01`
- Domaine owner: global dispatcher / weekly entry policy
- Source amont: demande user explicite de bilan weekly non routee vers weekly
- Symptome visible: Sophia repond comme conversation generale au lieu d'ouvrir/reprendre un bilan weekly.
- Preuve systeme: `response_owner=normal_reply`, `route_reason=normal_reply_default`, `memory_plan=weekly_bilan_context`.
- Correction attendue: clarifier le contrat: si "faire mon bilan weekly" est supporte, router vers `weekly_adaptive_review_v1`; sinon rendre une reponse produit explicite sans simuler le weekly.
- Statut: `open`
- Fix reference: n/a
- Tests requis: entree user "faire mon bilan weekly"; anti-faux-positif simple discussion sur une semaine passee.

## R1-B05

- Bug id: `R1-B05`
- Tours: 8
- Famille: `BF-LEDGER-01`, `BF-ROUTE-02`
- Domaine owner: `weekly_adaptive_review_v1` local dispatcher / direct-effect bridge / final response guard
- Source amont: weekly sort vers global sur une demande qui contient un rappel exploitable et une continuation weekly
- Symptome visible: Sophia dit que le rappel est "bien formulé pour demain à 18h", mais aucun rappel one-shot n'est cree.
- Preuve systeme: `selected_handler=weekly_adaptive_review_v1`, `route_reason=weekly_adaptive_review_exit_to_global`, `direct_effects=[]`, `executed_tools=[]`, durable only `weekly_progress_review_v2`.
- Correction attendue: autoriser `create_one_shot_reminder` comme direct effect pendant weekly; interdire confirmation visible sans `committed_effects`; continuer le weekly apres commit.
- Statut: `open`
- Fix reference: n/a
- Tests requis: fixture weekly active + reminder + "continuons le bilan"; assertion scheduled_checkin one-shot; assertion no plan patch without confirmation.

## R1-B06

- Bug id: `R1-B06`
- Tours: 10
- Famille: `BF-SAFETY-01`, `BF-LEDGER-02`
- Domaine owner: `safety_crisis` visible/final response composer + direct-effect confirmation bridge
- Source amont: visible safety generation fails after direct-effect commit and final answer degrades to confirmation only
- Symptome visible: Sophia confirme le rappel mais ne reste pas avec le user, malgre demande explicite.
- Preuve systeme: `response_owner=safety`, `route_reason=active_safety_crisis_with_local_direct_effects`, `committed_effects=[create_one_shot_reminder]`, `visible_failure_reason=missing_required_emergency_numbers`; durable instruction propre.
- Correction attendue: composer confirmation de commit + soutien safety obligatoire; si visible safety echoue, produire un fallback safety conforme plutot qu'une confirmation seule.
- Statut: `open`
- Fix reference: n/a
- Tests requis: safety actif + rappel + "reste avec moi"; assertion DB propre; assertion visible inclut soutien safety et ressources quand requises; anti-regression side effects bloques.
