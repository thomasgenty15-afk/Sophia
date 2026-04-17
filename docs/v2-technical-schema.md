# V2 Technical Schema

## Statut

Document canonique de schema technique pour la V2.

Ce document complete:

- [onboarding-v2-canonique.md](/Users/ahmedamara/Dev/Sophia%202/docs/onboarding-v2-canonique.md)
- [v2-systemes-vivants-implementation.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-systemes-vivants-implementation.md)
- [v2-orchestration-rules.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-orchestration-rules.md)
- [v2-mvp-scope.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-mvp-scope.md)
- [v2-audit-strategy.md](/Users/ahmedamara/Dev/Sophia%202/docs/v2-audit-strategy.md)

Son role est strictement technique.

Il fixe:

- les entites cibles
- les enums
- les relations
- les state shapes
- les payloads d'events
- les vues runtime
- les invariants techniques
- les decisions de source de verite

Il ne decrit pas le plan d'implementation. Il decrit la cible canonique sur
laquelle ce plan devra s'appuyer.

Ce document est la **source de verite unique** pour toutes les definitions de
types, enums et state shapes. Les autres docs V2 doivent y referer, pas les
redefinir.

## 1. Principes techniques

### 1.1 Regle majeure

Le systeme V2 est structure autour de 3 niveaux metier:

- `cycle`
- `transformation`
- `plan`

Regles:

- `1 cycle` contient `1 a 3 transformations`
- `1 transformation` peut avoir `0 ou 1 plan actif`
- `1 plan` appartient a `1 transformation`
- `1 plan` contient plusieurs `plan_items`

### 1.2 Regle de canonicalite

Les sources de verite cibles sont:

- `user_cycles`
- `user_transformations`
- `user_plans_v2`
- `user_plan_items`
- `user_chat_states.temp_memory` pour le runtime conversationnel transitoire
- tables de logs / entries / events pour l'observabilite et l'execution

### 1.3 Regle de runtime

Le produit ne doit pas relire dix tables brutes partout. Il doit pouvoir
reconstruire une vue runtime claire a partir de:

- tables metier stables
- events
- quelques vues/materialized views si necessaire

## 1bis. Decisions de source de verite

### Plan JSON vs plan_items

Decision canonique:

- `user_plan_items` est la **source de verite d'execution**
- `user_plans_v2.content` est un **snapshot de generation, read-only apres
  distribution**
- aucune sync bidirectionnelle
- les ajustements runtime (weekly, coaching, deactivation) modifient
  `user_plan_items`, jamais le JSON
- le JSON ne doit pas etre relu pour piloter l'execution

### North Star

Decision canonique:

- la North Star est une **metric canonique** de kind `north_star` dans
  `user_metrics`
- il n'y a pas de table separee ni de champ dedie sur `user_cycles`
- maximum `1` metric active de kind `north_star` et scope `cycle` par cycle

### State shapes runtime

Decision canonique:

- les state shapes vivant dans `user_chat_states.temp_memory` portent un champ
  `version`
- toute lecture doit passer par un helper
  `migrateIfNeeded(payload, currentVersion)` qui assure la compatibilite
  ascendante
- les anciennes versions sont migrées lazily au moment du read, jamais par batch

## 2. Enums canoniques

## 2.1 Cycle

```ts
type CycleStatus =
  | "draft"
  | "clarification_needed"
  | "structured"
  | "prioritized"
  | "questionnaire_in_progress"
  | "signup_pending"
  | "profile_pending"
  | "ready_for_plan"
  | "active"
  | "completed"
  | "abandoned";
```

## 2.2 Transformation

```ts
type TransformationStatus =
  | "draft"
  | "ready"
  | "pending"
  | "active"
  | "completed"
  | "cancelled"
  | "archived";
```

## 2.3 Aspect

```ts
type TransformationAspectStatus =
  | "active"
  | "deferred"
  | "rejected";

type TransformationAspectUncertainty =
  | "low"
  | "medium"
  | "high";

type DeferredReason =
  | "not_priority_now"
  | "later_cycle"
  | "out_of_scope"
  | "user_choice"
  | "unclear";
```

## 2.4 Plan

```ts
type PlanStatus =
  | "draft"
  | "generated"
  | "active"
  | "paused"
  | "completed"
  | "archived";
```

## 2.5 Plan item

```ts
type PlanDimension =
  | "support"
  | "missions"
  | "habits";

type PlanItemKind =
  | "framework"
  | "exercise"
  | "task"
  | "milestone"
  | "habit";

type PlanItemStatus =
  | "pending"
  | "active"
  | "in_maintenance"
  | "completed"
  | "deactivated"
  | "cancelled"
  | "stalled";

type SupportMode =
  | "always_available"
  | "recommended_now"
  | "unlockable";

type SupportFunction =
  | "practice"
  | "rescue"
  | "understanding";

type HabitState =
  | "active_building"
  | "in_maintenance"
  | "stalled";

type TrackingType =
  | "boolean"
  | "count"
  | "scale"
  | "text"
  | "milestone";
```

## 2.6 North star and metrics

```ts
type MetricScope =
  | "cycle"
  | "transformation";

type MetricKind =
  | "north_star"
  | "progress_marker"
  | "support_metric"
  | "custom";

type MetricStatus =
  | "active"
  | "paused"
  | "completed"
  | "archived";
```

## 2.7 Momentum

```ts
type MomentumStateLabel =
  | "momentum"
  | "friction_legere"
  | "evitement"
  | "pause_consentie"
  | "soutien_emotionnel"
  | "reactivation";

type MomentumPosture =
  | "push_lightly"
  | "simplify"
  | "hold"
  | "support"
  | "reopen_door"
  | "reduce_load"
  | "repair";

type ConfidenceLevel =
  | "low"
  | "medium"
  | "high";
```

## 2.8 Proactive system

```ts
type ProactiveBudgetClass =
  | "silent"
  | "light"
  | "notable";

type ProactiveWindowKind =
  | "morning_presence"
  | "pre_event_grounding"
  | "midday_rescue"
  | "evening_reflection_light"
  | "reactivation_window";

type ProactiveWindowDecision =
  | "create_window"
  | "reschedule_window"
  | "cancel_window"
  | "downgrade_to_soft_presence"
  | "skip";

type MorningNudgePosture =
  | "protective_pause"
  | "support_softly"
  | "pre_event_grounding"
  | "open_door"
  | "simplify_today"
  | "focus_today"
  | "celebration_ping";

type CooldownType =
  | "same_posture"
  | "same_item_reminded"
  | "failed_technique"
  | "refused_rendez_vous"
  | "reactivation_after_silence";

type DominantNeedKind =
  | "pre_event"
  | "emotional_protection"
  | "load_relief"
  | "traction_rescue"
  | "reactivation"
  | "general_presence";

type RendezVousKind =
  | "pre_event_grounding"
  | "post_friction_repair"
  | "weekly_reset"
  | "mission_preparation"
  | "transition_handoff";

type RendezVousState =
  | "draft"
  | "scheduled"
  | "delivered"
  | "skipped"
  | "cancelled"
  | "completed";
```

## 2.9 Bilans

```ts
type DailyBilanMode =
  | "check_light"
  | "check_supportive"
  | "check_blocker"
  | "check_progress";

type WeeklyDecision =
  | "hold"
  | "expand"
  | "consolidate"
  | "reduce";
```

## 3. Tables cibles

## 3.1 `user_cycles`

Entite racine d'un cycle de transformation.

Champs cibles:

```ts
type UserCycleRow = {
  id: string;
  user_id: string;
  status: CycleStatus;
  raw_intake_text: string;
  intake_language: string | null;
  validated_structure: Record<string, unknown> | null;
  duration_months: 1 | 2 | 3 | null;
  birth_date_snapshot: string | null;
  gender_snapshot: string | null;
  active_transformation_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  archived_at: string | null;
};
```

Notes:

- `validated_structure` porte le snapshot onboarding cycle-level: structure
  provisoire issue de la structuration, puis structure validee apres
  cristallisation.
- `duration_months`, `birth_date_snapshot`, `gender_snapshot` peuvent rester
  `null` tant que le cycle est pre-signup ou pre-profile.
- `active_transformation_id` facilite la runtime view.

## 3.2 `user_cycle_drafts`

Option recommandee pour separer le pre-signup du persisté utilisateur.

```ts
type UserCycleDraftRow = {
  id: string;
  anonymous_session_id: string;
  status: "draft" | "structured" | "prioritized" | "expired";
  raw_intake_text: string;
  draft_payload: Record<string, unknown>;
  expires_at: string;
  created_at: string;
  updated_at: string;
};
```

Notes:

- Cette table sert de cache serveur best-effort pour le draft onboarding V2
  pre-signup, cle par `anonymous_session_id`.
- Invariant runtime: un seul draft actif par `anonymous_session_id`, TTL 7 jours,
  cleanup inline au moment des `upsert` / `hydrate`.
- RLS active sans policy `auth.uid()`: acces uniquement via edge function
  `cycle-draft` avec `service_role`.

## 3.3 `user_transformations`

Entite metier principale a l'interieur d'un cycle.

```ts
type UserTransformationRow = {
  id: string;
  cycle_id: string;
  priority_order: number;
  status: TransformationStatus;
  title: string | null;
  internal_summary: string;
  user_summary: string;
  success_definition: string | null;
  main_constraint: string | null;
  questionnaire_schema: Record<string, unknown> | null;
  questionnaire_answers: Record<string, unknown> | null;
  completion_summary: string | null;
  handoff_payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  activated_at: string | null;
  completed_at: string | null;
};
```

## 3.4 `user_transformation_aspects`

Stocke les aspects detectes et valides/differes/rejetes.

```ts
type UserTransformationAspectRow = {
  id: string;
  cycle_id: string;
  transformation_id: string | null;
  label: string;
  raw_excerpt: string | null;
  status: TransformationAspectStatus;
  uncertainty_level: TransformationAspectUncertainty;
  deferred_reason: DeferredReason | null;
  source_rank: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};
```

Notes:

- `transformation_id=null` est possible pour les aspects encore non assignes ou
  deferes au niveau cycle.

## 3.5 `user_plans_v2`

Nouvelle table pour les plans V2. L'ancienne `user_plans` reste en place pour
les flows legacy.

```ts
type UserPlanV2Row = {
  id: string;
  user_id: string;
  cycle_id: string;
  transformation_id: string;
  status: PlanStatus;
  version: number;
  title: string | null;
  content: Record<string, unknown>;
  generation_attempts: number;
  last_generation_reason: string | null;
  activated_at: string | null;
  completed_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};
```

Notes:

- `content` est le snapshot JSON du plan (read-only apres distribution).
- La source relationnelle principale pour l'execution reste `user_plan_items`.
- Cette table est distincte de l'ancienne `user_plans` qui reste pour le legacy.

## 3.6 `user_plan_items`

Nouvelle colonne vertebrale de l'execution.

```ts
type UserPlanItemRow = {
  id: string;
  user_id: string;
  cycle_id: string;
  transformation_id: string;
  plan_id: string;
  dimension: PlanDimension;
  kind: PlanItemKind;
  status: PlanItemStatus;
  title: string;
  description: string | null;
  tracking_type: TrackingType;
  activation_order: number | null;
  activation_condition: Record<string, unknown> | null;
  current_habit_state: HabitState | null;
  support_mode: SupportMode | null;
  support_function: SupportFunction | null;
  target_reps: number | null;
  current_reps: number | null;
  cadence_label: string | null;
  scheduled_days: string[] | null;
  time_of_day: string | null;
  start_after_item_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  activated_at: string | null;
  completed_at: string | null;
};
```

Notes:

- `activation_condition` permet de representer le debloquage sans phases.
- `support_mode` et `support_function` ne s'appliquent qu'aux items
  `dimension=support`.

## 3.7 `user_plan_item_entries`

Journal unifie d'execution.

```ts
type UserPlanItemEntryRow = {
  id: string;
  user_id: string;
  cycle_id: string;
  transformation_id: string;
  plan_id: string;
  plan_item_id: string;
  entry_kind:
    | "checkin"
    | "progress"
    | "skip"
    | "partial"
    | "blocker"
    | "support_feedback";
  outcome: string;
  value_numeric: number | null;
  value_text: string | null;
  difficulty_level: "low" | "medium" | "high" | null;
  blocker_hint: string | null;
  created_at: string;
  effective_at: string;
  metadata: Record<string, unknown>;
};
```

Notes:

- Peut a terme remplacer une partie de la fragmentation actuelle entre
  actions/frameworks/vitals.

## 3.8 `user_metrics`

Table unique pour toutes les metrics (cycle-level et transformation-level).

```ts
type UserMetricRow = {
  id: string;
  user_id: string;
  cycle_id: string;
  transformation_id: string | null;
  scope: MetricScope;
  kind: MetricKind;
  status: MetricStatus;
  title: string;
  unit: string | null;
  current_value: string | null;
  target_value: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};
```

Notes:

- `transformation_id = null` pour les metrics `scope = "cycle"` (ex: North Star)
- `transformation_id` requis pour les metrics `scope = "transformation"` (ex:
  progress markers)
- maximum `1` metric active de kind `north_star` et scope `cycle` par cycle

## 3.9 `user_victory_ledger`

Nouvelle table recommandee.

```ts
type UserVictoryLedgerRow = {
  id: string;
  user_id: string;
  cycle_id: string;
  transformation_id: string | null;
  plan_item_id: string | null;
  title: string;
  summary: string;
  confidence: ConfidenceLevel;
  source_kind: "daily" | "weekly" | "chat" | "system";
  created_at: string;
  metadata: Record<string, unknown>;
};
```

## 3.10 `user_relation_preferences`

Nouvelle table recommandee.

```ts
type RelationPreferenceContactWindow =
  | "morning"
  | "afternoon"
  | "evening";

type UserRelationPreferencesRow = {
  user_id: string;
  preferred_contact_windows: RelationPreferenceContactWindow[] | null;
  disliked_contact_windows: RelationPreferenceContactWindow[] | null;
  preferred_tone: "gentle" | "direct" | "mixed" | null;
  preferred_message_length: "short" | "medium" | null;
  max_proactive_intensity: "low" | "medium" | "high" | null;
  soft_no_contact_rules: Record<string, unknown> | null;
  updated_at: string;
};
```

Notes:

- `preferred_contact_windows` / `disliked_contact_windows` utilisent les valeurs
  canoniques `morning`, `afternoon`, `evening`
- la table est alimentee par inference progressive depuis l'historique reel
  (nudges envoyes, reactions, horaires, longueur des reponses)
- aucun questionnaire explicite ne doit remplir cette table
- un changement ne doit etre persiste qu'en cas de signal suffisant

## 3.11 `user_rendez_vous`

Nouvelle table recommandee.

```ts
type UserRendezVousRow = {
  id: string;
  user_id: string;
  cycle_id: string;
  transformation_id: string | null;
  kind: RendezVousKind;
  state: RendezVousState;
  budget_class: ProactiveBudgetClass;
  trigger_reason: string;
  confidence: ConfidenceLevel;
  scheduled_for: string | null;
  posture: "gentle" | "supportive" | "preparatory" | "repair";
  source_refs: Record<string, unknown>;
  linked_checkin_id: string | null;
  created_at: string;
  updated_at: string;
  delivered_at: string | null;
};
```

## 3.12 `user_chat_states.temp_memory.__repair_mode_v1`

Source de verite canonique du `repair mode`.

Le `repair mode` est un etat runtime conversationnel, pas un etat metier stable
du cycle.

```ts
type RepairModeState = {
  version: 1;
  active: boolean;
  entered_at: string | null;
  reason: string | null;
  source: "router" | "watcher" | "process_checkins" | "system";
  reopen_signals_count: number;
  last_soft_contact_at: string | null;
};
```

Notes:

- la source de verite canonique est
  `user_chat_states.temp_memory.__repair_mode_v1`
- les snapshots et events ne servent qu'a l'audit et au debug

## 3.13 `system_runtime_snapshots`

Table recommandee pour snapshots systeme utiles au debug et aux recalculs.

```ts
type SystemRuntimeSnapshotRow = {
  id: string;
  user_id: string;
  cycle_id: string | null;
  transformation_id: string | null;
  snapshot_type: string;
  payload: Record<string, unknown>;
  created_at: string;
};
```

Notes:

- Cette table peut servir d'audit court terme et de cache runtime.
- `snapshot_type` accepte les 5 snapshots historiques, tous les event types V2
  de la section 6, et `cooldown_entry` pour les cooldowns registres de la Phase
  A.

## 4. Relations canoniques

```text
users
  -> user_cycles
      -> user_transformations
          -> user_transformation_aspects
          -> user_plans_v2
              -> user_plan_items
                  -> user_plan_item_entries
      -> user_metrics (scope = cycle | transformation)
      -> user_victory_ledger
      -> user_rendez_vous

users
  -> user_relation_preferences
  -> user_chat_states
```

## 5. JSON / state shapes canoniques

## 5.1 `PlanContentV2`

Snapshot de generation, **read-only apres distribution** dans `user_plan_items`.

```ts
type PlanContentV2 = {
  version: 2;
  cycle_id: string;
  transformation_id: string;
  duration_months: 1 | 2 | 3;
  title: string;
  user_summary: string;
  internal_summary: string;
  strategy: {
    identity_shift: string | null;
    core_principle: string | null;
    success_definition: string | null;
    main_constraint: string | null;
  };
  cycle_north_star_suggestion: {
    title: string | null;
    unit: string | null;
  };
  dimensions: Array<{
    id: PlanDimension;
    title: string;
    items: Array<PlanContentItem>;
  }>;
  timeline_summary: string | null;
  metadata: Record<string, unknown>;
};

type PlanContentItem = {
  temp_id: string;
  dimension: PlanDimension;
  kind: PlanItemKind;
  title: string;
  description: string;
  tracking_type: TrackingType;
  activation_order: number | null;
  activation_condition: Record<string, unknown> | null;
  support_mode: SupportMode | null;
  support_function: SupportFunction | null;
  target_reps: number | null;
  cadence_label: string | null;
  scheduled_days: string[] | null;
  time_of_day: string | null;
  payload: Record<string, unknown>;
};
```

Notes:

- `temp_id` est un identifiant temporaire de generation, remplace par un vrai
  UUID lors de la distribution en `user_plan_items`
- ce JSON n'est **jamais modifie** apres distribution
- toute lecture runtime doit passer par `user_plan_items`, pas par ce snapshot

## 5.2 `ConversationPulse`

```ts
type ConversationPulse = {
  version: 1;
  generated_at: string;
  window_days: 7;
  last_72h_weight: number;
  tone: {
    dominant: "steady" | "hopeful" | "mixed" | "strained" | "closed";
    emotional_load: "low" | "medium" | "high";
    relational_openness: "open" | "fragile" | "closed";
  };
  trajectory: {
    direction: "up" | "flat" | "down" | "mixed";
    confidence: ConfidenceLevel;
    summary: string;
  };
  highlights: {
    wins: string[];
    friction_points: string[];
    support_that_helped: string[];
    unresolved_tensions: string[];
  };
  signals: {
    top_blocker: string | null;
    likely_need: "push" | "simplify" | "support" | "silence" | "repair";
    upcoming_event: string | null;
    proactive_risk: "low" | "medium" | "high";
  };
  evidence_refs: {
    message_ids: string[];
    event_ids: string[];
  };
};
```

## 5.3 `WeeklyConversationDigest`

Artefact retrospectif hebdomadaire genere avant le weekly bilan.

```ts
type WeeklyConversationDigest = {
  version: 1;
  week_start: string;
  generated_at: string;
  dominant_tone: string;
  tone_evolution: string;
  best_traction_moments: string[];
  closure_fatigue_moments: string[];
  most_real_blockage: string | null;
  support_that_helped: string | null;
  main_risk_next_week: string | null;
  relational_opportunity: string | null;
  confidence: ConfidenceLevel;
  message_count: number;
  active_days: number;
};
```

Notes:

- `week_start` est une date ISO locale, debut de la semaine analysee
- digest retrospectif 7 jours, distinct du `ConversationPulse` qui reste un
  signal conversationnel temps-reel
- si `message_count < 3`, retourner un digest silencieux canonique:
  `dominant_tone = "silence"`, `tone_evolution = "peu d'echanges cette semaine"`,
  listes vides, champs nullable a `null`, `confidence = "low"`
- si `message_count < 5`, forcer `confidence = "low"` et neutraliser les
  insights nullable insuffisamment fiables

## 5.4 `MomentumStateV2`

```ts
type MomentumStateV2 = {
  version: 2;
  updated_at: string;
  current_state: MomentumStateLabel;
  state_reason: string;
  dimensions: {
    engagement: { level: "high" | "medium" | "low"; reason?: string };
    execution_traction: {
      level: "up" | "flat" | "down" | "unknown";
      reason?: string;
    };
    emotional_load: { level: "low" | "medium" | "high"; reason?: string };
    consent: { level: "open" | "fragile" | "closed"; reason?: string };
    plan_fit: { level: "good" | "uncertain" | "poor"; reason?: string };
    load_balance: {
      level: "balanced" | "slightly_heavy" | "overloaded";
      reason?: string;
    };
  };
  assessment: {
    top_blocker: string | null;
    top_risk: "load" | "avoidance" | "emotional" | "consent" | "drift" | null;
    confidence: ConfidenceLevel;
  };
  active_load: {
    current_load_score: number;
    mission_slots_used: number;
    support_slots_used: number;
    habit_building_slots_used: number;
    needs_reduce: boolean;
    needs_consolidate: boolean;
  };
  posture: {
    recommended_posture: MomentumPosture;
    confidence: ConfidenceLevel;
  };
  blockers: {
    blocker_kind: "mission" | "habit" | "support" | "global" | null;
    blocker_repeat_score: number;
  };
  memory_links: {
    conversation_pulse_id?: string | null;
    upcoming_event_id?: string | null;
    last_useful_support_ids: string[];
    last_failed_technique_ids: string[];
  };
};
```

## 5.5 `DailyBilanOutput`

```ts
type DailyBilanOutput = {
  mode: DailyBilanMode;
  target_items: string[];
  prompt_shape: {
    max_questions: 3;
    tone: "light" | "supportive" | "direct";
  };
  expected_capture: {
    progress_evidence: boolean;
    difficulty: boolean;
    blocker_hint: boolean;
    support_usefulness: boolean;
    consent_signal: boolean;
  };
  next_actions: {
    update_momentum: boolean;
    trigger_coaching_review: boolean;
    mark_unlock_candidate: boolean;
  };
};
```

## 5.6 `WeeklyBilanOutput`

```ts
type WeeklyBilanOutput = {
  decision: WeeklyDecision;
  reasoning: string;
  retained_wins: string[];
  retained_blockers: string[];
  load_adjustments: Array<{
    type: "activate" | "deactivate" | "maintenance" | "replace";
    target_item_id: string;
    reason: string;
  }>;
  coaching_note?: string;
  suggested_posture_next_week:
    | "steady"
    | "lighter"
    | "support_first"
    | "reengage";
};
```

## 5.7 `RendezVousRuntime`

```ts
type RendezVousRuntime = {
  id: string;
  cycle_id: string;
  transformation_id?: string | null;
  kind: RendezVousKind;
  state: RendezVousState;
  budget_class: ProactiveBudgetClass;
  trigger_reason: string;
  confidence: ConfidenceLevel;
  scheduled_for?: string | null;
  source_refs: {
    event_id?: string | null;
    conversation_pulse_id?: string | null;
    blocker_key?: string | null;
  };
  posture: "gentle" | "supportive" | "preparatory" | "repair";
};
```

## 5.8 `MemoryRetrievalContract`

Contrats de retrieval specialises par intention runtime.

```ts
type MemoryRetrievalIntent =
  | "answer_user_now"
  | "nudge_decision"
  | "daily_bilan"
  | "weekly_bilan"
  | "rendez_vous_or_outreach";

type MemoryLayerScope =
  | "cycle"
  | "transformation"
  | "execution"
  | "coaching"
  | "relational"
  | "event";

type MemoryRetrievalContract = {
  intent: MemoryRetrievalIntent;
  layers: MemoryLayerScope[];
  budget_tier: "minimal" | "light" | "medium" | "full";
  max_tokens_hint: number;
};
```

Contrats canoniques:

```ts
const MEMORY_CONTRACTS: Record<MemoryRetrievalIntent, MemoryRetrievalContract> =
  {
    answer_user_now: {
      intent: "answer_user_now",
      layers: [
        "cycle",
        "transformation",
        "execution",
        "coaching",
        "relational",
        "event",
      ],
      budget_tier: "full",
      max_tokens_hint: 2000,
    },
    nudge_decision: {
      intent: "nudge_decision",
      layers: ["execution", "relational", "event", "coaching"],
      budget_tier: "light",
      max_tokens_hint: 500,
    },
    daily_bilan: {
      intent: "daily_bilan",
      layers: ["execution", "coaching", "event"],
      budget_tier: "minimal",
      max_tokens_hint: 300,
    },
    weekly_bilan: {
      intent: "weekly_bilan",
      layers: ["cycle", "transformation", "execution", "coaching", "event"],
      budget_tier: "medium",
      max_tokens_hint: 1200,
    },
    rendez_vous_or_outreach: {
      intent: "rendez_vous_or_outreach",
      layers: ["event", "relational", "execution"],
      budget_tier: "light",
      max_tokens_hint: 400,
    },
  };
```

## 6. Events canoniques

## 6.1 Regle

Les events V2 doivent etre:

- suffisamment explicites pour l'audit
- suffisamment compacts pour rester exploitables
- suffisamment stables pour servir aux tests et au replay

## 6.2 Events onboarding / cycle

Je recommande:

- `cycle_created_v2`
- `cycle_structured_v2`
- `cycle_prioritized_v2`
- `cycle_profile_completed_v2`
- `transformation_activated_v2`
- `transformation_completed_v2`
- `transformation_handoff_generated_v2`
- `plan_generated_v2`
- `plan_activated_v2`

Payload minimal type:

```ts
type LifecycleEventPayload = {
  user_id: string;
  cycle_id: string;
  transformation_id?: string | null;
  plan_id?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
};
```

## 6.3 Events runtime

Je recommande:

- `conversation_pulse_generated_v2`
- `weekly_digest_generated_v2`
- `momentum_state_updated_v2`
- `active_load_recomputed_v2`
- `daily_bilan_decided_v2`
- `daily_bilan_completed_v2`
- `weekly_bilan_decided_v2`
- `weekly_bilan_completed_v2`
- `proactive_window_decided_v2`
- `morning_nudge_generated_v2`
- `rendez_vous_state_changed_v2`
- `repair_mode_entered_v2`
- `repair_mode_exited_v2`
- `plan_item_entry_logged_v2`
- `metric_recorded_v2`

## 6.4 Events memoire

Je recommande:

- `memory_retrieval_executed_v2`
- `memory_persisted_v2`
- `memory_handoff_v2`

### `memory_retrieval_executed_v2`

```ts
type MemoryRetrievalExecutedEvent = {
  user_id: string;
  cycle_id: string | null;
  transformation_id: string | null;
  intent: MemoryRetrievalIntent;
  layers_loaded: MemoryLayerScope[];
  tokens_used: number;
  hit_count: number;
  budget_tier: string;
};
```

### `memory_persisted_v2`

```ts
type MemoryPersistedEvent = {
  user_id: string;
  cycle_id: string | null;
  transformation_id: string | null;
  layer: MemoryLayerScope;
  action: "create" | "enrich" | "update" | "noop";
  memory_type: "topic" | "global" | "event" | "core_identity";
  memory_id: string | null;
};
```

### `memory_handoff_v2`

```ts
type MemoryHandoffEvent = {
  user_id: string;
  cycle_id: string;
  from_transformation_id: string;
  to_transformation_id: string;
  wins_count: number;
  supports_kept_count: number;
  techniques_failed_count: number;
};
```

## 6.5 Events coaching

Je recommande:

- `coaching_blocker_detected_v2`
- `coaching_intervention_proposed_v2`
- `coaching_intervention_rendered_v2`
- `coaching_follow_up_captured_v2`
- `coaching_technique_deprioritized_v2`

## 6.6 Event payloads specifiques

### `conversation_pulse_generated_v2`

```ts
type ConversationPulseGeneratedEvent = {
  user_id: string;
  cycle_id: string | null;
  transformation_id: string | null;
  snapshot_id: string;
  dominant_tone: string;
  likely_need: string;
  proactive_risk: string;
};
```

### `weekly_digest_generated_v2`

```ts
type WeeklyDigestGeneratedEvent = {
  user_id: string;
  cycle_id: string | null;
  transformation_id: string | null;
  snapshot_id: string;
  week_start: string;
  dominant_tone: string;
  confidence: ConfidenceLevel;
  message_count: number;
  active_days: number;
};
```

### `momentum_state_updated_v2`

```ts
type MomentumStateUpdatedEvent = {
  user_id: string;
  cycle_id: string | null;
  transformation_id: string | null;
  current_state: MomentumStateLabel;
  posture: MomentumPosture;
  confidence: ConfidenceLevel;
  top_risk: string | null;
};
```

### `proactive_window_decided_v2`

```ts
type ProactiveWindowDecidedEvent = {
  user_id: string;
  cycle_id: string | null;
  transformation_id: string | null;
  window_kind: ProactiveWindowKind;
  decision: ProactiveWindowDecision;
  budget_class: ProactiveBudgetClass;
  posture: MorningNudgePosture | null;
  confidence: ConfidenceLevel;
  reason: string;
};
```

### `weekly_bilan_decided_v2`

```ts
type WeeklyBilanDecidedEvent = {
  user_id: string;
  cycle_id: string;
  transformation_id: string;
  plan_id: string;
  decision: WeeklyDecision;
  adjustment_count: number;
  suggested_posture_next_week: string | null;
};
```

### `rendez_vous_state_changed_v2`

```ts
type RendezVousStateChangedEvent = {
  user_id: string;
  cycle_id: string;
  transformation_id: string | null;
  rendez_vous_id: string;
  kind: RendezVousKind;
  previous_state: RendezVousState | null;
  new_state: RendezVousState;
  budget_class: ProactiveBudgetClass;
  scheduled_for: string | null;
  trigger_reason: string;
  linked_checkin_id: string | null;
  metadata?: Record<string, unknown>;
};
```

### `repair_mode_entered_v2`

```ts
type RepairModeEnteredEvent = {
  user_id: string;
  cycle_id: string | null;
  transformation_id: string | null;
  reason: string;
  source: "router" | "watcher" | "process_checkins" | "system";
  proactive_no_echo_count: number;
  consent_decline_count: number;
};
```

### `repair_mode_exited_v2`

```ts
type RepairModeExitedEvent = {
  user_id: string;
  cycle_id: string | null;
  transformation_id: string | null;
  reason: string;
  reopen_signals_count: number;
  duration_ms: number;
};
```

## 7. Runtime views recommandees

## 7.1 `v_active_transformation_runtime`

Vue logique principale du dashboard et des systemes aval.

Contient:

- cycle actif
- transformation active
- plan actif
- north star cycle
- progress markers transformation
- counts de plan items par dimension/statut

## 7.2 `v_plan_item_runtime`

Vue normalisee pour les items actifs.

Contient:

- plan_item
- last_entry_at
- recent_traction
- support_value_score
- habit_anchoring_score
- blocker_repeat_score
- unlock_readiness

## 7.3 `v_proactive_runtime_context`

Vue ou payload runtime pour les decisions proactives.

Contient:

- relation preferences
- conversation_pulse courant
- momentum_state courant
- active_load courant
- recent proactive history
- upcoming event memory

## 7.4 `v_weekly_runtime_context`

Vue ou payload runtime weekly.

Contient:

- item_weekly_snapshot
- blockers_summary
- victory_ledger recent
- support effectiveness summary
- transformation handoff flags si necessaire

## 8. Invariants techniques

## 8.1 Invariants metier

- `1 cycle actif max` par user
- `1 transformation active max` par cycle
- `1 plan actif max` par transformation
- `1 north star active max` par cycle
- `3 transformations max` par cycle
- `2 generation_attempts max` par transformation tant que la regle produit le
  demande

## 8.2 Invariants d'execution

- pas plus de `1 mission principale` active
- pas plus de `1 mission secondaire` active si surcharge
- pas plus de `2 habits` en `active_building`
- un item `completed` ne redevient pas `active` sans event explicite
- `in_maintenance` ne doit pas bloquer un unlock

## 8.3 Invariants proactifs

- aucun proactive notable si `pause_consentie`
- aucun morning nudge si `confidence=low`
- aucun rendez-vous sans `trigger_reason`
- aucun rendez-vous si `confidence=low`
- aucun `expand` weekly si `needs_reduce=true`
- aucun proactive sans respect du cooldown engine

## 8.4 Invariants North Star

- la North Star canonique vit dans `user_metrics` avec `scope = "cycle"` et
  `kind = "north_star"`
- il ne doit pas exister une deuxieme verite metier concurrente sur
  `user_cycles`
- maximum `1` metric active de kind `north_star` par cycle

## 8.5 Invariants source de verite plan

- `user_plan_items` est la source de verite d'execution
- `user_plans_v2.content` est un snapshot de generation read-only
- aucun systeme runtime ne doit relire `user_plans_v2.content` pour piloter
  l'execution
- les ajustements weekly/coaching/deactivation modifient uniquement
  `user_plan_items`

## 8.6 Invariants Repair Mode

- le `repair mode` canonique vit dans
  `user_chat_states.temp_memory.__repair_mode_v1`
- `repair` peut etre une posture momentum, mais pas la source de verite
- toute entree/sortie de `repair mode` doit produire un event d'observabilite

## 8.7 Invariants memoire

- le retrieval ne charge jamais toutes les couches simultanement: seulement
  celles de l'intention active
- chaque retrieval doit respecter le `budget_tier` et le `max_tokens_hint` de
  son contrat
- le tagging `scope` (cycle/transformation/relational) est obligatoire pour les
  nouvelles global memories
- la memoire d'une transformation terminee n'est pas chargee par defaut dans le
  retrieval de la transformation suivante
- le handoff resume la memoire, il ne la copie pas

## 9. Compatibilite avec l'existant

## 9.1 Ce qui peut rester temporairement

- `user_chat_states`
- `chat_messages`
- une partie des tables d'observabilite
- `event_memory`
- registries coaching

## 9.2 Ce qui doit cesser d'etre canonique

- `current_phase`
- `user_goals` comme coeur metier des transformations
- `user_actions / user_framework_tracking / user_vital_signs` comme grille
  principale de runtime

## 9.3 Position recommandee

Page blanche metier, mais reutilisation maximale des briques techniques et
d'observabilite.

## 10. Budget LLM et strategie de cout

## 10.1 Classification des appels LLM

Les appels LLM V2 se repartissent en 3 tiers:

### Tier 1 - critique (modele performant requis)

- structuration des aspects (onboarding)
- cristallisation des transformations (onboarding)
- generation du plan (onboarding)

Ces appels sont rares (1 a 3 par cycle complet) et justifient un modele
performant.

### Tier 2 - recurrent (modele intermediaire acceptable)

- generation du questionnaire sur mesure
- conversation_pulse (max 1x/jour)
- weekly bilan decision
- weekly conversation digest

Ces appels sont hebdomadaires ou quotidiens. Un modele intermediaire suffit.

### Tier 3 - routine (modele rapide/cheap prioritaire)

- momentum classifier
- daily bilan mode selection
- morning nudge posture selection
- coaching micro-selector

Ces appels sont potentiellement quotidiens. Privilegier des modeles rapides ou
des heuristiques quand possible.

## 10.2 Regles de budget

- privilegier le caching: un `conversation_pulse` frais de moins de 12h n'a pas
  besoin d'etre regenere
- privilegier les heuristiques: le daily mode peut etre choisi par regles
  deterministes dans 80% des cas
- ne pas recalculer le momentum a chaque message: seulement sur signal fort ou
  cron
- limiter les appels LLM Tier 2/3 a `1` par fenetre temporelle et par user

## 10.3 Fallback

- si un appel LLM echoue, conserver le dernier snapshot valide
- ne jamais inventer un contexte riche a partir d'un fallback
- reduire l'ambition de la decision (ex: `hold` par defaut si le weekly echoue)

## 11. Ce qu'il faut produire juste apres ce document

Une fois ce schema technique valide, il faut produire:

1. un document `V2 orchestration rules`
2. un document `V2 implementation plan`

Le premier dira:

- qui decide quoi
- quand
- avec quelles priorites
- avec quels fallbacks

Le second dira:

- dans quel ordre on refond les fichiers et les tables
- comment on verifie chaque couche
- quand on supprime le legacy
