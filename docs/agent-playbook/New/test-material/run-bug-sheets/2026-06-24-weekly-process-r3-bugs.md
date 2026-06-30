# Bug Sheet - Weekly Process R3

Run: `weekly-qa-20260624-r3-partial_habits_mission_partial`  
Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-24-weekly-process-r3.md`  
Date: 2026-06-24  
Verdict: yellow

## R3-B01 - Destination next_level_required rendue de facon instable

- Tours: 3, 5
- Famille: `BF-PROACTIVE-01` - Daily/weekly preuve -> decision cassee
- Domaine owner: `weekly_adaptive_review_v1` renderer / visibles `qualify_solution_fit` et `weekly_adjust_recommendation`
- Source amont: propagation de `weekly_planning_context.adjustment_destination` et `adjust_recommendation.destination_instruction` vers les visibles weekly
- Symptome visible:
  - T3 rend "dans la validation du niveau, l’input à renseigner sera surtout celui-là : validation du niveau suivant", formulation confuse.
  - T5, le user demande explicitement "il faut que je le mette ailleurs ?", mais la reponse ne mentionne pas la destination, alors que l'etat contient `destination_instruction=Validation du niveau...`.
- Preuve systeme:
  - T3 `weekly_planning_context.mode=next_level_required`
  - T5 `adjust_recommendation.status=surfaced`
  - T5 `adjust_recommendation.confidence=0.98`
  - T5 `adjust_recommendation.destination_instruction=Validation du niveau : renseigner cet input de manière concrète, sans modifier le plan depuis le chat.`
  - T5 `committed_effects=[]`
- Correction attendue:
  - Tout visible weekly qui parle d'ajustement doit rendre la destination issue de l'etat, surtout quand le user demande ou mettre l'input.
  - En mode `next_level_required`, interdire les formulations vagues ou circulaires; utiliser "a renseigner dans la validation du niveau".
- Statut: open
- Fix reference: none
- Tests requis:
  - `weekly_adjust_recommendation` + `next_level_required` + "ou le mettre ?" -> reponse contient validation du niveau.
  - `qualify_solution_fit` + levier d'ajustement + `next_level_required` -> destination claire, pas de label repete comme contenu.
  - Anti-faux-positif: `next_week_configured` -> destination `Ajuster mon plan`, pas validation du niveau.

## R3-B02 - Clarification repetee alors que le slot cause est fourni

- Tours: 4
- Famille: `BF-INTAKE-01` - Slot fourni mais redemande
- Domaine owner: `weekly_adaptive_review_v1` local dispatcher/reducer
- Source amont: transition `solution_fit_status` / detection de cause claire dans le signal humain
- Symptome visible: apres "C’est surtout l’energie qui tombe quand l’heure est tardive", Sophia redemande "Est-ce que le vrai point dur, c’est surtout les soirs tardifs ?"
- Preuve systeme:
  - T4 `flow_action=clarify_human_signal`
  - T4 `visible_task=qualify_solution_fit`
  - T4 `weekly_gates.solution_fit_status=missing`
  - T4 `adjust_recommendation.status=none`
- Correction attendue:
  - Quand le user fournit cause + contexte temporel coherents avec les preuves daily, le reducer doit considerer le signal comme capture et passer a recommandation ou synthese.
  - Garder la clarification seulement si cause, scope ou action cible restent ambigus.
- Statut: open
- Fix reference: none
- Tests requis:
  - Cause explicite "energie qui tombe quand je rentre tard" -> pas de redemande du meme slot.
  - Cause partielle "le soir c'est complique" -> clarification autorisee.
  - Anti-faux-positif: deux causes contradictoires -> clarification autorisee.

## R3-B03 - Claim de cloture visible avant gates completes

- Tours: 6
- Famille: `BF-STATE-01` - Mauvaise transition de flow; `BF-LEDGER-01` - Claim sans commit
- Domaine owner: `weekly_adaptive_review_v1` reducer + renderer de synthese/cloture
- Source amont: alignement entre `weekly_synthesis` visible et transitions `synthesis_status` / `closure_status`
- Symptome visible: Sophia dit "Je clôture ce point weekly" au T6, mais l'etat interne indique encore `synthesis_status=needs_deeper` et `closure_status=missing`.
- Preuve systeme:
  - T6 `flow_action=recap_weekly`
  - T6 `visible_task=weekly_synthesis`
  - T6 `weekly_stage=synthesis`
  - T6 `weekly_gates.synthesis_status=needs_deeper`
  - T6 `weekly_gates.closure_status=missing`
  - T7 seulement passe a `flow_action=complete_weekly_no_change`, `synthesis_status=complete`, `closure_status=complete`
- Correction attendue:
  - Le renderer ne doit dire "cloture" ou "cloturee" que lorsque le reducer marque les gates completees dans le meme tour.
  - Si le user demande "synthese et ce que je dois garder pour la cloture", rendre une synthese et demander confirmation de cloture, ou bien faire passer directement `complete_weekly_no_change` si la demande est suffisamment explicite.
- Statut: open
- Fix reference: none
- Tests requis:
  - Message "synthese et cloture" explicite -> soit gates completees, soit pas de claim "cloturee".
  - Message "ce que je dois garder pour la cloture" ambigu -> synthese sans claim de cloture.
  - Invariant trace: toute reponse contenant "cloturee" / "je cloture" -> `closure_status=complete`.
