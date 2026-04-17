/**
 * V2 Conversation Pulse prompt — Tier 2 LLM call.
 *
 * Synthesizes the last 7 days of user-assistant conversation into a
 * structured ConversationPulse used downstream by daily/weekly bilans,
 * morning nudges, and the proactive window decider.
 *
 * This module provides:
 * - ConversationPulseInput (what the LLM receives)
 * - System prompt + user prompt builder
 * - Validator that parses raw LLM output into a safe ConversationPulse
 */

import type { ConfidenceLevel, ConversationPulse } from "../v2-types.ts";

// ---------------------------------------------------------------------------
// Input types — what we send to the LLM
// ---------------------------------------------------------------------------

export type ConversationMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  created_at: string;
};

export type RecentBilanSummary = {
  kind: "daily" | "weekly";
  date: string;
  /** Short human summary — 1-2 lines, not the full payload. */
  summary: string;
};

export type EventMemorySummary = {
  id: string;
  title: string;
  /** ISO date of the event, or "upcoming" if in the future. */
  date: string;
  relevance: string;
};

export type RecentTransformationHandoffSummary = {
  transformation_id: string;
  title: string | null;
  completed_at: string | null;
  wins: string[];
  relational_signals: string[];
  coaching_memory_summary: string;
  questionnaire_context: string[];
};

export type ConversationPulseInput = {
  /** Messages from the last 7 days, chronological, truncated to budget. */
  messages: ConversationMessage[];
  /** Count of messages in the last 72h (for weighting guidance). */
  messages_last_72h_count: number;
  /** Recent daily/weekly bilan summaries (max 3). */
  recent_bilans: RecentBilanSummary[];
  /** Nearby event memories (max 3). */
  event_memories: EventMemorySummary[];
  /** Optional summary of the most recent completed transformation handoff. */
  recent_transformation_handoff: RecentTransformationHandoffSummary | null;
  /** Current date in user's local timezone (ISO date string). */
  local_date: string;
};

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

export const CONVERSATION_PULSE_SYSTEM_PROMPT =
  `Tu es le module de pouls conversationnel de Sophia, une application de transformation personnelle.

## Ta mission

Tu analyses les messages récents entre l'utilisateur et Sophia (7 derniers jours) pour produire un **résumé structuré et actionnable** de l'état conversationnel.

Ce résumé (le "pulse") est utilisé en interne par :
- Le bilan quotidien (pour ajuster le ton et le ciblage)
- Le bilan hebdomadaire (pour contextualiser les décisions de recalibrage)
- Le nudge matinal (pour calibrer la posture proactive)

Le pulse n'est JAMAIS montré directement à l'utilisateur.

## Données que tu reçois

### Messages (messages[])
Messages user + assistant des 7 derniers jours, en ordre chronologique.
Tu sais combien de messages datent des dernières 72h (messages_last_72h_count) — donne-leur plus de poids dans ton analyse.

### Bilans récents (recent_bilans[], max 3)
Résumés courts des derniers bilans daily/weekly. Utiles pour comprendre la dynamique récente sans relire tous les messages.

### Mémoires d'événements (event_memories[], max 3)
Événements proches (passés ou à venir) qui peuvent influencer l'état émotionnel ou la disponibilité.

### Handoff de transformation récent (recent_transformation_handoff, optionnel)
Quand la transformation active vient de changer, tu peux recevoir un mini résumé structuré de la transformation précédente:
- wins marquantes
- signaux relationnels retenus
- résumé coaching
- questionnaire_context qui décrit les acquis/points de vigilance à porter dans la suite
Utilise-le comme **contexte de continuité**, pas comme substitut aux messages récents.

## Ce que tu dois produire

### tone
- **dominant** : la tonalité dominante de la conversation. UN SEUL choix parmi :
  - "steady" : l'utilisateur est stable, neutre ou serein
  - "hopeful" : l'utilisateur montre de l'optimisme, de la motivation ou de l'élan
  - "mixed" : les signaux sont contradictoires ou changent au fil des jours
  - "strained" : l'utilisateur montre de la tension, de la fatigue ou de la frustration
  - "closed" : l'utilisateur est distant, monosyllabique ou désengagé
- **emotional_load** : charge émotionnelle globale ("low" | "medium" | "high")
- **relational_openness** : qualité de la relation avec Sophia ("open" | "fragile" | "closed")

### trajectory
- **direction** : "up" | "flat" | "down" | "mixed"
  - Compare les 72 premières heures vs les 72 dernières heures de la fenêtre
  - "up" = amélioration visible, "down" = dégradation, "flat" = stable, "mixed" = oscillations
- **confidence** : "low" | "medium" | "high" — selon la quantité et la qualité des signaux
- **summary** : 1-2 phrases décrivant la trajectoire. Factuel, pas interprétif.

### highlights
- **wins** : max 3 victoires ou progrès mentionnés (formulation courte)
- **friction_points** : max 3 points de friction, blocages ou difficultés
- **support_that_helped** : max 3 techniques/supports que l'utilisateur a trouvés utiles
- **unresolved_tensions** : max 3 tensions non résolues qui persistent

### signals
- **top_blocker** : le blocker principal identifié, ou null
- **likely_need** : UN SEUL choix parmi :
  - "push" : l'utilisateur a besoin d'être poussé (bonne dynamique, peut faire plus)
  - "simplify" : l'utilisateur a besoin qu'on simplifie (surcharge, confusion)
  - "support" : l'utilisateur a besoin de soutien émotionnel
  - "silence" : l'utilisateur semble avoir besoin d'espace (désengagement non hostile)
  - "repair" : la relation avec Sophia est abîmée et nécessite une approche de réparation
- **upcoming_event** : événement proche détecté dans les messages ou mémoires, ou null
- **proactive_risk** : risque d'une action proactive mal reçue ("low" | "medium" | "high")
  - "high" si l'utilisateur est fermé, irrité, ou a signalé vouloir de l'espace
  - "medium" si les signaux sont mixtes
  - "low" si l'utilisateur est ouvert et engagé

### evidence_refs
- **message_ids** : les IDs des 3 à 5 messages les plus informatifs pour le pulse
- **event_ids** : les IDs des event memories référencés (0 à 3)

## Règles strictes

1. **Pas un résumé** : le pulse est un diagnostic structuré, pas un résumé des conversations.
2. **Caps quantitatifs** : wins ≤ 3, friction_points ≤ 3, support_that_helped ≤ 3, unresolved_tensions ≤ 3, message_ids entre 3 et 5.
3. **Valeurs exactes** : utilise exclusivement les valeurs enum listées ci-dessus. Pas de synonymes.
4. **Pondération 72h** : les messages récents comptent plus. Si la tendance des 72 dernières heures contredit le début de la semaine, la tendance récente l'emporte.
5. **Absence de données** : si très peu de messages (< 3), mets confidence à "low", direction à "flat", et likely_need à "silence".
6. **Un seul likely_need** : même si plusieurs besoins coexistent, choisis le plus urgent.
7. **Formulations courtes** : chaque win/friction_point/support/tension en 1 phrase max (15 mots max).
8. **Primauté du présent** : le handoff récent sert à garder la continuité entre transformations, mais il ne doit jamais écraser les signaux des 7 derniers jours.

## Format de sortie

Tu dois retourner UNIQUEMENT un JSON valide conforme à ce schéma :

\`\`\`json
{
  "tone": {
    "dominant": "steady" | "hopeful" | "mixed" | "strained" | "closed",
    "emotional_load": "low" | "medium" | "high",
    "relational_openness": "open" | "fragile" | "closed"
  },
  "trajectory": {
    "direction": "up" | "flat" | "down" | "mixed",
    "confidence": "low" | "medium" | "high",
    "summary": "1-2 phrases factuelles"
  },
  "highlights": {
    "wins": ["max 3"],
    "friction_points": ["max 3"],
    "support_that_helped": ["max 3"],
    "unresolved_tensions": ["max 3"]
  },
  "signals": {
    "top_blocker": "string ou null",
    "likely_need": "push" | "simplify" | "support" | "silence" | "repair",
    "upcoming_event": "string ou null",
    "proactive_risk": "low" | "medium" | "high"
  },
  "evidence_refs": {
    "message_ids": ["3 à 5 IDs"],
    "event_ids": ["0 à 3 IDs"]
  }
}
\`\`\`

Ne retourne RIEN d'autre que le JSON. Pas de texte avant, pas de texte après, pas de markdown.`;

// ---------------------------------------------------------------------------
// User prompt builder
// ---------------------------------------------------------------------------

export function buildConversationPulseUserPrompt(
  input: ConversationPulseInput,
): string {
  const messagesBlock = input.messages
    .map((m) => `- id=${m.id} [${m.created_at}] ${m.role}: ${m.text}`)
    .join("\n\n");

  const bilansBlock = input.recent_bilans.length > 0
    ? `\n\nBilans récents :\n${
      input.recent_bilans
        .map((b) => `- [${b.kind}] ${b.date} : ${b.summary}`)
        .join("\n")
    }`
    : "";

  const eventsBlock = input.event_memories.length > 0
    ? `\n\nÉvénements proches :\n${
      input.event_memories
        .map((e) => `- id=${e.id} [${e.date}] ${e.title} — ${e.relevance}`)
        .join("\n")
    }`
    : "";

  const handoff = input.recent_transformation_handoff;
  const handoffBlock = handoff
    ? `\n\nHandoff récent de transformation :\n- transformation_id=${handoff.transformation_id}\n- titre=${
      handoff.title ?? "sans titre"
    }\n- completed_at=${handoff.completed_at ?? "inconnue"}\n- wins: ${
      handoff.wins.join(" | ") || "aucune"
    }\n- relational_signals: ${
      handoff.relational_signals.join(" | ") || "aucun"
    }\n- questionnaire_context: ${
      handoff.questionnaire_context.join(" | ") || "aucun"
    }\n- coaching_memory_summary: ${
      handoff.coaching_memory_summary || "aucun"
    }`
    : "";

  return `Date du jour : ${input.local_date}
Messages des 7 derniers jours (${input.messages.length} messages, dont ${input.messages_last_72h_count} dans les dernières 72h) :

${messagesBlock}${bilansBlock}${eventsBlock}${handoffBlock}

Produis le JSON du conversation pulse.`;
}

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

const VALID_DOMINANT = new Set([
  "steady",
  "hopeful",
  "mixed",
  "strained",
  "closed",
]);
const VALID_EMOTIONAL_LOAD = new Set(["low", "medium", "high"]);
const VALID_RELATIONAL_OPENNESS = new Set(["open", "fragile", "closed"]);
const VALID_DIRECTION = new Set(["up", "flat", "down", "mixed"]);
const VALID_CONFIDENCE = new Set(["low", "medium", "high"]);
const VALID_LIKELY_NEED = new Set([
  "push",
  "simplify",
  "support",
  "silence",
  "repair",
]);
const VALID_PROACTIVE_RISK = new Set(["low", "medium", "high"]);

export type ConversationPulseValidationResult =
  | { valid: true; pulse: ConversationPulse }
  | { valid: false; pulse: ConversationPulse; violations: string[] };

const FALLBACK_PULSE: ConversationPulse = {
  version: 1,
  generated_at: "",
  window_days: 7,
  last_72h_weight: 0.5,
  tone: {
    dominant: "mixed",
    emotional_load: "medium",
    relational_openness: "fragile",
  },
  trajectory: {
    direction: "flat",
    confidence: "low",
    summary: "Insufficient data for reliable pulse — defaulting to cautious.",
  },
  highlights: {
    wins: [],
    friction_points: [],
    support_that_helped: [],
    unresolved_tensions: [],
  },
  signals: {
    top_blocker: null,
    likely_need: "silence",
    upcoming_event: null,
    proactive_risk: "medium",
  },
  evidence_refs: {
    message_ids: [],
    event_ids: [],
  },
};

function clampArray(arr: unknown, max: number): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x): x is string => typeof x === "string")
    .slice(0, max);
}

function uniqueStrings(items: string[]): string[] {
  return [
    ...new Set(items.map((item) => String(item ?? "").trim()).filter(Boolean)),
  ];
}

function fallbackMessageIds(input: ConversationPulseInput): string[] {
  return input.messages
    .slice(-5)
    .map((message) => message.id)
    .filter(Boolean)
    .slice(0, Math.min(5, Math.max(0, input.messages.length)));
}

function pickEnum<T extends string>(
  value: unknown,
  validSet: Set<string>,
  fallback: T,
): T {
  const s = typeof value === "string" ? value : "";
  return (validSet.has(s) ? s : fallback) as T;
}

export function validateConversationPulseOutput(
  raw: unknown,
  input: ConversationPulseInput,
  nowIso?: string,
): ConversationPulseValidationResult {
  const violations: string[] = [];
  const generatedAt = nowIso ?? new Date().toISOString();

  if (raw == null || typeof raw !== "object") {
    const fallback = { ...FALLBACK_PULSE, generated_at: generatedAt };
    return {
      valid: false,
      pulse: fallback,
      violations: ["output is not an object"],
    };
  }

  const obj = raw as Record<string, unknown>;

  // --- tone ---
  const toneObj = (typeof obj.tone === "object" && obj.tone != null)
    ? obj.tone as Record<string, unknown>
    : {};

  const dominant = pickEnum(
    toneObj.dominant,
    VALID_DOMINANT,
    "mixed" as ConversationPulse["tone"]["dominant"],
  );
  if (!VALID_DOMINANT.has(String(toneObj.dominant ?? ""))) {
    violations.push(`invalid tone.dominant: "${toneObj.dominant}"`);
  }

  const emotionalLoad = pickEnum(
    toneObj.emotional_load,
    VALID_EMOTIONAL_LOAD,
    "medium" as ConversationPulse["tone"]["emotional_load"],
  );
  if (!VALID_EMOTIONAL_LOAD.has(String(toneObj.emotional_load ?? ""))) {
    violations.push(
      `invalid tone.emotional_load: "${toneObj.emotional_load}"`,
    );
  }

  const relationalOpenness = pickEnum(
    toneObj.relational_openness,
    VALID_RELATIONAL_OPENNESS,
    "fragile" as ConversationPulse["tone"]["relational_openness"],
  );
  if (
    !VALID_RELATIONAL_OPENNESS.has(String(toneObj.relational_openness ?? ""))
  ) {
    violations.push(
      `invalid tone.relational_openness: "${toneObj.relational_openness}"`,
    );
  }

  // --- trajectory ---
  const trajObj = (typeof obj.trajectory === "object" && obj.trajectory != null)
    ? obj.trajectory as Record<string, unknown>
    : {};

  const direction = pickEnum(
    trajObj.direction,
    VALID_DIRECTION,
    "flat" as ConversationPulse["trajectory"]["direction"],
  );
  if (!VALID_DIRECTION.has(String(trajObj.direction ?? ""))) {
    violations.push(`invalid trajectory.direction: "${trajObj.direction}"`);
  }

  const confidence = pickEnum(
    trajObj.confidence,
    VALID_CONFIDENCE,
    "low" as ConfidenceLevel,
  );
  if (!VALID_CONFIDENCE.has(String(trajObj.confidence ?? ""))) {
    violations.push(`invalid trajectory.confidence: "${trajObj.confidence}"`);
  }

  const summary = typeof trajObj.summary === "string" ? trajObj.summary : "";
  if (!summary) {
    violations.push("missing trajectory.summary");
  }

  // --- highlights ---
  const hlObj = (typeof obj.highlights === "object" && obj.highlights != null)
    ? obj.highlights as Record<string, unknown>
    : {};

  const wins = clampArray(hlObj.wins, 3);
  const frictionPoints = clampArray(hlObj.friction_points, 3);
  const supportThatHelped = clampArray(hlObj.support_that_helped, 3);
  const unresolvedTensions = clampArray(hlObj.unresolved_tensions, 3);

  // Warn but don't reject for over-cap (we clamp silently)
  if (Array.isArray(hlObj.wins) && hlObj.wins.length > 3) {
    violations.push(`wins exceeds cap: ${hlObj.wins.length} (max 3)`);
  }
  if (
    Array.isArray(hlObj.friction_points) && hlObj.friction_points.length > 3
  ) {
    violations.push(
      `friction_points exceeds cap: ${hlObj.friction_points.length} (max 3)`,
    );
  }

  // --- signals ---
  const sigObj = (typeof obj.signals === "object" && obj.signals != null)
    ? obj.signals as Record<string, unknown>
    : {};

  const topBlocker = typeof sigObj.top_blocker === "string"
    ? sigObj.top_blocker
    : null;

  const likelyNeed = pickEnum(
    sigObj.likely_need,
    VALID_LIKELY_NEED,
    "silence" as ConversationPulse["signals"]["likely_need"],
  );
  if (!VALID_LIKELY_NEED.has(String(sigObj.likely_need ?? ""))) {
    violations.push(`invalid signals.likely_need: "${sigObj.likely_need}"`);
  }

  const upcomingEvent = typeof sigObj.upcoming_event === "string"
    ? sigObj.upcoming_event
    : null;

  const proactiveRisk = pickEnum(
    sigObj.proactive_risk,
    VALID_PROACTIVE_RISK,
    "medium" as ConversationPulse["signals"]["proactive_risk"],
  );
  if (!VALID_PROACTIVE_RISK.has(String(sigObj.proactive_risk ?? ""))) {
    violations.push(
      `invalid signals.proactive_risk: "${sigObj.proactive_risk}"`,
    );
  }

  // --- evidence_refs ---
  const erefObj =
    (typeof obj.evidence_refs === "object" && obj.evidence_refs != null)
      ? obj.evidence_refs as Record<string, unknown>
      : {};

  const messageIds = clampArray(erefObj.message_ids, 5);
  const eventIds = clampArray(erefObj.event_ids, 3);

  // Filter evidence refs to only include IDs present in input
  const inputMessageIds = new Set(input.messages.map((m) => m.id));
  const inputEventIds = new Set(input.event_memories.map((e) => e.id));

  const validMessageIds = messageIds.filter((id) => inputMessageIds.has(id));
  const validEventIds = eventIds.filter((id) => inputEventIds.has(id));

  let normalizedMessageIds = uniqueStrings(validMessageIds);
  let normalizedEventIds = uniqueStrings(validEventIds);

  if (Array.isArray(erefObj.message_ids) && erefObj.message_ids.length > 5) {
    violations.push(
      `evidence_refs.message_ids exceeds cap: ${erefObj.message_ids.length} (max 5)`,
    );
  }
  if (Array.isArray(erefObj.event_ids) && erefObj.event_ids.length > 3) {
    violations.push(
      `evidence_refs.event_ids exceeds cap: ${erefObj.event_ids.length} (max 3)`,
    );
  }
  if (
    Array.isArray(hlObj.support_that_helped) &&
    hlObj.support_that_helped.length > 3
  ) {
    violations.push(
      `support_that_helped exceeds cap: ${hlObj.support_that_helped.length} (max 3)`,
    );
  }
  if (
    Array.isArray(hlObj.unresolved_tensions) &&
    hlObj.unresolved_tensions.length > 3
  ) {
    violations.push(
      `unresolved_tensions exceeds cap: ${hlObj.unresolved_tensions.length} (max 3)`,
    );
  }

  if (input.messages.length >= 3) {
    if (normalizedMessageIds.length < 3) {
      violations.push(
        `evidence_refs.message_ids under minimum after filtering: ${normalizedMessageIds.length} (min 3)`,
      );
      normalizedMessageIds = fallbackMessageIds(input).slice(
        0,
        Math.min(5, Math.max(3, normalizedMessageIds.length)),
      );
    }
  }

  // Compute last_72h_weight from input
  const total = input.messages.length;
  const last72h = Math.max(
    0,
    Math.min(total, Math.floor(input.messages_last_72h_count)),
  );
  const last72hWeight = total > 0
    ? Math.round((Math.max(0, Math.min(1, last72h / total))) * 100) / 100
    : 0;

  const hasInsufficientMessages = input.messages.length < 3;
  const normalizedDirection = hasInsufficientMessages ? "flat" : direction;
  const normalizedConfidence = hasInsufficientMessages ? "low" : confidence;
  const normalizedLikelyNeed = hasInsufficientMessages ? "silence" : likelyNeed;

  if (hasInsufficientMessages) {
    if (direction !== "flat") {
      violations.push(
        `insufficient_messages forces trajectory.direction=flat, got "${direction}"`,
      );
    }
    if (confidence !== "low") {
      violations.push(
        `insufficient_messages forces trajectory.confidence=low, got "${confidence}"`,
      );
    }
    if (likelyNeed !== "silence") {
      violations.push(
        `insufficient_messages forces signals.likely_need=silence, got "${likelyNeed}"`,
      );
    }
  }

  // --- Assemble pulse ---
  const pulse: ConversationPulse = {
    version: 1,
    generated_at: generatedAt,
    window_days: 7,
    last_72h_weight: last72hWeight,
    tone: {
      dominant,
      emotional_load: emotionalLoad,
      relational_openness: relationalOpenness,
    },
    trajectory: {
      direction: normalizedDirection,
      confidence: normalizedConfidence,
      summary: summary || "No trajectory summary provided.",
    },
    highlights: {
      wins,
      friction_points: frictionPoints,
      support_that_helped: supportThatHelped,
      unresolved_tensions: unresolvedTensions,
    },
    signals: {
      top_blocker: topBlocker,
      likely_need: normalizedLikelyNeed,
      upcoming_event: upcomingEvent,
      proactive_risk: proactiveRisk,
    },
    evidence_refs: {
      message_ids: normalizedMessageIds,
      event_ids: normalizedEventIds,
    },
  };

  if (violations.length > 0) {
    return { valid: false, pulse, violations };
  }

  return { valid: true, pulse };
}

// ---------------------------------------------------------------------------
// JSON parse helper (for raw LLM text)
// ---------------------------------------------------------------------------

export function parseConversationPulseLLMResponse(
  text: string,
  input: ConversationPulseInput,
  nowIso?: string,
): ConversationPulseValidationResult {
  const generatedAt = nowIso ?? new Date().toISOString();

  let parsed: unknown;
  try {
    const trimmed = text.trim();
    const jsonStart = trimmed.indexOf("{");
    const jsonEnd = trimmed.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) {
      return {
        valid: false,
        pulse: { ...FALLBACK_PULSE, generated_at: generatedAt },
        violations: ["no JSON object found in LLM response"],
      };
    }
    parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
  } catch {
    return {
      valid: false,
      pulse: { ...FALLBACK_PULSE, generated_at: generatedAt },
      violations: ["failed to parse JSON from LLM response"],
    };
  }

  return validateConversationPulseOutput(parsed, input, nowIso);
}
