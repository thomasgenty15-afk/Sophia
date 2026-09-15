/**
 * Dernière porte déterministe de l'identité d'une casserole.
 *
 * Une préparation servie doit être mesurable et produire au moins la masse
 * prélevée par ses boîtes. La fonction reçoit les compteurs du relevé final et
 * possède l'appel de publication : le cas refusé ne peut donc pas écrire par
 * accident. Elle ne décide d'aucune tolérance positive ; un reste éventuel est
 * une masse réelle, journalisée par l'appelant.
 */
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
