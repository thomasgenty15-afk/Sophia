import type {
  GeneratedDish,
  MealPreparation,
  MemberPortionView,
  PreparationBox,
} from "../api/mealGeneration";

// LOT 4 — LA MISE EN BOÎTES, CÔTÉ ÉCRAN. LA SEULE JOINTURE, ET ELLE EST PAR ID.
//
// ── LE DÉFAUT QUE CE MODULE FERME ──────────────────────────────────────────
// Les parts par personne étaient de la PROSE lue à voix haute à table (« une
// bonne portion de poulet »), et le produit a tranché le 2026-08-17: « prendre
// une poignée, ça ne veut rien dire ». La sortie est le protocole des boîtes —
// on pèse UNE fois, à la session de cuisine, dans des boîtes nommées, et le
// jour J un plat CITE sa boîte au lieu de faire ressortir la balance.
//
// ── DEUX JOINTURES, ET AUCUNE NE LIT DU TEXTE ──────────────────────────────
//   · une boîte → des PRÉNOMS: par `member_id`, contre `member_portions`, dont
//     le `display_name` EST le prénom de la ligne membre (F5, recopié par le
//     moteur). Jamais un titre, jamais un prénom deviné dans une phrase.
//   · un plat → sa BOÎTE: par `uses[].box_id`, contre les `boxes` des
//     préparations. Le moteur a déjà validé que la boîte existe et qu'elle est
//     remplie un jour ≤ celui du repas (C5); l'écran ne rejuge rien, il joint.
//
// ⛔ « JAMAIS DE MATCHER MAISON », TREIZIÈME FOIS. Le seul autre chemin
// imaginable — retrouver la boîte de Zoé en cherchant « Zoé » dans un titre —
// se tromperait dès « Poulet pour Zoé et Marc » et ne trouverait rien dès que le
// plan sort en anglais. Douze faux positifs sur douze mesurés.
//
// ── CE QUI N'ENTRERA JAMAIS ICI ────────────────────────────────────────────
// Aucun objectif, aucun chiffre de corps, aucune calorie: ce module ne lit que
// `member_ids`, `grams` et `display_name`, et il n'a structurellement aucun
// champ où en mettre un. Les grammes qu'il rend sont des grammes d'ALIMENT, du
// même côté de la frontière que « 400 g de cuisses de poulet ».

/** Une ligne de la table de pesée, prête à rendre. */
export interface BoxLine {
  id: string;
  /**
   * LES PRÉNOMS DE LA BOÎTE, dans l'ordre du roster et jamais dans celui du
   * modèle: l'écran doit lister le foyer pareil d'une préparation à l'autre.
   *
   * ⚠️ VIDE EST POSSIBLE, et ce n'est pas une erreur à masquer: un plan relu
   * sans ses `member_portions` (un secondaire, une lecture partielle) n'a aucun
   * prénom à joindre. La ligne garde alors ses grammes — l'instruction de pesée
   * reste vraie — et l'écran choisit un libellé sans nom. Rendre l'identifiant
   * brut à la place serait montrer un uuid à table.
   */
  names: string[];
  grams: number;
}

/**
 * LES BOÎTES D'UNE PRÉPARATION, avec leurs prénoms résolus.
 *
 * `[]` quand la préparation n'en porte aucune — le cas de tout plan écrit avant
 * le 2026-08-17, de toute lane individuelle, et de tout foyer où le modèle n'a
 * pas obéi. L'écran se tait alors, il n'invente pas de table de pesée.
 */
export function boxLinesFor(
  preparation: Pick<MealPreparation, "boxes">,
  portions: readonly MemberPortionView[],
): BoxLine[] {
  return preparation.boxes.map((box) => toLine(box, portions));
}

/**
 * LA BOÎTE QU'UNE REPRISE CITE, résolue par ID.
 *
 * `null` quand la reprise n'en cite aucune (le cas nominal d'un plan d'avant ce
 * lot), ou quand l'identifiant ne se rattache à rien — ce qui ne devrait pas
 * arriver, le moteur l'ayant déjà validé, mais un plan relu peut avoir été écrit
 * par une version antérieure. On rend `null` plutôt que d'afficher un couvercle
 * vide.
 */
export function boxLineForUse(
  use: GeneratedDish["uses"][number],
  preparations: readonly MealPreparation[],
  portions: readonly MemberPortionView[],
): BoxLine | null {
  if (!use.box_id) return null;
  for (const preparation of preparations) {
    const box = preparation.boxes.find((b) => b.id === use.box_id);
    if (box) return toLine(box, portions);
  }
  return null;
}

/**
 * ⚠️ L'ORDRE DES PRÉNOMS SUIT `portions`, PAS `member_ids`. Deux boîtes de la
 * même préparation listeraient sinon « Zoé, Marc » et « Marc, Zoé » selon
 * l'humeur du modèle, et la table de pesée cesserait d'être lisible d'un coup
 * d'œil. Un id que le roster ne connaît pas est simplement absent des prénoms:
 * il n'y a rien de vrai à en dire, et son uuid n'a rien à faire à table.
 */
function toLine(box: PreparationBox, portions: readonly MemberPortionView[]): BoxLine {
  const wanted = new Set(box.member_ids);
  return {
    id: box.id,
    names: portions.filter((p) => wanted.has(p.memberId)).map((p) => p.displayName),
    grams: box.grams,
  };
}
