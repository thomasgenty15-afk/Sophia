# Bug Sheet - daily-two-plans-four-actions-20260624-r1

## Run

- Date: 2026-06-24
- Rapport: `tests/real-personas/rose/runs/daily-weekly/daily-two-plans-four-actions-20260624-r1.md`
- Runs source:
  - `daily-two-plans-four-actions-success-20260624-r1`
  - `daily-two-plans-four-actions-missed-20260624-r1`
- Domaine: `daily_action_review_v1`
- Verdict: red

## Bugs

### R1-B01 - Ouverture daily 4 targets presente seulement 2 actions

- Tours: A0, B0
- Famille: `BF-PROACTIVE-01` - Daily/weekly preuve -> decision cassee
- Domaine owner: `process-checkins`, `daily_action_review_v1` opening/focus queue
- Source amont: selection des `current_focus_occurrence_ids` et rendu visible de l'ouverture proactive
- Symptome visible: Sophia dit "ces deux actions" alors que le pending contient 4 targets reparties sur 2 plans.
- Preuve systeme: `target_count=4`, `pending.payload.targets.length=4`, ouverture visible cite seulement `journée 100% sans cannabis` et `soirée zéro vide`.
- Correction attendue: si le daily ouvre avec un focus de 2 actions sur une file de 4, le visible doit annoncer clairement que Sophia commence par ces 2 actions ou qu'il y aura une suite. Sinon l'ouverture doit couvrir explicitement les 4 targets.
- Statut: open
- Fix reference: a definir
- Tests requis:
  - 4 targets sur 2 plans, ouverture ne doit pas faire croire que seules 2 actions existent.
  - 1/2/4 targets doivent garder un wording naturel et non robotique.
  - Quand le user repond sur les 4 actions, le reducer doit toujours pouvoir committer les 4.

### R1-B02 - Commit daily reussi mais aucune reponse visible apres 502

- Tours: B1
- Famille: `BF-LEDGER-02` - Commit reel mal rendu
- Domaine owner: `whatsapp-webhook`, final response delivery daily, effect ledger/observability
- Source amont: pipeline apres commit `daily_action_review_v1` vers livraison WhatsApp
- Symptome visible: le webhook retourne `502 {"message":"An invalid response was received from the upstream server"}`; aucun message assistant daily n'est persisté, alors que les 4 entries sont creees et le pending passe a `done`.
- Preuve systeme: pending `6f2ca184-5d51-4609-97fb-0245f0b2e58e` -> `done`; 4 entries `missed`; `assistant_daily_messages=[]`; HTTP 502 sur le tour user.
- Correction attendue: rendre la livraison visible apres commit daily observable et idempotente. Si le commit a reussi mais l'envoi visible echoue, le runtime doit pouvoir exposer l'incident et eviter un double commit lors d'un retry.
- Statut: open
- Fix reference: a definir
- Tests requis:
  - simulation/integration commit OK + delivery KO -> pas de double commit.
  - trace contient commit status, delivery error et recovery policy.
  - retry du meme webhook ne doit pas dupliquer les entries.

### R1-B03 - Reason category absent pour "j'ai craqué"

- Tours: B1
- Famille: `BF-PROACTIVE-01` - Daily/weekly preuve -> decision cassee
- Domaine owner: `daily_action_review_v1`
- Source amont: reducer/effects reason mapping
- Symptome visible: aucun symptome visible direct, mais metadata durable incomplete.
- Preuve systeme: entry `28f38666-2c5f-49a4-9f07-9600f04a4b3a`, `reason_text="j'ai craqué dans l'après-midi"`, `reason_category=null`, outcome `missed`.
- Correction attendue: mapper les formulations de craquage/rechute vers une categorie canonique. Si aucune categorie existante n'est parfaitement adaptee, utiliser `other` ou clarifier la doctrine produit; ne pas laisser `null` pour une raison explicite et courante.
- Statut: open
- Fix reference: a definir
- Tests requis:
  - `j'ai craqué`, `j'ai rechuté`, `j'ai cédé`, `j'ai fumé quand même` doivent produire une categorie non nulle.
  - Anti-faux-positif: ne pas classer comme safety sans signal de crise.
  - Integration daily missed avec 4 targets: chaque reason_text explicite doit avoir une categorie durable.
