/**
 * LA RELANCE « PRÉFÉRENCE CONTRE EXCLUSION » — quand une bouche veut ce qu'une
 * autre refuse, et que le plan a réglé ça en privant la première.
 *
 * ⟳ 2026-09-06 — Mesuré (ASP4, quatre : Paul veut des asperges, Claire n'en veut
 * pas) : le brief v31 était servi, le modèle a ÉCRIT dans son explication « les
 * asperges restent un ajout séparé dans les boîtes de Paul » — et n'en a mis
 * dans aucune boîte (`preference_split.composed 0`). Une promesse en prose, rien
 * dans les items. Même machinerie que la relance du flagrant : on nomme la
 * bouche, le mot, le nombre de repas, et on interdit la boîte de l'autre ; les
 * cellules que la relance rend AVEC le composant sont prises par parties.
 *
 * PURE: no I/O, no clock, no randomness.
 */

export interface SplitRetryRow {
  readonly term: string;
  readonly wanter: string;
  readonly refusers: readonly string[];
}

/** Le plancher de repas où le composant doit apparaître : deux, comme le brief v31 le laisse entendre (« at some lunches and dinners »). */
export const SPLIT_RETRY_MIN_CELLS = 2;

export function preferenceSplitRetryInstruction(
  rows: readonly SplitRetryRow[],
  cellsChecked: number,
  /**
   * ⟳ LOT 14 (2026-09-08) — DANS QUELLE LANGUE ON DEMANDE.
   *
   * ⛔ REQUIS, deux valeurs nommées. `boxes` est le texte d'origine, servi tant
   * que le modèle écrit les couvercles. `standard_recipe` est celui du chemin
   * où le MOTEUR les autore: la personne n'a plus « une boîte à elle », elle a
   * un PLAT à elle, et c'est `for_member_id` qui le porte.
   */
  wording: "boxes" | "standard_recipe",
): string | null {
  const clean = (rows ?? []).filter((r) =>
    r && String(r.term ?? "").trim() && String(r.wanter ?? "").trim()
  );
  if (clean.length === 0 || !(cellsChecked > 0)) return null;
  const floor = Math.min(SPLIT_RETRY_MIN_CELLS, cellsChecked);
  const lines = clean.map((r) => {
    const refusers = r.refusers.map((n) => n.trim()).filter(Boolean);
    if (wording === "standard_recipe") {
      const never = refusers.length > 0
        ? ` -- and NEVER in the dish ${refusers.join(", ")} eat`
        : "";
      return `- "${r.term}" was asked for ${r.wanter}, and no dish of theirs cites it: ` +
        `the shared base avoided it for everyone. At least ${floor} lunches or dinners ` +
        `of the stretch must give ${r.wanter} a dish of their OWN ("for_member_id") ` +
        `citing "${r.term}": ONE MORE preparation (with its own id and full recipe, ` +
        `cooked apart) or added fresh on the day${never}.`;
    }
    const never = refusers.length > 0
      ? ` -- and NEVER from the box of ${refusers.join(", ")}`
      : "";
    return `- "${r.term}" was asked for ${r.wanter} in a box of their own, and no box of ` +
      `${r.wanter} cites it: the shared base avoided it for everyone. At least ${floor} ` +
      `lunches or dinners of the stretch must cite "${r.term}" from ${r.wanter}'s box ` +
      `entry in the SAME dish, with its own "items" naming it: ONE MORE preparation ` +
      `(with its own id and full recipe, cooked apart) or added fresh on the day${never}.`;
  });
  return [
    wording === "standard_recipe"
      ? "⛔ SOMEONE ASKED FOR A FOOD AND GOT NONE. Keep every dish, day and slot, " +
        "keep the shared base exactly as it is, and fix ONLY this:"
      : "⛔ SOMEONE ASKED FOR A FOOD IN THEIR OWN BOX AND GOT NONE. Keep every dish, day " +
        "and slot, keep the shared base exactly as it is, and fix ONLY this:",
    ...lines,
    "Add the new lines to the cooking sessions and the shopping list. Do NOT drop a " +
    "dish, do NOT shorten the plan, and do NOT mention any of this in a \"why\" -- what " +
    "somebody eats is nobody's business but theirs.",
  ].join("\n");
}
