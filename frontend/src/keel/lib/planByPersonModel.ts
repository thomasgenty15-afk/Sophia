import type { HouseholdDishView, MemberPortionView } from "../api/household";
import { EATING_OCCASIONS } from "../api/mealGeneration";

/**
 * UN PLAN PAR PERSONNE — LE MODÈLE. Pur, sans React, donc testable sans rendu.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ON NE CALCULE RIEN, ET C'EST TOUT LE LOT.
 *
 * « Quand le maître crée le plan, ça crée automatiquement le plan pour le
 * compte réclamé en prenant ses datas » — c'est déjà le cas, et depuis
 * toujours. `member_portions` porte un objet PAR BOUCHE, calculé sur SES
 * données (corps, objectif résolu, allergies, rythme), par
 * `_shared/keel/household_portions.ts` au moment de la composition. Il n'y
 * avait rien à calculer: il n'y avait qu'un écran manquant.
 *
 * ZÉRO APPEL MODÈLE PASSE PAR CE MODULE, SUR AUCUN CHEMIN. Aucune I/O, aucune
 * horloge, aucun aléa, aucun `t()`.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── LE FAIT QUI DÉCIDE DE LA FORME, ET IL EST CONTRE-INTUITIF ─────────────
 * Deux bouches sans profil réclamé mangent LE MÊME PLAT. La divergence est
 * dans la PART, jamais dans le plat: un plat dédié n'existe que par l'échelle
 * de fusion (`household_merge.ts::mergeLadder`), qui exige un titulaire ayant
 * pris la main. Empiler N grilles de plats identiques aurait donc rendu N
 * copies du même tableau.
 *
 * D'où la forme: LE PLAT RESTE COMMUN, ET UNE LIGNE PAR BOUCHE PORTE CE QUI
 * DIFFÈRE. C'est la seule mise en page qui dise la vérité du moteur.
 *
 * ── LA JOINTURE, ET POURQUOI ELLE VAUT PLUS QUE LA NOTE GÉNÉRALE ──────────
 * `member_portions[].preparation_shares[]` est indexé par `preparation_id`, et
 * `dish.uses[]` porte les mêmes `id`. La part affichée dans une case est donc
 * celle de LA PRÉPARATION QUE CE PLAT-LÀ SERT — pas la phrase générale du
 * membre, qui serait la même dans les vingt-six cases et ne dirait plus rien.
 *
 * Mesuré en base le 2026-08-14 (plan `3cc7915d`, foyer de deux):
 *   ILi       · prep_chicken_bowls · « Take a bigger portion of chicken… »
 *   Christèle · prep_chicken_bowls · « Take a balanced bowl of chicken… »
 * Les deux lignes ne sont donc PAS jumelles: c'est ce qui rend cette vue utile
 * plutôt que décorative.
 *
 * ── ⛔ CE QUI N'ENTRE JAMAIS DANS CE MODULE ───────────────────────────────
 * Aucun objectif, aucun poids, aucune calorie, aucun « pourquoi » de part. La
 * ceinture est STRUCTURELLE et pas disciplinaire: les deux seuls types
 * d'entrée sont `MemberPortionView` (bouche, prénom, instruction de service,
 * parts) et `HouseholdDishView` (titre, jour, moment, `uses`). AUCUN des deux
 * ne porte de champ où un objectif pourrait passer. Un mineur n'a donc pas
 * d'objectif affiché parce qu'il n'y a nulle part où en mettre un.
 *
 * `portion_note` et les notes de part sont des INSTRUCTIONS DE SERVICE,
 * garanties sans motif ni vocabulaire de corps par `sanitizePortionNote` côté
 * serveur — c'est précisément ce qui permet de les afficher devant toute la
 * table. ⚠️ L'INSTRUCTION EST PUBLIQUE, LE MOTIF QUI LA PRODUIT NE L'EST PAS.
 * (Règle recopiée de l'en-tête de `TableCard.tsx`, supprimée le 2026-08-14:
 * une règle dont le seul porteur disparaît est une règle qu'on redécouvrira
 * par un incident.)
 */

/** Ce qu'une bouche prend, pour un plat donné. */
export interface PersonCell {
  /**
   * Sa part, telle que le moteur l'a écrite. `null` = ce plat ne puise dans
   * aucune préparation pour laquelle cette bouche a une part, donc rien de
   * particulier à dire: elle sert comme le reste de la table.
   *
   * ⚠️ `null` RESTE `null` JUSQU'À L'ÉCRAN, ET L'ÉCRAN N'ÉCRIT RIEN. Fabriquer
   * ici une phrase de repli (« comme la table ») ferait dire au MOTEUR une
   * chose qu'il n'a pas dite, et remplirait vingt cases d'une même ligne que
   * plus personne ne lirait.
   */
  note: string | null;
  /**
   * ══════════════════════════════════════════════════════════════════════
   * LOT C — SON PLAT À ELLE, quand le plan lui en a composé un. `null` = elle
   * mange le plat de la table, et c'est le cas nominal.
   * ══════════════════════════════════════════════════════════════════════
   *
   * ⛔ CE CHAMP EST LA RÉPONSE AU TROU MESURÉ LE 2026-08-14. Un plat dédié ne
   * portait AUCUNE attribution: cette vue montrait donc le petit-déjeuner de
   * Zoé — « Greek yogurt bowls … for Zoe » — dans la ligne de Kid, et dans
   * celle de tout le monde. Depuis le lot C, le moteur pose `member_id` à la
   * CRÉATION du plat, et cette case le lit.
   *
   * ⚠️ IL PORTE UN TITRE, ET SEULEMENT UN TITRE. La règle d'en-tête ne bouge
   * pas: ni objectif, ni « pourquoi », ni ingrédient. Un titre de plat est déjà
   * lisible par tout le foyer (policy `student_generated_meals_household_read`).
   *
   * ⚠️ ET IL NE REMPLACE PAS `note`. Les deux peuvent coexister: quelqu'un a son
   * plat à elle ET une part écrite pour un lot que ce plat prélève. Les fondre
   * en un seul champ obligerait l'écran à deviner lequel il regarde.
   */
  ownDish: string | null;
}

/** Une bouche, et sa ligne à travers la semaine. */
export interface PersonRow {
  memberId: string;
  displayName: string;
  /**
   * Son instruction de service générale. `null` = part standard.
   * ⚠️ Elle n'est PAS répétée dans les cases: la même phrase vingt-six fois
   * cesse d'être lue. Elle a sa place dans la vue individuelle.
   */
  portionNote: string | null;
  /** Une case par jour, même longueur et même ordre que `days`. */
  cells: PersonCell[];
}

/** Un moment de la journée, et ce que chacun y prend. */
export interface SlotGroup {
  slot: string;
  /**
   * Le plat COMMUN, une case par jour. `null` = rien de composé ce jour-là à
   * ce moment. ⚠️ Une seule ligne, parce qu'il n'y a qu'un plat: le répéter
   * sous chaque bouche affirmerait une individualisation qui n'existe pas.
   */
  dishes: (string | null)[];
  /** Une ligne par bouche, dans l'ordre de `member_portions`. */
  people: PersonRow[];
}

export interface PlanByPersonModel {
  /** Les jours, dans l'ordre du PLAN (jamais du calendrier). */
  days: string[];
  groups: SlotGroup[];
}

/**
 * LA VUE PARALLÈLE.
 *
 * ── LES LIGNES DE MOMENT VIENNENT DES PLATS, PAS D'UN RYTHME DÉCLARÉ ──────
 * `PlanGrid` lit le rythme de l'élève parce qu'elle rend SON plan et que ses
 * moments sont une déclaration à respecter. Ici on rend le plan du FOYER, dont
 * les bouches n'ont pas toutes un rythme lisible (une bouche sans compte n'a
 * aucune ligne `student_goals`). Prendre le rythme du maître ferait afficher
 * des lignes vides pour les moments qu'il ne prend pas, et manquer ceux que le
 * plan a réellement remplis. Les moments RENDUS sont donc ceux que le plan
 * REMPLIT, dans l'ordre canonique de `EATING_OCCASIONS`.
 *
 * ⚠️ UN MOMENT INCONNU N'EST PAS JETÉ. Des plats déjà en base portent `snack`,
 * un jeton qui n'est plus proposé (voir l'en-tête d'`EATING_OCCASIONS`). Les
 * écarter ferait disparaître des plats d'un plan vivant; ils passent donc en
 * queue, dans leur ordre d'apparition.
 */
export function buildPlanByPerson(args: {
  /** Les jours de la fenêtre, DANS L'ORDRE DU PLAN. */
  days: readonly string[];
  /** Les plats du plan du foyer. */
  dishes: readonly HouseholdDishView[];
  /** `member_portions` — une entrée par bouche. */
  portions: readonly MemberPortionView[];
}): PlanByPersonModel {
  const days = [...args.days];
  if (days.length === 0 || args.portions.length === 0) {
    return { days: [], groups: [] };
  }

  // LE PLAT D'UN JOUR À UN MOMENT. Un plat en lot est DÉJÀ étendu sur chacun
  // des jours qu'il couvre par le moteur, donc il n'y a rien à répliquer ici:
  // le refaire produirait deux expansions du même plan, qui divergeraient.
  const byKey = new Map<string, HouseholdDishView>();
  /**
   * LOT C — LE PLAT DÉDIÉ D'UNE BOUCHE, PAR CASE. Clé `slot|day|memberId`.
   *
   * ⚠️ DEUX TABLES ET PAS UNE, ET C'EST TOUT LE LOT. Avant, un seul `byKey`
   * gardait le PREMIER plat de la case — ce qui était juste tant qu'un plan
   * n'en portait qu'un. Depuis les barreaux ② et ③, une case dédiée en porte
   * DEUX: celui de la table et celui d'une bouche. Le « premier arrivé » aurait
   * pu être l'un ou l'autre, au hasard de l'ordre du modèle, et la ligne « le
   * plat » aurait affiché le plat d'une personne à toute la table.
   */
  const ownByKey = new Map<string, HouseholdDishView>();
  const slotsSeen: string[] = [];
  for (const dish of args.dishes) {
    if (!dish.day || !dish.slot) continue;
    if (!days.includes(dish.day)) continue;
    if (!slotsSeen.includes(dish.slot)) slotsSeen.push(dish.slot);
    const key = `${dish.slot}|${dish.day}`;
    // ── LOT C · UN PLAT ATTRIBUÉ NE VA PAS DANS LA LIGNE COMMUNE ──────────
    // Il est rangé sous SA bouche, et il ne concourt plus pour la case de la
    // table. Sans cette séparation, le plat de Zoé pouvait devenir « le plat »
    // du vendredi pour tout le monde.
    if (dish.memberId !== null) {
      const own = `${key}|${dish.memberId}`;
      if (!ownByKey.has(own)) ownByKey.set(own, dish);
      continue;
    }
    // PREMIER ARRIVÉ, PREMIER SERVI. Deux plats COMMUNS sur le même créneau du
    // même jour n'existent pas dans un plan sain; si ça arrive, en rendre un
    // est une réponse, en rendre deux dans une case en est une autre — et la
    // seconde ferait grandir la case sans que personne ne sache pourquoi.
    if (!byKey.has(key)) byKey.set(key, dish);
  }

  const known = EATING_OCCASIONS.filter((s) =>
    (slotsSeen as readonly string[]).includes(s)
  );
  const unknown = slotsSeen.filter((s) => !(EATING_OCCASIONS as readonly string[]).includes(s));
  const slots: string[] = [...known, ...unknown];

  const groups = slots.map((slot): SlotGroup => {
    const dishes = days.map((day) => byKey.get(`${slot}|${day}`)?.title ?? null);
    return {
      slot,
      dishes,
      people: args.portions.map((p): PersonRow => ({
        memberId: p.memberId,
        displayName: p.displayName,
        portionNote: p.portionNote,
        cells: days.map((day): PersonCell => {
          // ── LOT C · SON PLAT À ELLE D'ABORD ────────────────────────────
          // Quand le plan lui a composé un plat, c'est CE plat qu'elle mange —
          // pas une part du plat commun. Sa part de lot reste lue derrière:
          // un plat dédié peut lui aussi prélever sur une préparation.
          const own = ownByKey.get(`${slot}|${day}|${p.memberId}`) ?? null;
          const shared = byKey.get(`${slot}|${day}`) ?? null;
          const from = own ?? shared;
          if (!from) return { note: null, ownDish: null };
          return { note: shareFor(p, from), ownDish: own?.title ?? null };
        }),
      })),
    };
  });

  return { days, groups };
}

/**
 * LA PART DE CETTE BOUCHE POUR CE PLAT-LÀ — ou `null`.
 *
 * ⚠️ LE PREMIER LOT QUI MATCHE, ET PAS UNE CONCATÉNATION. Un plat peut puiser
 * dans trois préparations (poulet, riz, légumes); coller les trois notes
 * ferait, dans une case de tableau, un paragraphe que personne ne lit. Les
 * notes du moteur décrivent d'ailleurs déjà l'assiette entière — mesuré:
 * « Take a bigger portion of chicken, rice, and vegetables » est la note du
 * SEUL `prep_chicken_bowls`. Prendre la première dans l'ordre du plat suit
 * l'ordre dans lequel le moteur les a écrites.
 */
export function shareFor(
  person: Pick<MemberPortionView, "shares">,
  dish: Pick<HouseholdDishView, "uses">,
): string | null {
  for (const id of dish.uses) {
    const found = person.shares.find((s) => s.preparationId === id);
    if (found) return found.note;
  }
  return null;
}

/**
 * LA VUE INDIVIDUELLE — la semaine d'UNE bouche, jour par jour.
 *
 * ── POURQUOI ELLE N'EST PAS UN FILTRE DE LA PRÉCÉDENTE ────────────────────
 * La vue parallèle répond à « qui mange quoi », donc elle compare et elle
 * tait la phrase générale. Celle-ci répond à « qu'est-ce que je mange », donc
 * elle porte d'abord l'instruction de service générale de la personne — la
 * phrase qu'on lit à voix haute en servant — puis sa semaine. Deux questions,
 * deux ordres de lecture.
 */
export interface PersonDay {
  day: string;
  dishes: Array<{ slot: string; title: string; note: string | null }>;
}

export function buildPersonWeek(args: {
  days: readonly string[];
  dishes: readonly HouseholdDishView[];
  person: MemberPortionView;
}): PersonDay[] {
  const order = (slot: string) => {
    const at = (EATING_OCCASIONS as readonly string[]).indexOf(slot);
    // Les moments inconnus passent en queue, jamais devant le petit déjeuner.
    return at < 0 ? EATING_OCCASIONS.length : at;
  };
  return args.days.map((day) => {
    const here = args.dishes.filter((d) => d.day === day && d.slot);
    /**
     * ══════════════════════════════════════════════════════════════════════
     * LOT 3 — LES MOMENTS OÙ ELLE A SON PLAT À ELLE.
     * ══════════════════════════════════════════════════════════════════════
     *
     * ⛔ SON PLAT REMPLACE CELUI DE LA TABLE, IL NE S'Y AJOUTE PAS. Sans cette
     * ligne, la semaine de Zoé montrait DEUX petits-déjeuners au vendredi: le
     * plat commun ET le sien. C'est la ligne C4 de la grille de cohérence —
     * « au moment M, chaque bouche a soit le plat commun, soit son plat dédié,
     * jamais zéro, jamais deux » — et c'est aussi ce que `buildPlanByPerson`
     * répond DÉJÀ, dix lignes plus haut (`own ?? shared`). Deux fonctions du
     * même module donnaient donc deux réponses à la même question; celle qu'on
     * lisait le moins gagnait sur l'écran individuel.
     *
     * ⚠️ CE N'EST PAS UNE DÉDUCTION SUR LE TITRE, ni sur le contenu: c'est la
     * seule lecture de `member_id`, posé par le moteur.
     */
    const ownSlots = new Set(
      here.filter((d) => d.memberId === args.person.memberId).map((d) => d.slot),
    );
    return {
    day,
    dishes: here
      // ══════════════════════════════════════════════════════════════════
      // LOT C — LE PLAT D'UN AUTRE NE FIGURE PAS DANS SA SEMAINE.
      // ══════════════════════════════════════════════════════════════════
      //
      // ⛔ C'EST LE DÉFAUT MESURÉ LE 2026-08-14, CITÉ TEL QUEL: la semaine de
      // Kid affichait « Greek yogurt bowls with peaches, granola and seeds »
      // ET « … for Zoe » juste en dessous. Le second est le plat DÉDIÉ de Zoé,
      // produit par le barreau ②, et rien ne permettait de le savoir — le plat
      // ne portait aucune attribution, et le seul marqueur était « for Zoe »
      // écrit dans son titre.
      //
      // `memberId === null` = le plat de la table, donc il est à elle aussi.
      // Un plat attribué à quelqu'un d'autre sort de sa semaine.
      .filter((d) => d.memberId === null || d.memberId === args.person.memberId)
      // C4 — le plat de la table sort de SON assiette au moment où elle a le
      // sien. Les autres moments ne bougent pas: le plat commun y reste le
      // sien aussi.
      .filter((d) => d.memberId !== null || !ownSlots.has(d.slot))
      .sort((a, b) => order(a.slot ?? "") - order(b.slot ?? ""))
      .map((d) => ({
        slot: d.slot ?? "",
        title: d.title,
        note: shareFor(args.person, d),
      })),
    };
  }).filter((d) => d.dishes.length > 0);
}
