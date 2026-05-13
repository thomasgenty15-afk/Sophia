import type {
  ConversationChannel,
  RiskBand,
} from "../contracts/turn_frame.v1.ts";
import { allowsSideEffects } from "./safety_thresholds.ts";

export type SafetyPregateInput = {
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  user_id: string;
  channel: ConversationChannel;
};

export type SafetyPregateOutput = {
  detected: boolean;
  risk_band: RiskBand;
  reason_codes: string[];
  evidence: string[];
  layer_contributions: {
    lexical: boolean;
    heuristic: boolean;
    classifier?: boolean;
    dispatcher_llm: false;
  };
  allow_side_effects: boolean;
};

type RiskScore = 0 | 1 | 2 | 3 | 4;

const RISK_TO_SCORE: Record<RiskBand, RiskScore> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const SCORE_TO_RISK: Record<RiskScore, RiskBand> = {
  0: "none",
  1: "low",
  2: "medium",
  3: "high",
  4: "critical",
};

const EXPLICIT_SELF_HARM_PATTERNS: Array<[RegExp, RiskScore, string]> = [
  [/\bme faire du mal\b/i, 3, "explicit_self_harm"],
  [/\bme suicider\b/i, 4, "explicit_suicide"],
  [/\bsuicide\b/i, 4, "explicit_suicide"],
  [/\bsuicidaires?\b/i, 3, "explicit_suicidal_thoughts"],
  [/\bpens[eé]es?\b.{0,40}\bsuicidaires?\b/i, 3, "explicit_suicidal_thoughts"],
  [/\ben finir\b/i, 4, "explicit_end_life"],
  [/\benvie de mourir\b/i, 4, "explicit_death_wish"],
  [/\bje veux mourir\b/i, 4, "explicit_death_wish"],
  [/\bpas la peine de continuer\b/i, 3, "explicit_no_reason_to_continue"],
  [/\btout arreter pour de bon\b/i, 3, "explicit_final_stop"],
];

const PASSIVE_SELF_HARM_PATTERNS: Array<[RegExp, RiskScore, string]> = [
  [/\bpensees?\b.{0,80}\bdisparaitre\b/i, 3, "passive_disappear_ideation"],
  [/\bpense\b.{0,80}\bdisparaitre\b/i, 3, "passive_disappear_ideation"],
  [
    /\bpens[eé]es?\b.{0,80}\bdispara[iî]tre\b/i,
    3,
    "passive_disappear_ideation",
  ],
  [/\bpens[eé]\b.{0,80}\bdispara[iî]tre\b/i, 3, "passive_disappear_ideation"],
  [
    /\bdisparaitre\b.{0,60}\bferait une pause\b/i,
    3,
    "passive_disappear_ideation",
  ],
  [
    /\bdispara[iî]tre\b.{0,60}\bferait une pause\b/i,
    3,
    "passive_disappear_ideation",
  ],
  [/\bpens[eé]e\b.{0,120}\bplus la\b/i, 3, "passive_absence_ideation"],
  [/\bpens[eé]e\b.{0,120}\bplus là\b/i, 3, "passive_absence_ideation"],
  [/\bsi je n['’]?etais plus la\b/i, 3, "passive_absence_ideation"],
  [/\bsi je n['’]?étais plus là\b/i, 3, "passive_absence_ideation"],
];

const INTENSITY_PATTERNS: Array<[RegExp, RiskScore, string]> = [
  [/\bje n['’]?en peux plus\b/i, 2, "distress_high_intensity"],
  [/\bj['’]?en peux plus\b/i, 2, "distress_high_intensity"],
  [/\bc['’]?est trop dur\b/i, 2, "distress_high_intensity"],
  [/\bje vais le faire\b/i, 2, "ambiguous_intent_high_intensity"],
  [/\bj['’]?arrete tout\b/i, 2, "distress_stop_everything"],
  [/\bplus envie\b/i, 2, "distress_no_motivation"],
];

const IMMEDIACY_PATTERNS: Array<[RegExp, string]> = [
  [/\bce soir\b/i, "immediacy_tonight"],
  [/\bmaintenant\b/i, "immediacy_now"],
  [/\btout de suite\b/i, "immediacy_now"],
  [/\bdemain\b/i, "immediacy_tomorrow"],
  [/\bdans \d+ (minutes?|heures?)\b/i, "immediacy_near_term"],
];

const NEGATION_PATTERNS = [
  /\bje ne veux pas mourir\b/i,
  /\bje veux pas mourir\b/i,
  /\bpas envie de mourir\b/i,
  /\bje ne vais pas me faire du mal\b/i,
  /\bje vais pas me faire du mal\b/i,
  /\bje ne veux pas me faire du mal\b/i,
  /\bje veux pas me faire du mal\b/i,
  /\bje ne suis pas en danger\b/i,
  /\bje suis pas en danger\b/i,
  /\bje n['’]?ai rien prepare\b/i,
  /\bje n['’]?ai rien préparé\b/i,
  /\brien prepare\b/i,
  /\brien préparé\b/i,
];

const HUMOR_PATTERNS = [
  /\bmort de rire\b/i,
  /\bmourir de rire\b/i,
  /\bmdr\b/i,
  /\blol\b/i,
  /😂|🤣/,
];

const BOUNDED_STRESS_CONTEXT_PATTERNS = [
  /\bce projet\b/i,
  /\bces reunions\b/i,
  /\bces réunions\b/i,
  /\bmon dossier\b/i,
  /\ble dossier\b/i,
  /\bce travail\b/i,
  /\bma journee\b/i,
  /\bma journée\b/i,
];

const ASSISTANT_SAFETY_CONTEXT_PATTERNS = [
  /\b3114\b/i,
  /\bprevention suicide\b/i,
  /\bprévention suicide\b/i,
  /\bpensee\b.{0,80}\bpas besoin d['’]?agir\b/i,
  /\bpensée\b.{0,80}\bpas besoin d['’]?agir\b/i,
  /\bcontexte securite\b/i,
  /\bcontexte sécurité\b/i,
  /\ben securite\b/i,
  /\ben sécurité\b/i,
];

function maxRisk(current: RiskScore, next: RiskScore): RiskScore {
  return Math.max(current, next) as RiskScore;
}

function hasPattern(patterns: RegExp[], text: string): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function pushEvidence(
  evidence: string[],
  reasonCodes: string[],
  text: string,
  pattern: RegExp,
  reasonCode: string,
): void {
  const match = text.match(pattern);
  reasonCodes.push(reasonCode);
  if (match?.[0]) evidence.push(match[0].slice(0, 120));
}

export function runSafetyPregate(
  input: SafetyPregateInput,
): SafetyPregateOutput {
  const text = String(input.user_message ?? "").trim();
  const evidence: string[] = [];
  const reasonCodes: string[] = [];
  let lexicalRisk: RiskScore = 0;
  let heuristicRisk: RiskScore = 0;
  let lexical = false;
  let heuristic = false;
  let matchedPassiveSelfHarm = false;

  for (const [pattern, risk, reasonCode] of EXPLICIT_SELF_HARM_PATTERNS) {
    if (pattern.test(text)) {
      lexical = true;
      lexicalRisk = maxRisk(lexicalRisk, risk);
      pushEvidence(evidence, reasonCodes, text, pattern, reasonCode);
    }
  }

  for (const [pattern, risk, reasonCode] of PASSIVE_SELF_HARM_PATTERNS) {
    if (pattern.test(text)) {
      lexical = true;
      matchedPassiveSelfHarm = true;
      lexicalRisk = maxRisk(lexicalRisk, risk);
      pushEvidence(evidence, reasonCodes, text, pattern, reasonCode);
    }
  }

  for (const [pattern, risk, reasonCode] of INTENSITY_PATTERNS) {
    if (pattern.test(text)) {
      heuristic = true;
      heuristicRisk = maxRisk(heuristicRisk, risk);
      pushEvidence(evidence, reasonCodes, text, pattern, reasonCode);
    }
  }

  const hasImmediacy = IMMEDIACY_PATTERNS.some(([pattern, reasonCode]) => {
    if (!pattern.test(text)) return false;
    heuristic = true;
    pushEvidence(evidence, reasonCodes, text, pattern, reasonCode);
    return true;
  });

  if (hasImmediacy && (lexicalRisk > 0 || heuristicRisk > 0)) {
    heuristicRisk = maxRisk(heuristicRisk, 1);
  }

  if (lexicalRisk >= 3 && hasImmediacy) {
    heuristic = true;
    heuristicRisk = maxRisk(heuristicRisk, 4);
    reasonCodes.push("immediacy_escalates_self_harm");
  }

  const recentSafetyContextMessages = input.recent_messages
    .slice(-8)
    .filter((message) => {
      if (message.role === "assistant") {
        return ASSISTANT_SAFETY_CONTEXT_PATTERNS.some((pattern) =>
          pattern.test(message.content)
        );
      }
      return (
        EXPLICIT_SELF_HARM_PATTERNS.some(([pattern]) =>
          pattern.test(message.content)
        ) ||
        PASSIVE_SELF_HARM_PATTERNS.some(([pattern]) =>
          pattern.test(message.content)
        ) ||
        INTENSITY_PATTERNS.some(([pattern]) => pattern.test(message.content))
      );
    });
  const recentUserSafetyCount =
    recentSafetyContextMessages.filter((message) => message.role === "user")
      .length;
  const recentSafetyContextCount = recentSafetyContextMessages.length;
  const hasRecentSafetyContext = recentSafetyContextCount >= 1;
  if (hasRecentSafetyContext) {
    heuristic = true;
    heuristicRisk = maxRisk(heuristicRisk, 2);
    reasonCodes.push("recent_safety_context_caution");
  }
  if (recentUserSafetyCount >= 3) {
    heuristic = true;
    heuristicRisk = maxRisk(heuristicRisk, 3);
    reasonCodes.push("recent_safety_context_escalation");
  }

  const negated = hasPattern(NEGATION_PATTERNS, text);
  if (negated) {
    heuristic = true;
    reasonCodes.push("negation_lowers_risk");
    if (matchedPassiveSelfHarm) {
      reasonCodes.push("passive_ideation_negated_medium_caution");
      lexicalRisk = Math.min(lexicalRisk, 2) as RiskScore;
      heuristicRisk = maxRisk(Math.min(heuristicRisk, 2) as RiskScore, 2);
    } else if (hasRecentSafetyContext) {
      reasonCodes.push("recent_safety_negated_medium_caution");
      lexicalRisk = Math.min(lexicalRisk, 1) as RiskScore;
      heuristicRisk = maxRisk(Math.min(heuristicRisk, 2) as RiskScore, 2);
    } else {
      lexicalRisk = Math.min(lexicalRisk, 1) as RiskScore;
      heuristicRisk = maxRisk(Math.min(heuristicRisk, 1) as RiskScore, 1);
    }
  }

  const humor = hasPattern(HUMOR_PATTERNS, text);
  if (humor) {
    heuristic = true;
    reasonCodes.push("humor_marker_lowers_risk");
    lexicalRisk = Math.min(lexicalRisk, 1) as RiskScore;
    heuristicRisk = maxRisk(Math.min(heuristicRisk, 1) as RiskScore, 1);
  }

  if (
    lexicalRisk === 0 && heuristicRisk <= 2 &&
    hasPattern(BOUNDED_STRESS_CONTEXT_PATTERNS, text)
  ) {
    reasonCodes.push("bounded_context_lowers_risk");
    heuristicRisk = 0;
  }

  const riskScore = maxRisk(lexicalRisk, heuristicRisk);
  const riskBand = SCORE_TO_RISK[riskScore];
  return {
    detected: riskScore > RISK_TO_SCORE.none,
    risk_band: riskBand,
    reason_codes: [...new Set(reasonCodes)],
    evidence: [...new Set(evidence)],
    layer_contributions: {
      lexical,
      heuristic,
      dispatcher_llm: false,
    },
    allow_side_effects: allowsSideEffects(riskBand),
  };
}
