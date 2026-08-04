# Bug Sheet - one-shot-reminder-r5

## R5-B01

- Tours: Tour 7
- Famille: `BF-EFFECT-02` - Effet attendu absent
- Domaine owner: `daily_action_review_v1` pending path / `whatsapp-webhook`
- Source amont: integration entre sortie locale daily, direct-effect lane commune et confirmation visible.
- Symptome visible: Sophia accuse reception du daily mais ignore la demande "rappelle-moi dans 25 minutes...".
- Preuve systeme: pending daily passe `done`, entries daily creees, occurrences mises a jour, mais aucun `scheduled_checkins` one-shot n'est cree.
- Correction attendue: le chemin pending daily doit executer la direct-effect lane commune quand `direct_effect_request` est present, puis transmettre `direct_effect_confirmation_context` au visible.
- Statut: `open`
- Fix reference: aucun
- Tests requis: daily pending positif `dans 25 minutes`; daily pending absolu `demain à 20h`; anti-faux-positif sans intention de rappel; verification DB `scheduled_checkins` + visible confirmation.

## R5-B02

- Tours: Tour 4
- Famille: `BF-LEDGER-02` - Commit reel mal rendu
- Domaine owner: `feature_opportunity.visible_agent`
- Source amont: restitution visible du `direct_effect_confirmation_context`.
- Symptome visible: le rappel est commit, mais Sophia dit seulement "Et dans 45 minutes, vider..." sans confirmer clairement "je te rappellerai".
- Preuve systeme: direct-effect lane `success`, `scheduled_checkins` cree, `parse_source=payload_utc_time`, `source_message_id` present.
- Correction attendue: si `one_shot_reminder.committed=true`, le visible local doit confirmer sobrement le rappel programme, sans texte deterministe injecte.
- Statut: `open`
- Fix reference: aucun
- Tests requis: feature opportunity avec rappel relatif; verification visible explicite; anti-faux-positif pour demande d'initiative recurrente sans rappel ponctuel.
