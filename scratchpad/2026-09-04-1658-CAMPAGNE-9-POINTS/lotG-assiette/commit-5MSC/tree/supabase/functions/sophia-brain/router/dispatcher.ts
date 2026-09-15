import type {
  DispatcherMemoryPlan,
  DispatcherPlanFeedbackSignal,
  DispatcherProfileStatementSignal,
  DispatcherRuleQuestionSignal,
  DispatcherResearchSignal,
} from "../contracts/turn_frame.v1.ts";

export type {
  DispatcherMemoryPlan,
  DispatcherPlanFeedbackSignal,
  DispatcherProfileStatementSignal,
  DispatcherRuleQuestionSignal,
  DispatcherResearchSignal,
};

export type DispatcherModelTierHint = "lite" | "standard" | "deep";

export type DispatcherSignals = {
  safety: { level: "NONE" | "SENTRY"; confidence: number };
  interrupt: { kind: "NONE" | "EXPLICIT_STOP" | "BORED"; confidence: number };
  risk_score: number;
  needs_research: DispatcherResearchSignal;
  checkup_intent: {
    detected: boolean;
    confidence?: number;
    trigger_phrase?: string | null;
  };
  plan_item_discussion: {
    detected: boolean;
    item_hint?: string;
    target_item_id?: string | null;
  };
  // LOT 4A — la forme est INCHANGÉE; elle a seulement cessé d'être recopiée.
  // Une seule définition, dans `contracts/turn_frame.v1.ts`, que le contrat du
  // TurnFrame et ce type partagent — le modèle remplit le champ du contrat, ce
  // type est ce que le runtime en lit. Deux jumeaux que rien ne relie, c'est la
  // panne §7.4: renommer un champ d'un côté laisse tout vert de l'autre.
  plan_feedback: DispatcherPlanFeedbackSignal;
  // LOT M1 — même patron, une seule définition, dans le contrat du TurnFrame.
  // Le modèle remplit le champ du contrat; ce type est ce que le runtime en
  // lit. Ce signal n'écrit rien: il arme une phrase de RENVOI.
  profile_statement: DispatcherProfileStatementSignal;
  // LOT M6 — la question qui révoque. Passif comme les deux au-dessus.
  rule_question: DispatcherRuleQuestionSignal;
  track_progress_plan_item: {
    detected: boolean;
    target_item_id?: string | null;
    target_title?: string | null;
    status_hint?: string | null;
    value_hint?: number | null;
    date_hint?: string | null;
  };
  dashboard_preferences_intent: {
    detected: boolean;
    confidence?: number;
    fields?: string[];
    preference_keys?: string[];
  };
};

export const DEFAULT_SIGNALS: DispatcherSignals = {
  safety: { level: "NONE", confidence: 0 },
  interrupt: { kind: "NONE", confidence: 0 },
  risk_score: 0,
  needs_research: { detected: false },
  checkup_intent: { detected: false },
  plan_item_discussion: { detected: false },
  plan_feedback: { detected: false },
  profile_statement: { detected: false },
  rule_question: { detected: false },
  track_progress_plan_item: { detected: false },
  dashboard_preferences_intent: { detected: false },
};
