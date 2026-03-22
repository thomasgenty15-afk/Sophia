# Machine de momentum utilisateur - Observability Phase 2

## Objectif

Instrumenter la chaine runtime momentum/proactive selon le contrat defini en phase 1.

## Portee

Cette phase 2 couvre :

- le routeur
- le watcher
- `trigger-daily-bilan`
- `trigger-weekly-bilan`
- `process-checkins`

Les evenements sont ecrits dans `memory_observability_events` via un helper partage, avec des `event_name` dedies au momentum.

## Evenements instrumentes

### Classification

- `router_momentum_state_applied`
- `watcher_momentum_state_consolidated`
- `momentum_transition_pending`
- `momentum_transition_confirmed`
- `momentum_transition_rejected`

### Decisions

- `daily_bilan_momentum_decision`
- `weekly_bilan_momentum_decision`
- `momentum_outreach_decision`

### Scheduling

- `momentum_outreach_scheduled`
- `momentum_outreach_schedule_skipped`

### Delivery

- `momentum_outreach_sent`
- `momentum_outreach_deferred`
- `momentum_outreach_cancelled`
- `momentum_outreach_failed`
- `momentum_outreach_throttled`

### Reaction

- `momentum_user_reply_after_outreach`

## Source components

- `router`
- `watcher`
- `trigger_daily_bilan`
- `trigger_weekly_bilan`
- `process_checkins`

## Activation

L'instrumentation est active si :

- `MOMENTUM_OBSERVABILITY_ON=1`

ou, a defaut, si :

- `MEMORY_OBSERVABILITY_ON=1`

## Effet attendu

Apres cette phase, on peut deja reconstruire :

- les changements d'etat momentum ;
- les decisions `allow / skip / outreach` ;
- les outreachs reels programmes ;
- leur delivery effective ;
- une premiere couche de reaction user apres outreach.

La phase suivante devra construire l'export d'audit a partir de ces evenements.
