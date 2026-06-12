# Bug Sheet - Weekly Opening Local R1

## R1-B01

- Tours: Contexte du test / opening.
- Famille: `BF-TEST-01` — trace/test incoherent ou suite malsaine.
- Domaine owner: `process-checkins` / QA proactive runner.
- Source amont: absence de filtre cible `scheduled_checkin_id` ou `user_id` dans le chemin local `process-checkins`.
- Symptome visible: le run ne peut pas appeler `process-checkins force=true` sans traiter des checkins pending hors perimetre deja presents en DB locale.
- Preuve systeme: inspection pre-run: plusieurs `scheduled_checkins` pending hors run pour un autre user; `process-checkins` charge les checkins due par batch global.
- Correction attendue: ajouter un mode interne QA cible permettant de traiter un seul scheduled_checkin ou un seul user, sans toucher la file globale.
- Statut: open.
- Fix reference: none.
- Tests requis: process-checkins cible un checkin weekly temporaire, persiste le draft/opening et l'active_skill_state, prouve que les pending hors scope restent inchanges.

## R1-B02

- Tours: Tour 2a.
- Famille: `BF-TEST-01` — trace/test incoherent ou suite malsaine.
- Domaine owner: local Edge runtime / runner QA.
- Source amont: upstream 502 sans trace Sophia exploitable.
- Symptome visible: reponse vide au premier essai du tour 2.
- Preuve systeme: body `{"message":"An invalid response was received from the upstream server"}`, pas de `conversation_turn_trace`; message user persiste, aucun assistant.
- Correction attendue: rendre les runners de QA robustes aux 502, avec option de retry qui ne laisse pas de message user orphelin, ou produire une trace d'erreur exploitable.
- Statut: open.
- Fix reference: none.
- Tests requis: simuler ou provoquer une erreur upstream et verifier que le runner documente l'incident, ne double pas le message user au retry, et preserve les effets durables.
