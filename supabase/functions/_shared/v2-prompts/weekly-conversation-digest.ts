/**
 * V2 Weekly Conversation Digest prompt — Tier 2 LLM call.
 *
 * Produces a WeeklyConversationDigest: a retrospective analysis of the
 * full week's conversations, generated BEFORE the weekly bilan
 * (orchestration-rules §5.4 step 2) and consumed by it as input.
 *
 * Coexists with the ConversationPulse (real-time 12h signal).
 * The digest is retrospective; the pulse is instantaneous.
 */

import type {
  ConfidenceLevel,
  WeeklyConversationDigest,
} from "../v2-types.ts";

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export type DigestConversationMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  created_at: string;
};

export type DigestDailyBilanSummary = {
  date: string;
  mode: string;
  target_items: string[];
  outcome: string;
};

export type DigestEventMemorySummary = {
  id: string;
  title: string;
  date: string;
  relevance: string;
};

export type DigestPulseSummary = {
  tone_dominant: string;
  trajectory_direction: string;
  trajectory_summary: string;
  likely_need: string;
  wins: string[];
  friction_points: string[];
};

export type WeeklyConversationDigestInput = {
  messages: DigestConversationMessage[];
  daily_bilans: DigestDailyBilanSummary[];
  event_memories: DigestEventMemorySummary[];
  latest_pulse: DigestPulseSummary | null;
  week_start: string;
  local_date: string;
  message_count: number;
  active_days: number;
};

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

export const WEEKLY_CONVERSATION_DIGEST_SYSTEM_PROMPT =
  `Tu es le module d'analyse conversationnelle hebdomadaire de Sophia, une application de transformation personnelle.

## Ta mission

Tu analyses TOUS les messages de la semaine écoulée entre l'utilisateur et Sophia pour produire un **digest rétrospectif structuré**.

Ce digest est utilisé en interne par :
- Le bilan hebdomadaire (pour contextualiser la décision hold/expand/consolidate/reduce)
- Les nudges matinaux de la semaine suivante (pour ajuster le ciblage)
- Le moteur proactif (pour anticiper les risques)

Le digest n'est JAMAIS montré directement à l'utilisateur.

## Différence avec le conversation pulse

Le conversation pulse est un **signal temps-réel** (fenêtre de 12h, rafraîchi quotidiennement).
Le weekly digest est une **rétrospective de la semaine entière** : il capture l'arc émotionnel, les moments clés et l'évolution sur 7 jours.

Tu peux recevoir le dernier pulse comme **référence**, mais tu ne dois PAS le recopier. Ton analyse doit couvrir la semaine entière, pas juste les dernières heures.

## Données que tu reçois

### Messages (messages[])
Tous les messages user + assistant de la semaine [week_start, week_start + 7 jours[, en ordre chronologique.

### Bilans quotidiens (daily_bilans[])
Résumés des bilans daily envoyés cette semaine (mode, items ciblés, outcome).

### Événements proches (event_memories[], max 3)
Événements actifs ou à venir qui peuvent influencer le contexte.

### Dernier pulse (latest_pulse, optionnel)
Le dernier conversation pulse de la semaine, comme point de référence (pas comme source unique).

### Méta-données pré-calculées
- message_count : nombre total de messages user dans la fenêtre
- active_days : nombre de jours distincts avec au moins 1 message user

## Ce que tu dois produire

### dominant_tone (string, < 50 chars)
La tonalité dominante de la semaine en langage naturel.
Exemples : "fatigue mêlée de détermination", "légèreté retrouvée", "tension sourde persistante"
PAS un seul mot. PAS un label technique.

### tone_evolution (string, < 100 chars)
L'arc tonal de la semaine : comment le ton a évolué du début à la fin.
Exemples : "début hésitant, regain mercredi, relâchement vendredi", "stable toute la semaine avec un pic de stress jeudi"

### best_traction_moments (string[], max 3, chacun < 100 chars)
Les moments où l'utilisateur a montré de la traction, de l'élan ou de la fierté.
DOIT être ancré dans des messages réels — cite approximativement le contenu ou le contexte, pas juste le jour.
Exemple : "Fier d'avoir médité 3 jours d'affilée malgré la fatigue (mercredi)"

### closure_fatigue_moments (string[], max 3, chacun < 100 chars)
Les moments où l'utilisateur a montré de la fermeture, de la fatigue ou du désengagement.
Même règle : ancré dans des messages réels.
Exemple : "Réponses monosyllabiques jeudi soir après une journée difficile"

### most_real_blockage (string | null, < 150 chars)
Le blocage le plus concret observé dans la CONVERSATION cette semaine.
Ce n'est PAS le top_blocker du momentum (qui vient des métriques) — c'est ce que l'utilisateur a exprimé ou laissé transparaître.
Null si aucun blocage clair ne ressort.

### support_that_helped (string | null, < 150 chars)
Ce qui a visiblement aidé l'utilisateur cette semaine — un support, une technique, un échange spécifique.
Doit être spécifique, pas générique.
Null si rien de clair.

### main_risk_next_week (string | null, < 150 chars)
Le risque principal anticipé pour la semaine suivante, basé sur les signaux de cette semaine.
Null si pas de signal clair.

### relational_opportunity (string | null, < 150 chars)
Une observation actionnable sur la relation Sophia ↔ utilisateur.
DOIT être actionnable : "l'utilisateur répond mieux le matin", "préfère les messages courts", "s'ouvre plus après un bilan positif"
PAS vague : "la relation est bonne"
Null si pas d'observation exploitable.

### confidence ("high" | "medium" | "low")
Confiance dans la qualité du digest.

## Règles strictes

1. **Rétrospective, pas résumé** : tu analyses l'arc de la semaine, tu ne résumes pas les messages.
2. **Ancrage obligatoire** : best_traction_moments et closure_fatigue_moments doivent citer approximativement le contenu des messages, pas juste "lundi" ou "mercredi".
3. **Indépendance du pulse** : ne recopie pas le pulse. Le digest doit apporter une valeur nouvelle (l'évolution sur 7 jours).
4. **Seuil de confiance** : si message_count < 5, mets confidence à "low" et les champs non renseignables à null.
5. **Semaine silencieuse** : si message_count < 3, retourne un digest minimal — dominant_tone="silence", tone_evolution="peu d'échanges cette semaine", listes vides, champs nullables à null.
6. **Caps** : best_traction_moments ≤ 3, closure_fatigue_moments ≤ 3, chaque string respecte son max de chars.
7. **Pas de platitudes** : most_real_blockage ne doit pas être "manque de motivation" si l'utilisateur a dit "je n'ai pas eu le temps à cause du déménagement". Cite le vrai.
8. **relational_opportunity actionnable** : si tu ne trouves rien de concret, mets null. Pas de remplissage.

## Format de sortie

Tu dois retourner UNIQUEMENT un JSON valide conforme à ce schéma :

\`\`\`json
{
  "dominant_tone": "string < 50 chars",
  "tone_evolution": "string < 100 chars",
  "best_traction_moments": ["max 3 strings < 100 chars"],
  "closure_fatigue_moments": ["max 3 strings < 100 chars"],
  "most_real_blockage": "string < 150 chars ou null",
  "support_that_helped": "string < 150 chars ou null",
  "main_risk_next_week": "string < 150 chars ou null",
  "relational_opportunity": "string < 150 chars ou null",
  "confidence": "high" | "medium" | "low"
}
\`\`\`

Ne retourne RIEN d'autre que le JSON. Pas de texte avant, pas de texte après, pas de markdown.`;

// ---------------------------------------------------------------------------
// User prompt builder
// ---------------------------------------------------------------------------

export function buildWeeklyConversationDigestUserPrompt(
  input: WeeklyConversationDigestInput,
): string {
  const messagesBlock = input.messages
    .map((m) => `- [${m.created_at}] ${m.role}: ${m.text}`)
    .join("\n\n");

  const bilansBlock = input.daily_bilans.length > 0
    ? `\n\nBilans quotidiens de la semaine :\n${
      input.daily_bilans
        .map((b) =>
          `- [${b.date}] mode=${b.mode}${
            b.target_items.length > 0
              ? ` items=${b.target_items.join(", ")}`
              : ""
          } → ${b.outcome}`
        )
        .join("\n")
    }`
    : "";

  const eventsBlock = input.event_memories.length > 0
    ? `\n\nÉvénements proches :\n${
      input.event_memories
        .map((e) => `- [${e.date}] ${e.title} — ${e.relevance}`)
        .join("\n")
    }`
    : "";

  const pulseBlock = input.latest_pulse
    ? `\n\nDernier conversation pulse (référence, ne pas recopier) :\n- tone=${input.latest_pulse.tone_dominant}, trajectory=${input.latest_pulse.trajectory_direction}\n- summary=${input.latest_pulse.trajectory_summary}\n- likely_need=${input.latest_pulse.likely_need}\n- wins: ${
      input.latest_pulse.wins.join(" | ") || "aucune"
    }\n- friction: ${
      input.latest_pulse.friction_points.join(" | ") || "aucune"
    }`
    : "";

  return `Semaine du ${input.week_start} — Date du jour : ${input.local_date}
Messages de la semaine (${input.message_count} messages user, ${input.active_days} jours actifs) :

${messagesBlock}${bilansBlock}${eventsBlock}${pulseBlock}

Produis le JSON du weekly conversation digest.`;
}

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

const VALID_CONFIDENCE = new Set(["low", "medium", "high"]);
const SILENT_WEEK_THRESHOLD = 3;
const LOW_CONFIDENCE_THRESHOLD = 5;
const SILENT_WEEK_DOMINANT_TONE = "silence";
const SILENT_WEEK_TONE_EVOLUTION = "peu d'échanges cette semaine";

export type WeeklyConversationDigestValidationResult =
  | { valid: true; digest: WeeklyConversationDigest }
  | { valid: false; digest: WeeklyConversationDigest; violations: string[] };

function clampString(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length <= maxLen
    ? trimmed
    : `${trimmed.slice(0, maxLen - 1).trim()}…`;
}

function clampNullableString(
  value: unknown,
  maxLen: number,
): string | null {
  if (value == null) return null;
  const clamped = clampString(value, maxLen);
  return clamped || null;
}

function clampStringArray(arr: unknown, max: number, maxLen: number): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .slice(0, max)
    .map((s) => clampString(s, maxLen));
}

function pickConfidence(
  value: unknown,
  fallback: ConfidenceLevel,
): ConfidenceLevel {
  const s = typeof value === "string" ? value.trim() : "";
  return (VALID_CONFIDENCE.has(s) ? s : fallback) as ConfidenceLevel;
}

function buildFallbackDigest(
  input: WeeklyConversationDigestInput,
  nowIso: string,
): WeeklyConversationDigest {
  const isSilent = input.message_count < SILENT_WEEK_THRESHOLD;
  return {
    version: 1,
    week_start: input.week_start,
    generated_at: nowIso,
    dominant_tone: isSilent ? SILENT_WEEK_DOMINANT_TONE : "indéterminé",
    tone_evolution: isSilent
      ? SILENT_WEEK_TONE_EVOLUTION
      : "données insuffisantes pour une analyse fiable",
    best_traction_moments: [],
    closure_fatigue_moments: [],
    most_real_blockage: null,
    support_that_helped: null,
    main_risk_next_week: null,
    relational_opportunity: null,
    confidence: "low",
    message_count: input.message_count,
    active_days: input.active_days,
  };
}

export function validateWeeklyConversationDigestOutput(
  raw: unknown,
  input: WeeklyConversationDigestInput,
  nowIso?: string,
): WeeklyConversationDigestValidationResult {
  const generatedAt = nowIso ?? new Date().toISOString();
  const violations: string[] = [];

  if (raw == null || typeof raw !== "object") {
    return {
      valid: false,
      digest: buildFallbackDigest(input, generatedAt),
      violations: ["output is not an object"],
    };
  }

  const obj = raw as Record<string, unknown>;

  const dominantTone = clampString(obj.dominant_tone, 50);
  if (!dominantTone) {
    violations.push("missing or empty dominant_tone");
  }

  const toneEvolution = clampString(obj.tone_evolution, 100);
  if (!toneEvolution) {
    violations.push("missing or empty tone_evolution");
  }

  const bestTractionMoments = clampStringArray(
    obj.best_traction_moments,
    3,
    100,
  );
  if (
    Array.isArray(obj.best_traction_moments) &&
    obj.best_traction_moments.length > 3
  ) {
    violations.push(
      `best_traction_moments exceeds cap: ${obj.best_traction_moments.length} (max 3)`,
    );
  }

  const closureFatigueMoments = clampStringArray(
    obj.closure_fatigue_moments,
    3,
    100,
  );
  if (
    Array.isArray(obj.closure_fatigue_moments) &&
    obj.closure_fatigue_moments.length > 3
  ) {
    violations.push(
      `closure_fatigue_moments exceeds cap: ${obj.closure_fatigue_moments.length} (max 3)`,
    );
  }

  const mostRealBlockage = clampNullableString(obj.most_real_blockage, 150);
  const supportThatHelped = clampNullableString(obj.support_that_helped, 150);
  const mainRiskNextWeek = clampNullableString(obj.main_risk_next_week, 150);
  const relationalOpportunity = clampNullableString(
    obj.relational_opportunity,
    150,
  );

  const rawConfidence = pickConfidence(obj.confidence, "low");
  if (!VALID_CONFIDENCE.has(String(obj.confidence ?? ""))) {
    violations.push(`invalid confidence: "${obj.confidence}"`);
  }

  // Enforce confidence coherence with message count
  const isSilentWeek = input.message_count < SILENT_WEEK_THRESHOLD;
  const isLowDataWeek = input.message_count < LOW_CONFIDENCE_THRESHOLD;
  const shouldNullNullableInsights = isSilentWeek || isLowDataWeek;

  let confidence = rawConfidence;
  if (isLowDataWeek && rawConfidence !== "low") {
    violations.push(
      `message_count=${input.message_count} forces confidence=low, got "${rawConfidence}"`,
    );
    confidence = "low";
  }

  // Silent weeks always collapse to the canonical minimal digest shape.
  if (isSilentWeek) {
    if (dominantTone && dominantTone !== SILENT_WEEK_DOMINANT_TONE) {
      violations.push(
        `silent week (< 3 messages) forces dominant_tone="${SILENT_WEEK_DOMINANT_TONE}"`,
      );
    }
    if (toneEvolution && toneEvolution !== SILENT_WEEK_TONE_EVOLUTION) {
      violations.push(
        `silent week (< 3 messages) forces tone_evolution="${SILENT_WEEK_TONE_EVOLUTION}"`,
      );
    }
  }

  // Low-data weeks can still keep tone and moments, but nullable insights become null.
  if (
    isLowDataWeek &&
    !isSilentWeek &&
    (
      mostRealBlockage !== null ||
      supportThatHelped !== null ||
      mainRiskNextWeek !== null ||
      relationalOpportunity !== null
    )
  ) {
    violations.push(
      "message_count < 5 forces nullable insight fields to null",
    );
  }

  const finalDominantTone = isSilentWeek
    ? SILENT_WEEK_DOMINANT_TONE
    : (dominantTone || "indéterminé");
  const finalToneEvolution = isSilentWeek
    ? SILENT_WEEK_TONE_EVOLUTION
    : (toneEvolution || "données insuffisantes");
  const finalBestTraction = isSilentWeek ? [] : bestTractionMoments;
  const finalClosureFatigue = isSilentWeek ? [] : closureFatigueMoments;
  const finalMostRealBlockage = shouldNullNullableInsights
    ? null
    : mostRealBlockage;
  const finalSupportThatHelped = shouldNullNullableInsights
    ? null
    : supportThatHelped;
  const finalMainRisk = shouldNullNullableInsights ? null : mainRiskNextWeek;
  const finalRelationalOpp = shouldNullNullableInsights
    ? null
    : relationalOpportunity;

  if (isSilentWeek && (bestTractionMoments.length > 0 ||
    closureFatigueMoments.length > 0)) {
    violations.push(
      "silent week (< 3 messages) should have empty moment lists",
    );
  }

  const digest: WeeklyConversationDigest = {
    version: 1,
    week_start: input.week_start,
    generated_at: generatedAt,
    dominant_tone: finalDominantTone,
    tone_evolution: finalToneEvolution,
    best_traction_moments: finalBestTraction,
    closure_fatigue_moments: finalClosureFatigue,
    most_real_blockage: finalMostRealBlockage,
    support_that_helped: finalSupportThatHelped,
    main_risk_next_week: finalMainRisk,
    relational_opportunity: finalRelationalOpp,
    confidence,
    message_count: input.message_count,
    active_days: input.active_days,
  };

  if (violations.length > 0) {
    return { valid: false, digest, violations };
  }

  return { valid: true, digest };
}

// ---------------------------------------------------------------------------
// JSON parse helper (for raw LLM text)
// ---------------------------------------------------------------------------

export function parseWeeklyConversationDigestLLMResponse(
  text: string,
  input: WeeklyConversationDigestInput,
  nowIso?: string,
): WeeklyConversationDigestValidationResult {
  const generatedAt = nowIso ?? new Date().toISOString();

  let parsed: unknown;
  try {
    const trimmed = text.trim();
    const jsonStart = trimmed.indexOf("{");
    const jsonEnd = trimmed.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) {
      return {
        valid: false,
        digest: buildFallbackDigest(input, generatedAt),
        violations: ["no JSON object found in LLM response"],
      };
    }
    parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
  } catch {
    return {
      valid: false,
      digest: buildFallbackDigest(input, generatedAt),
      violations: ["failed to parse JSON from LLM response"],
    };
  }

  return validateWeeklyConversationDigestOutput(parsed, input, nowIso);
}
