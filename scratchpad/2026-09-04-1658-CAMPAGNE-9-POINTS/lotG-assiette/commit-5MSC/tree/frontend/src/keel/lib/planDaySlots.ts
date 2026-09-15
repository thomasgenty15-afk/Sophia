import {
  EATING_OCCASIONS,
  type GeneratedDish,
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

/**
 * UNE BOUCHE QUI MANGE CE PLAT — le prénom, et rien de plus.
 *
 * ── POURQUOI CE CHAMP EXISTE À CÔTÉ DE `shares` ───────────────────────────
 * `shares` ne porte que les bouches qui ont quelque chose de PARTICULIER à
 * faire (une part écrite par le moteur). C'est la bonne liste pour une
 * instruction, et la mauvaise pour la question « ce plat, il est pour moi
 * aussi ? » — demandée le 2026-08-19: « quand le repas est commun, il faudrait
 * des genre de marqueur pour les personnes ».
 *
 * ⚠️ `eaters` EST UN SUR-ENSEMBLE DE `shares`, PAR CONSTRUCTION: les deux
 * sortent du même `eatsHere`, `shares` y ajoutant seulement le filtre « la part
 * est écrite ». Deux prédicats séparés auraient pu diverger et faire porter un
 * grammage à quelqu'un qui n'est pas à ce plat-là.
 *
 * ⛔ UN PRÉNOM ET UN IDENTIFIANT. Aucun objectif, aucun corps, aucune calorie —
 * même ceinture structurelle que `DayShareLine`.
 */
export interface DayEaterMark {
  memberId: string;
  /** Le prénom, tel que la ligne membre l'écrit. Jamais traduit. */
  name: string;
}

/** Ce qu'une bouche prend d'un plat. Vide = rien de particulier à dire. */
export interface DayShareLine {
  memberId: string;
  /** Le prénom, tel que la ligne membre l'écrit. Jamais traduit. */
  name: string;
  note: string;
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
  /**
   * TOUTES les bouches qui mangent ce plat, part écrite ou non.
   *
   * `[]` sous le plancher de deux bouches (rien à marquer quand il n'y a qu'une
   * assiette) et sur un plat dédié à une bouche que le plan ne nomme plus.
   */
  eaters: DayEaterMark[];
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
  /**
   * ══════════════════════════════════════════════════════════════════════
   * QUI MANGE LES PLATS DE `table` À CE MOMENT-LÀ.
   * ══════════════════════════════════════════════════════════════════════
   *
   * ── LE DÉFAUT QUE CE CHAMP FERME (2026-08-19) ────────────────────────
   * L'en-tête de la voie commune disait « Pour la table » MÊME quand une
   * bouche mangeait son plat à elle deux centimètres plus bas. Sur un foyer
   * de deux, « pour la table » désignait donc UNE personne, et l'écran
   * affirmait un partage qui n'avait pas lieu. Signalé: « je comprends pas
   * non plus "pour la table" ».
   *
   * ⚠️ C'EST LE MÊME `eatsHere` QUE LES PARTS, remonté au MOMENT. Le C4 a
   * déjà tranché que « la part suit l'assiette »; l'en-tête disait encore
   * l'inverse au-dessus des parts qui, elles, avaient raison.
   *
   * `[]` sous le plancher de deux bouches, ou quand chaque bouche nommée a
   * son plat — et alors l'écran retombe sur « Pour la table », qui reste
   * VRAI au sens littéral (`member_id === null`) faute de savoir nommer
   * mieux.
   */
  tableEaters: DayEaterMark[];
  /**
   * VRAI quand `tableEaters` couvre TOUTES les bouches nommées du plan.
   *
   * ⛔ C'EST LA SEULE CONDITION QUI AUTORISE « POUR LA TABLE » COMME UNE
   * AFFIRMATION. Partout ailleurs le mot est un repli, pas un fait.
   */
  tableIsEveryone: boolean;
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
  // ⛔ `preparations` A DISPARU DE CETTE SIGNATURE LE 2026-08-19, ET C'EST LE
  // LOT. Elle n'était là que pour retrouver la boîte qu'une reprise CITAIT
  // (`uses[].box_id` → `preparations[].boxes[].id`). Le repas porte désormais sa
  // boîte: le plat suffit, et un paramètre que plus personne ne lit est un
  // paramètre qui ment sur ce dont cette fonction a besoin.
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
  /**
   * ══════════════════════════════════════════════════════════════════════
   * ⛔ ET ELLE MANGE-T-ELLE À CE MOMENT-LÀ ? (2026-08-19)
   * ══════════════════════════════════════════════════════════════════════
   *
   * Défaut mesuré à l'écran: Christèle a déclaré déjeuner et dîner, et elle se
   * lisait au PETIT-DÉJEUNER à côté d'iku. La question n'était posée nulle
   * part — ni pour les marqueurs, ni pour les parts.
   *
   * ⚠️ LES MOMENTS VIENNENT DU PLAN (`member_portions[].eating_slots`), pas
   * d'une relecture du foyer: « il faut que le plan respecte les créneaux
   * renseignés AU MOMENT DE FAIRE LE PLAN ».
   *
   * ⚠️ `null` = elle suit la maison, ET IL N'Y A RIEN À ALLER CHERCHER POUR LE
   * SAVOIR. Les moments de ce jour SONT ceux de la maison — un plat existe à
   * ce créneau parce que la maison y mange. Passer un « rythme de la maison »
   * en paramètre ferait une seconde source pour une question à laquelle les
   * plats répondent déjà, et les deux divergeraient.
   *
   * ⚠️ UN PLAT SANS MOMENT NE FILTRE PERSONNE. `slot === null` existe sur des
   * plans anciens; y répondre « personne ne mange ça » les viderait.
   */
  const eatsAtSlot = (
    portion: MemberPortionView,
    slot: string | null,
  ): boolean =>
    slot === null || portion.eatingSlots === null ||
    portion.eatingSlots.includes(slot);

  /**
   * ══════════════════════════════════════════════════════════════════════
   * ⛔ DEUX PLATS DE TABLE AU MÊME MOMENT: ON NE SAIT PAS QUI MANGE QUOI.
   * ══════════════════════════════════════════════════════════════════════
   *
   * Mesuré à l'écran le 2026-08-19: au déjeuner, « Poulet rôti, courgette,
   * aubergine » ET « Thon, tomates, concombre » — les deux sans `member_id`.
   * Les marqueurs ont nommé iku ET Christèle sous LES DEUX. Or iku mange le
   * poulet: la salade est le repas à part de Christèle, que le modèle n'a pas
   * attribué. L'écran affirmait donc que chacun mange deux déjeuners.
   *
   * ⚠️ LE SILENCE EST LA SEULE RÉPONSE JUSTE. On peut nommer les mangeurs d'un
   * plat commun quand il est LE plat commun de ce moment; dès qu'il y en a
   * deux et qu'aucun ne porte de propriétaire, l'information n'existe pas —
   * et la fabriquer était pire que de se taire.
   *
   * ⚠️ CE N'EST PAS UN REPLI SUR L'ANCIEN COMPORTEMENT: les parts explicites
   * du modèle (`shares`) continuent de sortir, elles. Ce qu'on retire est
   * l'affirmation DÉDUITE, pas ce que le moteur a écrit.
   */
  const tableIsAmbiguous = (dish: GeneratedDish, tableDishesHere: number) =>
    dish.member_id === null && tableDishesHere > 1;

  const eatsHere = (
    portion: MemberPortionView,
    dish: GeneratedDish,
    ownersHere: ReadonlySet<string>,
  ): boolean =>
    eatsAtSlot(portion, dish.slot ?? null) &&
    (dish.member_id === null
      ? !ownersHere.has(portion.memberId)
      : dish.member_id === portion.memberId);

  const eatersOf = (
    dish: GeneratedDish,
    ownersHere: ReadonlySet<string>,
    tableDishesHere: number,
  ): DayEaterMark[] =>
    withShares && !tableIsAmbiguous(dish, tableDishesHere)
      ? args.portions
        // ⚠️ LE MÊME PRÉDICAT QUE LES PARTS, APPELÉ — pas recopié. Un second
        // « qui mange ici » écrit à côté aurait fini par marquer un prénom sous
        // un plat dont la part, juste dessous, dit qu'il n'est pas pour lui.
        .filter((p) => eatsHere(p, dish, ownersHere))
        .map((p) => ({ memberId: p.memberId, name: p.displayName }))
      : [];

  const entryFor = (
    dish: GeneratedDish,
    ownersHere: ReadonlySet<string>,
    tableDishesHere: number,
  ): DayDishEntry => ({
    dish,
    eaters: eatersOf(dish, ownersHere, tableDishesHere),
    // ══════════════════════════════════════════════════════════════════════
    // ⛔ UN PLAT QUI PORTE DES CONTENANTS NE PORTE PLUS DE PHRASE DE TABLE
    //    (v4, 2026-08-20)
    // ══════════════════════════════════════════════════════════════════════
    //
    // ── CE QU'ON A VU À L'ÉCRAN, ET QUI A DÉCIDÉ ───────────────────────────
    // Sous une carte dont le couvercle disait `iku — Vendredi Déjeuner —
    // Poulet rôti…` — UN seul nom, donc la portion d'iku — la phrase de table
    // écrivait « Christèle : prendre la boîte PARTAGÉE avec iku ». Les deux ne
    // peuvent pas être vraies: le nombre de noms sur le couvercle EST le
    // marqueur de v4, et la prose disait l'inverse. C'est la prose qu'on
    // croit, parce qu'elle est en français.
    //
    // ⛔ CE N'EST DONC PAS UNE RÉPÉTITION QU'ON RANGE, C'EST UNE SECONDE
    // AUTORITÉ QU'ON SUPPRIME. Le défaut « deux autorités sur un même nombre »
    // est déjà fermé pour les GRAMMES (`boxGrams`, retiré quinze lignes plus
    // bas); il restait ouvert pour la PHRASE, qui peut contredire un couvercle
    // sans qu'aucun compteur ne bouge.
    //
    // ⚠️ ET LA RÉPÉTITION ÉTAIT RÉELLE, ELLE AUSSI. Sur un repas en boîtes,
    // trois surfaces disaient le même geste: `same_day` + `method` (« sortir la
    // boîte et la réchauffer »), la ligne des contenants (qui, quel jour, quel
    // plat), puis cette phrase. `portion_note` était le SEUL endroit qui disait
    // qui prend quoi avant v4; le contenant le dit désormais, avec le nom
    // dessus.
    //
    // ⚠️ CE QUE ÇA COÛTE, ÉCRIT ICI POUR QUE PERSONNE NE LE REDÉCOUVRE: une
    // note qui portait autre chose que le service — un échange, « sans la
    // sauce », une cuisson à part — tombe avec elle sur ces plats-là. Le vrai
    // correctif est dans le brief, qui réclame encore une INSTRUCTION DE
    // SERVICE; tant qu'il la réclame, le modèle l'écrit et elle répète. Ce
    // filtre-ci est la moitié écran, et il est réversible d'une ligne.
    //
    // ⛔ ET IL NE TOUCHE QUE LES PLATS EN BOÎTES. Un plat cuisiné de zéro le
    // jour même n'a aucun contenant: sa phrase de table reste la SEULE chose
    // qui dit qui prend quoi, et la retirer là rendrait le jour muet.
    // `PlanByPerson` et `MyShareCard` ne sont pas touchés — ce sont des vues
    // PAR BOUCHE, où la note est le sujet et non une annotation sous un plat.
    shares: withShares && dish.boxes.length === 0
      ? args.portions
        .filter((p) => eatsHere(p, dish, ownersHere))
        // ⚠️ LA JOINTURE EST CELLE DE `PlanByPerson`, APPELÉE — pas recopiée.
        // `shareFor` prend les `preparation_id` d'un plat; ceux-ci sont dans
        // `uses[]`, sous une autre forme que côté foyer (`{preparation_id,
        // servings}` contre des `id` nus). On lui donne les ids, on ne
        // réécrit pas sa règle.
        // ⛔ PLUS AUCUN GRAMME SUR CETTE LIGNE — v4, 2026-08-20. Elle portait
        // `boxGrams`: la part de cette bouche dans la boîte du repas, affichée
        // à côté de son prénom sur la carte du plat. Deux raisons de la
        // retirer, et la seconde suffit à elle seule:
        //   ① LE CHAMP N'EXISTE PLUS. v4 ne découpe plus un bac en parts par
        //      personne — un contenant partagé porte UNE quantité, celle du bac.
        //      Il n'y a littéralement plus rien à chercher par `member_id`.
        //   ② LE GRAMME N'A PLUS LE DROIT D'ÊTRE ICI. Le contenant EST la
        //      portion; réafficher un chiffre au moment du repas ferait
        //      ressortir la balance à table, ce que le protocole des boîtes
        //      existe pour supprimer. Le détail vit dans le Boxing.
        .map((p) => ({
          memberId: p.memberId,
          name: p.displayName,
          note: shareFor(p, { uses: dish.uses.map((u) => u.preparation_id) }),
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
    // COMBIEN DE PLATS SANS PROPRIÉTAIRE À CE MOMENT — compté AVANT de rendre,
    // parce que la réponse porte sur le MOMENT et pas sur un plat: c'est
    // l'existence d'un second plat de table qui rend le premier ambigu.
    const tableDishesHere =
      here.filter((d) => d.member_id === null).length;
    const table: DayDishEntry[] = [];
    const unnamedDishes: DayDishEntry[] = [];
    const people: DayPersonBlock[] = [];
    const blockOf = new Map<string, DayPersonBlock>();
    for (const dish of here) {
      const entry = entryFor(dish, ownersHere, tableDishesHere);
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
    // QUI MANGE LA CASSEROLE COMMUNE À CE MOMENT — le complément exact des
    // bouches qui ont leur plat à elles, dans l'ordre du roster. Calculé au
    // MOMENT et une seule fois: deux plats communs du même moment ne peuvent
    // pas nourrir deux tablées différentes.
    const tableEaters = withShares
      ? args.portions
        // ⛔ LE MÊME `eatsAtSlot` QUE LES MARQUEURS. Sans lui, l'en-tête de la
        // voie commune nommerait quelqu'un que les pastilles juste dessous ne
        // nomment pas — deux réponses à « qui mange ce petit-déjeuner ».
        // ⛔ ET MUET DÈS QU'IL Y A DEUX PLATS DE TABLE au même moment: on ne
        // sait alors pas qui mange lequel, et l'en-tête nommerait tout le monde
        // au-dessus des deux. Même règle que les pastilles, même raison.
        .filter((p) =>
          tableDishesHere <= 1 && !ownersHere.has(p.memberId) &&
          eatsAtSlot(p, slot)
        )
        .map((p) => ({ memberId: p.memberId, name: p.displayName }))
      : [];
    return {
      slot,
      table,
      people,
      unnamed: unnamedDishes,
      separated: people.length > 0,
      tableEaters,
      // ⚠️ « TOUTES » SE COMPTE SUR LE ROSTER, PAS SUR `tableEaters` NON VIDE.
      // Sans le second membre, un moment où une seule des trois bouches mange
      // le plat commun se dirait encore « pour la table ».
      // ⚠️ « TOUTES » SE COMPTE SUR LES BOUCHES QUI MANGENT À CE MOMENT, pas
      // sur le roster entier: à un petit-déjeuner que seul iku prend, il EST
      // toute la tablée, et « Pour la table » est alors exact.
      tableIsEveryone: withShares &&
        tableEaters.length ===
          args.portions.filter((p) => eatsAtSlot(p, slot)).length,
    };
  });
}
