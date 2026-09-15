// FF-052 · LES PROPRIÉTÉS DE JOUR — le pendant POSITIF de l'absence.
//
// Fiche: docs/fonctionnalites/composition-des-repas/FF-052-les-proprietes-de-jour.md
//
// ── LA RÈGLE QUI A COUPÉ LA LISTE DE QUATRE À DEUX ─────────────────────────
// Une propriété SANS branche est PIRE que son absence: elle fait croire que le
// produit en tient compte, et l'élève organise sa semaine sur cette croyance.
// Le test du dépôt s'applique sans pitié — « est-ce que cette information
// change ce que l'élève trouvera dans son assiette cette semaine ? »
//
// `market` et `guests` ont été instruites et NON retenues; la fiche §3 écrit
// pourquoi, et §11 nomme le trou. Ce fichier ne les porte pas, même en
// commentaire de liste: un jeton présent et inerte est exactement ce qu'on
// vient d'écarter.
//
// ── MODULE PUR ─────────────────────────────────────────────────────────────
// Aucun accès base. Comme `fixed_intakes.ts`, il ne peut PAS importer de
// valeur depuis `meal_generation.ts` (cycle au chargement — payé deux fois).

/**
 * LA LISTE FERMÉE. Deux entrées, chacune avec une branche nommée.
 *
 * L'étendre demande, dans le même lot: la branche, la consigne, et le test de
 * MUTATION qui prouve que la sortie bouge quand la propriété est posée.
 */
export const DAY_PROPERTIES = ["batch_cook", "leftovers"] as const;
export type DayProperty = (typeof DAY_PROPERTIES)[number];

/** Ce qu'un jour porte. `properties` n'est jamais vide (voir R2). */
export interface DayPropertyEntry {
  /** `mon`…`sun`. */
  day: string;
  properties: DayProperty[];
}

/**
 * Les jetons de jour, recopiés. Même raison que `fixed_intakes.ts`, et même
 * test d'égalité contre le vocabulaire que le parseur accepte réellement.
 */
export const DAY_PROPERTY_DAY_TOKENS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;

const PROPERTY_SET = new Set<string>(DAY_PROPERTIES);
const DAY_SET = new Set<string>(DAY_PROPERTY_DAY_TOKENS);

/**
 * Les propriétés lues depuis `practical_constraints.day_properties`.
 *
 * PATRON `parseAwayDays`, et ce n'est pas une coïncidence: c'est le même
 * genre de donnée, avec le même mode de défaillance. Un jeton inconnu tombe
 * SEUL et laisse ses voisins — une faute de frappe ne doit pas effacer une
 * déclaration lisible du même jour.
 *
 * Un jour dont AUCUNE propriété n'est lisible tombe entièrement: il ne dit plus
 * rien, et le garder produirait une entrée vide que les branches devraient
 * apprendre à ignorer.
 */
export function parseDayProperties(raw: unknown): DayPropertyEntry[] {
  if (!Array.isArray(raw)) return [];
  const byDay = new Map<string, Set<DayProperty>>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    const day = String(e.day ?? "").trim().toLowerCase();
    if (!DAY_SET.has(day)) continue;
    const props = (Array.isArray(e.properties) ? e.properties : [])
      .map((p) => String(p ?? "").trim().toLowerCase())
      .filter((p): p is DayProperty => PROPERTY_SET.has(p));
    if (props.length === 0) continue;
    const set = byDay.get(day) ?? new Set<DayProperty>();
    props.forEach((p) => set.add(p));
    byDay.set(day, set);
  }
  // L'ordre est celui de la SEMAINE et celui de la liste fermée, jamais celui
  // de la saisie: un ordre qui suit l'entrée ferait bouger la consigne d'une
  // génération à l'autre pour une déclaration identique, ce qui casse le cache
  // de prompt et rend le test de désarmement impossible à écrire.
  const out: DayPropertyEntry[] = [];
  for (const day of DAY_PROPERTY_DAY_TOKENS) {
    const set = byDay.get(day);
    if (!set) continue;
    out.push({ day, properties: DAY_PROPERTIES.filter((p) => set.has(p)) });
  }
  return out;
}

/** Ce jour-là porte-t-il cette propriété ? */
export function dayHasProperty(
  entries: readonly DayPropertyEntry[],
  day: string | null,
  property: DayProperty,
): boolean {
  if (!day) return false;
  return entries.some((e) => e.day === day && e.properties.includes(property));
}

/** Les jours qui portent cette propriété, dans l'ordre de la semaine. */
export function daysWithProperty(
  entries: readonly DayPropertyEntry[],
  property: DayProperty,
): string[] {
  return entries.filter((e) => e.properties.includes(property)).map((e) => e.day);
}

// ---------------------------------------------------------------------------
// LA CONSIGNE
// ---------------------------------------------------------------------------

const DAY_PROSE: Record<string, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

function prose(days: readonly string[]): string {
  return days.map((d) => DAY_PROSE[d] ?? d).join(", ");
}

/**
 * LE BLOC DE CONSIGNE, ou `[]` quand rien n'est déclaré.
 *
 * `[]` et pas `[""]`: le spread d'un tableau vide n'ajoute STRICTEMENT rien —
 * ni ligne, ni saut de ligne, ni titre orphelin. C'est ce qui rend le
 * désarmement testable par égalité de chaîne (R5), et une ligne vide de trop
 * coûterait un bump de version de prompt pour rien.
 */
export function dayPropertyPromptLines(
  entries: readonly DayPropertyEntry[],
): string[] {
  if (entries.length === 0) return [];
  const batch = daysWithProperty(entries, "batch_cook");
  const leftovers = daysWithProperty(entries, "leftovers");
  const lines: string[] = ["", "-- WHAT THOSE DAYS ARE FOR --"];
  if (batch.length > 0) {
    lines.push(
      `they cook in bulk on ${prose(batch)} -- put the long session there, ` +
      "as a preparation that makes several servings, and let the days after " +
      "it draw on that preparation instead of starting from scratch.",
    );
  }
  if (leftovers.length > 0) {
    lines.push(
      `they eat what is already made on ${prose(leftovers)} -- compose NO new ` +
      "dish there. Every dish on those days must draw on a preparation you " +
      "wrote, and add nothing that needs its own cooking.",
    );
  }
  return lines;
}
