import type {
  GeneratedDish,
  MealBox,
  MemberPortionView,
} from "../api/mealGeneration";
import { dishDayLabel, dishSlotLabel, mealCopy } from "../api/mealLabels";

// LA MISE EN BOÎTES, CÔTÉ ÉCRAN. LA SEULE JOINTURE, ET ELLE EST PAR ID.
//
// ── LE DÉFAUT QUE CE MODULE FERME ──────────────────────────────────────────
// Les parts par personne étaient de la PROSE lue à voix haute à table (« une
// bonne portion de poulet »), et le produit a tranché le 2026-08-17: « prendre
// une poignée, ça ne veut rien dire ». La sortie est le protocole des boîtes —
// on pèse UNE fois, à la session de cuisine, dans des contenants nommés.
//
// ── CE QUI A CHANGÉ LE 2026-08-20: LE PLURIEL (v4) ─────────────────────────
// Un repas ne porte plus UN contenant mais N — un par GROUPE de mangeurs:
// chaque bouche à objectif SEULE, puis tout le reste présent ENSEMBLE. Un
// foyer de quatre dont une bouche a un objectif sort deux contenants par repas.
//
// ⛔ ET LE NOMBRE DE NOMS DÉCIDE DE CE QUE LES GRAMMES VEULENT DIRE.
//   · UN SEUL NOM → une PRESCRIPTION. Le contenant EST sa portion: on l'ouvre,
//     on mange, personne ne pèse.
//   · PLUSIEURS → une QUANTITÉ DE BAC. C'est ce qu'on met dedans pour n
//     personnes, et ça ne vise personne. ⛔ Jamais une part par personne
//     là-dedans — c'est ce qui a tué v2 (la balance de retour au service).
// Ce module ne fabrique donc AUCUNE division: il rend les `items` tels quels et
// dérive un total. Il n'a structurellement aucun endroit où répartir.
//
// ⛔ « JAMAIS DE MATCHER MAISON », QUATORZIÈME FOIS. Le seul autre chemin
// imaginable — retrouver la boîte de Zoé en cherchant « Zoé » dans un titre — se
// tromperait dès « Poulet pour Zoé et Marc » et ne trouverait rien dès que le
// plan sort en anglais. Douze faux positifs sur douze mesurés.
//
// ── CE QUI N'ENTRERA JAMAIS ICI ────────────────────────────────────────────
// Aucun objectif, aucun chiffre de corps, aucune calorie: ce module ne lit que
// `member_ids`, `items` et `display_name`, et il n'a structurellement aucun
// champ où en mettre un. Les grammes qu'il rend sont des grammes d'ALIMENT, du
// même côté de la frontière que « 400 g de cuisses de poulet ».

/** AU-DELÀ DE CE NOMBRE DE PRÉNOMS, le couvercle porte un compte. */
const MAX_NAMES_ON_LID = 4;

/**
 * LE SÉPARATEUR DU COUVERCLE, ET IL N'EST PAS `nameList`.
 *
 * ⚠️ `nameList` rend une phrase (« Mathilde, Thomas et Christèle ») — c'est le
 * bon outil quand on PARLE d'un groupe, et c'est pour ça qu'il reste employé
 * partout ailleurs. Ici on écrit une ÉTIQUETTE, celle qu'on trace au marqueur
 * sur un couvercle: elle est plus courte, elle se lit d'un coup d'œil sur un
 * bac dans un frigo, et elle n'a PAS DE LANGUE — donc pas de « et »/« and » à
 * traduire au milieu d'une chaîne qui doit rester identique d'un écran à
 * l'autre.
 */
const LID_NAME_SEPARATOR = " + ";

/** UN COMPOSANT DANS UN CONTENANT: ce qu'on met, et combien. */
export interface BoxItemLine {
  term: string;
  grams: number;
}

/** Une ligne de Boxing: UN contenant, c'est-à-dire un repas ET un groupe. */
export interface BoxLine {
  id: string;
  /**
   * LES PRÉNOMS DU GROUPE, dans l'ordre du ROSTER et jamais dans celui du
   * modèle: l'écran doit lister le foyer pareil d'un repas à l'autre.
   *
   * ⚠️ VIDE EST POSSIBLE, et ce n'est pas une erreur à masquer: un plan relu
   * sans ses `member_portions` (un secondaire, une lecture partielle) n'a aucun
   * prénom à joindre. Le contenant garde alors ses grammes — l'instruction de
   * pesée reste vraie — et le couvercle se rend sans nom. Rendre l'identifiant
   * brut à la place serait montrer un uuid à table.
   */
  eaters: string[];
  /** Les prénoms tels qu'ils s'écrivent sur le couvercle (règle des 4). */
  eatersLabel: string;
  /**
   * COMBIEN DE BOUCHES OUVRENT CE CONTENANT. Il vient de `member_ids`, PAS de
   * `eaters`: on sait toujours combien ils sont, même quand on ne sait pas
   * comment ils s'appellent. C'est lui qui décide de `shared`.
   */
  eaterCount: number;
  /**
   * LE REPAS QUE CE CONTENANT EST — « jeudi soir ». C'est ce qui décide devant
   * la porte du frigo, et c'est exactement le défaut n°3 du run `76be8ce3`:
   * « Boîte iku » était sur cinq boîtes, et ce nom ne tranchait rien.
   *
   * ⚠️ IL VIENT DU PLAT QUI PORTE LE CONTENANT, jamais d'une seconde
   * déclaration du modèle: deux sources pour un même jour finiraient par se
   * contredire, et l'écart se lirait comme un repas au mauvais moment. Vide
   * quand le plat ne nomme ni jour ni moment (il vaut alors pour la fenêtre).
   */
  meal: string;
  /** Le titre du plat — « ce qu'il y a dedans ». */
  dish: string;
  /**
   * ══════════════════════════════════════════════════════════════════════
   * LE COUVERCLE. UNE SEULE CHAÎNE, CONSTRUITE UNE SEULE FOIS.
   * ══════════════════════════════════════════════════════════════════════
   * `Mathilde + Thomas + Christèle — jeudi soir — Riz sauté aux champignons`
   *
   * ⛔ ELLE S'AFFICHE À L'IDENTIQUE DANS LE BOXING **ET** SUR LA CARTE DU
   * REPAS, et c'est la raison d'être du champ. On tient un bac dans la main et
   * on cherche la même suite de mots à l'écran: deux constructions divergentes
   * feraient échouer cette comparaison-là, sur l'objet dont le seul travail est
   * de trancher. Une ceinture de `mealBoxes.int.test.ts` compare les deux
   * rendus caractère pour caractère.
   *
   * ⚠️ SUR LA CARTE DU REPAS, LA REDONDANCE EST LE POINT. La carte est déjà
   * sous son jour, sous son moment, et titrée par son plat — et le couvercle
   * redit les trois quand même, parce qu'il n'informe pas: il se FAIT
   * RECONNAÎTRE. (Ce qui avait été jugé « incompréhensible » le 2026-08-19,
   * c'étaient trois fragments collés SANS séparateur et suivis d'un gramme.
   * Ici les séparateurs sont là et le gramme n'y est plus.)
   */
  lid: string;
  /** Ce qu'on met dedans. Vide sur un plan v2 relu — voir `total`. */
  items: BoxItemLine[];
  /**
   * CE QUE LE CONTENANT REÇOIT. DÉRIVÉ des `items`, jamais déclaré — deux
   * nombres qui doivent s'accorder finissent par diverger. Sur un plan v2 relu
   * (aucun `item`), c'est la somme des parts d'alors, qui EST une quantité de
   * bac.
   */
  total: number;
  /**
   * PLUSIEURS BOUCHES ⇒ LE GRAMME DÉCRIT LE BAC, PAS UNE PERSONNE. C'est le
   * seul champ qui porte la distinction, et il se dérive du COMPTE de bouches —
   * il n'y a pas d'autre marqueur, et il n'en faut pas d'autre.
   */
  shared: boolean;
  /**
   * ══════════════════════════════════════════════════════════════════════
   * CE CONTENANT PART AU CONGÉLATEUR — 2026-09-04.
   * ══════════════════════════════════════════════════════════════════════
   *
   * ── LE DÉFAUT QUE CE CHAMP FERME ──────────────────────────────────────
   * Une seule session de cuisine pour sept jours ne tient QUE par le
   * congélateur: `uses[].kept === "freezer"` existe depuis le 2026-09-01, la
   * garde de fenêtre le lit, et le plan entier en dépend. Mais devant l'évier,
   * au moment de remplir six bacs, **rien ne disait lesquels vont au
   * congélateur** — le Boxing les rendait tous pareils. La seule mention du
   * congélateur à l'écran était `DishCard`, quatre jours plus tard, au moment
   * de SORTIR la part. On disait quoi décongeler sans avoir dit quoi congeler.
   *
   * ⛔ DÉRIVÉ DE `uses[].kept`, JAMAIS D'UNE PROSE. Le modèle écrit aussi
   * « mettez le reste au congélateur » dans sa `method`; le lire là serait un
   * matcher maison sur du texte de modèle, et il changerait de verdict avec la
   * langue du plan. La clé est la seule autorité — c'est très exactement ce
   * pour quoi elle a été créée (« la promesse et la clé de schéma doivent se
   * toucher »).
   *
   * ⚠️ LA JOINTURE EST PAR `preparation_id`, ET C'EST ELLE QUI REND LE CHAMP
   * EXACT. Un plat peut prélever sur deux casseroles, l'une gardée au frigo et
   * l'autre congelée: c'est le contenant qui porte des `items` de la seconde
   * qui doit être marqué, pas le plat entier. Un `item` sans
   * `preparation_id` (l'ajout frais du jour) ne marque rien — il n'a jamais
   * été dans un lot.
   *
   * ⚠️ ET IL EST FAUX SUR UN PLAN v2 RELU: aucun `item`, donc aucune
   * jointure. C'est la bonne direction — un plan d'avant la clé n'a jamais
   * déclaré de congélation, et lui en inventer une ferait sortir une part d'un
   * congélateur où personne ne l'a mise.
   */
  frozen: boolean;
}

/**
 * LES PRÉNOMS SUR LE COUVERCLE — et le compte quand ils sont trop nombreux.
 *
 * ⚠️ LA RÈGLE DES 4 EST UNE DÉCISION DE LISIBILITÉ, PAS UNE TRONCATURE. Un
 * foyer de six écrirait une ligne de trois centimètres sur un couvercle et deux
 * lignes de repli sur un téléphone à 320 px. Au-delà de quatre, le couvercle dit
 * combien ils sont — ce qui est la seule chose dont on ait besoin devant le
 * frigo quand ce n'est de toute façon pas « sa » boîte.
 *
 * ⚠️ ET LE COMPTE VIENT DES BOUCHES, PAS DES PRÉNOMS RÉSOLUS. Un plan relu
 * sans ses parts sait encore qu'ils sont cinq.
 */
export function eatersLabelFor(names: readonly string[], count: number): string {
  if (names.length === 0) return "";
  if (names.length > MAX_NAMES_ON_LID) {
    return mealCopy("meals.boxes.rest_of_table", { n: count });
  }
  return names.join(LID_NAME_SEPARATOR);
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE COUVERCLE — LE CONSTRUCTEUR UNIQUE, ET IL NE LIT QUE DEUX CHOSES.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ IL NE DÉPEND QUE DU PLAT ET DES PRÉNOMS DÉJÀ RÉSOLUS — jamais des
 * PRÉPARATIONS. `/app/today`, c'est-à-dire l'écran où l'on OUVRE la boîte, ne
 * reçoit pas `preparations`: un libellé qui en dépendrait serait complet sur
 * `/app/plan` et amputé là où on le lit vraiment. Une ceinture de
 * `mealBoxes.int.test.ts` monte la carte sans préparations et exige le même
 * libellé.
 *
 * ⚠️ AUCUN MOT DE MOTEUR: les moitiés sont des libellés déjà traduits
 * (`meals.day.*`, `meals.slot.*`) et un titre de plat. Une moitié manquante rend
 * les autres seules — « jeudi soir — Riz sauté » sur un plan relu sans ses
 * parts reste un couvercle utile.
 */
export function boxLidLabel(
  eatersLabel: string,
  meal: string,
  dish: string,
): string {
  return [eatersLabel, meal, dish]
    .filter((part) => part !== "")
    .join(" — ");
}

/**
 * LES CONTENANTS D'UN REPAS, PRÊTS À RENDRE. `[]` quand le plat n'en porte pas.
 *
 * `[]` est le cas de tout plan écrit avant le 2026-08-19, de toute lane
 * individuelle, et de tout plat cuisiné de zéro le jour même. L'écran se tait
 * alors: il n'invente pas de contenant.
 */
export function boxLinesForDish(
  dish: Pick<GeneratedDish, "boxes" | "title" | "day" | "slot" | "uses">,
  portions: readonly MemberPortionView[],
): BoxLine[] {
  const meal = mealLabelFor(dish.day, dish.slot);
  // ⛔ LES CASSEROLES DONT LA PART EST CONGELÉE, LUES SUR LA CLÉ. `uses[].kept`
  // est l'autorité; la prose de `method` ne l'est pas, et un plan d'avant la
  // clé n'en porte aucune — il rend donc un ensemble vide, pas une devinette.
  const frozenPreparations = new Set(
    dish.uses.filter((u) => u.kept === "freezer").map((u) => u.preparation_id),
  );
  return dish.boxes.map((box) =>
    oneLine(box, meal, dish.title, portions, frozenPreparations)
  );
}

function oneLine(
  box: MealBox,
  meal: string,
  dishTitle: string,
  portions: readonly MemberPortionView[],
  /**
   * LES CASSEROLES DE CE PLAT DONT LA PART EST CONGELÉE.
   *
   * ⚠️ REQUIS, jamais optionnel. Un `?` ferait un contenant `frozen: false`
   * chez tout appelant qui l'oublierait — c'est-à-dire un marqueur éteint qui
   * ressemble trait pour trait à un plan sans congélation. Vide se dit `new
   * Set()`, et ça se dit.
   */
  frozenPreparations: ReadonlySet<string>,
): BoxLine {
  const wanted = new Set(box.member_ids);
  // ⚠️ L'ORDRE DES PRÉNOMS SUIT `portions`, PAS `member_ids`. Deux contenants du
  // même jour listeraient sinon « Zoé + Marc » et « Marc + Zoé » selon l'humeur
  // du modèle, et le Boxing cesserait d'être lisible d'un coup d'œil.
  const eaters = portions
    .filter((p) => wanted.has(p.memberId))
    .map((p) => p.displayName);
  const eaterCount = box.member_ids.length;
  const eatersLabel = eatersLabelFor(eaters, eaterCount);
  const items = box.items.map((it) => ({ term: it.term, grams: it.grams }));
  return {
    id: box.id,
    eaters,
    eatersLabel,
    eaterCount,
    meal,
    dish: dishTitle,
    lid: boxLidLabel(eatersLabel, meal, dishTitle),
    items,
    // ⚠️ LE TOTAL SE DÉRIVE, SAUF SUR UN PLAN v2 QUI N'A PAS D'`items` À
    // SOMMER. Le repli n'est pas un défaut: v2 ne portait aucune ventilation
    // par composant, et sa somme est bien une quantité de bac.
    total: items.length > 0
      ? items.reduce((sum, it) => sum + it.grams, 0)
      : (box.legacy_total_grams ?? 0),
    shared: eaterCount > 1,
    // ⚠️ `some`, PAS `every`: un contenant qui mélange une part congelée et une
    // part fraîche se remplit quand même au congélateur — c'est le geste le plus
    // contraignant qui décide, comme partout où une garde compose.
    frozen: box.items.some((it) =>
      it.preparation_id !== null && frozenPreparations.has(it.preparation_id)
    ),
  };
}

/**
 * LES CONTENANTS QU'UNE SESSION DE CUISINE DOIT REMPLIR.
 *
 * ⚠️ LA JOINTURE EST `uses[].preparation_id`, PAS UN TITRE. Un repas appartient à
 * cette session s'il prélève sur AU MOINS une de ses casseroles. Un repas qui
 * mélange deux sessions apparaît sous les deux, et c'est juste: ses contenants se
 * remplissent en deux fois.
 *
 * L'ordre est celui des plats du plan — c'est-à-dire celui de la semaine.
 */
export function boxLinesForSession(
  preparationIds: readonly string[],
  dishes: readonly GeneratedDish[],
  portions: readonly MemberPortionView[],
): BoxLine[] {
  const wanted = new Set(preparationIds);
  return dishes
    .filter((dish) => dish.uses.some((u) => wanted.has(u.preparation_id)))
    .flatMap((dish) => boxLinesForDish(dish, portions));
}

/**
 * « jeudi soir » — LA MOITIÉ DU COUVERCLE QUI DÉCIDE DEVANT LE FRIGO.
 *
 * ⚠️ AUCUN MOT DE MOTEUR: les deux moitiés sont des libellés déjà traduits
 * (`meals.day.*`, `meals.slot.*`), et l'espace qui les sépare n'a pas de langue.
 * Une moitié manquante rend l'autre seule — « midi » sans jour reste utile sur
 * un plat qui vaut pour toute la fenêtre, et « jeudi » sans moment aussi.
 */
function mealLabelFor(day: string | null, slot: string | null): string {
  return [dishDayLabel(day), dishSlotLabel(slot)]
    .filter((part): part is string => part !== null && part !== "")
    .join(" ");
}
