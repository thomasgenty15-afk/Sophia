# Bug Sheet - `daily-reason-category-20260624-mqscoou1`

## Run

- Date: 2026-06-24
- Rapport: `tests/real-personas/rose/runs/daily-weekly/daily-reason-category-20260624-mqscoou1.md`
- Raw: `tests/real-personas/rose/runs/daily-weekly/daily-reason-category-20260624-mqscoou1.raw.json`
- Verdict global: red

## Bugs

### R1-B01 - Pending daily non priorise comme owner

- Tours: 1, 2, 8
- Famille: `BF-ROUTE-01` - Mauvais owner selectionne
- Domaine owner: routeur global / arbitration pending actions
- Source amont: selection d'owner avant direct-effect lane et `normal_reply`
- Symptome visible: Sophia repond comme conversation normale et dit que l'etat est note, alors que le daily pending reste ouvert.
- Preuve systeme: `response_owner=normal_reply`, `route_reason=direct_effects_then_normal_reply`, `pending_status=pending`, `review_status=collecting`, `entries=[]`.
- Correction attendue: si un pending `daily_action_review_v1` actif existe et que le message repond aux targets daily, router vers daily avant `normal_reply` et avant direct effects transverses.
- Statut: `open`
- Fix reference: a faire
- Tests requis: integration route pending daily; run QA reel avec `force_full_ai=true`; anti-faux-positif pour safety et vrai topic change.

### R1-B02 - Coaching recommendation capture une preuve daily

- Tours: 4, 5, 6, 7
- Famille: `BF-ROUTE-02` - Ancien flow capture une nouvelle intention
- Domaine owner: active-flow arbitration / child-flow return policy
- Source amont: priorite entre pending daily et `coaching_recommendation`
- Symptome visible: Sophia bascule vers coaching et demande si l'action fait partie du plan alors que la target vient du daily.
- Preuve systeme: `response_owner=coaching_recommendation`, `route_reason=coaching_recommendation_signal` puis `active_coaching_recommendation`, pending daily toujours `collecting`, `entries=[]`.
- Correction attendue: une preuve daily reste dans daily; un besoin coaching doit etre un child-flow structure avec retour parent, ou ne pas s'activer quand le user donne seulement une raison de non-realisation.
- Statut: `open`
- Fix reference: a faire
- Tests requis: pending daily + fatigue sans demande d'aide reste daily; pending daily + demande explicite d'aide lance child-flow avec retour; "pour cloturer le daily" restaure daily.

### R1-B03 - Claim visible sans commit

- Tours: 1, 2, 3, 8
- Famille: `BF-LEDGER-01` - Claim sans commit
- Domaine owner: final response guard / normal reply policy
- Source amont: rendu visible hors daily sans verification du ledger ou du commit daily
- Symptome visible: Sophia dit "note", "on garde ca" ou "je garde ca" alors qu'aucune entry daily n'est creee.
- Preuve systeme: `entries=[]`, `executed_tools=[]`, `pending_status=pending`, no `log_daily_action_review`.
- Correction attendue: interdire les formulations de confirmation d'ecriture hors commit durable; si la route n'a pas commit, parler en clarification ou rediriger vers l'owner daily.
- Statut: `open`
- Fix reference: a faire
- Tests requis: final response guard sur `normal_reply` avec direct effect bloque; regression daily no-commit.

### R1-B04 - Mapping `reason_category` non validable sur ce run

- Tours: tous
- Famille: `BF-PROACTIVE-01` - Daily/weekly preuve -> decision cassee
- Domaine owner: daily action review, bloque par routeur amont
- Source amont: daily non execute, donc impossible d'observer le reducer/prompt `reason_category`
- Symptome visible: aucune fermeture daily malgre des preuves completes.
- Preuve systeme: `entries=[]`; pas d'output dispatcher daily exploitable.
- Correction attendue: corriger d'abord R1-B01/R1-B02, puis relancer le test cible `craque/fume => emotional` et `fatigue => fatigue`.
- Statut: `blocked`
- Fix reference: depend de R1-B01/R1-B02
- Tests requis: meme scenario apres correction d'ownership.
