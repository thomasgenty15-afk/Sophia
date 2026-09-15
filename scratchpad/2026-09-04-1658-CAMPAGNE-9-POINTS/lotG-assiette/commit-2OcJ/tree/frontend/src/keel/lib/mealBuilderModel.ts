import { SHOPPING_AISLE_ORDER } from "../api/mealLabels";
import {
  DAY_TOKENS,
  type GeneratedDish,
  type PantryItem,
  type ShoppingItem,
} from "../api/mealGeneration";

// LES FONCTIONS PURES DU CONSTRUCTEUR DE REPAS.
//
// Elles vivaient dans `MealBuilder.tsx`, et le lint avait raison de refuser:
// un fichier qui exporte autre chose qu'un composant casse le fast refresh.
// Elles sont pures, testables sans React, et ce sont les deux endroits où une
// erreur se voit tout de suite à l'écran — leur place est ici.

/**
 * Une ligne de garde-manger par ligne de texte, « terme, quantité ».
 *
 * Le découpage est déterministe et volontairement bête: la première virgule
 * sépare le terme de la quantité. Un parseur plus malin devinerait, et deviner
 * ce que l'élève a chez lui produit une liste de courses fausse.
 */
export function parsePantry(raw: string): PantryItem[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => {
      const comma = line.indexOf(",");
      if (comma === -1) return { term: line, quantity: null };
      return {
        term: line.slice(0, comma).trim(),
        quantity: line.slice(comma + 1).trim() || null,
      };
    })
    .filter((item) => item.term !== "");
}

/**
 * Les plats regroupés par JOUR, dans l'ordre de la semaine.
 *
 * ── UN PLAT EN LOT NOURRIT PLUSIEURS JOURS, ET DOIT DONC Y APPARAÎTRE ─────
 * Défaut mesuré: un chili cuisiné dimanche et couvrant lundi et mardi ne
 * s'affichait que sous son jour de cuisson. Lundi et mardi paraissaient VIDES,
 * et l'élève lisait des trous là où le plan était en fait complet — le
 * reproche exact qu'on nous a fait sur la première version.
 *
 * Un plat en lot est donc placé sur CHAQUE jour qu'il couvre. Ce n'est pas une
 * duplication de données: c'est la même session de cuisine, montrée aux
 * moments où on en mange. Le bandeau de lot le dit sur chaque occurrence, donc
 * personne ne peut le lire comme « refaire ce plat trois fois ».
 *
 * Les plats sans jour (portée « un jour ») tombent dans un groupe sans titre:
 * leur inventer « Lundi » serait une prescription d'horaire que le moteur n'a
 * pas faite.
 */
export function groupByDay(
  dishes: readonly GeneratedDish[],
  /**
   * L'ORDRE DU PLAN, et plus lundi→dimanche en dur.
   *
   * Le défaut, tel qu'il se voyait: une composition faite un MERCREDI remplit
   * `wed…sun` puis `mon, tue` — qui sont la semaine SUIVANTE. Parcourus dans
   * l'ordre du calendrier, ces deux-là arrivaient EN TÊTE du plan, et l'élève
   * ouvrait son écran sur ce qui ressemblait à deux jours déjà ratés.
   *
   * L'ordre vient donc de la composition (`stretchDayOrder`), pas du calendrier.
   * Par défaut on garde l'ordre calendaire, pour que les tests et tout appelant
   * qui n'a pas d'ancre gardent un comportement défini.
   */
  order: readonly string[] = DAY_TOKENS,
): Array<{ day: string | null; dishes: GeneratedDish[] }> {
  const groups = new Map<string, GeneratedDish[]>();
  const undated: GeneratedDish[] = [];

  // L'IDENTITÉ D'UN PLAT, pour ne pas l'afficher deux fois le même jour.
  //
  // Mesuré: sur une semaine en lots, le modèle émet le MÊME plat une fois par
  // jour couvert — trois entrées « Chicken quinoa veg bowl », chacune portant
  // `covers_days: [mon, tue, wed]`. Sans cette clé, l'expansion ci-dessous les
  // multiplierait entre elles: neuf cartes pour une seule session de cuisine.
  //
  // ⛔ L'ATTRIBUTION FAIT PARTIE DE L'IDENTITÉ (LOT 3, 2026-08-17), ET SON
  // ABSENCE A ÉTÉ MESURÉE. Sur `title|slot` seuls, un plat DÉDIÉ portant le
  // même titre que celui de la table — « Greek yogurt bowls » pour tout le
  // monde, « Greek yogurt bowls » pour Zoé avec sa part à elle — était jeté
  // ici, en silence, avant d'atteindre le moindre écran. Le foyer perdait donc
  // une assiette sur la seule case où deux bouches ne mangent PAS la même
  // chose, c'est-à-dire exactement le cas que la vue jour doit rendre lisible.
  // Deux plats attribués différemment ne sont pas le même plat.
  const identity = (dish: GeneratedDish) =>
    `${dish.title.trim().toLowerCase()}|${dish.slot ?? ""}|${dish.member_id ?? ""}`;

  const place = (token: string, dish: GeneratedDish) => {
    const list = groups.get(token) ?? [];
    if (!list.some((d) => identity(d) === identity(dish))) list.push(dish);
    groups.set(token, list);
  };

  for (const dish of dishes) {
    // UN PLAT EST PLACÉ SUR SON JOUR, ET C'EST TOUT.
    //
    // L'expansion sur plusieurs jours venait du lot: le MÊME plat s'affichait
    // sur chaque jour couvert. Les préparations l'ont rendue inutile — c'est la
    // PRÉPARATION qui nourrit plusieurs jours, et chaque jour a désormais son
    // propre plat, qui la cite. Une cuisson de poulet, quatre repas différents.
    if (!dish.day) {
      undated.push(dish);
      continue;
    }
    place(dish.day, dish);
  }

  const out: Array<{ day: string | null; dishes: GeneratedDish[] }> = [];
  if (undated.length > 0) out.push({ day: null, dishes: undated });
  for (const token of order) {
    const list = groups.get(token);
    if (list && list.length > 0) out.push({ day: token, dishes: list });
  }
  return out;
}

/** Un jour de la fenêtre, et ses plats. Vide = il ne porte pas de repas. */
export interface DayGroup {
  day: string | null;
  dishes: GeneratedDish[];
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LES JOURS QUI PORTENT QUELQUE CHOSE, MÊME SANS UN SEUL PLAT (D3, 2026-08-18).
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LE DÉFAUT, TEL QU'IL SE VOYAIT. `groupByDay` ne rend un jour que s'il a un
 * plat; la vue SEMAINE rend exactement ce qu'il lui donne. Un dimanche de
 * grosse cuisson — la session qui remplit le frigo de toute la semaine — mais
 * dont aucun repas n'est à lui, ne produisait AUCUN bloc: la session et la
 * vague de courses de ce jour-là étaient invisibles sur l'écran qu'on ouvre
 * pour savoir quoi faire. La vue JOUR, elle, traitait déjà ce cas.
 *
 * ── TRANCHÉ LE 2026-08-18 ────────────────────────────────────────────────
 * On affiche le jour dès qu'il porte une SESSION ou des COURSES. On cuisine le
 * dimanche pour la semaine, et cacher ce jour fait rater la session.
 *
 * ⚠️ ET PAS PLUS QUE ÇA. Un jour TOTALEMENT vide — ni plat, ni session, ni
 * courses — reste absent. Sinon la semaine se remplit de blocs qui ne disent
 * rien, et c'est exactement ce que la vue semaine existe pour éviter: elle est
 * là pour qu'on VOIE, pas pour qu'on fasse défiler sept titres muets.
 *
 * ⚠️ AUCUNE RÈGLE DE VAGUE ICI, ET AUCUNE JOINTURE DE DATE. L'appelant a déjà
 * les deux (`waveForDate` sur `windowDates`); ce module reçoit des JETONS de
 * jour, déjà résolus. Recalculer une vague ici recréerait le jumeau supprimé
 * le 2026-08-10.
 *
 * ⚠️ L'ORDRE ET LE GROUPE SANS JOUR NE BOUGENT PAS: l'ordre est celui du PLAN
 * (`order`), et le groupe `day: null` reste en tête — il vaut pour la fenêtre
 * entière.
 */
export function withDaysThatCarry(args: {
  /** Les groupes de `groupByDay`, tels quels. */
  groups: ReadonlyArray<DayGroup>;
  /** L'ordre du PLAN (`windowDayOrder`), jamais le calendrier. */
  order: readonly string[];
  /** Les jetons des jours qui portent une session de cuisine. */
  sessionDays: readonly string[];
  /**
   * Les jetons des jours où tombe une vague de courses VISIBLE.
   *
   * ⚠️ VISIBLE, PAS SEULEMENT ASSIGNÉE. Le bloc jour ne rend sa vague que si
   * elle a des articles (`wave.indices.length > 0`); une vague vide ferait
   * apparaître un jour dont le corps serait ensuite muet — c'est-à-dire le
   * bloc creux que cette fonction refuse de produire.
   */
  groceryDays: readonly string[];
}): DayGroup[] {
  const withDishes = new Map<string, DayGroup>();
  const out: DayGroup[] = [];
  for (const group of args.groups) {
    if (group.day === null) out.push(group);
    else withDishes.set(group.day, group);
  }
  for (const day of args.order) {
    const existing = withDishes.get(day);
    if (existing) {
      out.push(existing);
      continue;
    }
    const carries = args.sessionDays.includes(day) ||
      args.groceryDays.includes(day);
    // LE JOUR SANS PLAT MAIS QUI PORTE: un groupe VIDE, à sa place dans
    // l'ordre du plan. Le bloc jour sait déjà rendre ça — c'est ce que la vue
    // jour lui envoie depuis le premier jour.
    if (carries) out.push({ day, dishes: [] });
  }
  return out;
}

/**
 * Les articles groupés par rayon, dans l'ordre d'un magasin.
 *
 * Un rayon vide ne produit pas de titre: une liste de courses avec un « Frozen »
 * suivi de rien fait chercher un article qui n'existe pas.
 *
 * L'INDEX D'ORIGINE VOYAGE AVEC L'ARTICLE. C'est lui qui identifie une ligne
 * cochée — pas son terme, parce que deux rayons peuvent porter le même mot
 * (« lemon » en produce, « lemon juice » en pantry), et pas sa position dans le
 * groupe, qui change dès qu'on regroupe autrement.
 */
export function groupByAisle(
  items: readonly ShoppingItem[],
): Array<{ aisle: string; items: Array<{ item: ShoppingItem; index: number }> }> {
  const byAisle = new Map<string, Array<{ item: ShoppingItem; index: number }>>();
  items.forEach((item, index) => {
    // Un rayon hors vocabulaire tombe dans « other » plutôt que de créer un
    // groupe que l'ordre ci-dessous ne connaît pas — donc un article invisible.
    const aisle = (SHOPPING_AISLE_ORDER as readonly string[]).includes(item.aisle)
      ? item.aisle
      : "other";
    const list = byAisle.get(aisle) ?? [];
    list.push({ item, index });
    byAisle.set(aisle, list);
  });
  return SHOPPING_AISLE_ORDER
    .map((aisle) => ({ aisle, items: byAisle.get(aisle) ?? [] }))
    .filter((group) => group.items.length > 0);
}
