# Bug Sheet - Weekly Full R7

## Run

- Report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-13-weekly-full-r7.md`
- Run id: `weekly-full-20260613-r7-rose`
- Persona: Rose
- Verdict: yellow

## Bugs

### R7-B01 - Weekly dispatcher fallback on rich action review

- Status: open
- Severity: red localisee / yellow run
- Family: BF-STATE-01 - Mauvaise transition/continuation de flow local
- Tours: T2
- Symptom: `weekly_review_local_dispatcher_failed` sur une reponse action-review riche avec corrections multiples.
- Expected: le dispatcher local produit un JSON valide avec `action_status_updates`, puis le visible prompt continue en `explore_action_blocker` ou `review_action_gaps`.
- Actual: fallback visible technique "Je garde le point weekly..."
- Suspected source: contrat JSON weekly local trop lourd ou sortie IA invalide apres ajout de `action_status_updates`.
- Recommended fix: inspecter la raw response dispatcher T2, simplifier/renforcer les Field Completion Rules et ajouter un test de normalisation/fixture multi-action correction.
- Anti-patching note: ne pas resoudre par regex ou phrase fallback; corriger la fiabilite structuree du dispatcher local.
- Validation: run IA reel avec correction de plusieurs actions dans le meme message; aucun fallback, corrections conservees dans durable.

### R7-B02 - Wrong gender agreement in defense visible prompt

- Status: open
- Severity: yellow
- Family: BF-PREF-01 - Preference/persona non appliquee runtime
- Tours: T7
- Symptom: Sophia dit `fatigué` a Rose.
- Expected: formulation feminine si persona connue, ou formulation neutre si genre non transmis.
- Actual: "Quand je rentre fatigué..."
- Suspected source: `prepare_defense_card.visible_agent` ne recoit pas ou n'applique pas de contrainte persona/tone equivalente au weekly.
- Recommended fix: transmettre contexte persona/tone constraints au visible defense ou utiliser formulations neutres pour adjectifs genrés.
- Anti-patching note: ne pas faire un remplacement de chaine; corriger le contexte visible et l'instruction stage-specific.
- Validation: test visible defense avec persona Rose et proposition support_need contenant fatigue; pas d'accord masculin.

## Confirmed Fixed From R6

- R6-B01 action partial status: fixed in R7. Durable contains `user_corrected_action_statuses` with `partial` for rangement and sas.
- R6-B02 attack/defense drift: fixed in R7. Sophia proposes `prepare_defense_card` directly for the risk window.
- R6-B03 plan item defense destination: fixed in R7. `route_kind=plan_item_card` and destination is the Plan action section.
- R6-B04 claim available/ready without commit: fixed in R7. Visible says prepared/to enter manually; durable `created=false`, `available=false`.
- R6-B05 closure durable late: fixed in R7. T10 closes durable on the same turn.
- R6-B06 cleanup too broad: fixed in R7. Cleanup deletes only current run scope; no preserved unexpected scope was deleted.
