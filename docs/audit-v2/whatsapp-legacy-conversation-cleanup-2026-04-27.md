# WhatsApp Legacy Conversation Cleanup - 2026-04-27

## Inventaire

### A supprimer

- `supabase/functions/trigger-memory-echo/`: ancien pipeline Memory Echo
  complet.
- `supabase/functions/trigger-daily-bilan/`: ancien bilan quotidien WhatsApp.
- `supabase/functions/trigger-weekly-bilan/`: ancien bilan hebdomadaire WhatsApp
  tel qu'il existait avant la refonte.
- `supabase/functions/trigger-proactive-scheduler/index.ts`: ancien fan-out
  `daily_bilan`, `weekly_bilan`, `memory_echo`.
- `supabase/functions/sophia-brain/momentum_proactive_selector.ts`: selecteur
  lie au fan-out proactive legacy.
- `supabase/functions/sophia-brain/weekly_conversation_digest_builder.ts` et
  prompt associe `weekly-conversation-digest`.
- `scripts/setup_archivist_cron.sql`: cron manuel Memory Echo.

### A desactiver seulement

- Crons et fonctions SQL `claim_due_*` legacy via migration dediee, sans drop
  des tables historiques.
- `whatsapp_pending_actions` legacy: suppression des lignes actives
  `daily_bilan`, `weekly_bilan`, `memory_echo`, `bilan_reschedule` et des
  candidates proactive liees.
- `scheduled_checkins` legacy: passage a `cancelled` pour
  `daily_bilan_reschedule`, `daily_bilan_v2`, `weekly_bilan_v2`.

### A garder car utilise par une autre brique

- `whatsapp-webhook`: entree WhatsApp conservee, branches pending legacy
  retirees.
- `whatsapp-send`: delivery WhatsApp generique.
- `scheduled_checkins` et `process-checkins`: bus generique de delivery.
- `watcher` generique, memorizer et memoire durable.
- `whatsapp_winback.ts` et branches `daily_bilan_winback`: winback conserve, a
  renommer/decoupler plus tard.
- `conversation_pulse`: conserve comme analyzer reutilisable, decouple des
  tables `daily_bilan_v2` et `weekly_bilan_recaps`.
- `weekly_bilan_recaps`: table historique gardee pour audit/migration, plus lue
  par `conversation_pulse_builder`.
- `system_runtime_snapshots` avec anciens events `daily_bilan_*`,
  `weekly_bilan_*`, `conversation_pulse_*`: historique/audit.

### Incertain / decision humaine

- `momentum_morning_nudge`, `momentum_outreach`, `momentum_state`: a reutiliser
  comme base pour checks matin/soir et machine d'engagement.
- `coaching_intervention_selector`, `repair_mode`, `conversation_pulse`,
  `surface_registry`: inventorie comme reusable analyzer/skill material, non
  supprime.
- `weekly_bilan_recaps` et events weekly: garder tant que la nouvelle version du
  bilan leger de fin de semaine n'est pas specifiee.
- Champs `profiles.whatsapp_bilan_*`: garder pour opt-in/winback et migration
  progressive, meme si le nom est legacy.
