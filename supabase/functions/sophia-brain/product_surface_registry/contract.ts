import { PRODUCT_SURFACE_DEFINITIONS } from "./surfaces_data.ts";

export type ProductSurfaceId =
  | "plan"
  | "attack_cards"
  | "defense_cards"
  | "state_potions"
  | "recurring_reminders"
  | "coach_preferences"
  | string;

export type ProductSurfaceHandoffTarget = {
  surface_id: ProductSurfaceId;
  operation_type:
    | "adjust_plan_item"
    | "prepare_attack_card"
    | "prepare_defense_card"
    | "select_state_potion"
    | "create_recurring_reminder"
    | "update_coach_preferences"
    | string;
  label: string;
  short_destination_label: string;
  user_facing_destination: string;
  platform_steps: string[];
  can_execute_from_chat: false;
  chat_behavior: "platform_handoff";
};

export const PLATFORM_HANDOFF_OPERATION_TYPES = [
  "adjust_plan_item",
  "prepare_attack_card",
  "prepare_defense_card",
  "select_state_potion",
  "create_recurring_reminder",
  "update_coach_preferences",
] as const;

export function isProductSurfaceHandoffTarget(
  value: unknown,
): value is ProductSurfaceHandoffTarget {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  return Boolean(
    record?.chat_behavior === "platform_handoff" &&
      typeof record.operation_type === "string" &&
      typeof record.surface_id === "string" &&
      typeof record.label === "string" &&
      typeof record.short_destination_label === "string" &&
      typeof record.user_facing_destination === "string" &&
      Array.isArray(record.platform_steps) &&
      record.platform_steps.every((step) =>
        typeof step === "string" && step.trim()
      ) &&
      record.can_execute_from_chat === false,
  );
}

export function validateProductSurfaceHandoffTarget(
  value: unknown,
): ProductSurfaceHandoffTarget {
  if (!isProductSurfaceHandoffTarget(value)) {
    const operation = (value as any)?.operation_type ?? "unknown";
    throw new Error(`handoff_target_${operation}_invalid`);
  }
  return value;
}

const HANDOFF_TARGETS: ProductSurfaceHandoffTarget[] =
  PRODUCT_SURFACE_DEFINITIONS.reduce<ProductSurfaceHandoffTarget[]>(
    (targets, definition) => {
      if (isProductSurfaceHandoffTarget(definition)) {
        targets.push(validateProductSurfaceHandoffTarget(definition));
      }
      return targets;
    },
    [],
  );

const HANDOFF_TARGETS_BY_OPERATION = new Map(
  HANDOFF_TARGETS
    .map((target) => [target.operation_type, target]),
);

export function getHandoffTargetForOperation(
  operationType: string,
): ProductSurfaceHandoffTarget | null {
  const target = HANDOFF_TARGETS_BY_OPERATION.get(String(operationType).trim());
  if (!target) return null;
  if (
    target.can_execute_from_chat !== false ||
    target.chat_behavior !== "platform_handoff"
  ) {
    return null;
  }
  return target;
}

export function allHandoffTargets(): ProductSurfaceHandoffTarget[] {
  return [...HANDOFF_TARGETS_BY_OPERATION.values()];
}
