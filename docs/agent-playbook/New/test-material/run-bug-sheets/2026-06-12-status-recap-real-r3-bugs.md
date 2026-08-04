# Bug Sheet — status-recap-real-r3

## R3-B01

- Bug id: `R3-B01`
- Tours: Tour 1, impact indirect Tours 2-4
- Famille: `BF-TEST-01` — Trace/test incoherent ou suite malsaine
- Domaine owner: QA runner / isolation des fixtures `status_recap`
- Source amont: connexion temporaire reutilisee `status_recap_status_recap_20260612_r2` avec artefact recurrent preexistant
- Symptome visible: Sophia mentionne deux rappels recurrents alors que le seed r3 en ajoute un seul.
- Preuve systeme: `before_rows.recurring` contient deux rows avant conversation; `projection_summary.recurring_reminder_count=2`; cleanup r3 final conserve un rappel recurrent preexistant `53547602-fa08-4647-b573-8855eddd2e0c`.
- Correction attendue: utiliser une connexion temporaire neuve par rerun ou nettoyer uniquement les artefacts QA precedents identifies par run id, source metadata ou IDs deterministes, sans broad delete.
- Statut: `open`
- Fix reference: n/a
- Tests requis: rerun `status_recap` avec `before_rows` limitees aux fixtures du run courant; verifier que `cleanup.verify` ne contient plus d'artefact produit sur le user temporaire, hors donnees explicitement acceptees.

## Notes De Verification

- Les bugs r2 prioritaires sont verifies comme corriges par ce run:
  - `BF-ROUTE-01`: T1 route directement vers `status_recap`.
  - `BF-STATUS-01`: la preference coach est rendue dans les reponses globales.
  - `BF-STATE-01`: les follow-ups T3/T4 restent sous `active_status_recap_local_dispatcher` avec `global_dispatcher` bloque.
