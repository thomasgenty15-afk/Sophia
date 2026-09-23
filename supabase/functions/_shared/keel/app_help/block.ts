// FF-066 · L'aide sur l'app — LE BLOC injecté au composeur, et ce qu'il lui faut.
//
// Le circuit (fiche §4):
//   dispatcher ─► skill_signals.app_help = { detected, topics }
//   run.ts     ─► selectAppHelpTopics (identifiants connus, 3 au plus)
//              ─► loadAppHelpViewer   (rôle dans le foyer + objectif, UNE lecture,
//                                      seulement sur ce tour-là)
//              ─► appHelpContextBlock (le texte, dans la langue de la réponse)
//              ─► injectedContext     (placé en tête: survit à la coupe du prompt)
//
// Tout est pur ici sauf `loadAppHelpViewer`. Aucune fonction ne lève: une
// lecture en panne rend un profil inconnu, et la fiche rend sa réponse par
// défaut, qui énonce ses conditions au lieu de choisir un profil (fiche §7).

import {
  APP_HELP_CARDS,
  APP_HELP_NUMBER_TOPICS,
  APP_HELP_PHOTO_TOPICS,
  APP_HELP_TOPIC_IDS,
  APP_HELP_UNKNOWN_TOPIC,
  type AppHelpCard,
  type AppHelpGoal,
  type AppHelpLocale,
  type AppHelpRole,
  type AppHelpTopicId,
  type AppHelpVariant,
} from "./cards.ts";
import { APP_HELP_BLOCK_TITLE } from "./block_title.ts";

/** Au plus trois fiches par tour: c'est ce qui borne le coût (fiche R1). */
export const APP_HELP_MAX_TOPICS = 3;
/** Identifiants inconnus gardés pour le log, bornés. */
const MAX_DROPPED_LOGGED = 5;
const MAX_DROPPED_CHARS = 60;

const KNOWN_TOPICS: ReadonlySet<string> = new Set(APP_HELP_TOPIC_IDS);

export type AppHelpTopicSelection = {
  /** Identifiants connus, dédoublonnés, dans l'ordre du modèle, 3 au plus. */
  topics: AppHelpTopicId[];
  /** Ce que le modèle a émis et qu'aucune fiche ne porte. Pour le log seulement. */
  dropped: string[];
};

/**
 * Le tri des identifiants émis par le dispatcher.
 *
 * ⚠️ UN SIGNAL DÉTECTÉ SANS IDENTIFIANT CONNU DEVIENT `unknown_feature`, jamais
 * rien. Le modèle a reconnu une question sur l'app; s'il a inventé l'identifiant,
 * la bonne réponse reste « voici ce qui existe », pas une réponse sans bloc où
 * le composeur n'a plus le droit de nommer un écran.
 */
export function selectAppHelpTopics(raw: unknown): AppHelpTopicSelection {
  const values = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  const topics: AppHelpTopicId[] = [];
  const dropped: string[] = [];
  for (const value of values) {
    const id = String(value ?? "").trim().toLowerCase();
    if (!id) continue;
    if (KNOWN_TOPICS.has(id)) {
      const known = id as AppHelpTopicId;
      if (!topics.includes(known) && topics.length < APP_HELP_MAX_TOPICS) {
        topics.push(known);
      }
    } else if (dropped.length < MAX_DROPPED_LOGGED) {
      dropped.push(id.slice(0, MAX_DROPPED_CHARS));
    }
  }
  if (topics.length === 0) topics.push(APP_HELP_UNKNOWN_TOPIC);
  return { topics, dropped };
}

/**
 * LE PLANCHER PASSE AVANT L'AIDE. Sous le plancher de restriction alimentaire
 * (FF-021) ou pour un mineur, les fiches de chiffres ne partent pas
 * (`APP_HELP_NUMBER_TOPICS`). Ce qui reste peut être vide: pas de bloc alors,
 * et le composeur, sans bloc, ne nomme aucun écran.
 *
 * ⚠️ `restrictionFlag` et `isMinor` SONT REQUIS. Un paramètre de garde
 * optionnel est une garde désarmée.
 */
export function appHelpTopicsAllowed(args: {
  topics: readonly AppHelpTopicId[];
  restrictionFlag: boolean;
  isMinor: boolean;
}): { topics: AppHelpTopicId[]; droppedByFloor: AppHelpTopicId[] } {
  if (!args.restrictionFlag && !args.isMinor) {
    return { topics: [...args.topics], droppedByFloor: [] };
  }
  const topics: AppHelpTopicId[] = [];
  const droppedByFloor: AppHelpTopicId[] = [];
  for (const topic of args.topics) {
    if (APP_HELP_NUMBER_TOPICS.includes(topic)) droppedByFloor.push(topic);
    else topics.push(topic);
  }
  return { topics, droppedByFloor };
}

/** `true` quand une fiche du tour explique un geste photo. Voir `enforceTurnLedger`. */
export function photoTopicsIn(topics: readonly string[]): boolean {
  return topics.some((topic) =>
    (APP_HELP_PHOTO_TOPICS as readonly string[]).includes(topic)
  );
}

export type AppHelpViewer = {
  /** `null` = non lu. La fiche rend alors sa réponse par défaut. */
  role: AppHelpRole | null;
  goal: AppHelpGoal | null;
};

export const UNKNOWN_APP_HELP_VIEWER: AppHelpViewer = { role: null, goal: null };

/** La langue du bloc. Tout ce qui n'est pas français est servi en anglais. */
export function appHelpLocaleOf(locale: string | null | undefined): AppHelpLocale {
  return String(locale ?? "").trim().toLowerCase().startsWith("fr") ? "fr" : "en";
}

function variantMatches(
  when: AppHelpVariant["when"],
  viewer: AppHelpViewer,
): boolean {
  if (when.roles && (viewer.role === null || !when.roles.includes(viewer.role))) {
    return false;
  }
  if (when.goals && !when.goals.includes(viewer.goal)) return false;
  return true;
}

/** La réponse d'une fiche pour ce profil: la première variante qui tient, sinon le défaut. */
export function pickAppHelpAnswer(
  card: AppHelpCard,
  viewer: AppHelpViewer,
  locale: AppHelpLocale,
): readonly string[] {
  const variant = (card.variants ?? []).find((candidate) =>
    variantMatches(candidate.when, viewer)
  );
  return (variant ?? card).answer[locale];
}

const UNKNOWN_INTRO: Readonly<Record<AppHelpLocale, readonly string[]>> = {
  fr: [
    "Ce qui est demandé ne fait pas partie de l'app telle qu'elle est aujourd'hui, sauf si la liste ci-dessous le couvre.",
    "Dis-le simplement, sans promettre que ça viendra, et propose ce qui s'en rapproche dans la liste.",
    "Ce que l'app couvre :",
  ],
  en: [
    "What is asked is not part of the app as it is today, unless the list below covers it.",
    "Say so plainly, without promising it will come, and offer the closest thing in the list.",
    "What the app covers:",
  ],
};

const BLOCK_INTRO: Readonly<Record<AppHelpLocale, string>> = {
  fr:
    "Faits vérifiés sur l'app telle qu'elle est aujourd'hui. Réponds depuis ce bloc uniquement ; cite les boutons et les écrans entre guillemets, mot pour mot.",
  en:
    "Verified facts about the app as it is today. Answer from this block only; quote buttons and screens between quotation marks, word for word.",
};

const DOES_NOT_EXIST_LABEL: Readonly<Record<AppHelpLocale, string>> = {
  fr: "N'existe pas :",
  en: "Does not exist:",
};

function unknownFeatureLines(
  cards: readonly AppHelpCard[],
  locale: AppHelpLocale,
): string[] {
  return [
    ...UNKNOWN_INTRO[locale],
    ...cards
      .filter((card) => card.id !== APP_HELP_UNKNOWN_TOPIC)
      .map((card) => `  · ${card.title[locale]}`),
  ];
}

/**
 * LE BLOC. `null` quand il n'y a rien à dire — jamais un titre au-dessus du vide,
 * qui autoriserait le composeur à répondre « depuis le bloc » avec rien dedans.
 */
export function appHelpContextBlock(args: {
  topics: readonly AppHelpTopicId[];
  locale: string | null | undefined;
  viewer: AppHelpViewer;
  cards?: readonly AppHelpCard[];
}): string | null {
  const cards = args.cards ?? APP_HELP_CARDS;
  const locale = appHelpLocaleOf(args.locale);
  const sections: string[] = [];
  for (const topic of args.topics.slice(0, APP_HELP_MAX_TOPICS)) {
    const card = cards.find((candidate) => candidate.id === topic);
    if (!card) continue;
    const lines = topic === APP_HELP_UNKNOWN_TOPIC
      ? unknownFeatureLines(cards, locale)
      : [...pickAppHelpAnswer(card, args.viewer, locale)];
    if (lines.length === 0) continue;
    const body = lines.map((line) => line.startsWith("  ·") ? line : `- ${line}`);
    const missing = card.doesNotExist?.[locale] ?? [];
    if (missing.length > 0) {
      body.push(`${DOES_NOT_EXIST_LABEL[locale]} ${missing.join(" · ")}`);
    }
    sections.push([`[${card.title[locale]}]`, ...body].join("\n"));
  }
  if (sections.length === 0) return null;
  return [
    `=== ${APP_HELP_BLOCK_TITLE[locale]} ===`,
    BLOCK_INTRO[locale],
    ...sections,
  ].join("\n");
}

/**
 * Les lignes que lit le dispatcher: une par fiche, dans l'ordre de
 * `APP_HELP_TOPIC_IDS`. Générées ici pour que la liste du prompt ne puisse pas
 * diverger des fiches (fiche R7), et stables d'un utilisateur à l'autre pour
 * rester dans la partie mise en cache du prompt (R8).
 */
export function appHelpDispatcherLines(
  cards: readonly AppHelpCard[] = APP_HELP_CARDS,
): string[] {
  return APP_HELP_TOPIC_IDS.map((id) => {
    const card = cards.find((candidate) => candidate.id === id);
    return `   - ${id}: ${card?.dispatcherHint ?? ""}`.trimEnd();
  });
}

// ── LA SEULE LECTURE ──────────────────────────────────────────────────────────

type MinimalQuery = {
  select: (columns: string, options?: Record<string, unknown>) => MinimalQuery;
  eq: (column: string, value: unknown) => MinimalQuery;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
} & PromiseLike<{ data: unknown; error: unknown; count?: number | null }>;

type MinimalClient = { from: (table: string) => MinimalQuery };

const GOALS: readonly AppHelpGoal[] = ["fat_loss", "muscle_gain", "maintenance"];

export type AppHelpViewerRead = {
  viewer: AppHelpViewer;
  read: "ok" | "failed";
};

/**
 * Le rôle et l'objectif de la personne qui demande.
 *
 * Mêmes sources que l'écran: `household_members.role` (comme
 * `loadMyHouseholdPlace`, `frontend/src/keel/api/household.ts`) et
 * `student_goals.goal` (comme le bouton « + », `api/slotMeal.ts`).
 *
 * ⚠️ UNE LECTURE EN PANNE REND `null`, JAMAIS `solo`. « Pas de ligne » est une
 * réponse (la personne n'a pas de foyer); « lecture échouée » n'en est pas une,
 * et la confondre servirait à un membre la réponse d'un titulaire.
 */
export async function loadAppHelpViewer(
  client: unknown,
  userId: string,
): Promise<AppHelpViewerRead> {
  const db = client as MinimalClient | null | undefined;
  if (!db || typeof db.from !== "function" || !userId) {
    return { viewer: UNKNOWN_APP_HELP_VIEWER, read: "failed" };
  }
  let role: AppHelpRole | null = null;
  let goal: AppHelpGoal | null = null;
  let failed = false;
  try {
    const place = await db.from("household_members")
      .select("role, household_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (place.error) {
      failed = true;
    } else if (!place.data) {
      role = "solo";
    } else {
      const row = place.data as Record<string, unknown>;
      if (String(row.role ?? "") !== "owner") {
        role = "member";
      } else {
        const mouths = await db.from("household_members")
          .select("member_id", { count: "exact", head: true })
          .eq("household_id", row.household_id);
        if (mouths.error || typeof mouths.count !== "number") {
          failed = true;
        } else {
          role = mouths.count >= 2 ? "owner" : "solo";
        }
      }
    }
  } catch {
    failed = true;
  }
  try {
    const goals = await db.from("student_goals")
      .select("goal")
      .eq("user_id", userId)
      .maybeSingle();
    if (goals.error) {
      failed = true;
    } else {
      const raw = String((goals.data as Record<string, unknown> | null)?.goal ?? "")
        .trim();
      goal = (GOALS as readonly string[]).includes(raw) ? raw as AppHelpGoal : null;
    }
  } catch {
    failed = true;
  }
  return { viewer: { role, goal }, read: failed ? "failed" : "ok" };
}
