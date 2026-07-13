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
  // Correction de cible (3h-bis): entry du jour a invalider sur cet item
  // avant de committer sur target_item_id.
  retarget_from_item_id?: string | null;
  /** Correction explicite (3h): remplace l'ecriture contredite du jour au lieu d'empiler. */
  correction?: boolean;
}) => Promise<{
  logged_progress_id: string;
  /** false = entry committee mais patch compteur/statut rejete (cmd 15). */
  item_patch_applied?: boolean;
  // Entry identique (item, jour, outcome) deja en DB, ecrite par un autre
  // message: rien de re-ecrit, l'id renvoye est celui de l'entry existante.
  already_logged?: boolean;
}>;

export type TrackProgressCommittedEffect = {
  type: "track_progress_plan_item";
  logged_progress_id: string;
  target_item_id: string;
  target_title: string;
  progress_status: TrackProgressStatus;
  value: number;
  /** false = coche committee, compteur/statut NON mis a jour (paul-r8 B01). */
  item_patch_applied?: boolean;
};

export type TrackProgressRequestedEffect = {
  type: "track_progress_plan_item";
  target_item_id: string;
  target_title?: string;
  progress_status: TrackProgressStatus;
  value: number;
  date_hint?: string | null;
  source_message_id: string;
  retarget_from_item_id?: string | null;
  /** Correction explicite (3h): remplace l'ecriture contredite du jour au lieu d'empiler. */
  correction?: boolean;
};

export type TrackProgressDirectEffectResult = {
  /** P2-4a: slots additionnels portés au 3g (ex. retarget_from_candidate). */
  known_slots_extra?: Record<string, unknown> | null;
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
