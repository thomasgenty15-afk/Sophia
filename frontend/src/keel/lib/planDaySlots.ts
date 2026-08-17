import {
  EATING_OCCASIONS,
  type GeneratedDish,
  type MealPreparation,
  type MemberPortionView,
} from "../api/mealGeneration";
import { shareFor } from "./planByPersonModel";

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT 3 — UN JOUR, MOMENT PAR MOMENT, ET QUI MANGE QUOI À CHACUN. PUR.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * La demande, mot pour mot (2026-08-17): « dans le cas où c'est un foyer et
 * que 2 personnes ne mangent pas le même plat, alors il faut une séparation
 * claire de ce qu'il y a à préparer pour les deux plats ».
 *
 * ── CE QUI DÉCIDE, ET CE QUI NE DÉCIDE JAMAIS ────────────────────────────
 * L'attribution vient de `dish.member_id`, posé par le MOTEUR à la création
 * du plat (lot C du 2026-08-15), et de rien d'autre. Le prénom vient de
 * `member_portions[].display_name`, que le moteur recopie de la LIGNE MEMBRE
 * au moment de composer (F5, `household_portions.ts:1376`).
 *
 * ⛔ AUCUNE LECTURE DE TITRE, NULLE PART. Avant le lot C, le seul marqueur
 * d'un plat dédié était « for Zoe » écrit dans son titre par le modèle. Un
 * matcher se serait trompé dès « Chicken for Zoe and Marc » et n'aurait rien
 * trouvé dès que le plan sort en français — « jamais de matcher maison », 12
 * faux positifs sur 12 mesurés dans ce dépôt.
 *
 * ── UNE SEULE JOINTURE VERS LES PARTS ────────────────────────────────────
 * `shareFor` (`planByPersonModel.ts`) est la SEULE façon de relier une bouche
 * à ce qu'elle prend d'un plat, ici comme dans la vue « qui mange quoi ».
 * Deux dérivations du même plan divergent au premier correctif, et ici la
 * divergence se lirait comme deux réponses à « combien j'en mets ».
 *
 * ── ⛔ CE QU'ON N'AFFIRME PAS ────────────────────────────────────────────
 * Un plat COMMUN ne se répète pas sous chaque bouche. Le moteur ne compose
 * qu'un plat pour la table quand rien ne diverge, et le recopier sous trois
 * prénoms affirmerait une individualisation qu'il n'a pas faite (option
 * rejetée n°3 du rapport du 2026-08-14). Une case sans part est un silence
 * voulu: pas de « comme la table » répété.
 *
 * ── ⛔ CE QUI N'ENTRE JAMAIS DANS CE MODULE ──────────────────────────────
 * Aucun objectif, aucun poids, aucune calorie, aucun « pourquoi » de part. La
 * ceinture est STRUCTURELLE: les seules valeurs qui sortent d'ici sont un
 * prénom, un identifiant de bouche, une instruction de service, et le plat
 * lui-même — tel qu'il est déjà rendu par `DishCard`. Les instructions de
 * service sont garanties sans motif ni vocabulaire de corps par
 * `sanitizePortionNote` côté serveur; c'est ce qui autorise à les poser
 * devant toute la table. ⚠️ L'INSTRUCTION EST PUBLIQUE, LE MOTIF QUI LA
 * PRODUIT NE L'EST PAS.
 */

/** Ce qu'une bouche prend d'un plat. Vide = rien de particulier à dire. */
export interface DayShareLine {
  memberId: string;
  /** Le prénom, tel que la ligne membre l'écrit. Jamais traduit. */
  name: string;
  note: string;
  /**
   * LOT 4 — LES GRAMMES DES BOÎTES QUE CE PLAT CITE ET QUI SONT À CETTE BOUCHE.
   *
   * ⛔ C'EST LA MOITIÉ QUI REND LA PART EXÉCUTABLE. La note dit « ta part de
   * poulet »; la boîte dit COMBIEN, et elle le dit sans faire ressortir la
   * balance — la seule pesée de la semaine a eu lieu à la session de cuisine.
   *
   * ⚠️ UN TABLEAU, PAS UN NOMBRE. Un plat peut puiser dans DEUX lots boîtés (le
   * poulet et le riz), et chacun a sa boîte pour cette bouche. Les additionner
   * rendrait un nombre qui ne correspond à aucun couvercle; n'en garder qu'un
   * ferait disparaître l'autre en silence. Ils sont dans l'ordre des `uses`.
   *
   * `[]` = ce plat ne cite aucune boîte qui soit à elle, et l'écran se tait —
   * le cas de tout plan écrit avant le 2026-08-17.
   *
   * ⛔ DES GRAMMES D'ALIMENT, ET RIEN D'AUTRE. Ce champ est un nombre de
   * grammes dans une boîte, du même côté de la frontière que « 400 g de cuisses
   * de poulet » sur une liste de courses (F7/F8). Aucun objectif, aucun corps,
   * aucune calorie ne peut structurellement passer par là.
   */
  boxGrams: number[];
}

/** Un plat du jour, et ce que chacun en prend. */
export interface DayDishEntry {
  dish: GeneratedDish;
  /**
   * Une ligne par bouche qui a une part écrite pour ce plat-là. `[]` = aucune
   * bouche ne diverge, et l'écran se tait — c'est le cas majoritaire, et il ne
   * paie rien.
   */
  shares: DayShareLine[];
}

/** Les plats d'UNE bouche à ce moment-là. */
export interface DayPersonBlock {
  memberId: string;
  name: string;
  entries: DayDishEntry[];
}

/** Un moment du jour, et la séparation qu'il demande — ou pas. */
export interface DaySlotGroup {
  /** Le jeton du moment. `null` = plat sans moment (des plans anciens en ont). */
  slot: string | null;
  /** Les plats de la table — `member_id === null`. */
  table: DayDishEntry[];
  /** Un bloc par bouche nommée qui a son plat à elle, dans l'ordre du plan. */
  people: DayPersonBlock[];
  /**
   * Les plats attribués à une bouche que `portions` NE NOMME PAS (la ligne
   * membre a disparu depuis la composition). Ils se rendent tels quels, sans
   * étiquette: les ranger sous « pour la table » dirait d'eux une chose fausse,
   * et inventer un prénom serait pire. Le silence est la seule réponse juste.
   */
  unnamed: DayDishEntry[];
  /**
   * VRAI quand au moins une bouche a son plat à elle à ce moment-là. C'est ce
   * qui déclenche les sous-blocs; sans ça le moment se rend à plat, comme
   * avant ce lot.
   */
  separated: boolean;
}

/**
 * ⛔ LE PLANCHER DES PARTS — DEUX BOUCHES.
 *
 * « Qui mange quoi » n'a pas de sujet à une seule bouche, et la composition à 1
 * est le chemin MAJORITAIRE du produit. Même plancher que `PlanByPerson`, et
 * c'est voulu: deux surfaces qui répondent à la même question ne peuvent pas
 * répondre à partir de deux seuils.
 */
export const SHARES_MIN_MOUTHS = 2;

export function groupDayBySlot(args: {
  /** Les plats de CE jour, dans l'ordre du plan. */
  dishes: readonly GeneratedDish[];
  /**
   * `member_portions` DU PLAN RENDU. `[]` = plan individuel, ou lecteur qui
   * n'a pas à voir les parts — et alors ni prénom ni part ne sortent d'ici.
   */
  portions: readonly MemberPortionView[];
  /**
   * LOT 4 — LES PRÉPARATIONS DU PLAN, POUR LES BOÎTES QU'UN PLAT CITE.
   *
   * ⚠️ REQUISE, `[]` pour « aucune », jamais `T?`. « Paramètre de garde
   * optionnel = garde désarmée » est une cicatrice de ce dépôt, et elle vaut ici
   * telle quelle: un `?` n'aurait fait remonter AUCUN appelant au compilateur,
   * aucune part n'aurait jamais montré ses grammes, et le lot serait
   * construit-branché-désarmé sans un seul rouge.
   *
   * `[]` = plan sans préparation, ou lecteur qui n'en a pas — et alors aucune
   * part ne porte de grammes, ce que ces plans-là étaient déjà.
   */
  preparations: readonly MealPreparation[];
}): DaySlotGroup[] {
  const named = new Map(args.portions.map((p) => [p.memberId, p]));
  // LE PLANCHER, APPLIQUÉ UNE FOIS ET AU MODÈLE. Le mettre à l'écran en
  // ferait une règle d'affichage qu'un second écran oublierait.
  const withShares = args.portions.length >= SHARES_MIN_MOUTHS;

  /**
   * ══════════════════════════════════════════════════════════════════════
   * C4 — LA PART SUIT L'ASSIETTE. UNE BOUCHE N'EST SERVIE QU'UNE FOIS.
   * ══════════════════════════════════════════════════════════════════════
   *
   * ⛔ MESURÉ À L'ÉCRAN LE 2026-08-17, sur un plan qui porte un plat dédié.
   * Les parts étaient calculées sur TOUTES les bouches, pour TOUS les plats:
   * au dîner du jeudi, la voie « pour la table » disait « Paul — une pleine
   * portion » alors que Paul mange son plat à lui deux centimètres plus bas,
   * et la voie « pour Paul » disait « Lea, Tom, Nina — … » sous un plat
   * qu'aucune des trois ne touche. Les deux sous-blocs demandaient donc de
   * servir tout le monde DEUX FOIS, sur la seule case que ce lot existe pour
   * rendre lisible.
   *
   * ⚠️ C'EST LA MÊME QUESTION QUE `buildPersonWeek`, ET IL FAUT LA MÊME
   * RÉPONSE. Ce lot a corrigé là-bas « son plat REMPLACE celui de la table »;
   * ici la part faisait encore l'inverse. Deux fonctions du même lot qui
   * répondent différemment à « Paul mange-t-il le plat de la table ce
   * soir ? » est exactement ce qui produit les incidents de ce dépôt.
   *
   * ⚠️ UN PLAT DÉDIÉ À UNE BOUCHE QUE LE PLAN NE NOMME PLUS ne porte alors
   * AUCUNE ligne: aucune bouche nommée ne le mange, et lui prêter les parts
   * de la table dirait de lui une chose fausse. Le silence est juste ici
   * aussi.
   */
  const eatsHere = (
    memberId: string,
    dish: GeneratedDish,
    ownersHere: ReadonlySet<string>,
  ): boolean =>
    dish.member_id === null
      ? !ownersHere.has(memberId)
      : dish.member_id === memberId;

  const entryFor = (
    dish: GeneratedDish,
    ownersHere: ReadonlySet<string>,
  ): DayDishEntry => ({
    dish,
    shares: withShares
      ? args.portions
        .filter((p) => eatsHere(p.memberId, dish, ownersHere))
        // ⚠️ LA JOINTURE EST CELLE DE `PlanByPerson`, APPELÉE — pas recopiée.
        // `shareFor` prend les `preparation_id` d'un plat; ceux-ci sont dans
        // `uses[]`, sous une autre forme que côté foyer (`{preparation_id,
        // servings}` contre des `id` nus). On lui donne les ids, on ne
        // réécrit pas sa règle.
        .map((p) => ({
          memberId: p.memberId,
          name: p.displayName,
          note: shareFor(p, { uses: dish.uses.map((u) => u.preparation_id) }),
          // ── LOT 4 · LES BOÎTES DE CETTE BOUCHE, CITÉES PAR CE PLAT ──────
          // ⛔ LA JOINTURE EST DOUBLE, ET ELLE EST TOUJOURS PAR ID: le plat
          // cite un `box_id`, la boîte liste des `member_ids`. Aucun titre,
          // aucun prénom cherché dans une phrase — « jamais de matcher
          // maison », et ici une erreur ferait servir 75 g à la place de 200.
          boxGrams: dish.uses.flatMap((u) => {
            if (!u.box_id) return [];
            for (const prep of args.preparations) {
              const box = prep.boxes.find((b) => b.id === u.box_id);
              if (box) return box.member_ids.includes(p.memberId) ? [box.grams] : [];
            }
            return [];
          }),
        }))
        // `null` RESTE `null`, ET L'ÉCRAN N'ÉCRIT RIEN À LA PLACE. Fabriquer
        // « comme la table » ferait dire au moteur une chose qu'il n'a pas
        // dite, et remplirait le jour d'une ligne que plus personne ne lit.
        .filter((line): line is DayShareLine => line.note !== null)
      : [],
  });

  // ── L'ORDRE DES MOMENTS ─────────────────────────────────────────────────
  // Celui de la journée (`EATING_OCCASIONS`), et pas celui où le modèle a
  // écrit ses plats: c'est déjà l'ordre des deux listes plates du foyer
  // (`dishListByDay`) et celui de la vue « qui mange quoi ». Trois surfaces
  // qui montrent le même jour dans trois ordres seraient trois jours.
  // ⚠️ UN MOMENT INCONNU N'EST PAS JETÉ. Des plats en base portent `snack`, un
  // jeton qui n'est plus proposé; les écarter ferait disparaître des plats
  // d'un plan vivant. Ils passent en queue, dans leur ordre d'apparition, et
  // les plats sans moment ferment la marche.
  const seen: Array<string | null> = [];
  for (const dish of args.dishes) {
    const slot = dish.slot ?? null;
    if (!seen.some((s) => s === slot)) seen.push(slot);
  }
  const known = EATING_OCCASIONS.filter((s) =>
    seen.some((seenSlot) => seenSlot === s)
  ) as readonly (string | null)[];
  const unknown = seen.filter((s) =>
    s !== null && !(EATING_OCCASIONS as readonly string[]).includes(s)
  );
  const slots: Array<string | null> = [
    ...known,
    ...unknown,
    ...(seen.some((s) => s === null) ? [null] : []),
  ];

  return slots.map((slot): DaySlotGroup => {
    const here = args.dishes.filter((d) => (d.slot ?? null) === slot);
    // C4 — LES BOUCHES QUI ONT LEUR PLAT À ELLES À CE MOMENT-LÀ. Calculé une
    // fois pour le moment, pas plat par plat: la question « Paul mange-t-il le
    // plat de la table ce soir ? » se pose au MOMENT, et deux plats du même
    // moment ne peuvent pas y répondre différemment.
    const ownersHere = new Set(
      here.map((d) => d.member_id).filter((id): id is string => id !== null),
    );
    const table: DayDishEntry[] = [];
    const unnamedDishes: DayDishEntry[] = [];
    const people: DayPersonBlock[] = [];
    const blockOf = new Map<string, DayPersonBlock>();
    for (const dish of here) {
      const entry = entryFor(dish, ownersHere);
      if (dish.member_id === null) {
        table.push(entry);
        continue;
      }
      const person = named.get(dish.member_id);
      if (!person) {
        unnamedDishes.push(entry);
        continue;
      }
      // L'ORDRE DES BLOCS EST CELUI DU PLAN, pas celui du roster: c'est
      // l'ordre dans lequel le moment se lit, et une bouche sans plat dédié
      // n'a rien à faire dans cette liste (elle mange le plat de la table).
      let block = blockOf.get(person.memberId);
      if (!block) {
        block = { memberId: person.memberId, name: person.displayName, entries: [] };
        blockOf.set(person.memberId, block);
        people.push(block);
      }
      block.entries.push(entry);
    }
    return {
      slot,
      table,
      people,
      unnamed: unnamedDishes,
      separated: people.length > 0,
    };
  });
}
