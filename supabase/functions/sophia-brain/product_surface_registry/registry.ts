import {
  type ProductSurfaceDestination,
  validateProductSurfaceDestination,
} from "./contract.ts";
import { PRODUCT_SURFACE_DEFINITIONS } from "./surfaces_data.ts";

export type ProductSurfaceFamily =
  | "utility"
  | "transformational"
  | "state"
  | "execution"
  | "safety";

export type ProductSurfaceDefinition = {
  id: string;
  family: ProductSurfaceFamily;
  label: string;
  goal: string;
  when_relevant: string;
  anti_noise: string;
  contraindications: string[];
  requires_consent: boolean;
  can_execute_from_chat: boolean;
  feature_id?: string | null;
  default_level_cap: 1 | 2 | 3 | 4 | 5;
  content_source: string;
  aliases: string[];
  trigger_keywords: string[];
};

export type ProductSurfaceRegistry = {
  surfaces: ProductSurfaceDefinition[];
  by_id: Map<string, ProductSurfaceDefinition>;
  platform_destinations: ProductSurfaceDestination[];
  platform_destinations_by_id: Map<string, ProductSurfaceDestination>;
};

const REQUIRED_SURFACE_IDS = [
  "potion.state",
  "attack_card",
  "defense_card",
  "plan_item.reduce",
  "plan_item.clarify",
  "dashboard.reminders",
  "dashboard.preferences",
  "dashboard.personal_actions",
] as const;

const REQUIRED_PLATFORM_DESTINATION_IDS = [
  "plan_adjustment",
  "attack_card",
  "defense_card",
  "state_potion",
  "recurring_reminder",
  "coach_preferences",
] as const;

export function validateProductSurfaceDefinition(
  value: unknown,
): ProductSurfaceDefinition {
  const surface = value as Partial<ProductSurfaceDefinition>;
  if (!surface || typeof surface !== "object") {
    throw new Error("surface_not_object");
  }
  const requiredStrings = [
    "id",
    "family",
    "label",
    "goal",
    "when_relevant",
    "anti_noise",
    "content_source",
  ] as const;
  for (const key of requiredStrings) {
    if (typeof surface[key] !== "string" || !surface[key]?.trim()) {
      throw new Error(`surface_${surface.id ?? "unknown"}_${key}_missing`);
    }
  }
  if (
    !["utility", "transformational", "state", "execution", "safety"].includes(
      surface.family!,
    )
  ) {
    throw new Error(`surface_${surface.id}_family_invalid`);
  }
  if (!Array.isArray(surface.contraindications)) {
    throw new Error(`surface_${surface.id}_contraindications_missing`);
  }
  if (surface.contraindications.length === 0) {
    throw new Error(`surface_${surface.id}_contraindications_empty`);
  }
  if (typeof surface.requires_consent !== "boolean") {
    throw new Error(`surface_${surface.id}_requires_consent_missing`);
  }
  if (typeof surface.can_execute_from_chat !== "boolean") {
    throw new Error(`surface_${surface.id}_can_execute_from_chat_missing`);
  }
  if (
    ![1, 2, 3, 4, 5].includes(
      surface.default_level_cap as 1 | 2 | 3 | 4 | 5,
    )
  ) {
    throw new Error(`surface_${surface.id}_default_level_cap_invalid`);
  }
  if (!Array.isArray(surface.aliases) || surface.aliases.length === 0) {
    throw new Error(`surface_${surface.id}_aliases_missing`);
  }
  if (
    !Array.isArray(surface.trigger_keywords) ||
    surface.trigger_keywords.length === 0
  ) {
    throw new Error(`surface_${surface.id}_trigger_keywords_missing`);
  }
  return surface as ProductSurfaceDefinition;
}

export function buildProductSurfaceRegistry(
  values: unknown[],
): ProductSurfaceRegistry {
  const platformDestinations = values
    .filter((value) =>
      (value as Record<string, unknown> | null)?.chat_behavior ===
        "platform_destination"
    )
    .map(validateProductSurfaceDestination);
  const surfaces = values
    .filter((value) =>
      (value as Record<string, unknown> | null)?.chat_behavior !==
        "platform_destination"
    )
    .map(validateProductSurfaceDefinition);
  const ids = new Set<string>();
  for (const surface of surfaces) {
    if (ids.has(surface.id)) throw new Error(`surface_${surface.id}_duplicate`);
    ids.add(surface.id);
  }
  for (const requiredId of REQUIRED_SURFACE_IDS) {
    if (!ids.has(requiredId)) throw new Error(`surface_${requiredId}_missing`);
  }
  const destinationIds = new Set<string>();
  for (const destination of platformDestinations) {
    if (destinationIds.has(destination.destination_id)) {
      throw new Error(
        `platform_destination_${destination.destination_id}_duplicate`,
      );
    }
    destinationIds.add(destination.destination_id);
  }
  for (const destinationId of REQUIRED_PLATFORM_DESTINATION_IDS) {
    if (!destinationIds.has(destinationId)) {
      throw new Error(`platform_destination_${destinationId}_missing`);
    }
  }
  return {
    surfaces,
    by_id: new Map(surfaces.map((surface) => [surface.id, surface])),
    platform_destinations: platformDestinations,
    platform_destinations_by_id: new Map(
      platformDestinations.map((destination) => [
        destination.destination_id,
        destination,
      ]),
    ),
  };
}

export async function loadProductSurfaceRegistry(
  path = new URL("./surfaces.json", import.meta.url),
): Promise<ProductSurfaceRegistry> {
  if (
    path instanceof URL &&
    path.protocol === "file:" &&
    path.href === new URL("./surfaces.json", import.meta.url).href
  ) {
    return buildProductSurfaceRegistry([...PRODUCT_SURFACE_DEFINITIONS]);
  }
  const raw = await Deno.readTextFile(path);
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("surfaces_json_not_array");
  return buildProductSurfaceRegistry(parsed);
}

export function filterSurfacesByContraindications(
  surfaces: ProductSurfaceDefinition[],
  activeContraindications: string[],
): ProductSurfaceDefinition[] {
  const active = new Set(activeContraindications);
  return surfaces.filter((surface) =>
    !surface.contraindications.some((contraindication) =>
      active.has(contraindication)
    )
  );
}

export const PRODUCT_SURFACE_REGISTRY_REQUIRED_IDS = REQUIRED_SURFACE_IDS;
export const PRODUCT_SURFACE_REGISTRY_REQUIRED_PLATFORM_DESTINATION_IDS =
  REQUIRED_PLATFORM_DESTINATION_IDS;
