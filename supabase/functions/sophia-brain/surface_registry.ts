export type SurfaceFamily = "utility" | "transformational";

export type SurfaceId =
  | "dashboard.personal_actions"
  | "dashboard.north_star"
  | "dashboard.reminders"
  | "dashboard.preferences"
  | "architect.coaching"
  | "architect.wishlist"
  | "architect.stories"
  | "architect.reflections"
  | "architect.quotes";

export type SurfaceContentSource =
  | "none"
  | "personal_actions"
  | "north_star"
  | "reminders"
  | "preferences"
  | "wishlist"
  | "stories"
  | "reflections"
  | "quotes";

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
    goal: "Aider le user à installer ou suivre des habitudes personnelles hors plan principal.",
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
    id: "dashboard.north_star",
    family: "utility",
    label: "Étoile Polaire",
    goal:
      "Aider le user à clarifier un cap long terme via un indicateur unique et suivi dans le temps.",
    whenRelevant:
      "Direction, cap, trajectoire, indicateur, métrique long terme, sentiment d'avancer sans boussole.",
    antiNoise:
      "Ne pas pousser pour un simple problème ponctuel sans enjeu de direction ou de mesure.",
    defaultLevelCap: 4,
    contentSource: "north_star",
    aliases: [
      "étoile polaire",
      "etoile polaire",
      "north star",
    ],
    triggerKeywords: [
      "cap",
      "direction",
      "trajectoire",
      "indicateur",
      "mesurer",
      "long terme",
      "boussole",
    ],
  },
  {
    id: "dashboard.reminders",
    family: "utility",
    label: "Rendez-vous",
    goal:
      "Permettre à Sophia de venir vers le user au bon moment avec un rappel, un message ou un contenu inspirant.",
    whenRelevant:
      "Besoin de rappels, relances, messages planifiés, soutien proactif, timing important.",
    antiNoise:
      "Ne pas pousser si le user veut seulement créer une habitude à faire lui-même ou un rappel one-shot.",
    defaultLevelCap: 5,
    contentSource: "reminders",
    aliases: ["rendez-vous", "rendez vous", "reminders"],
    triggerKeywords: [
      "rappel",
      "rappels",
      "reminder",
      "viens vers moi",
      "écris-moi",
      "me rappeler",
      "me relancer",
      "message planifié",
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
  {
    id: "architect.coaching",
    family: "transformational",
    label: "L'Atelier",
    goal:
      "Orienter vers le travail de transformation identitaire et les modules de coaching/rituels.",
    whenRelevant:
      "Reconstruction de soi, blocages profonds, transformation identitaire, besoin d'un travail structuré.",
    antiNoise:
      "Ne pas pousser pour une simple réponse pratique ou un souci très local sans enjeu identitaire.",
    defaultLevelCap: 4,
    contentSource: "none",
    aliases: ["atelier", "l'atelier", "coaching", "temple"],
    triggerKeywords: [
      "forge",
      "table ronde",
      "transformation",
      "identité",
      "blocage profond",
      "me reconstruire",
      "travail de fond",
    ],
  },
  {
    id: "architect.wishlist",
    family: "transformational",
    label: "Envies",
    goal:
      "Capturer ce qui attire profondément le user et dessine la vie qu'il veut construire.",
    whenRelevant:
      "Désirs, aspirations, envies de vie, bucket list, ce qui l'appelle ou le fait vibrer.",
    antiNoise:
      "Ne pas pousser sur une simple idée logistique ou une tâche immédiate.",
    defaultLevelCap: 4,
    contentSource: "wishlist",
    aliases: ["envies", "wishlist", "life wishlist"],
    triggerKeywords: [
      "désirs",
      "desirs",
      "aspirations",
      "j'ai envie",
      "ça m'attire",
      "vie que je veux",
      "me fait vibrer",
      "j'aimerais vivre",
    ],
  },
  {
    id: "architect.stories",
    family: "transformational",
    label: "Histoires",
    goal:
      "Transformer le vécu réel du user en récits transmissibles, utiles et réutilisables.",
    whenRelevant:
      "Raconter une expérience, mieux parler de soi, prise de parole, vente, dating, connexion.",
    antiNoise:
      "Ne pas pousser si le user ne parle pas d'un vécu, d'un récit ou d'un besoin de narration.",
    defaultLevelCap: 4,
    contentSource: "stories",
    aliases: ["histoires", "story journal"],
    triggerKeywords: [
      "histoire",
      "récit",
      "recit",
      "story",
      "raconter",
      "anecdote",
      "ce que j'ai vécu",
      "prise de parole",
      "transmettre",
    ],
  },
  {
    id: "architect.reflections",
    family: "transformational",
    label: "Réflexions",
    goal:
      "Structurer des idées, intuitions et observations pour clarifier la pensée du user.",
    whenRelevant:
      "Introspection, idée à développer, observation, intuition, besoin de structurer une pensée.",
    antiNoise:
      "Ne pas pousser pour une demande purement opérationnelle ou un simple besoin de réponse courte.",
    defaultLevelCap: 4,
    contentSource: "reflections",
    aliases: ["réflexions", "reflexions", "réflexion", "reflexion"],
    triggerKeywords: [
      "idée",
      "j'ai une idée",
      "je me disais",
      "intuition",
      "observation",
      "structurer ma pensée",
    ],
  },
  {
    id: "architect.quotes",
    family: "transformational",
    label: "Citations",
    goal:
      "Ancrer des phrases fortes et retrouver rapidement la bonne citation selon le moment.",
    whenRelevant:
      "Besoin d'inspiration légère, de phrase choc, de mantra, de rappel de perspective.",
    antiNoise:
      "Ne pas pousser face à un besoin d'analyse longue ou à un sujet qui demande autre chose qu'une ancre courte.",
    defaultLevelCap: 3,
    contentSource: "quotes",
    aliases: ["citations", "citation", "quotes"],
    triggerKeywords: [
      "phrase",
      "mantra",
      "quote",
      "inspire-moi",
      "phrase forte",
      "citation",
      "mantra",
      "rappel mental",
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
