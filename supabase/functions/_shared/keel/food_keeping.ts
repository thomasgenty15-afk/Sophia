/**
 * ══════════════════════════════════════════════════════════════════════════
 * LA CONSERVATION D'UN ALIMENT — UNE SEULE LECTURE, DEUX LECTEURS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LE DÉFAUT QUE CE MODULE FERME, ET IL A REFUSÉ UN PLAN RÉEL (tir 3 du
 * 2026-09-12). Le thon EN CONSERVE et le thon FRAIS portent le même
 * `food_group_ref` — `white_fish` — parce que le référentiel n'a aucune
 * colonne de conservation. Deux lecteurs en tiraient deux conclusions
 * différentes :
 *
 *   · LA DATATION lisait le RAYON (`PERISHABLE_AISLES`). Depuis que
 *     `aisleForFood` range les conserves en `pantry`, elle ne les datait plus
 *     comme du frais — corrigé.
 *   · LA GARDE FINALE lisait le GROUPE (`rawWindowDaysFor`) sans regarder le
 *     rayon. Elle appliquait donc la fenêtre du poisson frais à une boîte de
 *     thon, et refusait : « thon en conserve acheté le 2026-09-12, tenu 1
 *     jour, attendu cuisiné le 2026-09-14 — sans congélation ».
 *
 * La revue du 2026-09-12 le dit en toutes lettres : « le classement en rayon
 * seul ne corrige pas tous les lecteurs de conservation ». Deux lectures d'un
 * même fait divergent toujours ; celle qu'on regarde le moins garde l'ancienne.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CE QUE CE MODULE N'EST PAS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ IL NE LIT PAS LE RAYON. Le rayon est un champ d'AFFICHAGE — il dit dans
 * quelle allée du magasin on trouve la chose. En faire une seconde autorité de
 * sécurité est précisément ce qui a produit le défaut : un rangement de
 * confort décidait d'une date de fraîcheur.
 *
 * ⛔ IL N'INVENTE AUCUNE DURÉE. Les fenêtres viennent de `RAW_WINDOW_DAYS`
 * (`fridge_window.ts`), miroir de `food_groups.raw_window_days`. Ce module
 * n'ajoute qu'UNE chose que le référentiel ne porte pas : la liste NOMMÉE des
 * aliments dont on SAIT qu'ils se gardent (`SHELF_STABLE_SLUGS`).
 *
 * ⛔ ET « INCONNU » N'EST PAS « STABLE ». Un aliment sans groupe n'est pas
 * réputé se garder : il est réputé NON VÉRIFIÉ, et ça se compte. Écrire
 * « aucune contrainte » faute de donnée est la façon dont ces contrôles
 * meurent.
 *
 * ⚠️ PURE: no I/O, no clock, no randomness.
 */

import { rawWindowDaysFor } from "./fridge_window.ts";
import { SHELF_STABLE_SLUGS } from "./shopping_identity.ts";

export const KEEPING_KINDS = [
  /** On SAIT que ça se garde : conserve, bocal. Aucune fenêtre ne mord. */
  "stable",
  /** Une fenêtre crue connue, en jours. */
  "refrigerated",
  /** Le plan déclare le geste du congélateur sur cette ligne. */
  "frozen",
  /** ⛔ NON VÉRIFIÉ. Ni « stable », ni « périssable » — on ne sait pas. */
  "unknown",
] as const;
export type KeepingKind = (typeof KEEPING_KINDS)[number];

/** Pourquoi cette lecture. Un jeton, pour le journal et les compteurs. */
export const KEEPING_REASONS = [
  "freeze_declared",
  "shelf_stable_slug",
  "group_window",
  "no_group",
  "group_without_window",
] as const;
export type KeepingReason = (typeof KEEPING_REASONS)[number];

export interface FoodKeeping {
  readonly kind: KeepingKind;
  /**
   * La fenêtre crue en jours. `null` = AUCUNE FENÊTRE À APPLIQUER, et les
   * trois raisons de ce `null` ne se confondent pas : `stable` (on sait),
   * `frozen` (le plan l'a dit), `unknown` (on ne sait pas). `kind` les sépare.
   */
  readonly rawWindowDays: number | null;
  readonly why: KeepingReason;
}

/**
 * CE QUE CET ALIMENT PEUT ATTENDRE, ENTRE L'ACHAT ET LA CUISSON.
 *
 * ⛔ L'ORDRE DE LECTURE EST LE CONTRAT :
 *
 *   ① le CONGÉLATEUR déclaré par le plan gagne sur tout — c'est un geste
 *     écrit dans la recette, pas une supposition ;
 *   ② l'aliment NOMMÉ comme se gardant (`SHELF_STABLE_SLUGS`) ensuite : c'est
 *     la seule chose qu'on sache et que le référentiel ne porte pas ;
 *   ③ le GROUPE et sa fenêtre, quand il y en a un ;
 *   ④ sinon, NON VÉRIFIÉ.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function keepingOf(args: {
  /** Le slug du référentiel (`tuna_tinned`). `null` = ligne sans identité. */
  readonly ref: string | null | undefined;
  /** Le `food_group_ref` de la ligne. `null` = non résolu. */
  readonly group: string | null | undefined;
  /** ⛔ `true` = le plan écrit le geste du congélateur sur cette ligne. */
  readonly frozen?: boolean;
}): FoodKeeping {
  if (args.frozen === true) {
    return { kind: "frozen", rawWindowDays: null, why: "freeze_declared" };
  }
  const ref = String(args.ref ?? "").trim();
  if (ref !== "" && SHELF_STABLE_SLUGS.has(ref)) {
    return { kind: "stable", rawWindowDays: null, why: "shelf_stable_slug" };
  }
  const group = String(args.group ?? "").trim();
  if (group === "") {
    return { kind: "unknown", rawWindowDays: null, why: "no_group" };
  }
  const window = rawWindowDaysFor(group);
  if (window === null) {
    // ⚠️ UN GROUPE CONNU DU PLAN MAIS ABSENT DE LA TABLE DES FENÊTRES. Ça ne
    // devrait pas arriver (la table couvre les trente groupes), et si ça
    // arrive c'est une divergence entre le code et la base — pas une
    // autorisation de se taire.
    return { kind: "unknown", rawWindowDays: null, why: "group_without_window" };
  }
  return { kind: "refrigerated", rawWindowDays: window, why: "group_window" };
}

/**
 * LA FENÊTRE QUI MORD VRAIMENT, ou `null` quand aucune ne mord.
 *
 * ⚠️ UN RACCOURCI POUR LES DEUX LECTEURS, pas une seconde règle: il rend
 * exactement `keepingOf(...).rawWindowDays`. Il existe pour que les deux sites
 * lisent la même ligne d'appel, donc pour qu'une divergence se voie en diff.
 *
 * PURE.
 */
export function keepingWindowDays(args: {
  readonly ref: string | null | undefined;
  readonly group: string | null | undefined;
  readonly frozen?: boolean;
}): number | null {
  return keepingOf(args).rawWindowDays;
}

/** Ce qu'une liste de courses a donné à lire. ⛔ Les quatre natures, séparées. */
export interface KeepingCounts {
  readonly stable: number;
  readonly refrigerated: number;
  readonly frozen: number;
  /** ⛔ NON VÉRIFIÉ. À zéro, la lecture a couvert toute la liste. */
  readonly unknown: number;
}

/**
 * COMPTE LES QUATRE NATURES SUR UNE LISTE.
 *
 * ⛔ IL EXISTE PARCE QU'UNE LECTURE MUETTE RESSEMBLE À UNE LECTURE COMPLÈTE.
 * Sans `unknown`, une liste dont aucune ligne ne porte de groupe rend
 * exactement la même chose qu'une liste parfaitement résolue.
 *
 * PURE.
 */
export function keepingCounts(
  lines: readonly {
    readonly ref?: string | null;
    readonly food_group?: string | null;
    readonly freeze_on_purchase?: boolean;
  }[],
): KeepingCounts {
  const out = { stable: 0, refrigerated: 0, frozen: 0, unknown: 0 };
  for (const l of lines) {
    const k = keepingOf({
      ref: l.ref ?? null,
      group: l.food_group ?? null,
      frozen: l.freeze_on_purchase === true,
    });
    out[k.kind] += 1;
  }
  return out;
}
