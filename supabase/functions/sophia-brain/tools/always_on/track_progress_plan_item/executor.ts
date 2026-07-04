import type {
  TrackProgressCommittedEffect,
  TrackProgressRequestedEffect,
  TrackProgressWrite,
} from "./contract.ts";

export type TrackProgressExecutionResult =
  | {
    status: "committed";
    committed_effect: TrackProgressCommittedEffect;
  }
  | {
    // Entry identique deja en DB pour (item, jour, outcome), ecrite par un
    // autre message: aucun nouveau write, on expose l'existant au renderer.
    status: "already_logged";
    existing_progress_id: string;
  }
  | {
    status: "failed";
    reason_code: "write_failed" | "missing_logged_progress_id";
  };

export async function executeTrackProgressWrite(args: {
  requested_effect: TrackProgressRequestedEffect;
  user_id: string;
  idempotency_key: string;
  write_progress: TrackProgressWrite;
}): Promise<TrackProgressExecutionResult> {
  try {
    const written = await args.write_progress({
      user_id: args.user_id,
      target_item_id: args.requested_effect.target_item_id,
      target_title: args.requested_effect.target_title ?? "",
      progress_status: args.requested_effect.progress_status,
      value: args.requested_effect.value,
      source_message_id: args.requested_effect.source_message_id,
      date_hint: args.requested_effect.date_hint,
      idempotency_key: args.idempotency_key,
      retarget_from_item_id: args.requested_effect.retarget_from_item_id ??
        null,
    });
    const loggedProgressId = String(written.logged_progress_id ?? "").trim();
    if (!loggedProgressId) {
      return { status: "failed", reason_code: "missing_logged_progress_id" };
    }
    if (written.already_logged) {
      return {
        status: "already_logged",
        existing_progress_id: loggedProgressId,
      };
    }
    return {
      status: "committed",
      committed_effect: {
        type: "track_progress_plan_item",
        logged_progress_id: loggedProgressId,
        target_item_id: args.requested_effect.target_item_id,
        target_title: args.requested_effect.target_title ?? "",
        progress_status: args.requested_effect.progress_status,
        value: args.requested_effect.value,
      },
    };
  } catch (_error) {
    return { status: "failed", reason_code: "write_failed" };
  }
}
