/**
 * Dernière porte déterministe de l'identité d'une casserole.
 *
 * Une préparation servie doit être mesurable et produire au moins la masse
 * prélevée par ses boîtes. La fonction reçoit les compteurs du relevé final et
 * possède l'appel de publication : le cas refusé ne peut donc pas écrire par
 * accident. Elle ne décide d'aucune tolérance positive ; un reste éventuel est
 * une masse réelle, journalisée par l'appelant.
 *
 * ⟳ 2026-09-23 — UN DÉFICIT DE CUISINE N'EST PAS UN DÉFICIT. Staging, requête
 * `03676bbf…`: tout le plan est parti en 422 pour une casserole courte de
 * MOINS D'UN GRAMME (`worst_shortfall_g: 1`, qui est un `Math.ceil`). La
 * croissance avance par pas entiers, la masse prête se recalcule avec l'eau de
 * cuisson: un reste de quelques dixièmes sous zéro est de l'arithmétique, pas
 * une casserole vide. Un manque est donc TOLÉRÉ tant qu'il reste sous
 * `max(10 g, 3 % du prélevé)` — ce qu'aucune cuisine ne sait peser. Au-delà, la
 * porte refuse comme avant.
 */
export const POT_SHORTFALL_TOLERANCE_MIN_G = 10;
export const POT_SHORTFALL_TOLERANCE_SHARE = 0.03;

/** `true` si ce manque (en g, positif) est sous la tolérance de cuisine. */
export function potShortfallTolerated(drawnG: number, shortfallG: number): boolean {
  if (!Number.isFinite(drawnG) || !Number.isFinite(shortfallG)) return false;
  if (shortfallG <= 0) return true;
  const tolerance = Math.max(
    POT_SHORTFALL_TOLERANCE_MIN_G,
    POT_SHORTFALL_TOLERANCE_SHARE * Math.max(0, drawnG),
  );
  return shortfallG <= tolerance;
}
export type PotMassPublication<R> =
  | { readonly kind: "published"; readonly result: R }
  | {
    readonly kind: "blocked";
    readonly overdrawn: number;
    readonly unreadable: number;
    readonly worstShortfallG: number;
  };

export function potMassBlocker(args: {
  readonly overdrawn: number;
  readonly unreadable: number;
  readonly worstShortfallG: number;
}): Extract<PotMassPublication<never>, { kind: "blocked" }> | null {
  const overdrawn = Number.isFinite(args.overdrawn)
    ? Math.max(0, Math.trunc(args.overdrawn))
    : 1;
  const unreadable = Number.isFinite(args.unreadable)
    ? Math.max(0, Math.trunc(args.unreadable))
    : 1;
  const worstShortfallG = Number.isFinite(args.worstShortfallG)
    ? Math.max(0, args.worstShortfallG)
    : 0;
  return overdrawn > 0 || unreadable > 0
    ? { kind: "blocked", overdrawn, unreadable, worstShortfallG }
    : null;
}

export async function decidePotMassPublication<R>(args: {
  readonly overdrawn: number;
  readonly unreadable: number;
  readonly worstShortfallG: number;
  readonly publish: () => Promise<R>;
}): Promise<PotMassPublication<R>> {
  const blocked = potMassBlocker(args);
  if (blocked !== null) return blocked;
  return { kind: "published", result: await args.publish() };
}
