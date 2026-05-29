export type TrackProgressIntent =
  | "log_completed"
  | "log_partial"
  | "log_missed"
  | "future_intent"
  | "status_question"
  | "clarify"
  | "ignore";

export type TrackProgressStatus = "completed" | "missed" | "partial";

export type TrackProgressWrite = (input: {
  user_id: string;
  target_item_id: string;
  target_title: string;
  progress_status: TrackProgressStatus;
  value: number;
  source_message_id: string;
  date_hint?: string | null;
  idempotency_key: string;
}) => Promise<{ logged_progress_id: string }>;

export type TrackProgressCommittedEffect = {
  type: "track_progress_plan_item";
  logged_progress_id: string;
  target_item_id: string;
  target_title: string;
  progress_status: TrackProgressStatus;
  value: number;
};

export type TrackProgressRequestedEffect = {
  type: "track_progress_plan_item";
  target_item_id: string;
  target_title?: string;
  progress_status: TrackProgressStatus;
  value: number;
  date_hint?: string | null;
  source_message_id: string;
};

export type TrackProgressDirectEffectResult = {
  detected: boolean;
  intent: TrackProgressIntent;
  status:
    | "logged"
    | "needs_clarify"
    | "blocked"
    | "ignored"
    | "failed";
  reply: string | null;
  executed_tools: ["track_progress_plan_item"] | [];
  requested_effects: TrackProgressRequestedEffect[];
  allowed_effects: TrackProgressRequestedEffect[];
  committed_effects: TrackProgressCommittedEffect[];
  blocked_effects: Array<{ type: string; reason_code: string }>;
  debug: {
    reason_code: string;
    gate_reason?: string | null;
  };
};
