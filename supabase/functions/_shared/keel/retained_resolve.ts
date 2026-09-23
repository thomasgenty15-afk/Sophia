/**
 * ══════════════════════════════════════════════════════════════════════════
 * UN SOUVENIR PORTE SA CLÉ — la résolution vers le référentiel. Lot A.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── LE DÉFAUT QUE CE MODULE FERME, MESURÉ SUR LE SEUL COMPTE RÉEL ─────────
 * **4 souvenirs durables sur 9 résolvaient. Cinq non.** `lesoeufs`,
 * `flocons d'avoines`, `bol de muesli`, `petit suisse` — des souvenirs qui
 * s'affichent sur la carte et ne font RIEN: la ceinture n'y trouve aucun
 * aliment à chercher, et le constat (`retained_honoured`) ne peut rien
 * vérifier. Un souvenir sans clé est décoratif.
 *
 * Trois de ces quatre échecs sont de la MISE EN FORME, et résolvent dès qu'on
 * les écrit autrement: `oeufs` → `whole_eggs`, `flocons d'avoine` (SINGULIER)
 * → `oats`, `muesli` → `granola`.
 *
 * ── ⛔ POURQUOI LE MODÈLE NE PEUT PAS FAIRE ÇA ────────────────────────────
 * Il n'a ni les 945 slugs ni les 2 739 alias en tête. Une consigne de prompt
 * vient de le prouver: « écris l'aliment correctement » a produit `les œufs`,
 * qui **ne résout rien** — seul `oeufs` résout. La seule orthographe correcte
 * est celle que le référentiel connaît, et elle se LIT: on ne la devine pas.
 *
 * ── ⛔ ET CE MODULE NE RÉSOUT RIEN LUI-MÊME ───────────────────────────────
 * Il APPELLE `resolveIngredient` (`food_composition.ts`), dont la doctrine est
 * écrite et éprouvée: égalité exacte d'abord, alias ensuite, faux amis nommés
 * un par un (`prune`, `raisin`), marqueurs d'ambiguïté, **aucune distance
 * d'édition**. Un second résolveur divergerait du premier, et c'est celui
 * qu'on relit le moins qui attacherait un souvenir au mauvais aliment — la
 * cicatrice « laitue ≠ lait », 12 faux positifs sur 12, mais cette fois avec
 * le pouvoir de retirer un plat de l'assiette de quelqu'un.
 *
 * ── CE QU'IL NE TOUCHE PAS ────────────────────────────────────────────────
 * `text`. Jamais. C'est la ligne que la personne lit et édite; la réécrire
 * dans une forme de référentiel lui ferait lire `whole_eggs` à la place de ses
 * mots. Le slug vient À CÔTÉ.
 *
 * PURE: no I/O, no clock, no randomness. L'index arrive en paramètre.
 */

import {
  type CompositionIndex,
  resolveIngredient,
} from "./food_composition.ts";
import {
  parseRetainedItem,
  type RetainedItem,
  retainedItemToJson,
} from "./retained_item.ts";

/** Les familles qui désignent un aliment, et elles seules. */
const RESOLVABLE = new Set<RetainedItem["kind"]>([
  "food.exclude",
  "food.prefer",
]);

/**
 * ⛔ `method.*` N'EST PAS RÉSOLUBLE, ET C'EST UNE DÉCISION.
 *
 * « friture », « cru », « rôti au four » sont des PRÉPARATIONS. Le référentiel
 * est une table d'aliments: y chercher « friture » rendrait au mieux rien, au
 * pire un aliment frit précis — c'est-à-dire une règle sur un plat au lieu
 * d'une règle sur une façon de cuisiner. On ne leur donne donc pas de clé, et
 * leur `ref` reste `null` sans que ça compte comme un échec.
 */
export const RESOLVABLE_KINDS: readonly RetainedItem["kind"][] = Object.freeze([
  ...RESOLVABLE,
]);

/**
 * CE QUE LA RÉSOLUTION A DONNÉ — avec son DÉNOMINATEUR.
 *
 * ⚠️ `resolved: 0` SEUL EST AMBIGU: il rend le même zéro pour « aucun souvenir
 * d'aliment » et « aucun n'a résolu ». `askable` sépare les deux, et c'est le
 * nombre qui dit si la mémoire agit ou décore.
 */
export interface RetainedResolution {
  readonly items: readonly RetainedItem[];
  /** Les souvenirs dont on POUVAIT chercher une clé (les familles d'aliments). */
  readonly askable: number;
  readonly resolved: number;
  /** Les formes qu'aucun slug ni alias ne connaît — à verser au sas. */
  readonly unresolved: readonly string[];
}

/**
 * Pose `ref` sur les souvenirs d'aliment. Les autres traversent INCHANGÉS.
 *
 * ⚠️ `index` EST REQUIS, et `null` est une RÉPONSE: le référentiel n'a pas pu
 * être chargé. Tout sort alors avec `ref: null` et `resolved: 0` — et
 * `askable` dit que ce zéro-là n'est pas « rien à résoudre ». Optionnel, il
 * aurait laissé chaque appelant hériter en silence d'une mémoire non résolue,
 * c'est-à-dire du comportement d'avant ce lot sans que rien ne le dise.
 */
export function resolveRetainedRefs(args: {
  items: readonly RetainedItem[];
  index: CompositionIndex | null;
}): RetainedResolution {
  const out: RetainedItem[] = [];
  const unresolved: string[] = [];
  let askable = 0;
  let resolved = 0;

  for (const item of args.items ?? []) {
    if (!RESOLVABLE.has(item.kind)) {
      out.push(item);
      continue;
    }
    askable += 1;
    const ref = args.index === null
      ? null
      : resolveIngredient(args.index, item.text)?.slug ?? null;
    if (ref === null) {
      const form = item.text.trim();
      if (form !== "" && !unresolved.includes(form)) unresolved.push(form);
      out.push(item);
      continue;
    }
    resolved += 1;
    // ⛔ PAR LE PARSEUR, JAMAIS UN `as`. Le socle vérifie la FORME du slug —
    // un `ref` qui porterait des espaces serait du texte déguisé en
    // identifiant. Cicatrice: « `as` sur un type étranger désarme le
    // typecheck », mesurée en 200 au log et null en silence.
    const stamped = parseRetainedItem({ ...retainedItemToJson(item), ref });
    // ⚠️ UN ÉCHEC DE RELECTURE GARDE L'ITEM D'ORIGINE. Perdre un souvenir
    // parce qu'on a voulu l'améliorer serait le pire échange possible.
    out.push(stamped ?? item);
  }

  return { items: out, askable, resolved, unresolved };
}
