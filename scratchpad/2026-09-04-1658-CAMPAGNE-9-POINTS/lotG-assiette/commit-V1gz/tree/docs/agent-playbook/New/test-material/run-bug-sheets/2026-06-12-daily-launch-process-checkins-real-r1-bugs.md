# Run Bug Sheet - Daily Launch Process Checkins Real R1

Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-12-daily-action-review-launch-process-checkins-real-r1.md`

## Bugs

### R1-B01

- Tours: Tour 0
- Famille: `BF-PROACTIVE-01`
- Domaine owner: proactive daily launch / `process-checkins`
- Source amont: prompt et contexte `generateDailyActionReviewOpening` pour le grouping de plusieurs occurrences du meme plan item.
- Symptome visible: Sophia dit "les deux occurrences a passer en revue", ce qui expose un terme interne au user.
- Preuve systeme: ouverture IA reelle `gpt-5.2` via `scheduled_checkins:dynamic_whatsapp`; `chat_messages.content` et `whatsapp_pending_actions.payload.draft_message` contiennent le terme "occurrences".
- Correction attendue: renforcer le prompt d'ouverture pour interdire le vocabulaire technique visible (`occurrence`, pending, checkin, IDs) et formuler les doublons de meme action en langage utilisateur.
- Statut: open
- Fix reference: none
- Tests requis: lancement daily avec deux occurrences du meme plan item; lancement daily avec deux actions differentes; verification que le pending conserve tous les `occurrence_ids` meme si le message visible les formule naturellement.
