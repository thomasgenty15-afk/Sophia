import type {
  DishSideCourse,
  DishSideCourseKind,
  GeneratedDish,
  MealBox,
  MealPreparation,
  MemberPortionView,
  PotSharePartView,
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
//
// ⟳ 2026-09-23 — ET LES À-CÔTÉS (`side_courses`): un aliment, des grammes ou un
// nombre d'unités, une personne par ID. Ni leurs calories ni leur provenance
// n'entrent ici.

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
  /**
   * ⟳ 2026-09-22 — LES MÊMES GRAMMES EN MILLILITRES, quand l'aliment se VERSE.
   * Recopié du moteur (`BoxItem.ml`), jamais calculé ici: la densité vit dans
   * le référentiel, que le front ne peut pas lire.
   *
   * `null` = cet aliment ne se verse pas, ou le plan est antérieur au lot. La
   * ligne rend alors ses grammes seuls, comme avant.
   */
  ml: number | null;
  /**
   * ⟳ 2026-09-22 — CE QUE CETTE PART DE CASSEROLE CONTIENT: « dont poulet
   * ~110 g, légumes ~140 g ». Les grammes de la boîte × la fraction calculée par
   * le moteur (`MealPreparation.share_parts`), arrondis à 5 g.
   *
   * ⛔ UNE INFORMATION, PAS UNE PESÉE: un mijoté ou une frittata ne se sépare
   * pas, et `grams` reste la seule quantité qu'on pèse.
   *
   * Absent sur un item frais, sur une casserole d'une seule famille (un riz
   * nature), et sur tout plan écrit avant le lot. ⚠️ ABSENT, PAS `[]`: la clé
   * n'est posée que quand il y a quelque chose à dire.
   */
  parts?: readonly BoxItemPart[];
}

/** Une famille nommée sous une part de casserole. */
export interface BoxItemPart {
  kind: PotSharePartView["kind"];
  /** `null` sur les légumes, sommés: l'écran les dit « légumes ». */
  term: string | null;
  /** Arrondi à 5 g, jamais sous 5 g. */
  grams: number;
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-23 — UN À-CÔTÉ SOUS UN CONTENANT: « 1 × pomme », « comté ~30 g ».
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ IL N'EST PAS UN `item`, ET C'EST CE QUI GARDE LE POIDS DU PLAT JUSTE. Un
 * `BoxLine.total` se dérive de ses `items`; les à-côtés vivent à côté, sur leur
 * propre ligne « À côté », et ne s'y ajoutent jamais — le plat reste le plat.
 *
 * ⛔ AUCUNE PROVENANCE: `DishSideCourse.source` n'entre pas ici, et ce type n'a
 * aucun champ où la mettre. Un yaourt de la liste de secours se lit comme un
 * yaourt nommé par le modèle.
 */
export interface BoxSideItem {
  kind: DishSideCourseKind;
  term: string;
  /** Grammes d'aliment prêt — la pesée d'une soupe tirée d'une casserole. */
  grams: number;
  /** `null` = l'à-côté se pèse; sinon il se compte. */
  unitCount: number | null;
  /** La casserole d'où il est tiré, `null` = il s'ajoute le jour même. */
  preparationId: string | null;
  /** Le libellé déjà rédigé: `meals.boxes.side_unit` ou `meals.boxes.side_grams`. */
  label: string;
}

/**
 * LES À-CÔTÉS D'UNE PERSONNE SOUS UN CONTENANT.
 *
 * ⚠️ UNE LIGNE PAR PERSONNE, JAMAIS UNE PAR ALIMENT: « Christèle : 1 × yaourt
 * nature, 1 × pomme ». Sur sa boîte à elle, le couvercle la nomme déjà, et la
 * ligne dit l'aliment seul.
 */
export interface BoxSideLine {
  memberId: string;
  /**
   * Le prénom, rendu devant les aliments. `null` sur une boîte à UN nom (le
   * couvercle l'a déjà écrit) et quand le prénom n'est pas connu (un plan relu
   * sans `member_portions`) — ⛔ jamais l'identifiant brut à la place.
   */
  name: string | null;
  items: BoxSideItem[];
  /** « 1 × pomme, comté ~30 g » ou « Christèle : 1 × yaourt nature ». */
  text: string;
}

/**
 * LE LIBELLÉ D'UN À-CÔTÉ: compté (« 1 × pomme ») ou pesé (« comté ~30 g »).
 *
 * ⚠️ LE « × » ÉVITE LE PLURIEL, EXPRÈS. « 2 pommes » demanderait d'accorder un
 * mot écrit par le modèle, dans sa langue — un matcher maison de plus. Le
 * gabarit vient du paquet de langue, le mot vient du plan, et rien ne les colle
 * en code.
 */
export function sideCourseLabel(
  side: Pick<DishSideCourse, "term" | "grams" | "unit_count">,
): string {
  return side.unit_count !== null
    ? mealCopy("meals.boxes.side_unit", { n: side.unit_count, term: side.term })
    : mealCopy("meals.boxes.side_grams", { term: side.term, n: side.grams });
}

/**
 * LA BOÎTE D'UN REPAS QUI PORTE L'À-CÔTÉ DE CETTE PERSONNE — par ID.
 *
 * ⛔ LE MÊME ORDRE QUE LE MOTEUR (`attachSideCourses`, voies ① et ②): la boîte
 * où elle est SEULE d'abord, sinon le premier bac commun qui la nomme. Deux
 * ordres différents feraient lire le yaourt de Christèle sous un couvercle qui
 * n'est pas celui que le moteur a choisi.
 *
 * `null` = aucune boîte de ce plat ne la nomme (plat de la table sans
 * contenant, plat qui lui est attribué sans boîte): la carte du repas rend
 * alors la ligne elle-même (`looseSideLinesForDish`).
 */
function sideHostBoxId(boxes: readonly MealBox[], memberId: string): string | null {
  const own = boxes.find((b) => b.member_ids.length === 1 && b.member_ids[0] === memberId);
  if (own !== undefined) return own.id;
  const shared = boxes.find((b) => b.member_ids.includes(memberId));
  return shared === undefined ? null : shared.id;
}

/**
 * LES À-CÔTÉS D'UN PLAT, TELS QUE CE MODULE LES LIT.
 *
 * ⚠️ LA TOLÉRANCE À L'ABSENCE N'EST PAS UN REPLI DE PRODUIT. `readDishes` est
 * le seul chemin vers `GeneratedDish` et il pose toujours `side_courses`
 * (`[]` quand il n'y en a pas). Mais les montages de test du dépôt fabriquent
 * leurs plats par `as GeneratedDish`, hors de `tsc` (les `*.test.*` sont exclus
 * de `tsconfig.app.json`), et ceux d'avant ce lot n'ont pas la clé. Sans ce
 * `Array.isArray`, chacun d'eux lèverait un `TypeError` au montage — l'écran
 * blanc que `boxes: []` a déjà coûté une fois.
 */
function sidesOfDish(dish: { side_courses?: readonly DishSideCourse[] }): readonly DishSideCourse[] {
  return Array.isArray(dish.side_courses) ? dish.side_courses : [];
}

/**
 * GROUPE DES À-CÔTÉS PAR PERSONNE, DANS L'ORDRE DU ROSTER.
 *
 * ⚠️ L'ORDRE SUIT `portions`, comme les prénoms du couvercle; une personne que
 * le roster ne connaît pas vient après, dans l'ordre du plan.
 */
function sideLinesOf(
  sides: readonly DishSideCourse[],
  portions: readonly { memberId: string; displayName: string }[],
  /** `true` = le prénom est écrit devant les aliments (bac commun, carte). */
  named: boolean,
): BoxSideLine[] {
  const byMember = new Map<string, DishSideCourse[]>();
  for (const side of sides) {
    const list = byMember.get(side.member_id) ?? [];
    list.push(side);
    byMember.set(side.member_id, list);
  }
  const rank = (id: string) => {
    const i = portions.findIndex((p) => p.memberId === id);
    return i === -1 ? portions.length : i;
  };
  return [...byMember.keys()]
    .map((memberId, order) => ({ memberId, order }))
    .sort((a, b) => rank(a.memberId) - rank(b.memberId) || a.order - b.order)
    .map(({ memberId }) => {
      const items = (byMember.get(memberId) ?? []).map((side) => ({
        kind: side.kind,
        term: side.term,
        grams: side.grams,
        unitCount: side.unit_count,
        preparationId: side.preparation_id,
        label: sideCourseLabel(side),
      }));
      const known = portions.find((p) => p.memberId === memberId)?.displayName.trim() ?? "";
      const name = named && known !== "" ? known : null;
      // ⚠️ LA VIRGULE N'A PAS DE LANGUE: c'est la liste des aliments, pas une
      // phrase. Le gabarit qui colle le prénom, lui, vient du paquet de langue.
      const joined = items.map((it) => it.label).join(", ");
      return {
        memberId,
        name,
        items,
        text: name === null ? joined : mealCopy("meals.boxes.side_for", { name, items: joined }),
      };
    });
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-23 — LES À-CÔTÉS QU'AUCUN CONTENANT DE CE PLAT NE PORTE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Le moteur rattache aussi un à-côté à un plat SANS boîte qui la nomme (voies
 * ③ et ④ de `attachSideCourses`: plat qui lui est attribué, plat de la table
 * sans contenant). Aucun couvercle ne le dira: c'est la carte du repas qui rend
 * la ligne, après les ingrédients, avec le prénom quand elle le connaît.
 *
 * `people` = les mangeurs que la carte connaît déjà (`DishCard.eaters`); `[]`
 * rend les aliments sans prénom — jamais un identifiant.
 */
export function looseSideLinesForDish(
  dish: Pick<GeneratedDish, "boxes" | "side_courses">,
  people: readonly { memberId: string; name: string }[],
): BoxSideLine[] {
  const loose = sidesOfDish(dish).filter(
    (side) => sideHostBoxId(dish.boxes, side.member_id) === null,
  );
  return sideLinesOf(
    loose,
    people.map((p) => ({ memberId: p.memberId, displayName: p.name })),
    true,
  );
}

/**
 * LA COMPOSITION D'UNE CASSEROLE, PAR SON IDENTIFIANT. `null` = rien à dire.
 * ⚠️ REQUISE sur chaque constructeur de lignes: la session la lit sur ses
 * préparations, la carte du repas dit explicitement qu'elle n'en a pas.
 */
export type SharePartsOf = (preparationId: string) => readonly PotSharePartView[] | null;

/** La carte d'un repas ne détaille pas ses casseroles: elle ne montre aucun gramme. */
export const NO_SHARE_PARTS: SharePartsOf = () => null;

/** Le détail d'une part, en grammes de CETTE boîte. `undefined` = rien à dire. */
function partsOfItem(
  item: { preparation_id: string | null; grams: number },
  sharePartsOf: SharePartsOf,
): BoxItemPart[] | undefined {
  if (item.preparation_id === null) return undefined;
  const share = sharePartsOf(item.preparation_id);
  if (share === null || share.length === 0) return undefined;
  const parts = share
    .map((p) => ({ kind: p.kind, term: p.term, grams: Math.round((item.grams * p.fraction) / 5) * 5 }))
    .filter((p) => p.grams >= 5);
  return parts.length > 0 ? parts : undefined;
}

/**
 * ⟳ 2026-09-22 — CE QUE LE COUVERCLE NOMME: le nom d'usage du plat
 * (« Frittata tomate-amande »), et le titre descriptif seulement quand le nom
 * manque. Demande du propriétaire: « Œufs, blancs d'œufs, pomme de terre,
 * épinards, tomate et amandes » ne dit pas qu'on parle de la frittata.
 */
export function lidDishLabel(dish: { title: string; name?: string | null }): string {
  const name = typeof dish.name === "string" ? dish.name.trim() : "";
  return name !== "" ? name : dish.title;
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
   * ⟳ 2026-09-23 — LES À-CÔTÉS SERVIS AVEC CE CONTENANT, une ligne par
   * personne (voir `BoxSideLine`). `[]` = aucun, et l'écran se tait.
   *
   * ⛔ ILS N'ENTRENT PAS DANS `total`: le poids affiché reste celui du plat.
   */
  sides: BoxSideLine[];
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
  /**
   * ⟳ 2026-09-16 — VRAI QUAND CE CONTENANT NE TIENT QU'UNE PARTIE DU REPAS : la
   * part de marmite produite par la session. Le reste (tortilla, laitue, tomate
   * d'un plat assemblé le jour même) n'entre pas dans ce contenant-là, et c'est
   * le jour qui le dit. Mesuré le 2026-09-16 : « Boxing » faisait peser le
   * mercredi 588 g de dinde ET 43 g de tortilla pour un plat monté le jeudi.
   *
   * ⟳ 2026-09-23 — ET AUSSI quand une part vient d'une casserole d'une AUTRE
   * session (`fromOtherSessions`). Dans les deux cas l'énergie du repas ne se
   * lit pas sur ce contenant.
   */
  partial: boolean;
  /**
   * ⟳ 2026-09-23 — VRAI QUAND DES ACCOMPAGNEMENTS FRAIS (`preparation_id:
   * null`) ont été laissés hors du contenant de la session : c'est lui, et lui
   * seul, qui fait dire « le reste se prépare le jour même ». Toujours `false`
   * hors d'une session.
   */
  restOnTheDay: boolean;
  /**
   * ⟳ 2026-09-23 — LES PARTS DE CE CONTENANT CUITES DANS UNE AUTRE SESSION,
   * nommées avec leur jour de cuisson. `[]` hors d'une session.
   *
   * ⛔ MESURÉ SUR LE PLAN `404d64b5` : le « Boxing » du mercredi faisait peser
   * 278 g de « Saumon, brocoli et carotte » cuit le vendredi, parce que la
   * boîte du vendredi soir tenait aussi le couscous du mercredi. La part d'une
   * autre session n'est plus pesée ici : elle est NOMMÉE, pour qu'on sache ce
   * qui complète la boîte, et quand.
   */
  fromOtherSessions: readonly OtherSessionPart[];
}

/** Une part cuite dans une autre session : son nom, et son jour déjà traduit. */
export interface OtherSessionPart {
  term: string;
  /** `dishDayLabel(cook_on)` — `null` quand la casserole ne dit pas son jour. */
  dayLabel: string | null;
}

/**
 * CE QU'UNE SESSION CUISINE — la seule chose qu'elle a le droit de peser.
 *
 * `preparationIds` : les casseroles de la session (`session.preparation_ids`).
 * `cookOnOf` : le jour de cuisson d'une casserole, pour nommer celles des autres.
 */
interface SessionScope {
  preparationIds: ReadonlySet<string>;
  cookOnOf: (preparationId: string) => string | null;
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
  dish: Pick<GeneratedDish, "boxes" | "title" | "name" | "day" | "slot" | "uses" | "side_courses">,
  portions: readonly MemberPortionView[],
): BoxLine[] {
  const meal = mealLabelFor(dish.day, dish.slot);
  // ⛔ LES CASSEROLES DONT LA PART EST CONGELÉE, LUES SUR LA CLÉ. `uses[].kept`
  // est l'autorité; la prose de `method` ne l'est pas, et un plan d'avant la
  // clé n'en porte aucune — il rend donc un ensemble vide, pas une devinette.
  const frozenPreparations = new Set(
    dish.uses.filter((u) => u.kept === "freezer").map((u) => u.preparation_id),
  );
  // ⟳ 2026-09-23 — LE JOUR MÊME, TOUS LES À-CÔTÉS: le fruit comme la soupe.
  const sides = sidesOfDish(dish);
  return dish.boxes.map((box) =>
    oneLine(
      box,
      meal,
      lidDishLabel(dish),
      portions,
      frozenPreparations,
      NO_SHARE_PARTS,
      sidesHostedBy(box, dish.boxes, sides),
      null,
    )
  );
}

/**
 * LES À-CÔTÉS QUE CE CONTENANT PORTE — ceux dont il est l'hôte
 * (`sideHostBoxId`), et aucun autre: un à-côté ne se lit que sous UN couvercle.
 */
function sidesHostedBy(
  box: MealBox,
  boxes: readonly MealBox[],
  sides: readonly DishSideCourse[],
): DishSideCourse[] {
  return sides.filter((side) => sideHostBoxId(boxes, side.member_id) === box.id);
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
  /** ⟳ 2026-09-22 — la composition des casseroles. Voir `SharePartsOf`. */
  sharePartsOf: SharePartsOf,
  /**
   * ⟳ 2026-09-23 — LES À-CÔTÉS DONT CE CONTENANT EST L'HÔTE (`sidesHostedBy`).
   * ⚠️ REQUIS: `[]` dit « aucun », et ça se dit — un `?` rendrait muette la
   * ligne « À côté » chez l'appelant qui l'oublierait.
   */
  hostedSides: readonly DishSideCourse[],
  /**
   * `null` = le repas ENTIER (la carte du jour). Une session = ne garder que
   * les parts de SES casseroles : ce qu'elle cuit, elle le pèse ; le reste est
   * nommé, jamais pesé.
   *
   * ⟳ 2026-09-23 — REQUIS, et plus un booléen à défaut `false`. L'ancien
   * `potSharesOnly = true` ne retirait que les items frais : une part d'une
   * casserole cuite dans une AUTRE session passait, et le mercredi faisait
   * peser le saumon du vendredi (plan `404d64b5`).
   */
  scope: SessionScope | null,
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
  const kept = scope === null
    ? box.items
    : box.items.filter((it) =>
      it.preparation_id !== null && scope.preparationIds.has(it.preparation_id)
    );
  // Les parts d'une autre session, une fois chacune, dans l'ordre de la boîte.
  const elsewhere = new Map<string, OtherSessionPart>();
  if (scope !== null) {
    for (const it of box.items) {
      const id = it.preparation_id;
      if (id === null || scope.preparationIds.has(id) || elsewhere.has(id)) continue;
      elsewhere.set(id, { term: it.term, dayLabel: dishDayLabel(scope.cookOnOf(id)) });
    }
  }
  const items = kept.map((it) => {
    const parts = partsOfItem(it, sharePartsOf);
    return parts === undefined
      ? { term: it.term, grams: it.grams, ml: it.ml }
      : { term: it.term, grams: it.grams, ml: it.ml, parts };
  });
  // ⟳ 2026-09-23 — À LA SESSION, SEULS LES À-CÔTÉS TIRÉS D'UNE CASSEROLE DE
  // CETTE SESSION (une soupe): ils se mettent en boîte comme n'importe quelle
  // part de marmite. Le fruit et le yaourt s'ajoutent le jour même — même règle
  // que les items frais; une soupe cuite dans une autre session n'est pas pesée
  // ici, même règle que `scope` pour les parts.
  const sides = sideLinesOf(
    scope === null
      ? hostedSides
      : hostedSides.filter((s) =>
        s.preparation_id !== null && scope.preparationIds.has(s.preparation_id)
      ),
    portions,
    // Le prénom devant les aliments sur un bac commun seulement: sur une boîte
    // à un nom, le couvercle l'a déjà écrit.
    eaterCount > 1,
  );
  return {
    id: box.id,
    eaters,
    eatersLabel,
    eaterCount,
    meal,
    dish: dishTitle,
    lid: boxLidLabel(eatersLabel, meal, dishTitle),
    items,
    sides,
    // ⛔ LES À-CÔTÉS N'Y ENTRENT PAS (⟳ 2026-09-23): le poids est celui du plat.
    // ⚠️ LE TOTAL SE DÉRIVE, SAUF SUR UN PLAN v2 QUI N'A PAS D'`items` À
    // SOMMER. Le repli n'est pas un défaut: v2 ne portait aucune ventilation
    // par composant, et sa somme est bien une quantité de bac.
    total: items.length > 0
      ? items.reduce((sum, it) => sum + it.grams, 0)
      : scope !== null
      ? 0
      : (box.legacy_total_grams ?? 0),
    shared: eaterCount > 1,
    partial: kept.length < box.items.length,
    restOnTheDay: scope !== null && box.items.some((it) => it.preparation_id === null),
    fromOtherSessions: [...elsewhere.values()],
    // ⚠️ `some`, PAS `every`: un contenant qui mélange une part congelée et une
    // part fraîche se remplit quand même au congélateur — c'est le geste le plus
    // contraignant qui décide, comme partout où une garde compose.
    // ⟳ 2026-09-23 — SUR `kept`, PAS SUR LA BOÎTE ENTIÈRE: dans une session,
    // c'est ce qu'ELLE y met qui va au frais ou au congélateur. Sur la carte du
    // jour, `kept` est la boîte entière et rien ne change.
    frozen: kept.some((it) =>
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
 * ⛔ 2026-09-23 — EN DEUX FOIS POUR DE VRAI: chaque session ne pèse que les parts
 * de SES casseroles. Jusque-là la phrase ci-dessus était vraie des REPAS mais pas
 * des PARTS: mesuré sur le plan `404d64b5`, la session du mercredi (poulet,
 * couscous) faisait peser 278 g de « Saumon, brocoli et carotte » pour le dîner
 * du vendredi — le saumon est cuit vendredi. Les parts d'une autre session sont
 * NOMMÉES (`fromOtherSessions`) avec leur jour, jamais pesées ici. La règle est
 * locale: elle ne dépend d'aucun ordre entre sessions.
 *
 * L'ordre est celui des plats du plan — c'est-à-dire celui de la semaine.
 */
export function boxLinesForSession(
  preparationIds: readonly string[],
  dishes: readonly GeneratedDish[],
  portions: readonly MemberPortionView[],
  /**
   * ⟳ 2026-09-22 — les préparations du plan, pour dire ce qu'une part contient.
   * ⟳ 2026-09-23 — et leur `cook_on`, pour dire QUAND cuit une part venue d'une
   * autre session. ⚠️ REQUIS: `[]` dit « ni détail ni jour », et ça se dit.
   */
  preparations: readonly Pick<MealPreparation, "id" | "share_parts" | "cook_on">[],
): BoxLine[] {
  const wanted = new Set(preparationIds);
  const sharePartsOf: SharePartsOf = (id) =>
    preparations.find((p) => p.id === id)?.share_parts ?? null;
  const scope: SessionScope = {
    preparationIds: wanted,
    cookOnOf: (id) => preparations.find((p) => p.id === id)?.cook_on ?? null,
  };
  return dishes
    // ⟳ 2026-09-23 — UN REPAS DONT L'ENTRÉE EST TIRÉE D'UNE CASSEROLE DE CETTE
    // SESSION (une soupe) en fait partie aussi: cette part-là se met en boîte
    // ici, comme n'importe quelle casserole tirée.
    .filter((dish) =>
      dish.uses.some((u) => wanted.has(u.preparation_id)) ||
      sidesOfDish(dish).some((s) => s.preparation_id !== null && wanted.has(s.preparation_id))
    )
    // ⟳ 2026-09-16 — CE QU'UNE SESSION MET EN BOÎTE, C'EST CE QU'ELLE PRODUIT.
    // Un plat assemblé le jour même (`same_day: assemble`) tient UNE part de
    // marmite (`preparation_id` de cette session) ET des accompagnements frais
    // (`preparation_id: null`) ajoutés à table. Lister les seconds ici faisait
    // peser le mercredi 43 g de tortilla et 29 g de laitue pour un plat monté
    // le jeudi — la vue du JOUR (`boxLinesForDish`) garde le repas entier.
    .flatMap((dish) => {
      const meal = mealLabelFor(dish.day, dish.slot);
      const frozenPreparations = new Set(
        dish.uses.filter((u) => u.kept === "freezer").map((u) => u.preparation_id),
      );
      const sides = sidesOfDish(dish);
      return dish.boxes
        .map((box) =>
          oneLine(
            box,
            meal,
            lidDishLabel(dish),
            portions,
            frozenPreparations,
            sharePartsOf,
            sidesHostedBy(box, dish.boxes, sides),
            scope,
          )
        )
        // Un contenant qui ne tiendrait rien de cette session n'est pas à remplir.
        .filter((line) => line.items.length > 0 || line.total > 0 || line.sides.length > 0);
    });
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
