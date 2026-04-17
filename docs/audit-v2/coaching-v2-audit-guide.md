# Coaching V2 Audit Guide

STATUT: complet — Lot 6C

Structure standard: voir
[v2-audit-strategy.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-audit-strategy.md)

Refonte de:
[coaching-intervention-audit-analysis-guide.md](/Users/ahmedamara/Dev/Sophia%202/docs/coaching-intervention-audit-analysis-guide.md)

## 1. Objectif

Auditer la qualite du coaching V2 sur une fenetre donnee, de bout en bout:

```
message user / trigger routeur
→ selector run
→ gate coaching
→ proposition d'intervention
→ rendu dans la reponse
→ follow-up
→ apprentissage technique
```

Le focus V2 porte sur 4 questions:

- le blocage est-il rattache a la bonne dimension (`mission`, `habit`,
  `support`) ?
- le coaching reste-t-il `micro` quand il devrait etre `structural` ?
- le systeme conclut-il `simplify` quand `plan_fit=poor` ou
  `load_balance=overloaded` ?
- les techniques et suivis restent-ils coherents avec le plan item cible ?

## 2. Source de verite du bundle

L'export coaching V2 ne depend pas d'un rail de snapshots V2 dedie. Il assemble
4 sources reelles:

- `get-coaching-intervention-trace`
- `get-coaching-intervention-scorecard`
- `momentum_state_updated_v2` depuis `system_runtime_snapshots`
- `user_plan_items` du plan actif

Le bundle part donc du trace/scorecard coaching existants, puis les enrichit
avec le contexte V2 disponible au moment de l'export.

Consequence importante:

- les sections `selector_runs`, `interventions`, `follow_ups`, `weekly_surfaces`
  viennent du trace endpoint canonique
- les champs V2 (`dimension_detected`, `coaching_scope`, `simplify_instead`,
  `plan_fit_level`, `load_balance_level`, etc.) sont lifts depuis les payloads
  d'observabilite quand ils existent
- sur de vieilles fenetres ou avant le rewiring V2 complet, certains champs
  peuvent etre `null`

## 3. Structure du JSON exporte

Le bundle contient:

- `ok`
- `exported_at`
- `source`
- `request`
- `trace`
- `scorecard`
- `legacy_scorecard`
- `annotations`

### `source`

- `supabase_url`
- `connection_type`
- `trace_endpoint`
- `scorecard_endpoint`

### `request`

- `user_id`
- `scope`
- `from`, `to`
- `used_hours`

### `trace`

Le coeur du bundle.

#### `trace.window`

- `from`, `to`, `scope`

#### `trace.summary`

Vient du trace canonique:

- `messages_total`, `user_messages`, `assistant_messages`
- `turns_total`
- `selector_runs_total`
- `interventions_total`
- `follow_ups_total`
- `weekly_surfaces_total`
- `observability_events_total`

#### `trace.messages`

Messages bruts pour lecture humaine et transcript.

#### `trace.turns`

Reconstruction logique des tours issue du trace endpoint:

- `turn_id`, `request_id`, `started_at`
- `user_message`, `assistant_messages`
- `selector_runs`, `intervention_events`, `follow_up_events`, `events`

#### `trace.selector_runs`

Runs du selecteur coaching enrichis V2:

- base canonique: `trigger_type`, `momentum_state`, `blocker_type`,
  `confidence`, `eligible`, `skip_reason`
- base canonique: `recommended_technique`, `candidate_techniques`,
  `follow_up_needed`
- enrichissement V2: `blocker_kind`
- enrichissement V2: `dimension_detected`
- enrichissement V2: `item_kind`
- enrichissement V2: `coaching_scope`
- enrichissement V2: `simplify_instead`
- enrichissement V2: `dimension_strategy`
- enrichissement V2: `plan_fit_level`, `load_balance_level`
- enrichissement V2: `target_plan_item_id`, `target_plan_item_title`,
  `target_plan_item_dimension`
- `payload`

#### `trace.interventions`

Interventions proposees, enrichies V2:

- `intervention_id`, `proposed_at`
- `trigger_type`, `momentum_state`, `blocker_type`, `confidence`
- `recommended_technique`, `candidate_techniques`
- `follow_up_needed`, `follow_up_due_at`
- `dimension_detected`, `item_kind`
- `coaching_scope`, `simplify_instead`, `dimension_strategy`
- `plan_fit_level`, `load_balance_level`
- `target_plan_item_*`
- `proposal`, `render`, `follow_up`, `events`

#### `trace.follow_ups`

Follow-ups du trace canonique, enrichis par jointure sur `intervention_id` quand
possible:

- `follow_up_outcome`, `helpful`
- `recommended_technique`
- `dimension_detected`, `coaching_scope`, `simplify_instead`

#### `trace.weekly_surfaces`

Sorties weekly du rail coaching existant:

- `weekly_recommendation`
- `summary`
- `coaching_scope_at_weekly` si present dans le payload

#### `trace.momentum_context`

Snapshots `momentum_state_updated_v2` dans la fenetre:

- `current_state`
- `posture`
- `dimensions`
- `assessment`
- `active_load`

#### `trace.plan_items_snapshot`

Contexte plan V2 au moment de l'export:

- `id`, `dimension`, `kind`, `title`, `status`
- `current_habit_state`, `activation_order`

#### `trace.unassigned_events`

Events coaching non rattaches a un turn.

## 4. Scorecard

`scorecard` est la vue V2 enrichie pour audit. `legacy_scorecard` conserve la
sortie brute de `get-coaching-intervention-scorecard`.

### `scorecard.coverage`

Copie du coverage canonique:

- `turns_total`
- `user_messages`, `assistant_messages`
- `selector_runs_total`, `interventions_total`, `follow_ups_total`
- `weekly_surfaces_total`
- `observability_events_total`

### `scorecard.triggers`

Distribution brute des triggers.

### `scorecard.gating`

Scorecard canonique:

- `eligible_total`
- `blocked_total`
- `by_gate`
- `skipped_total`

### `scorecard.blockers`

Scorecard canonique:

- `distribution`
- `confidence`

### `scorecard.dimension_distribution`

Distribution des dimensions detectees dans `selector_runs`:

- `mission`
- `habit`
- `support`
- `unknown`

### `scorecard.coaching_scope_distribution`

Distribution des scopes dans `interventions`:

- `micro`
- `structural`
- `unknown`

### `scorecard.simplify_conclusions`

- `total`
- `with_overloaded_load`
- `with_poor_plan_fit`
- `ignored_despite_overload`

### `scorecard.techniques`

- scorecard canonique par technique
- `proposed_by_dimension`: repartition par dimension detectee

### `scorecard.effectiveness`

Reprise du scorecard canonique:

- `proposal_total`
- `tried_total`
- `helpful_total`
- `behavior_changed_total`
- `proposal_to_try_rate`
- `try_to_helpful_rate`
- `behavior_change_rate`
- `repeat_failed_technique_rate`

### `scorecard.weekly`

Distribution des recommandations weekly existantes.

### `scorecard.alerts`

`list` contient les alertes auditablement derivables aujourd'hui:

- `dimension_mismatch`
- `simplify_ignored_despite_overload`
- `structural_needed_but_micro_given`
- `low_confidence_selector_runs`
- `repeated_failed_technique_signals`

Les compteurs sont aussi exposes separement.

## 5. Regles d'interpretation

### Dimension-aware

Mapping attendu:

- `mission`: item `missions`
- `habit`: item `habits`
- `support`: item `support`

Une alerte `dimension_mismatch` n'est fiable que si:

- `dimension_detected` est renseigne
- `target_plan_item_dimension` est renseigne

Sinon, conclure "non observable" plutot que "incorrect".

### Micro vs structural

Cas a surveiller:

- `coaching_scope=micro` alors que `plan_fit_level=poor`
- `coaching_scope=micro` alors que `load_balance_level=overloaded`

Ce pattern nourrit `structural_needed_but_micro_given`.

### Simplify

Cas attendu:

- `simplify_instead=true` quand surcharge structurelle evidente

Cas d'alerte:

- `load_balance_level=overloaded` ou `plan_fit_level=poor`
- et pourtant `simplify_instead=false`

## 6. Methode d'audit recommandee

1. Lire `scorecard.coverage` pour verifier qu'il y a assez de volume.
2. Regarder `scorecard.dimension_distribution` et `coaching_scope_distribution`.
3. Inspecter `scorecard.simplify_conclusions`.
4. Zoomer sur `trace.selector_runs` pour les cas `unknown`, `low confidence`,
   `simplify=false` sous surcharge.
5. Verifier `trace.interventions` et `trace.follow_ups` pour voir si le rendu et
   l'apprentissage suivent.
6. Relire `trace.momentum_context` et `trace.plan_items_snapshot` avant toute
   conclusion sur `plan_fit` ou `load_balance`.
7. Utiliser le transcript texte pour lire les tours autour des cas critiques.

## 7. Limites connues

- Le bundle n'invente pas de donnees V2 absentes du runtime.
- Sur des fenetres anciennes, `dimension_detected`, `coaching_scope` ou
  `simplify_instead` peuvent etre `null`.
- `follow_ups` heritent du contexte V2 via `intervention_id`; si la jointure ne
  matche pas, les champs enrichis restent `null`.
- Le scorecard V2 enrichi complete le scorecard legacy; il ne le remplace pas
  comme source historique.
