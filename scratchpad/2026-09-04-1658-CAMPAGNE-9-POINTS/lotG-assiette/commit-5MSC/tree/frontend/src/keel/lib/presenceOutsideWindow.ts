import { EATING_OCCASIONS } from "../api/mealGeneration";
import type { EatingOccasion, EatingOccasionSlot } from "../api/mealGeneration";
import type { AwayMark, PresenceState } from "./presenceMarks";

// ═══════════════════════════════════════════════════════════════════════════
// D4 ④ — CE QUE LA GRILLE NE MONTRE PAS, ET QUI FAIT MENTIR SES DEUX
// COMPTEURS D'UN CRAN.
//
// ⛔ MESURÉ. La réponse hebdomadaire (« la semaine, tu manges au bureau ? »)
// écrit CINQ midis « dehors » — un par jour ouvré — et l'écran de l'étape 3 le
// dit: « 5 midis de semaine seront déjà cochés “dehors” à l'étape suivante ».
// À l'étape suivante, les deux compteurs de la grille annonçaient 4.
//
// Ce n'est pas une erreur d'arithmétique, c'est un EFFET DE FENÊTRE: une
// fenêtre « d'ici dimanche » commencée un mardi porte tue→sun, donc QUATRE
// jours ouvrés. Le cinquième midi (lundi) est écrit en base, il vaut pour la
// semaine suivante, et il n'a simplement aucune colonne où se voir.
//
// ⚠️ AUCUN DES DEUX NOMBRES N'ÉTAIT FAUX, ET C'EST PRÉCISÉMENT LE PROBLÈME.
// « 5 » est vrai de ce qui est écrit; « 4 » est vrai de ce qui est montré. Deux
// vérités qui ne disent pas de quoi elles parlent se lisent comme une erreur —
// et « un compteur faux d'une unité est pire qu'absent, parce qu'on le croit ».
// On ne corrige donc AUCUN des deux: on NOMME le reste.
//
// ⛔ ET ON NE LES ADDITIONNE PAS DANS LE COMPTEUR DE LA GRILLE. Écrire « 5 »
// sous quatre cases cochées ferait chercher la cinquième à l'écran, où elle
// n'est pas. Le compteur reste celui de ce qu'on voit; la ligne d'à côté dit ce
// qui vit en dehors.
//
// ⚠️ PUR, ET SÉPARÉ DE L'ÉCRAN, PARCE QUE C'EST LA SEULE FAÇON DE LE MESURER.
// `MealPickerGrid` monte une `Modal` qui passe par `createPortal`, et ce dépôt
// n'a pas de DOM — un compte enfoui dans le composant n'aurait eu aucun test.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Les marques posées sur des jours QUE LA FENÊTRE NE MONTRE PAS, comptées en
 * moments — la même unité que les compteurs de la grille.
 *
 * `state` filtre par état quand il est donné: la grille compte séparément « ce
 * qui sort du plan » (tout) et « ce qui est dehors » (`eating_out`), et les deux
 * lignes doivent pouvoir poser la même question à ce module.
 *
 * ⚠️ LE RYTHME BORNE LE COMPTE, comme il borne les lignes de la grille. Une
 * marque posée sur un `snack_pm` que la personne ne déclare plus n'a aucune
 * ligne où se voir: la compter ici promettrait une case qui n'existe pas, et le
 * total serait de nouveau faux — dans l'autre sens.
 *
 * ⚠️ UNE MARQUE SANS CRÉNEAU EST LA JOURNÉE ENTIÈRE. C'est la convention de
 * `presenceStateOf`, et la relire autrement ici donnerait deux lectures de la
 * même colonne.
 */
export function marksOutsideWindow(args: {
  marks: readonly AwayMark[];
  /** Les jours que la grille montre, en jetons. */
  days: readonly string[];
  rhythm: readonly EatingOccasionSlot[];
  state?: PresenceState;
}): number {
  const shown = new Set(args.days);
  const rows = new Set<string>(args.rhythm.map((r) => r.slot));
  // ⚠️ DÉDUPLIQUÉ PAR `jour|créneau`. Deux marques qui se recouvrent (la
  // journée entière ET son déjeuner, ce que la base accepte) compteraient
  // sinon deux fois le même repas.
  const seen = new Set<string>();
  for (const mark of args.marks) {
    if (shown.has(mark.day)) continue;
    if (args.state !== undefined && mark.kind !== args.state) continue;
    const slots: readonly EatingOccasion[] = mark.slots.length > 0
      ? mark.slots
      : EATING_OCCASIONS;
    for (const slot of slots) {
      if (!rows.has(slot)) continue;
      seen.add(`${mark.day}|${slot}`);
    }
  }
  return seen.size;
}
