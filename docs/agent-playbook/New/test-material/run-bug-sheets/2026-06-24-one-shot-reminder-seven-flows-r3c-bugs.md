# Bug Sheet - One Shot Reminder Seven Flows R3c

## R3C-B01 - Safety duplique le rappel ponctuel

- Tours: Tour 5 safety_crisis
- Famille: `BF-EFFECT-03` - Payload durable faux
- Domaine owner: `create_one_shot_reminder` / direct-effect lane
- Source amont: idempotence executor + compilation de delais relatifs
- Symptome visible: Sophia annonce un seul rappel.
- Preuve systeme: deux `scheduled_checkins` pour `one_shot_reminder:lui_envoyer_un_sms`, ids `9b1b6aaa-3b8f-450f-8140-fbefb0124014` et `21cb7c68-18a7-4f7f-a2ef-0a33a75591db`, horaires separes de quelques millisecondes.
- Correction attendue: dedupe stable avant commit par turn/source message, effet, instruction normalisee et `when_hint/local_label`, pas par `scheduled_for` calcule.
- Statut: open
- Fix reference: a faire
- Tests requis: safety + one-shot relatif; non-safety + double source directe; assert un seul row DB; assert trace sans double `committed_effects`.

## R3C-B02 - Weekly confirme l'heure UTC au lieu de l'heure locale

- Tours: Tour 6 weekly_adaptive_review
- Famille: `BF-STATUS-03` - Temps/localisation mal rendus
- Domaine owner: direct-effect confirmation context / one-shot reminder renderer
- Source amont: rendu visible de `scheduled_for` sans `user_timezone` ou sans reutiliser `when_hint`.
- Symptome visible: user demande `demain à 10h15`; Sophia confirme `demain à 8h15`.
- Preuve systeme: DB row `3d8a1c17-5515-40b1-b9f1-4d9908a1801b` a `scheduled_for=2026-06-25T08:15:00+00:00` et payload `user_timezone=Europe/Paris`; instant correct pour 10h15 Paris, rendu visible faux.
- Correction attendue: confirmation commune formatee depuis `scheduled_for + user_timezone` ou depuis `when_hint` valide, jamais depuis UTC brut.
- Statut: open
- Fix reference: a faire
- Tests requis: weekly + `demain HH:mm`; global/product/coaching/feature regression; assert confirmation visible locale et payload DB timezone.

## R3C-B03 - Daily pending non testable dans la fenetre du run

- Tours: Tour 7 daily_action_review
- Famille: `BF-TEST-01` - Trace/test incoherent ou suite malsaine
- Domaine owner: QA harness daily / `process-checkins`
- Source amont: absence de filtre interne cible `user_id` ou `scheduled_checkin_id`; cadence runtime maintient `action_evening_review_v2` a l'horaire calcule.
- Symptome visible: aucun tour daily user exploitable pour tester `create_one_shot_reminder`.
- Preuve systeme: `process-checkins` retourne `No checkins to process`; checkin `ab4ffee1-8416-48d0-8609-185fe93ead9d` reste `pending` a `2026-06-24T14:56:25.795+00:00`; tentative REST PATCH cible ne change pas `scheduled_for`.
- Correction attendue: mode QA interne safe permettant de traiter un checkin isole du user temporaire sans toucher la file globale et sans creer manuellement le pending.
- Statut: open
- Fix reference: a faire
- Tests requis: daily process-checkins -> pending WhatsApp -> message user avec rappel -> direct-effect lane -> row DB unique.
