/**
 * V2 Transformation Handoff prompt — Tier 2 LLM call.
 *
 * Triggered when `user_transformations.status` passes to `completed`.
 * Produces a `TransformationHandoffPayload` that feeds the next
 * transformation's questionnaire context, conversation pulse, and
 * a `transition_handoff` rendez-vous for the user.
 *
 * This module provides:
 * - TransformationHandoffInput (what the LLM receives)
 * - System prompt + user prompt builder
 * - Validator that parses raw LLM output into a safe payload
 */

import type {
  ConversationPulse,
  PlanDimension,
  PlanItemKind,
  PlanItemStatus,
} from "../v2-types.ts";

// ── Output type — TransformationHandoffPayload (mvp-scope §7) ───────────────

export type TransformationHandoffPayload = {
  wins: string[];
  supports_to_keep: string[];
  habits_in_maintenance: string[];
  techniques_that_failed: string[];
  relational_signals: string[];
  coaching_memory_summary: string;
};

// ── Input types — what we send to the LLM ────────────────────────────────────

export type HandoffTransformationSnapshot = {
  id: string;
  title: string | null;
  internal_summary: string;
  user_summary: string;
  success_definition: string | null;
  activated_at: string | null;
  completed_at: string | null;
  duration_days: number | null;
};

export type HandoffPlanItemSnapshot = {
  id: string;
  title: string;
  dimension: PlanDimension;
  kind: PlanItemKind;
  status: PlanItemStatus;
  current_habit_state: string | null;
  total_entries: number;
  positive_entries: number;
  blocker_entries: number;
  skip_entries: number;
  last_entry_at: string | null;
};

export type HandoffVictorySnapshot = {
  title: string;
  created_at: string;
};

export type HandoffCoachingSnapshot = {
  technique_key: string | null;
  created_at: string;
  outcome: string | null;
};

export type HandoffMetricSnapshot = {
  metric_kind: string;
  label: string | null;
  current_value: number | null;
  target_value: number | null;
};

export type TransformationHandoffInput = {
  transformation: HandoffTransformationSnapshot;
  plan_items: HandoffPlanItemSnapshot[];
  victories: HandoffVictorySnapshot[];
  coaching_snapshots: HandoffCoachingSnapshot[];
  metrics: HandoffMetricSnapshot[];
  pulse_summary: {
    tone_dominant: string;
    trajectory_direction: string;
    likely_need: string;
    friction_points: string[];
    wins: string[];
  } | null;
};

// ── Input builder — pure, no DB ──────────────────────────────────────────────

function parseIsoMs(value: unknown): number {
  if (typeof value !== "string" || !value.trim()) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

const POSITIVE_KINDS = new Set(["checkin", "progress", "partial"]);
const BLOCKER_KINDS = new Set(["blocker"]);
const SKIP_KINDS = new Set(["skip"]);
const LOW_ACTIVITY_TOTAL_ENTRIES_THRESHOLD = 5;

export function buildHandoffTransformationSnapshot(
  transformation: Record<string, unknown>,
): HandoffTransformationSnapshot {
  const activatedMs = parseIsoMs(transformation.activated_at);
  const completedMs = parseIsoMs(transformation.completed_at);
  const durationDays = activatedMs > 0 && completedMs > activatedMs
    ? Math.round((completedMs - activatedMs) / (24 * 60 * 60 * 1000))
    : null;

  return {
    id: String(transformation.id ?? ""),
    title: transformation.title ? String(transformation.title) : null,
    internal_summary: String(transformation.internal_summary ?? ""),
    user_summary: String(transformation.user_summary ?? ""),
    success_definition: transformation.success_definition
      ? String(transformation.success_definition)
      : null,
    activated_at: transformation.activated_at
      ? String(transformation.activated_at)
      : null,
    completed_at: transformation.completed_at
      ? String(transformation.completed_at)
      : null,
    duration_days: durationDays,
  };
}

export function buildHandoffPlanItemSnapshot(
  item: Record<string, unknown>,
  entries: Array<Record<string, unknown>>,
): HandoffPlanItemSnapshot {
  return {
    id: String(item.id ?? ""),
    title: String(item.title ?? ""),
    dimension: String(item.dimension ?? "clarifications") as PlanDimension,
    kind: String(item.kind ?? "framework") as PlanItemKind,
    status: String(item.status ?? "active") as PlanItemStatus,
    current_habit_state: item.current_habit_state
      ? String(item.current_habit_state)
      : null,
    total_entries: entries.length,
    positive_entries: entries.filter((e) =>
      POSITIVE_KINDS.has(String(e.entry_kind ?? ""))
    ).length,
    blocker_entries: entries.filter((e) =>
      BLOCKER_KINDS.has(String(e.entry_kind ?? ""))
    ).length,
    skip_entries: entries.filter((e) =>
      SKIP_KINDS.has(String(e.entry_kind ?? ""))
    ).length,
    last_entry_at: entries.length > 0
      ? String(
        entries.sort((a, b) =>
          parseIsoMs(b.effective_at) - parseIsoMs(a.effective_at)
        )[0]?.effective_at ?? "",
      )
      : null,
  };
}

export function buildPulseSummaryForHandoff(
  pulse: ConversationPulse | null,
): TransformationHandoffInput["pulse_summary"] {
  if (!pulse) return null;
  return {
    tone_dominant: pulse.tone.dominant,
    trajectory_direction: pulse.trajectory.direction,
    likely_need: pulse.signals.likely_need,
    friction_points: pulse.highlights.friction_points,
    wins: pulse.highlights.wins,
  };
}

function totalEntriesCount(input: TransformationHandoffInput): number {
  return input.plan_items.reduce((sum, item) => sum + item.total_entries, 0);
}

function allowsPartialHandoff(input: TransformationHandoffInput): boolean {
  return (
    (input.transformation.duration_days !== null &&
      input.transformation.duration_days < 14) ||
    totalEntriesCount(input) < LOW_ACTIVITY_TOTAL_ENTRIES_THRESHOLD
  );
}

// ── System prompt ────────────────────────────────────────────────────────────

export const TRANSFORMATION_HANDOFF_SYSTEM_PROMPT =
  `Tu es le module de bilan de transformation de Sophia, une application de transformation personnelle.

## Ta mission

Quand une transformation se termine, tu produis un **handoff structuré** qui résume ce qui s'est passé, ce qui a fonctionné, ce qui n'a pas marché, et ce que le coaching a appris sur cet utilisateur. Ce handoff alimente directement la transformation suivante.

## Ce que tu reçois

### transformation
La transformation terminée : titre, résumé interne, résumé utilisateur, définition de succès, dates, durée.

### plan_items[]
Tous les items du plan de cette transformation, avec pour chacun :
- id, title, dimension (clarifications | missions | habits, avec legacy support possible), kind, status
- current_habit_state : état de l'habitude (null si pas une habitude)
- total_entries, positive_entries, blocker_entries, skip_entries
- last_entry_at

### victories[]
Les victoires enregistrées pendant cette transformation (titre + date).

### coaching_snapshots[]
Les interventions coaching tentées pendant cette transformation (technique, date, résultat).

### metrics[]
Les métriques suivies (north star, progress markers) avec valeurs actuelles et cibles.

### pulse_summary (optionnel)
Dernier pouls conversationnel : tonalité, trajectoire, besoins détectés.

## Ce que tu dois produire

### wins (1-5)
Victoires significatives de cette transformation. Chacune doit être :
- Ancrée dans des entries/victoires réelles présentes dans l'input (pas inventée)
- Formulée de façon concrète et spécifique (pas de platitude type "bonne progression")
- Maximum 100 caractères par victoire

### supports_to_keep (0-N)
Champ legacy conservé pour compatibilité. Il doit contenir en priorité les IDs de plan_items de dimension \`clarifications\` encore utiles pour la transformation suivante. Si des anciens items \`support\` existent encore dans les données historiques, ils peuvent aussi être gardés.

### habits_in_maintenance (0-N)
IDs de plan_items de type habit qui ont atteint l'ancrage (current_habit_state === "anchored" ou bonne progression régulière) et passent en maintenance. Ne lister que des IDs réels de plan_items dont kind === "habit".

### techniques_that_failed (0-N)
IDs de plan_items ou techniques coaching qui n'ont pas fonctionné (beaucoup de blockers, skip fréquents, feedbacks négatifs). Les identifier permet d'éviter de les reproposer.

### relational_signals (0-3)
Observations sur la relation utilisateur ↔ Sophia pendant cette transformation. Exemples :
- "Répond mieux aux nudges matinaux"
- "Préfère les bilans courts"
- "S'ouvre davantage après une victoire partagée"
Chaque signal fait maximum 150 caractères.

### coaching_memory_summary (obligatoire)
Un paragraphe de synthèse (maximum 200 tokens) de ce que le coaching a appris sur cet utilisateur pendant cette transformation. Ce résumé doit capturer :
- Les patterns de comportement observés
- Les leviers de motivation qui fonctionnent
- Les zones de fragilité à surveiller

## Règles strictes

1. **Résumer, pas copier** : le handoff RÉSUME. Il ne copie pas les données brutes. Chaque champ apporte une interprétation utile.
2. **IDs réels** :
   - supports_to_keep et habits_in_maintenance doivent contenir uniquement des IDs présents dans plan_items[]
   - supports_to_keep ne doit contenir que des IDs d'items dont dimension === "clarifications" (ou "support" legacy si présent)
   - habits_in_maintenance ne doit contenir que des IDs d'items dont kind === "habit"
   - techniques_that_failed peut contenir soit des IDs de plan_items présents dans plan_items[], soit des technique_keys présents dans coaching_snapshots[]
3. **Wins ancrés** : chaque win doit correspondre à un progrès réel observable dans les entries/victoires. Pas de compliments génériques.
4. **coaching_memory_summary concis** : maximum 200 tokens. Un seul paragraphe, pas de liste à puces.
5. **Transformation courte / peu active** : si duration_days < 14 ou si le total agrégé des total_entries de plan_items[] est < ${LOW_ACTIVITY_TOTAL_ENTRIES_THRESHOLD}, le handoff peut être partiel :
   - wins peut être vide
   - habits_in_maintenance peut être vide
   - coaching_memory_summary reste obligatoire (même bref)
6. **Pas de platitudes** : si rien de significatif ne s'est passé, le dire honnêtement plutôt que d'inventer des victoires.

## Format de sortie

Tu dois retourner UNIQUEMENT un JSON valide conforme à ce schéma :

\`\`\`json
{
  "wins": ["Victoire concrète 1", "Victoire concrète 2"],
  "supports_to_keep": ["uuid-plan-item-1"],
  "habits_in_maintenance": ["uuid-plan-item-2"],
  "techniques_that_failed": ["uuid-plan-item-3"],
  "relational_signals": ["Signal 1", "Signal 2"],
  "coaching_memory_summary": "Un paragraphe de synthèse..."
}
\`\`\`

Ne retourne RIEN d'autre que le JSON. Pas de texte avant, pas de texte après, pas de markdown.`;

// ── User prompt builder ──────────────────────────────────────────────────────

export function buildTransformationHandoffUserPrompt(
  input: TransformationHandoffInput,
): string {
  return `Voici les données de la transformation terminée :

${JSON.stringify(input, null, 2)}

Produis le JSON du transformation handoff.`;
}

// ── Validator ────────────────────────────────────────────────────────────────

export type TransformationHandoffValidationResult =
  | { valid: true; payload: TransformationHandoffPayload }
  | {
    valid: false;
    payload: TransformationHandoffPayload;
    violations: string[];
  };

const FALLBACK_PAYLOAD: TransformationHandoffPayload = {
  wins: [],
  supports_to_keep: [],
  habits_in_maintenance: [],
  techniques_that_failed: [],
  relational_signals: [],
  coaching_memory_summary: "",
};

function clampStringArray(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((s) => s.trim())
    .slice(0, max);
}

function filterValidIds(
  ids: string[],
  validIds: Set<string>,
): { kept: string[]; removed: string[] } {
  const kept: string[] = [];
  const removed: string[] = [];
  for (const id of ids) {
    if (validIds.has(id)) {
      kept.push(id);
    } else {
      removed.push(id);
    }
  }
  return { kept, removed };
}

export function validateTransformationHandoffOutput(
  raw: unknown,
  input: TransformationHandoffInput,
): TransformationHandoffValidationResult {
  const violations: string[] = [];

  if (raw == null || typeof raw !== "object") {
    return {
      valid: false,
      payload: { ...FALLBACK_PAYLOAD },
      violations: ["output is not an object"],
    };
  }

  const obj = raw as Record<string, unknown>;

  // Build valid ID sets from input
  const allItemIds = new Set(input.plan_items.map((i) => i.id));
  const supportItemIds = new Set(
    input.plan_items.filter((i) =>
      i.dimension === "support" || i.dimension === "clarifications"
    ).map((i) => i.id),
  );
  const habitItemIds = new Set(
    input.plan_items.filter((i) => i.kind === "habit").map((i) => i.id),
  );

  // --- wins ---
  let wins = clampStringArray(obj.wins, 5);
  if (wins.length === 0 && !allowsPartialHandoff(input)) {
    violations.push(
      "wins is empty for a transformation that is neither short nor low-activity",
    );
  }
  for (const win of wins) {
    if (win.length > 100) {
      violations.push(`win exceeds 100 chars: "${win.slice(0, 50)}..."`);
    }
  }
  wins = wins.map((w) => w.slice(0, 100));

  // --- supports_to_keep ---
  const rawSupports = clampStringArray(obj.supports_to_keep, 50);
  const supportsResult = filterValidIds(rawSupports, supportItemIds);
  const supportsInAllItems = filterValidIds(rawSupports, allItemIds);
  const nonSupportItems = supportsInAllItems.kept.filter(
    (id) => !supportItemIds.has(id),
  );
  if (nonSupportItems.length > 0) {
    violations.push(
      `supports_to_keep contains non-clarification items: ${nonSupportItems.join(", ")}`,
    );
  }
  const invalidSupportIds = rawSupports.filter((id) => !allItemIds.has(id));
  if (invalidSupportIds.length > 0) {
    violations.push(
      `supports_to_keep contains invalid IDs: ${invalidSupportIds.join(", ")}`,
    );
  }

  // --- habits_in_maintenance ---
  const rawHabits = clampStringArray(obj.habits_in_maintenance, 50);
  const habitsResult = filterValidIds(rawHabits, habitItemIds);
  const habitsInAllItems = filterValidIds(rawHabits, allItemIds);
  const nonHabitItems = habitsInAllItems.kept.filter(
    (id) => !habitItemIds.has(id),
  );
  if (nonHabitItems.length > 0) {
    violations.push(
      `habits_in_maintenance contains non-habit items: ${nonHabitItems.join(", ")}`,
    );
  }
  if (habitsResult.removed.length > 0) {
    violations.push(
      `habits_in_maintenance contains invalid IDs: ${habitsResult.removed.join(", ")}`,
    );
  }

  // --- techniques_that_failed ---
  const rawFailed = clampStringArray(obj.techniques_that_failed, 50);
  // Also allow coaching technique keys from coaching_snapshots
  const coachingKeys = new Set(
    input.coaching_snapshots
      .map((s) => s.technique_key)
      .filter((k): k is string => k != null && k.trim().length > 0),
  );
  const validFailedIds = rawFailed.filter(
    (id) => allItemIds.has(id) || coachingKeys.has(id),
  );
  const invalidFailedIds = rawFailed.filter(
    (id) => !allItemIds.has(id) && !coachingKeys.has(id),
  );
  if (invalidFailedIds.length > 0) {
    violations.push(
      `techniques_that_failed contains unknown IDs/keys: ${invalidFailedIds.join(", ")}`,
    );
  }

  // --- relational_signals ---
  let relationalSignals = clampStringArray(obj.relational_signals, 3);
  for (const sig of relationalSignals) {
    if (sig.length > 150) {
      violations.push(
        `relational_signal exceeds 150 chars: "${sig.slice(0, 50)}..."`,
      );
    }
  }
  relationalSignals = relationalSignals.map((s) => s.slice(0, 150));

  // --- coaching_memory_summary ---
  let coachingMemorySummary = typeof obj.coaching_memory_summary === "string"
    ? obj.coaching_memory_summary.trim()
    : "";
  if (!coachingMemorySummary) {
    violations.push("coaching_memory_summary is empty");
  }
  // Rough 200-token cap: ~800 chars for French text
  const TOKEN_CHAR_ESTIMATE = 800;
  if (coachingMemorySummary.length > TOKEN_CHAR_ESTIMATE) {
    violations.push(
      `coaching_memory_summary likely exceeds 200 tokens (${coachingMemorySummary.length} chars)`,
    );
    coachingMemorySummary = coachingMemorySummary.slice(0, TOKEN_CHAR_ESTIMATE);
  }

  const payload: TransformationHandoffPayload = {
    wins,
    supports_to_keep: supportsResult.kept,
    habits_in_maintenance: habitsResult.kept,
    techniques_that_failed: validFailedIds,
    relational_signals: relationalSignals,
    coaching_memory_summary: coachingMemorySummary,
  };

  if (violations.length > 0) {
    return { valid: false, payload, violations };
  }

  return { valid: true, payload };
}

// ── JSON parse helper ────────────────────────────────────────────────────────

export function parseTransformationHandoffLLMResponse(
  text: string,
  input: TransformationHandoffInput,
): TransformationHandoffValidationResult {
  let parsed: unknown;
  try {
    const trimmed = text.trim();
    const jsonStart = trimmed.indexOf("{");
    const jsonEnd = trimmed.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) {
      return {
        valid: false,
        payload: { ...FALLBACK_PAYLOAD },
        violations: ["no JSON object found in LLM response"],
      };
    }
    parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
  } catch {
    return {
      valid: false,
      payload: { ...FALLBACK_PAYLOAD },
      violations: ["failed to parse JSON from LLM response"],
    };
  }

  return validateTransformationHandoffOutput(parsed, input);
}
