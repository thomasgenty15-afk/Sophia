/**
 * V2 Weekly Recalibrage prompt — Tier 2 LLM call.
 *
 * Produces a WeeklyBilanOutput: hold/expand/consolidate/reduce decision
 * with up to 3 load_adjustments, a coaching note, and a posture for next week.
 */

import type {
  ConversationPulse,
  MomentumStateV2,
  PlanDimension,
  PlanItemKind,
  PlanItemStatus,
  WeeklyConversationDigest,
} from "../v2-types.ts";

import type {
  CurrentPhaseRuntimeContext,
  PlanItemRuntimeRow,
} from "../v2-runtime.ts";

// ---------------------------------------------------------------------------
// Input type — what the LLM receives
// ---------------------------------------------------------------------------

export type WeeklyItemSnapshot = {
  id: string;
  title: string;
  dimension: PlanDimension;
  kind: PlanItemKind;
  status: PlanItemStatus;
  week_entries_count: number;
  positive_entries: number;
  blocker_entries: number;
  skip_entries: number;
  difficulty_high_count: number;
  completion_rate: number | null;
  has_strong_progress: boolean;
  has_repeated_blocker: boolean;
};

export type WeeklyBilanV2Input = {
  items: WeeklyItemSnapshot[];
  phase_context: {
    current_phase_id: string | null;
    current_phase_order: number | null;
    current_phase_title: string | null;
    total_phases: number;
    heartbeat_title: string | null;
    heartbeat_unit: string | null;
    heartbeat_current: number | null;
    heartbeat_target: number | null;
    heartbeat_progress_ratio: number | null;
    heartbeat_reached: boolean;
    heartbeat_almost_reached: boolean;
    transition_ready: boolean;
  } | null;
  momentum: {
    current_state: MomentumStateV2["current_state"];
    posture: MomentumStateV2["posture"]["recommended_posture"];
    emotional_load: MomentumStateV2["dimensions"]["emotional_load"]["level"];
    consent_level: MomentumStateV2["dimensions"]["consent"]["level"];
    execution_traction:
      MomentumStateV2["dimensions"]["execution_traction"]["level"];
    load_balance: MomentumStateV2["dimensions"]["load_balance"]["level"];
    top_blocker: string | null;
    top_risk: MomentumStateV2["assessment"]["top_risk"];
  };
  pulse_summary: {
    tone_dominant: ConversationPulse["tone"]["dominant"];
    trajectory_direction: ConversationPulse["trajectory"]["direction"];
    trajectory_summary: string;
    wins: string[];
    friction_points: string[];
    likely_need: ConversationPulse["signals"]["likely_need"];
  } | null;
  weekly_digest: WeeklyConversationDigest | null;
  victories: string[];
  recurring_blockers: string[];
};

// ---------------------------------------------------------------------------
// Snapshot builder — pure, no DB
// ---------------------------------------------------------------------------

const PROGRESS_KINDS = new Set(["checkin", "progress", "partial"]);
const BLOCKER_KINDS = new Set(["blocker"]);
const SKIP_KINDS = new Set(["skip"]);
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function buildWeeklyItemSnapshot(
  item: PlanItemRuntimeRow,
  nowMs: number,
): WeeklyItemSnapshot {
  const cutoff = nowMs - SEVEN_DAYS_MS;
  const weekEntries = item.recent_entries.filter(
    (e) => new Date(e.effective_at).getTime() >= cutoff,
  );

  const positiveEntries =
    weekEntries.filter((e) => PROGRESS_KINDS.has(e.entry_kind)).length;
  const blockerEntries =
    weekEntries.filter((e) => BLOCKER_KINDS.has(e.entry_kind)).length;
  const skipEntries = weekEntries.filter((e) => SKIP_KINDS.has(e.entry_kind))
    .length;
  const difficultyHigh = weekEntries.filter(
    (e) => e.difficulty_level === "high",
  ).length;

  let completionRate: number | null = null;
  if (item.target_reps != null && item.target_reps > 0) {
    completionRate = Math.min(1, positiveEntries / item.target_reps);
  }

  return {
    id: item.id,
    title: item.title,
    dimension: item.dimension,
    kind: item.kind,
    status: item.status,
    week_entries_count: weekEntries.length,
    positive_entries: positiveEntries,
    blocker_entries: blockerEntries,
    skip_entries: skipEntries,
    difficulty_high_count: difficultyHigh,
    completion_rate: completionRate,
    has_strong_progress: completionRate != null
      ? completionRate >= 0.6
      : positiveEntries >= 3,
    has_repeated_blocker: blockerEntries >= 2,
  };
}

export function buildWeeklyBilanV2Input(
  planItems: PlanItemRuntimeRow[],
  momentum: MomentumStateV2,
  pulse: ConversationPulse | null | undefined,
  nowMs?: number,
  weeklyDigest?: WeeklyConversationDigest | null,
  phaseContext?: CurrentPhaseRuntimeContext | null,
): WeeklyBilanV2Input {
  // Weekly logic should receive a runtime with enough entries to cover
  // the full rolling 7-day window (use getWeeklyPlanItemRuntime, not the
  // default getPlanItemRuntime cap of 5 entries/item).
  const now = nowMs ?? Date.now();
  const items = planItems.map((item) => buildWeeklyItemSnapshot(item, now));

  const victories = items
    .filter((i) => i.has_strong_progress)
    .map((i) => i.title);

  const recurringBlockers = items
    .filter((i) => i.has_repeated_blocker)
    .map((i) => i.title);

  const pulseSummary = pulse
    ? {
      tone_dominant: pulse.tone.dominant,
      trajectory_direction: pulse.trajectory.direction,
      trajectory_summary: pulse.trajectory.summary,
      wins: pulse.highlights.wins,
      friction_points: pulse.highlights.friction_points,
      likely_need: pulse.signals.likely_need,
    }
    : null;

  return {
    items,
    phase_context: phaseContext
      ? {
        current_phase_id: phaseContext.current_phase_id,
        current_phase_order: phaseContext.current_phase_order,
        current_phase_title: phaseContext.current_phase_title,
        total_phases: phaseContext.total_phases,
        heartbeat_title: phaseContext.heartbeat_title,
        heartbeat_unit: phaseContext.heartbeat_unit,
        heartbeat_current: phaseContext.heartbeat_current,
        heartbeat_target: phaseContext.heartbeat_target,
        heartbeat_progress_ratio: phaseContext.heartbeat_progress_ratio,
        heartbeat_reached: phaseContext.heartbeat_reached,
        heartbeat_almost_reached: phaseContext.heartbeat_almost_reached,
        transition_ready: phaseContext.transition_ready,
      }
      : null,
    momentum: {
      current_state: momentum.current_state,
      posture: momentum.posture.recommended_posture,
      emotional_load: momentum.dimensions.emotional_load.level,
      consent_level: momentum.dimensions.consent.level,
      execution_traction: momentum.dimensions.execution_traction.level,
      load_balance: momentum.dimensions.load_balance.level,
      top_blocker: momentum.assessment.top_blocker,
      top_risk: momentum.assessment.top_risk,
    },
    pulse_summary: pulseSummary,
    weekly_digest: weeklyDigest ?? null,
    victories,
    recurring_blockers: recurringBlockers,
  };
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

export const WEEKLY_RECALIBRAGE_SYSTEM_PROMPT =
  `Tu es le module de recalibrage hebdomadaire de Sophia, une application de transformation personnelle.

## Ta mission

Tu reçois un bilan de la semaine écoulée pour un utilisateur : ses items de plan actifs avec leurs résultats, son état de momentum, et optionnellement deux signaux conversationnels complémentaires.

Tu dois produire une décision de recalibrage qui ajuste la charge de travail pour la semaine suivante.

## Données que tu reçois

### Items de plan (items[])
Chaque item a :
- id, title, dimension (support | missions | habits), kind, status
- week_entries_count : nombre total d'entrées cette semaine
- positive_entries : entrées de progrès (checkin, progress, partial)
- blocker_entries : entrées de type blocker
- skip_entries : entrées de type skip
- difficulty_high_count : nombre d'entrées marquées difficulté haute
- completion_rate : ratio si target_reps défini (0 à 1), null sinon
- has_strong_progress : true si completion_rate >= 0.6 ou >= 3 entrées positives
- has_repeated_blocker : true si >= 2 entrées blocker

### Contexte de phase (phase_context, optionnel)
Quand il est présent, il décrit la phase active du plan :
- current_phase_title / current_phase_order / total_phases
- heartbeat_title, heartbeat_unit, heartbeat_current, heartbeat_target
- heartbeat_progress_ratio
- heartbeat_reached : le seuil Heartbeat est atteint
- heartbeat_almost_reached : la phase est très proche du seuil
- transition_ready : la phase peut probablement basculer à la suivante

Si transition_ready === true, tu peux le mentionner dans le reasoning ou la
coaching_note, mais tu ne crées pas d'ajustement spécial de transition : tu
restes dans le schéma JSON existant.

### Momentum (momentum)
- current_state : momentum | friction_legere | evitement | pause_consentie | soutien_emotionnel | reactivation
- posture recommandée, charge émotionnelle, niveau de consentement, traction d'exécution, balance de charge
- top_blocker et top_risk éventuels

### Pulse conversationnel (pulse_summary, optionnel)
Résumé des conversations récentes : tonalité, trajectoire, points de friction, victoires.

### Digest conversationnel de la semaine (weekly_digest, optionnel)
Signal rétrospectif sur TOUTE la semaine : tonalité dominante, évolution, moments de traction / fatigue, blocage concret, risque principal la semaine suivante, opportunité relationnelle.

Le digest est plus global que le pulse :
- pulse_summary = snapshot récent (dernières heures / dernier jour)
- weekly_digest = arc de la semaine entière

Quand les deux divergent, accorde plus de poids au weekly_digest pour la décision hebdomadaire.
Si weekly_digest.confidence === "low", traite-le comme un signal faible mais utile.

### Victoires et blockers
- victories[] : titres des items en forte progression
- recurring_blockers[] : titres des items avec blockers répétés

## Ta décision

Tu dois choisir UNE décision parmi :

### hold (défaut)
La charge actuelle convient. Pas de changement majeur.
Choisis hold si :
- L'exécution est stable (même imparfaite)
- Les signaux sont mixtes sans tendance claire
- L'utilisateur est en friction légère mais pas en détresse
- Aucun signal fort ne pousse vers expand, consolidate ou reduce

### expand
L'utilisateur a de la marge pour prendre plus. Activer un item en attente.
Choisis expand UNIQUEMENT si :
- Au moins un item a has_strong_progress === true
- execution_traction est "up" ou "flat"
- load_balance n'est PAS "overloaded"
- emotional_load est "low" ou "medium"
- Il existe des items en status "pending" à activer

### consolidate
L'utilisateur avance mais de façon fragile. Passer certains items en maintenance.
Choisis consolidate si :
- Progression inégale (certains items bien, d'autres stagnent)
- load_balance est "slightly_heavy"
- L'utilisateur montre des signes de fatigue sans être en crise

### reduce
L'utilisateur est en surcharge ou en difficulté. Désactiver des items.
Choisis reduce si :
- load_balance est "overloaded"
- emotional_load est "high"
- Plusieurs items ont has_repeated_blocker === true
- current_state est "evitement" ou "soutien_emotionnel"

## Règles strictes

1. **Célébrer avant de corriger** : retained_wins DOIT lister les victoires de la semaine AVANT toute suggestion de changement.
2. **Max 3 ajustements** : load_adjustments contient au maximum 3 entrées.
3. **Cohérence reduce** : si decision === "reduce", AUCUN adjustment de type "activate" n'est autorisé.
4. **Cohérence expand** : si decision === "expand", au moins un item doit avoir has_strong_progress === true dans l'input.
5. **IDs valides** : chaque target_item_id dans load_adjustments DOIT correspondre à un id présent dans items[].
6. **Pas de doublon** : un même target_item_id ne peut apparaître qu'une fois dans load_adjustments.
7. **Posture obligatoire** : suggested_posture_next_week est toujours renseigné.
8. **Coaching sobre** : coaching_note est optionnelle. Si présente, 1 à 2 phrases max, ton empathique et direct (tutoiement), pas de jargon.
9. **Lecture des deux signaux** : utilise tone_evolution pour arbitrer hold vs reduce/consolidate, best_traction_moments pour renforcer expand, closure_fatigue_moments pour renforcer reduce/consolidate, most_real_blockage / main_risk_next_week / relational_opportunity pour enrichir le raisonnement et la coaching_note.

## Format de sortie

Tu dois retourner UNIQUEMENT un JSON valide conforme à ce schéma :

\`\`\`json
{
  "decision": "hold" | "expand" | "consolidate" | "reduce",
  "reasoning": "Explication concise (2-3 phrases) de la décision",
  "retained_wins": ["victoire 1", "victoire 2"],
  "retained_blockers": ["blocker récurrent 1"],
  "load_adjustments": [
    {
      "type": "activate" | "deactivate" | "maintenance" | "replace",
      "target_item_id": "uuid de l'item",
      "reason": "Explication courte"
    }
  ],
  "coaching_note": "Note optionnelle, 1-2 phrases, ton Sophia",
  "suggested_posture_next_week": "steady" | "lighter" | "support_first" | "reengage"
}
\`\`\`

### Types d'ajustement

- **activate** : passer un item pending/paused → active
- **deactivate** : passer un item active → paused (temporairement retiré)
- **maintenance** : passer un item active → in_maintenance (suivi allégé)
- **replace** : désactiver un item ET en activer un autre (compte comme 1 ajustement, mais target_item_id est l'item désactivé ; l'item activé est dans reason)

### Postures

- **steady** : continuer comme cette semaine
- **lighter** : alléger la pression
- **support_first** : priorité au soutien émotionnel
- **reengage** : réengager doucement après une pause

## Critère de performance

Un bon recalibrage :
- Protège l'utilisateur de la surcharge (reduce quand nécessaire)
- Ne freine pas un élan positif (expand quand mérité)
- Préfère hold quand le doute existe (primum non nocere)
- Donne le sentiment que Sophia comprend la semaine écoulée

Ne retourne RIEN d'autre que le JSON. Pas de texte avant, pas de texte après, pas de markdown.`;

// ---------------------------------------------------------------------------
// User prompt builder
// ---------------------------------------------------------------------------

export function buildWeeklyRecalibrageUserPrompt(
  input: WeeklyBilanV2Input,
): string {
  return `Voici le bilan de la semaine écoulée :

${JSON.stringify(input, null, 2)}

Produis le JSON de recalibrage.`;
}
