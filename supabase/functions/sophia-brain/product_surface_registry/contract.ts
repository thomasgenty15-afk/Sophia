import { PRODUCT_SURFACE_DEFINITIONS } from "./surfaces_data.ts";

export type ProductSurfaceId =
  | "plan"
  | "attack_cards"
  | "defense_cards"
  | "state_potions"
  | "recurring_reminders"
  | "coach_preferences"
  | string;

export type ProductSurfaceDestination = {
  surface_id: ProductSurfaceId;
  destination_id:
    | "plan_adjustment"
    | "attack_card"
    | "defense_card"
    | "state_potion"
    | "recurring_reminder"
    | "coach_preferences"
    | string;
  label: string;
  short_destination_label: string;
  user_facing_destination: string;
  platform_steps: string[];
  can_execute_from_chat: false;
  chat_behavior: "platform_destination";
};

export const PLATFORM_DESTINATION_IDS = [
  "plan_adjustment",
  "attack_card",
  "defense_card",
  "state_potion",
  "recurring_reminder",
  "coach_preferences",
] as const;

export function isProductSurfaceDestination(
  value: unknown,
): value is ProductSurfaceDestination {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  return Boolean(
    record?.chat_behavior === "platform_destination" &&
      typeof record.destination_id === "string" &&
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

export function validateProductSurfaceDestination(
  value: unknown,
): ProductSurfaceDestination {
  if (!isProductSurfaceDestination(value)) {
    const destination = (value as any)?.destination_id ?? "unknown";
    throw new Error(`platform_destination_${destination}_invalid`);
  }
  return value;
}

const PLATFORM_DESTINATIONS: ProductSurfaceDestination[] =
  PRODUCT_SURFACE_DEFINITIONS.reduce<ProductSurfaceDestination[]>(
    (destinations, definition) => {
      if (isProductSurfaceDestination(definition)) {
        destinations.push(validateProductSurfaceDestination(definition));
      }
      return destinations;
    },
    [],
  );

const PLATFORM_DESTINATIONS_BY_ID = new Map(
  PLATFORM_DESTINATIONS
    .map((destination) => [destination.destination_id, destination]),
);

export function getPlatformDestination(
  destinationId: string,
): ProductSurfaceDestination | null {
  const destination = PLATFORM_DESTINATIONS_BY_ID.get(
    String(destinationId).trim(),
  );
  if (!destination) return null;
  if (
    destination.can_execute_from_chat !== false ||
    destination.chat_behavior !== "platform_destination"
  ) {
    return null;
  }
  return destination;
}

export function allPlatformDestinations(): ProductSurfaceDestination[] {
  return [...PLATFORM_DESTINATIONS_BY_ID.values()];
}
