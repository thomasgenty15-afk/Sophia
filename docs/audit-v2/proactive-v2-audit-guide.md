# Proactive V2 Audit Guide

STATUT: complet — Lot 6C

Structure standard: voir
[v2-audit-strategy.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-audit-strategy.md)

## 1. Objectif

Auditer la qualite du systeme proactif V2 sur la fenetre morning nudge:

```
MomentumStateV2 + plan_items + conversation context + historique nudge
→ skip_or_speak
→ selectPostureV2
→ validateCooldownV2
→ generation dynamique
→ delivery WhatsApp
→ reaction utilisateur
```

Le bundle cherche a repondre a:

- le systeme a-t-il parle quand il fallait se taire ?
- la posture choisie etait-elle coherent avec l'etat momentum ?
- le delivery reel a-t-il bien eu lieu ?
- l'utilisateur a-t-il reagi ?
- observe-t-on une repetition excessive de posture ?

## 2. Runtime reel a auditer

L'audit proactive V2 doit suivre la logique code, pas une spec theorique.

### 2.1 Skip-or-speak

Le gate effectif skippe quand:

- `current_state = pause_consentie`
- aucun item du jour et aucun item actif
- la policy momentum bloque le proactive (`proactive_policy=none` ou quota a 0)
- le quota hebdo de l'etat est atteint
- la meme posture a deja ete envoyee au moins 2 fois de suite sans reaction

Important:

- il n'y a pas de "budget par defaut = 5"
- `max_proactive_per_7d` vient de `momentum_policy.ts` et varie selon l'etat

### 2.2 Selection de posture

La cascade reelle dans `selectPostureV2` est:

1. `protective_pause` si `current_state = soutien_emotionnel` ET
   `emotional_load = high`
2. `support_softly` si `emotional_load = high` ou `medium`
3. `pre_event_grounding` si `conversationPulse.signals.upcoming_event` existe
4. `open_door` si `current_state = reactivation`
5. `simplify_today` si `current_state = friction_legere` ou `evitement`, ou si
   `load_balance` est `slightly_heavy` / `overloaded`
6. `celebration_ping` si victoire recente < 48h
7. `focus_today` fallback

### 2.3 Cooldowns

Cooldowns hardcodes:

- meme posture sans reaction: 48h
- memes items sans reaction: 72h

Adjacence reelle:

- `protective_pause` → `support_softly`
- `support_softly` → `protective_pause`, `simplify_today`
- `pre_event_grounding` → `focus_today`, `simplify_today`
- `open_door` → `simplify_today`
- `simplify_today` → `focus_today`, `open_door`
- `focus_today` → `simplify_today`, `celebration_ping`
- `celebration_ping` → `focus_today`

Si aucun fallback viable n'existe, la decision devient un skip.

## 3. Source de verite du bundle

L'export proactive V2 assemble:

- `get-momentum-trace`
- `get-momentum-scorecard`
- les `scheduled_checkins` morning (`morning_nudge_v2` et legacy
  `morning_active_actions_nudge`)

Le script ne depend pas de snapshots V2 dedies pour les nudges. Il s'appuie
d'abord sur les observability events momentum, puis utilise `scheduled_checkins`
pour recuperer le draft envoye et le payload de delivery.

## 4. Structure du JSON exporte

Le bundle contient:

- `ok`
- `exported_at`
- `source`
- `request`
- `trace`
- `scorecard`
- `legacy_momentum_scorecard`
- `annotations`

### `source`

- `supabase_url`
- `connection_type`
- `trace_endpoint`
- `scorecard_endpoint`
- `scheduled_checkin_contexts`

### `request`

- `user_id`
- `from`, `to`
- `scope` (`whatsapp`)
- `used_hours`

### `trace`

#### `trace.window`

- `from`, `to`, `scope`, `hours`

#### `trace.summary`

- `nudge_decisions_total`
- `nudge_deliveries_total`
- `nudge_skips_total`
- `nudge_reactions_total`
- `messages_total`
- `momentum_state_events_total`
- `observability_events_total`
- `scheduled_checkins_total`

#### `trace.nudge_decisions`

Reconstruit depuis `get-momentum-trace` sur `target_kind = morning_nudge`:

- `at`
- `decision` (`send` ou `skip`)
- `skip_reason`
- `posture`
- `confidence`
- `momentum_state`
- `plan_items_targeted`
- `delivery_status`
- `transport`
- `cooldown_check`
- `budget_state`
- `raw_payload`

Note:

- `cooldown_check` et `budget_state` sont renseignes seulement si ces infos sont
  presentes dans les payloads runtime
- sinon les champs restent `null`

#### `trace.nudge_deliveries`

Reconstruit depuis `scheduled_checkins`:

- `at`
- `scheduled_for`
- `event_context`
- `delivery_status`
- `posture`
- `message_content`
- `instruction`
- `fallback_text`
- `event_grounding`
- `plan_items_targeted`
- `confidence`
- `scheduled_checkin_id`

Important:

- `at` est derive de `processed_at`, puis `scheduled_for`, puis `created_at`
- `fallback_text` peut etre `null` si non persiste

#### `trace.nudge_reactions`

Reactions user detectees dans les 4h apres `trace.nudge_deliveries[*].at`:

- `nudge_at`
- `posture`
- `had_reaction`
- `reaction_at`
- `reaction_delay_minutes`
- `reaction_content_preview`

#### `trace.event_groundings`

Sous-ensemble des deliveries `pre_event_grounding`:

- `at`
- `event_title`
- `event_grounding`
- `message_sent`
- `scheduled_checkin_id`

#### `trace.momentum_state_timeline`

Copie de `trace.state_timeline` venant de `get-momentum-trace`.

#### `trace.momentum_proactive_decisions`

Copie brute des decisions proactives venant de `get-momentum-trace`.

## 5. Scorecard

`scorecard` est la vue audit specifique morning nudge.
`legacy_momentum_scorecard` conserve la scorecard momentum canonique.

### `scorecard.total_decisions`

Nombre total de decisions morning nudge observees.

### `scorecard.speak_rate`

Pourcentage de decisions `send`.

### `scorecard.posture_distribution`

Distribution des postures observees dans les deliveries.

### `scorecard.posture_repetition_rate`

Taux de repetitions consecutives de posture dans les deliveries.

### `scorecard.cooldown_violations`

- nombre si des checks cooldown explicites sont presents dans les decisions
- `null` sinon

### `scorecard.budget_violations`

- nombre si des compteurs budget explicites sont presents dans les decisions
- `null` sinon

### `scorecard.reaction_rate`

Pourcentage de deliveries ayant recu une reaction user dans les 4h.

### `scorecard.positive_reaction_rate`

Pourcentage de deliveries ayant recu une reaction dans les 2h.

### `scorecard.skip_reason_distribution`

Distribution normalisee des raisons de skip:

- `pause_consentie`
- `no_active_items`
- `budget_exceeded`
- `posture_fatigue`
- `no_viable_posture`
- ou la raison brute si non reconnue

### `scorecard.data_completeness`

Permet de savoir si certains controles sont vraiment auditables:

- `cooldown_checks_available`
- `budget_checks_available`

### `scorecard.alerts`

Alertes derivables aujourd'hui:

- `cooldown_violated`
- `budget_exceeded`
- `same_posture_3x`
- `no_reaction_5_consecutive`
- `systematic_skip`
- `systematic_speak`

Les alertes suivantes ne sont pas calculees tant que le runtime ne loggue pas
assez de contexte structure:

- `pre_event_too_early`
- `celebration_on_non_victory`
- un vrai `pre_event_timing_accuracy`
- un vrai timeline de budget glissant
- un vrai `cooldown_state_at_decisions`

## 6. Methode d'audit recommandee

1. Lire `scorecard.speak_rate`, `posture_distribution`, `reaction_rate`.
2. Verifier `scorecard.data_completeness` avant toute conclusion forte sur
   cooldown ou budget.
3. Lire `trace.nudge_decisions` pour comprendre pourquoi le systeme a parle ou
   saute.
4. Lire `trace.nudge_deliveries` pour verifier le contenu reel envoye.
5. Lire `trace.nudge_reactions` pour evaluer la reception utilisateur.
6. Croiser avec `trace.momentum_state_timeline` pour savoir si la posture etait
   coherente avec l'etat.
7. Utiliser le transcript pour lire le contexte conversationnel autour des
   nudges.

## 7. Limites connues

- Le bundle ne pretend pas reconstruire un cooldown ou un budget si ces infos
  n'ont pas ete logguees.
- `scheduled_checkins` ne fournit pas un `sent_at` canonique; le bundle derive
  un `at` a partir des colonnes disponibles.
- Le script inclut encore le context legacy `morning_active_actions_nudge` pour
  garder les fenetres mixtes lisibles.
- Le scorecard morning nudge complete la scorecard momentum globale; il ne la
  remplace pas.
