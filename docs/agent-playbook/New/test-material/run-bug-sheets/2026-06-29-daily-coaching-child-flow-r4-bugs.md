# Bug Sheet - daily-coaching-child-flow-20260629-r4-webhook

## R4-B01

- Bug id: `R4-B01`
- Tours: 1
- Famille: `BF-PROACTIVE-01`
- Domaine owner: daily opening / `process-checkins` proactive scheduled checkin
- Source amont: generation du message daily apres acceptation `template_gate`
- Symptome visible: Sophia dit "tu as rangé..." et "tu as fait..." avant que le user donne la preuve daily.
- Preuve systeme: au tour 1, `entries_count=0`, occurrences `planned`, pending encore `pending`, mais la reponse visible affirme des completions.
- Correction attendue: l'ouverture daily doit demander le bilan/preuve sans affirmer completion avant reducer/executor.
- Statut: `open`
- Fix reference: n/a
- Tests requis: opening daily apres `template_gate` ne doit pas contenir de claim completion; elle doit poser une question neutre sur les targets du jour.

## R4-W01

- Bug id: `R4-W01`
- Tours: 4
- Famille: `BF-STATE-01`
- Domaine owner: daily pending metadata cleanup
- Source amont: payload final conserve `local_flow_transfer=handoff_to_child_flow` et `child_flow_handoff=coaching_recommendation` apres pending `done`.
- Symptome visible: aucun symptome utilisateur; warning trace uniquement.
- Preuve systeme: tour 4 pending `done`, entries `3`, mais payload trace garde le handoff transit.
- Correction attendue: clarifier si ces champs doivent rester comme audit ou etre deplaces vers un memo/archive; si transit actif seulement, les nettoyer apres commit.
- Statut: `open`
- Fix reference: n/a
- Tests requis: apres commit daily, verifier que les champs de transit actif ne polluent pas l'etat courant, ou qu'ils sont explicitement documentes comme audit.
