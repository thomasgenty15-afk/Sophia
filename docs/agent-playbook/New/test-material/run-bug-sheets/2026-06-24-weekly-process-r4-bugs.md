# Bug Sheet - Weekly Process R4

Run: `weekly-qa-20260624-r4-partial_habits_mission_partial`  
Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-24-weekly-process-r4.md`  
Date: 2026-06-24  
Verdict: red

## R4-B01 - Recommandation visible sans `adjust_recommendation`

- Tours: 1, 2, 3
- Famille: `BF-PROACTIVE-01` - Daily/weekly preuve -> decision cassee; `BF-LEDGER-01` - Claim sans commit
- Domaine owner: `weekly_adaptive_review_v1` reducer / visible `weekly_synthesis_closure`
- Source amont: contrat state -> visible agent pour les recommandations d'ajustement
- Symptome visible: Sophia formule "l'ajustement utile a envisager..." ou "levier recommande" alors que le champ `adjust_recommendation` reste `status=none`, `confidence=0`, `safe_to_surface=false`.
- Preuve systeme:
  - T1 `visible_task=weekly_synthesis`, `adjust_recommendation.status=none`
  - T2 `visible_task=weekly_synthesis`, `adjust_recommendation.status=none`
  - T3 `visible_task=weekly_closure`, `adjust_recommendation.status=none`
  - Tous les tours `committed_effects=[]`
- Correction attendue:
  - Le visible ne doit jamais employer "ajustement utile", "levier recommande" ou une intention precise si `adjust_recommendation.safe_to_surface !== true`.
  - Si le seuil n'est pas atteint, repondre seulement avec synthese et destination generale, ou demander le signal manquant.
- Statut: open
- Fix reference: none
- Tests requis:
  - Unit visible: `adjust_recommendation.status=none` + `weekly_synthesis` -> pas de recommandation d'ajustement.
  - Unit visible: `adjust_recommendation.safe_to_surface=true` -> recommandation autorisee et destination rendue.
  - Real QA: demande "quoi garder pour la suite" -> si recommandation visible, trace `adjust_recommendation.confidence>=0.95`.

## R4-B02 - Instruction interne fuite dans le message utilisateur

- Tours: 2, 4
- Famille: `BF-PROACTIVE-01` - Daily/weekly preuve -> decision cassee
- Domaine owner: visible context builder / visible `weekly_synthesis_closure`
- Source amont: injection brute de `adjust_recommendation_destination_instruction`
- Symptome visible: Sophia dit "le user doit valider le niveau..." au lieu d'une phrase naturelle pour l'utilisateur.
- Preuve systeme:
  - T2 wording: "Sans semaine suivante configuree, le user doit valider le niveau..."
  - T4 wording: "Sans semaine suivante configurée, tu dois valider le niveau..." plus naturel mais encore recopie brute de la contrainte.
- Correction attendue:
  - Ne pas injecter une instruction systeme brute dans le visible.
  - Fournir un champ user-facing separe: par exemple `destination_user_message="A renseigner dans la Validation du niveau, au moment de valider le niveau."`
- Statut: open
- Fix reference: none
- Tests requis:
  - Prompt/context visible ne contient pas "le user doit".
  - Visible generated QA ne contient ni "le user" ni instruction brute.
  - `next_week_configured` garde une destination user-facing differente.

## R4-B03 - Cloture interne complete sans visible `weekly_closure`

- Tours: 4
- Famille: `BF-STATE-01` - Mauvaise transition de flow; `BF-LEDGER-01` - Etat visible non aligne
- Domaine owner: weekly reducer / visible task selection
- Source amont: admission `complete_weekly_no_change` et selection `visible_task`
- Symptome visible: le user demande explicitement la cloture, `closure_status=complete`, mais la reponse visible reste une synthese "a garder pour la cloture" et `visible_task=weekly_synthesis`.
- Preuve systeme:
  - T4 `flow_action=complete_weekly_no_change`
  - T4 `weekly_gates.closure_status=complete`
  - T4 `visible_task=weekly_synthesis`
  - T4 visible ne dit pas clairement que le bilan est cloture
- Correction attendue:
  - Si `complete_weekly_no_change` complete la closure, forcer `visible_task=weekly_closure`.
  - Sinon bloquer la completion et garder `closure_status=missing`.
- Statut: open
- Fix reference: none
- Tests requis:
  - Unit reducer: `complete_weekly_no_change` + `closure_status=complete` + visible `weekly_synthesis` -> visible final force `weekly_closure` ou completion bloquee.
  - Unit visible: `weekly_closure` + closure allowed -> message cloture clairement.
  - Real QA: "tu peux clôturer maintenant" -> trace `visible_task=weekly_closure` et visible dit cloture.
