import type {
  PlanDimension,
  PlanItemKind,
  PlanItemStatus,
  SupportFunction,
  SupportMode,
  TrackingType,
} from "./v2";

export type ActionType = "habitude" | "mission" | "framework";

export interface ActionHistoryEntry {
  id: string;
  createdAt: string;
  effectiveAt: string;
  entryKind: string;
  outcome: string;
  valueNumeric?: number | null;
  valueText?: string | null;
  difficultyLevel?: string | null;
  blockerHint?: string | null;
  metadata?: Record<string, unknown>;
}

export interface Action {
  id: string;
  type: ActionType;
  title: string;
  description: string;
  isCompleted: boolean;
  status?: PlanItemStatus;
  dimension?: PlanDimension;
  kind?: PlanItemKind;
  trackingType?: TrackingType;
  currentReps?: number | null;
  mantra?: string;
  isHypnosis?: boolean;
  media_duration?: string;
  targetReps?: number | null;
  cadenceLabel?: string | null;
  scheduledDays?: string[] | null;
  timeOfDay?: string | null;
  supportMode?: SupportMode | null;
  supportFunction?: SupportFunction | null;
  payload?: Record<string, unknown>;
  history: ActionHistoryEntry[];
}

export interface CompletedTransformation {
  id: string;
  title: string;
  theme: string;
  completedDate: string;
  strategy: {
    identity: string;
    bigWhy: string;
    goldenRules: string;
  };
  contextProblem?: string;
  actions: Action[];
  status: string;
}
