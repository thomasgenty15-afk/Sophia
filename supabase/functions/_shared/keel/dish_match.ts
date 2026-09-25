/**
 * « ÇA VAUT AUSSI POUR… » — 2026-09-24. Module PUR.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LE BESOIN (retour du propriétaire, le jour même de « Changer »)
 * ══════════════════════════════════════════════════════════════════════════
 * Sur l'aperçu, « Changer » demande une raison par plat. Mesuré: trois matins
 * aux œufs, et la même raison tapée trois fois (« pas d'œufs le matin », « pas
 * d'oeuf le matin », « j'ai pas envie d'oeufs le matin »). Après la raison d'UN
 * plat, un appel RAPIDE (le modèle du chat, `getGlobalAiModel`) lit les AUTRES
 * plats du brouillon — titre, moment, pour qui, ingrédients principaux — et dit
 * à lesquels la même raison s'applique. L'écran les PROPOSE, cochés; la
 * personne confirme. Rien n'est barré sans elle.
 *
 * ⛔ LE MODÈLE NE DÉSIGNE QUE DES NUMÉROS DE LA LISTE ENVOYÉE. Un titre qu'il
 * écrirait lui-même ne vaudrait rien: la réponse est relue contre la liste, et
 * un numéro inconnu est compté puis jeté.
 *
 * ⛔ LA RAISON QUI ARRIVE ICI A DÉJÀ PASSÉ `readDraftNote` (plancher TCA,
 * interdits de doctrine) — c'est l'appelant qui la juge, avant tout appel.
 */

import { dishTitleKey, type StoredDishForRejection } from "./rejected_dishes.ts";

/** Au plus autant de plats proposés d'un coup: au-delà, ce n'est plus une suggestion. */
export const DISH_MATCH_MAX = 12;
/** Les premiers termes d'ingrédients d'un plat — assez pour « œufs » dans une frittata. */
export const DISH_MATCH_TERMS_PER_DISH = 8;

/** Un plat du brouillon rangé, tel que la correspondance le lit. */
export interface DishMatchDish extends StoredDishForRejection {
  ingredients?: readonly { term?: string | null }[] | null;
}

/** Un TITRE candidat (toutes ses occurrences), numéroté pour le modèle. */
export interface DishMatchCandidate {
  readonly id: number;
  readonly title: string;
  readonly occurrences: readonly { day: string; slot: string; memberId: string | null }[];
  /** Les prénoms servis; `[]` = personne de connu (le modèle lit « the table »). */
  readonly who: readonly string[];
  readonly terms: readonly string[];
}

/**
 * LES AUTRES PLATS — un par titre, le plat barré exclu (toutes ses occurrences
 * le sont déjà), les compléments exclus (ils ne se barrent pas seuls).
 */
export function dishMatchCandidates(args: {
  dishes: readonly DishMatchDish[];
  struckTitle: string;
  names: ReadonlyMap<string, string>;
}): DishMatchCandidate[] {
  const struckKey = dishTitleKey(args.struckTitle);
  const byKey = new Map<string, {
    title: string;
    occurrences: { day: string; slot: string; memberId: string | null }[];
    who: Set<string>;
    terms: Set<string>;
  }>();
  for (const dish of args.dishes) {
    const title = String(dish.title ?? "");
    if (dish.complementsShared === true || !dish.day || !dish.slot || title.trim() === "") continue;
    const key = dishTitleKey(title);
    if (key === struckKey) continue;
    const entry = byKey.get(key) ??
      { title, occurrences: [], who: new Set<string>(), terms: new Set<string>() };
    entry.occurrences.push({ day: dish.day, slot: dish.slot, memberId: dish.memberId ?? null });
    const fromBoxes = (dish.boxes ?? []).flatMap((b) => b?.memberIds ?? []);
    for (const id of fromBoxes.length > 0 ? fromBoxes : dish.memberId ? [dish.memberId] : []) {
      const name = args.names.get(id);
      if (name) entry.who.add(name);
    }
    for (const ingredient of dish.ingredients ?? []) {
      if (entry.terms.size >= DISH_MATCH_TERMS_PER_DISH) break;
      const term = String(ingredient?.term ?? "").trim().toLowerCase();
      if (term) entry.terms.add(term);
    }
    byKey.set(key, entry);
  }
  return [...byKey.values()].map((e, i) => ({
    id: i + 1,
    title: e.title,
    occurrences: e.occurrences,
    who: [...e.who],
    terms: [...e.terms],
  }));
}

export const DISH_MATCH_SYSTEM_PROMPT = [
  "You read a household meal plan. Someone asked to change ONE dish and wrote why.",
  "Say which OTHER dishes of the same plan that reason also applies to, so they can change them in one go.",
  "Include a dish ONLY when the reason, as written, clearly applies to it too:",
  "- the reason names a food or an ingredient: the dish must contain it (read its title AND its ingredients);",
  "- the reason names a moment of the day (morning, lunch, evening…): only dishes at that moment;",
  "- the reason names a person: only dishes that person eats;",
  "- the reason is about a trait (too long, too heavy, too sweet…): only dishes that clearly share it.",
  "When you are not sure, leave the dish out. Never include a dish only because it looks similar.",
  'Answer with JSON only: {"matches": [ids]} — ids from the list, [] when none.',
].join("\n");

const quoted = (text: string) => `«${String(text ?? "").replace(/[«»]/g, '"')}»`;
const whoText = (who: readonly string[]) => (who.length > 0 ? `for ${who.join(", ")}` : "for the table");

/** LA CONSIGNE: la raison, le plat qu'elle visait, puis la liste numérotée. */
export function buildDishMatchPrompt(args: {
  reason: string;
  struck: { title: string; day: string; slot: string; who: readonly string[] };
  candidates: readonly DishMatchCandidate[];
}): string {
  const lines = args.candidates.map((c) => {
    const slots = [...new Set(c.occurrences.map((o) => o.slot))].join("/");
    const days = [...new Set(c.occurrences.map((o) => o.day))].join(", ");
    const terms = c.terms.length > 0 ? ` — ${c.terms.join(", ")}` : "";
    return `${c.id} — ${quoted(c.title)} — ${slots} on ${days} — ${whoText(c.who)}${terms}`;
  });
  return [
    `The reason, written about ${quoted(args.struck.title)} (${args.struck.slot} on ${args.struck.day}, ` +
    `${whoText(args.struck.who)}): ${quoted(args.reason)}`,
    "",
    "Other dishes of the plan (id — title — moment and days — for whom — main ingredients):",
    ...lines,
  ].join("\n");
}

export interface DishMatchReading {
  /** Les candidats retenus, dans l'ordre de la liste, sans doublon. */
  readonly matches: readonly DishMatchCandidate[];
  /** Numéros rendus qui ne sont pas dans la liste. */
  readonly unknown: number;
  /** Réponse illisible (pas du JSON, pas de `matches`). */
  readonly malformed: boolean;
  /** Retenus au-delà de `DISH_MATCH_MAX`, jetés. */
  readonly overCap: number;
}

/** LA RÉPONSE DU MODÈLE, RELUE CONTRE LA LISTE ENVOYÉE. */
export function readDishMatches(raw: unknown, candidates: readonly DishMatchCandidate[]): DishMatchReading {
  let value: unknown = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return { matches: [], unknown: 0, malformed: true, overCap: 0 };
    }
  }
  const list = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>).matches
    : null;
  if (!Array.isArray(list)) return { matches: [], unknown: 0, malformed: true, overCap: 0 };
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const kept = new Set<number>();
  let unknown = 0;
  for (const item of list) {
    const id = typeof item === "number" ? item : Number(String(item ?? "").trim());
    if (!Number.isInteger(id) || !byId.has(id)) {
      unknown++;
      continue;
    }
    kept.add(id);
  }
  const ordered = candidates.filter((c) => kept.has(c.id));
  return {
    matches: ordered.slice(0, DISH_MATCH_MAX),
    unknown,
    malformed: false,
    overCap: Math.max(0, ordered.length - DISH_MATCH_MAX),
  };
}
