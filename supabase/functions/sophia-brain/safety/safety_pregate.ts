// Deterministic safety pregate — W3.1.
//
// BEFORE: `initialSafetyContext` returned `risk_band: 'none'` hard-coded with
// `dispatcher_llm: false`. Crisis detection rested 100 % on one LLM call, with
// no deterministic floor underneath, and the trace column
// `conversation_turn_traces.safety_pregate` stopped being written (which is why
// migration 20260625143000 had to make it nullable).
//
// AFTER: this module computes a FLOOR from the current user message alone. The
// floor is a one-way ratchet:
//
//     final_band = max(llm_band, pregate_floor)
//
// The LLM may RAISE the band (it sees context the lexicon cannot). It can never
// lower it below the floor. `applySafetyFloor` in `safety_floor.ts` is the
// single place where that max is taken, and it is tested directly.
//
// The lexicon, the escalators and the named disarm conditions live in
// `safety_lexicon.ts`; that file also carries the doctrine and the
// disarmament conditions (P9).

import type {
  ConversationChannel,
  RiskBand,
} from "../contracts/turn_frame.v1.ts";
import { allowsSideEffects, isAtLeast } from "./safety_thresholds.ts";
import {
  DISARM_CONDITION_BY_ID,
  type DisarmId,
  IMMINENCE_MARKERS,
  MEANS_MARKERS,
  normalizeForSafety,
  quotedRanges,
  SAFETY_LEXICON,
  type SafetyCluster,
  type SafetyLexiconEntry,
  splitClauses,
  splitSentences,
} from "./safety_lexicon.ts";

export const SAFETY_PREGATE_VERSION = "safety_pregate_v1_2026_07";

export type SafetyPregateInput = {
  user_message: string;
  /**
   * NON-INPUT of the floor (dispatcher rule 1d-bis a: evidence comes from the
   * CURRENT message only). Accepted so callers keep one shape, ignored by the
   * matcher.
   */
  recent_messages?: Array<{ role: "user" | "assistant"; content: string }>;
  user_id?: string;
  channel?: ConversationChannel;
};

export type SafetyPregateEscalation =
  | null
  | "imminence"
  | "means"
  | "imminence_and_means";

export type SafetyPregateMatch = {
  entry_id: string;
  cluster: SafetyCluster;
  lang: "en" | "fr";
  reason_code: string;
  base_floor: RiskBand;
  floor: RiskBand;
  escalation: SafetyPregateEscalation;
  span: string;
};

export type SafetyPregateDisarm = {
  entry_id: string;
  condition: DisarmId;
  span: string;
};

export type SafetyPregateOutput = {
  version: string;
  detected: boolean;
  /** THE FLOOR. Never lowered downstream. */
  risk_band: RiskBand;
  reason_codes: string[];
  evidence: string[];
  clusters: SafetyCluster[];
  matches: SafetyPregateMatch[];
  disarmed: SafetyPregateDisarm[];
  layer_contributions: {
    lexical: boolean;
    active_flow_caution: boolean;
    dispatcher_llm: false;
  };
  allow_side_effects: boolean;
};

const MAX_EVIDENCE = 5;
const MAX_EVIDENCE_CHARS = 120;

const BAND_ORDER: RiskBand[] = ["none", "low", "medium", "high", "critical"];

function bandMax(a: RiskBand, b: RiskBand): RiskBand {
  return isAtLeast(a, b) ? a : b;
}

function bandUp(band: RiskBand): RiskBand {
  const index = BAND_ORDER.indexOf(band);
  if (index < 0) return band;
  return BAND_ORDER[Math.min(index + 1, BAND_ORDER.length - 1)];
}

function escalate(
  entry: SafetyLexiconEntry,
  sentence: string,
): { floor: RiskBand; escalation: SafetyPregateEscalation } {
  // Only the two danger-to-life clusters escalate. Distress vocabulary next to
  // the word "pont" is not a crisis, it is a commute.
  if (
    entry.cluster !== "suicidal_intent_active" &&
    entry.cluster !== "self_harm_intent" &&
    entry.cluster !== "suicidal_ideation_passive"
  ) {
    return { floor: entry.floor, escalation: null };
  }
  const imminence = IMMINENCE_MARKERS.test(sentence);
  const means = MEANS_MARKERS.test(sentence);
  if (!imminence && !means) return { floor: entry.floor, escalation: null };
  const escalation: SafetyPregateEscalation = imminence && means
    ? "imminence_and_means"
    : imminence
    ? "imminence"
    : "means";
  // Passive ideation escalates on MEANS only: "j'ai envie de mourir ce soir"
  // is still passive vocabulary; "j'ai les cachets devant moi" is not.
  if (entry.cluster === "suicidal_ideation_passive" && !means) {
    return { floor: entry.floor, escalation: null };
  }
  return { floor: bandUp(entry.floor), escalation };
}

function truncate(value: string): string {
  const text = value.trim();
  return text.length <= MAX_EVIDENCE_CHARS
    ? text
    : `${text.slice(0, MAX_EVIDENCE_CHARS - 1)}…`;
}

function neutralOutput(): SafetyPregateOutput {
  return {
    version: SAFETY_PREGATE_VERSION,
    detected: false,
    risk_band: "none",
    reason_codes: [],
    evidence: [],
    clusters: [],
    matches: [],
    disarmed: [],
    layer_contributions: {
      lexical: false,
      active_flow_caution: false,
      dispatcher_llm: false,
    },
    allow_side_effects: allowsSideEffects("none"),
  };
}

/**
 * Deterministic floor for the current turn. Pure function: same message in,
 * same band out, no clock, no network, no LLM.
 */
export function runSafetyPregate(
  input: SafetyPregateInput,
): SafetyPregateOutput {
  const raw = String(input?.user_message ?? "");
  if (!raw.trim()) return neutralOutput();

  const normalized = normalizeForSafety(raw);
  if (!normalized) return neutralOutput();

  const quoted = quotedRanges(normalized);
  const sentences = splitSentences(normalized);

  const matches: SafetyPregateMatch[] = [];
  const disarmed: SafetyPregateDisarm[] = [];

  for (const entry of SAFETY_LEXICON) {
    let fired = false;
    for (const sentence of sentences) {
      if (fired) break;
      const hit = entry.pattern.exec(sentence.text);
      if (!hit) continue;
      const span = hit[0];
      const spanIndexInSentence = hit.index;
      const spanAbsolute = sentence.start + spanIndexInSentence;
      const clauses = splitClauses(sentence.text);
      const clause = clauses.find((candidate) =>
        spanIndexInSentence >= candidate.start &&
        spanIndexInSentence < candidate.start + candidate.text.length
      ) ?? { text: sentence.text, start: 0 };
      const ctx = {
        normalized,
        sentence: sentence.text,
        clause: clause.text,
        spanIndexInClause: spanIndexInSentence - clause.start,
        spanIndexInSentence,
        span,
        insideQuotes: quoted.some(([open, close]) =>
          spanAbsolute > open && spanAbsolute < close
        ),
      };

      const triggered = entry.disarmable_by.filter((id) =>
        DISARM_CONDITION_BY_ID[id]?.applies(ctx) === true
      );
      if (triggered.length > 0) {
        for (const condition of triggered) {
          disarmed.push({ entry_id: entry.id, condition, span });
        }
        continue;
      }

      const { floor, escalation } = escalate(entry, sentence.text);
      matches.push({
        entry_id: entry.id,
        cluster: entry.cluster,
        lang: entry.lang,
        reason_code: entry.reason_code,
        base_floor: entry.floor,
        floor,
        escalation,
        span,
      });
      fired = true;
    }
  }

  if (matches.length === 0) {
    return { ...neutralOutput(), disarmed };
  }

  const riskBand = matches.reduce<RiskBand>(
    (acc, match) => bandMax(acc, match.floor),
    "none",
  );
  const reasonCodes = [...new Set(matches.map((m) => m.reason_code))];
  const clusters = [...new Set(matches.map((m) => m.cluster))];
  const evidence = [
    ...new Set(matches.map((m) => truncate(m.span))),
  ].slice(0, MAX_EVIDENCE);

  return {
    version: SAFETY_PREGATE_VERSION,
    detected: true,
    risk_band: riskBand,
    reason_codes: reasonCodes,
    evidence,
    clusters,
    matches,
    disarmed,
    layer_contributions: {
      lexical: true,
      active_flow_caution: false,
      dispatcher_llm: false,
    },
    allow_side_effects: allowsSideEffects(riskBand),
  };
}

/**
 * Compact, PII-bounded payload written to
 * `conversation_turn_traces.safety_pregate`. Purpose: measure the trigger rate
 * and, on a red run, know WHICH belt fired or WHICH condition disarmed it.
 */
export type SafetyPregateTrace = {
  version: string;
  detected: boolean;
  floor_band: RiskBand;
  reason_codes: string[];
  clusters: SafetyCluster[];
  evidence: string[];
  matches: Array<{
    entry_id: string;
    cluster: SafetyCluster;
    lang: "en" | "fr";
    base_floor: RiskBand;
    floor: RiskBand;
    escalation: SafetyPregateEscalation;
  }>;
  disarmed: Array<{ entry_id: string; condition: DisarmId }>;
  layer_contributions: SafetyPregateOutput["layer_contributions"];
  allow_side_effects: boolean;
  /** Band the LLM frame asserted for this turn, when known. */
  llm_band?: RiskBand | null;
  /** Band actually used by the turn after the floor was applied. */
  final_band?: RiskBand | null;
  /** True when the floor had to raise the LLM band. */
  floor_applied?: boolean;
};

export function safetyPregateTrace(
  pregate: SafetyPregateOutput,
  merged?: {
    llm_band?: RiskBand | null;
    final_band?: RiskBand | null;
    floor_applied?: boolean;
  },
): SafetyPregateTrace {
  return {
    version: pregate.version,
    detected: pregate.detected,
    floor_band: pregate.risk_band,
    reason_codes: [...pregate.reason_codes],
    clusters: [...pregate.clusters],
    evidence: [...pregate.evidence],
    matches: pregate.matches.map((match) => ({
      entry_id: match.entry_id,
      cluster: match.cluster,
      lang: match.lang,
      base_floor: match.base_floor,
      floor: match.floor,
      escalation: match.escalation,
    })),
    disarmed: pregate.disarmed.map((item) => ({
      entry_id: item.entry_id,
      condition: item.condition,
    })),
    layer_contributions: { ...pregate.layer_contributions },
    allow_side_effects: pregate.allow_side_effects,
    llm_band: merged?.llm_band ?? null,
    final_band: merged?.final_band ?? pregate.risk_band,
    floor_applied: merged?.floor_applied ?? false,
  };
}
