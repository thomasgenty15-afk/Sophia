// RETRAIT ARCHITECTE (2026-08-08) — les cinq surfaces `architect.*`
// (coaching/wishlist/stories/reflections/quotes) sont retirées de ce registre.
// Leurs trois tables avaient déjà été droppées le 2026-08-03 par
// `20260803140000_pivot_drop_non_spine_legacy.sql`, et leurs écrans
// (`/architecte/*`) sont démontés depuis `App.tsx` W2.A.
//
// L'absence est portée par `getSurfaceDefinition()`: un `surface_id`
// `architect.*` persisté dans un état conversationnel d'avant le pivot ne
// résout plus rien, et `loadSurfaceOpportunityAddon()` rend `null` avant tout
// accès DB.
//
// Ce qui reste ici (les surfaces `dashboard.*`) n'a **aucun écrivain**:
// personne ne pose `tempMemory.__surface_opportunity_addon`, seule entrée du
// système. Le registre entier est donc inerte — son verdict dépend des lots
// « plans d'action » et « rappels récurrents », et n'est pas rendu ici.
//
// RETRAIT RÉSIDUS GRAND PUBLIC (2026-08-08) — `dashboard.reminders` est partie
// avec `user_recurring_reminders` (lot « rappels récurrents », migration
// 20260808080000, décision humaine: 0 utilisateur grand public).

// `"transformational"` disparaît avec les surfaces `architect.*`: c'était la
// famille des cinq, et il n'en reste aucune.
export type SurfaceFamily = "utility";

export type SurfaceId =
  | "dashboard.personal_actions"
  | "dashboard.preferences";

export type SurfaceContentSource =
  | "none"
  | "personal_actions"
  | "preferences";

export interface SurfaceDefinition {
  id: SurfaceId;
  family: SurfaceFamily;
  label: string;
  goal: string;
  whenRelevant: string;
  antiNoise: string;
  defaultLevelCap: 1 | 2 | 3 | 4 | 5;
  contentSource: SurfaceContentSource;
  aliases: string[];
  triggerKeywords: string[];
}

export const SURFACE_REGISTRY: SurfaceDefinition[] = [
  {
    id: "dashboard.personal_actions",
    family: "utility",
    label: "Actions Personnelles",
    goal:
      "Aider le user à installer ou suivre des habitudes personnelles hors plan principal.",
    whenRelevant:
      "Comportements récurrents, auto-discipline, petites routines, action à répéter soi-même.",
    antiNoise:
      "Ne pas pousser si le user veut seulement un rappel envoyé par Sophia ou une simple discussion abstraite.",
    defaultLevelCap: 4,
    contentSource: "personal_actions",
    aliases: [
      "actions personnelles",
    ],
    triggerKeywords: [
      "actions personnelles",
      "habitudes",
      "habitude",
      "routine",
      "routines",
      "tenir",
      "routine",
      "habitude",
      "discipline quotidienne",
      "répéter",
    ],
  },
  {
    id: "dashboard.preferences",
    family: "utility",
    label: "Préférences coach",
    goal:
      "Adapter la relation avec Sophia via le ton, le challenge, la longueur et la fréquence des questions.",
    whenRelevant:
      "Friction avec le style de Sophia, besoin de plus de douceur/directivité, longueur ou bavardage.",
    antiNoise:
      "Ne pas pousser pour une préférence implicite faible ou un simple ressenti isolé.",
    defaultLevelCap: 5,
    contentSource: "preferences",
    aliases: [
      "préférences",
      "preferences",
      "préférences coach",
      "preferences coach",
    ],
    triggerKeywords: [
      "ton",
      "style",
      "coach",
      "plus direct",
      "plus doux",
      "plus court",
      "moins de questions",
      "challenge-moi",
    ],
  },
];

const SURFACE_MAP = new Map<SurfaceId, SurfaceDefinition>(
  SURFACE_REGISTRY.map((surface) => [surface.id, surface]),
);

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function listSurfaceIds(): SurfaceId[] {
  return SURFACE_REGISTRY.map((surface) => surface.id);
}

export function isAllowedSurfaceId(value: string): value is SurfaceId {
  return SURFACE_MAP.has(value as SurfaceId);
}

export function getSurfaceDefinition(
  surfaceId: string,
): SurfaceDefinition | undefined {
  return SURFACE_MAP.get(surfaceId as SurfaceId);
}

export function getSurfaceLevelCap(surfaceId: string): number {
  return getSurfaceDefinition(surfaceId)?.defaultLevelCap ?? 3;
}

export function findSurfaceIdsByText(text: string): SurfaceId[] {
  const normalized = normalizeText(String(text ?? ""));
  if (!normalized) return [];
  const hits: SurfaceId[] = [];
  for (const surface of SURFACE_REGISTRY) {
    const needles = [...surface.aliases, ...surface.triggerKeywords];
    if (
      needles.some((needle) => {
        const candidate = normalizeText(needle);
        return candidate.length > 0 && normalized.includes(candidate);
      })
    ) {
      hits.push(surface.id);
    }
  }
  return hits;
}

export function findExplicitSurfaceIdsByText(text: string): SurfaceId[] {
  const normalized = normalizeText(String(text ?? ""));
  if (!normalized) return [];
  const hits: SurfaceId[] = [];
  for (const surface of SURFACE_REGISTRY) {
    if (
      surface.aliases.some((alias) => {
        const candidate = normalizeText(alias);
        return candidate.length > 0 && normalized.includes(candidate);
      })
    ) {
      hits.push(surface.id);
    }
  }
  return hits;
}

export const SURFACE_REGISTRY_PROMPT_BLOCK = SURFACE_REGISTRY.map((surface) =>
  [
    `- ${surface.id}`,
    `  family=${surface.family}`,
    `  goal=${surface.goal}`,
    `  relevant=${surface.whenRelevant}`,
    `  anti_noise=${surface.antiNoise}`,
  ].join("\n")
).join("\n");
