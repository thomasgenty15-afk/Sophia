# Bug Sheet - Daily Post-Fix Rerun R2

## R2-B01

- Bug id: `R2-B01`
- Tours: Tour 0
- Famille: `BF-LEDGER-01`
- Domaine owner: `process-checkins` / ouverture proactive daily
- Source amont: generation visible d'ouverture `action_evening_review_v2`
- Symptome visible: Sophia dit "J'ai vu tes actions... nickel" avant toute preuve user et avant commit DB.
- Preuve systeme: pending initial `status=pending`, aucun effet daily commite au moment de l'ouverture.
- Correction attendue: l'ouverture daily doit collecter une preuve, jamais valider ou feliciter une action comme faite avant reponse user et commit runtime.
- Statut: `open`
- Fix reference: a faire
- Tests requis: ouverture avec 1/2/3/4 targets; assert absence de claims `fait`, `nickel`, `note`, `j'ai vu` avant preuve; run QA reel avec pending non commite.

## R2-B02

- Bug id: `R2-B02`
- Tours: Tour 0
- Famille: `BF-PROACTIVE-01`
- Domaine owner: `process-checkins` / daily opening selector and renderer
- Source amont: opening prompt + coverage guard
- Symptome visible: ouverture affiche seulement 2 actions alors que `targets_count=3` et `not_yet_asked_occurrence_ids` contient une troisieme target.
- Preuve systeme: pending direct contient 3 targets avec descriptions; ouverture mentionne seulement sas + materiel; target `Cibler le joint reflexe` absente de la question visible.
- Correction attendue: si le stage affiche un sous-ensemble, la formulation doit indiquer que le daily continue ensuite; sinon afficher toutes les targets du stage. Ne jamais laisser croire que le check couvre tout quand une target reste en file.
- Statut: `open`
- Fix reference: a faire
- Tests requis: opening daily 3 targets, 4 targets, grouped same plan, mixed plan; verify coverage visible ou annonce de suite; reducer queue invariant.

## R2-B03

- Bug id: `R2-B03`
- Tours: Tentative Run 2
- Famille: `BF-TEST-01`
- Domaine owner: QA harness + `process-checkins`
- Source amont: selection/eligibilite du second scheduled checkin QA
- Symptome visible: le scenario `clarify` ne peut pas demarrer car aucun pending daily n'est genere.
- Preuve systeme: checkin QA `qa-daily-two-runs-20260618-r1-clarify` cree puis reste `pending`; `process-checkins` retourne `processed=0`; aucun `whatsapp_pending_actions` associe.
- Correction attendue: isoler correctement les runs daily successifs ou exposer dans le harness la raison de non-selection `process-checkins`.
- Statut: `open`
- Fix reference: a faire
- Tests requis: deux scheduled checkins QA successifs sur meme persona sans collision; logs de skip reason exploitables; cleanup cible idempotent.
