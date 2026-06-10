import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import {
  buildToolConfirmationDecision,
  type ToolConfirmationDecision,
} from "../_shared/confirmation_adapter.ts";

export function buildAdjustPlanConfirmationDecision(args: {
  user_message: string;
  turn_frame: TurnFrame | null;
  pending_confirmation: unknown;
  local_review?: unknown;
  request_id?: string | null;
}): ToolConfirmationDecision {
  return buildToolConfirmationDecision({
    user_message: args.user_message,
    turn_frame: args.turn_frame,
    pending_confirmation: args.pending_confirmation,
    operation_type: "adjust_plan_item",
    local_review: args.local_review,
    request_id: args.request_id ?? null,
  });
}
