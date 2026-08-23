import { describe, expect, it } from "vitest";

import { groupDayBySlot, SHARES_MIN_MOUTHS } from "./planDaySlots";
import type { GeneratedDish, MemberPortionView } from "../api/mealGeneration";

// ===========================================================================
// LOT 3 (2026-08-17) — LE MOMENT, ET QUI Y MANGE QUOI. MODÈLE PUR.
//
// ⚠️ LES FIXTURES PORTENT DES TITRES IDENTIQUES, ET AUCUN PRÉNOM UTILE.
// C'est délibéré: si un matcher de titre revenait un jour décider de
// l'attribution, ces tests tomberaient. « Jamais de matcher maison » est une
// cicatrice mesurée de ce dépôt (12 faux positifs sur 12), et le seul marqueur
// d'un plat dédié AVANT le lot C était « for Zoe » écrit dans son titre.
// ===========================================================================

const TABLE_DISH = "Greek yogurt bowls with peaches";

function dish(over: Partial<GeneratedDish> = {}): GeneratedDish {
  return {
    title: TABLE_DISH,
    slot: "breakfast",
    day: "fri",
    method: "Spoon the yogurt into bowls.",
    why: "",
    ingredients: [],
    uses: [],
    // ⚠️ `boxes: []` EST OBLIGATOIRE, ET LE `as GeneratedDish` PLUS BAS EST CE
    // QUI L'A CACHÉ: le cast fait taire tsc sur un champ manquant, et
    // `boxLinesForDish` lève alors un `TypeError` au montage — écran blanc.
    // Cette fixture ne met AUCUN contenant, exprès; mais elle doit le DIRE.
    boxes: [],
    same_day: null,
    member_id: null,
    ...over,
  } as GeneratedDish;
}

function person(over: Partial<MemberPortionView> = {}): MemberPortionView {
  return {
    memberId: "mem-zoe",
    displayName: "Zoé",
    portionNote: null,
    // ⚠️ `null` = elle n'a rien déclaré, donc elle suit la maison — le cas
    // nominal. Un test qui veut prouver qu'une bouche est ABSENTE d'un moment
    // le dit explicitement (`eatingSlots: ["lunch", "dinner"]`).
    eatingSlots: null,
    shares: [],
    ...over,
  };
}

const ZOE = person();
const KID = person({ memberId: "mem-kid", displayName: "Kid" });

describe("LOT 3 · la séparation d'un moment", () => {
  it("un seul plat commun ⇒ AUCUNE séparation, et le moment ne paie rien", () => {
    const [group] = groupDayBySlot({ preparations: [], dishes: [dish()], portions: [ZOE, KID] });
    expect(group.separated).toBe(false);
    expect(group.table).toHaveLength(1);
    expect(group.people).toHaveLength(0);
  });

  it("⛔ un plat de la table + un plat dédié ⇒ DEUX voies, nommées", () => {
    const groups = groupDayBySlot({
      dishes: [dish(), dish({ member_id: "mem-zoe" })],
      portions: [ZOE, KID],
    });
    expect(groups).toHaveLength(1);
    const [group] = groups;
    expect(group.separated).toBe(true);
    expect(group.table).toHaveLength(1);
    expect(group.people.map((p) => p.name)).toEqual(["Zoé"]);
    expect(group.people[0].entries).toHaveLength(1);
  });

  it("deux bouches, deux plats dédiés ⇒ une voie chacune, dans l'ordre du plan", () => {
    const [group] = groupDayBySlot({
      dishes: [dish({ member_id: "mem-kid" }), dish({ member_id: "mem-zoe" })],
      portions: [ZOE, KID],
    });
    // L'ordre est celui du PLAN (Kid d'abord), pas celui du roster (Zoé
    // d'abord): c'est l'ordre dans lequel le moment se lit.
    expect(group.people.map((p) => p.memberId)).toEqual(["mem-kid", "mem-zoe"]);
    expect(group.table).toHaveLength(0);
    expect(group.separated).toBe(true);
  });

  /**
   * ⛔ LE TEST QUI TOMBE SI UN MATCHER REVIENT.
   *
   * Les deux plats portent le MÊME titre, et ce titre nomme Zoé. Seul celui qui
   * porte `member_id` est le sien. Un lecteur qui déduirait l'attribution du
   * texte attribuerait les deux — ou attribuerait le mauvais.
   */
  it("⛔ le titre ne décide de RIEN — même titre, une seule attribution", () => {
    const named = "Greek yogurt bowls with peaches, granola and seeds for Zoe";
    // ⚠️ LE PRÉNOM DE LA FIXTURE EST ÉCRIT COMME DANS LE TITRE (« Zoe », sans
    // accent), ET C'EST NÉCESSAIRE. Avec « Zoé », un matcher de titre ne
    // trouverait rien et ce test resterait vert en ne prouvant RIEN — la
    // mutation ne mordait pas, mesuré le 2026-08-17.
    const ZOE_AS_WRITTEN = person({ displayName: "Zoe" });
    const [group] = groupDayBySlot({
      dishes: [dish({ title: named }), dish({ title: named, member_id: "mem-zoe" })],
      portions: [ZOE_AS_WRITTEN, KID],
    });
    expect(group.table).toHaveLength(1);
    expect(group.people).toHaveLength(1);
    expect(group.people[0].entries[0].dish.title).toBe(named);
  });

  it("un plat commun ne se répète JAMAIS sous une bouche", () => {
    const [group] = groupDayBySlot({
      dishes: [dish(), dish({ member_id: "mem-zoe" })],
      portions: [ZOE, KID],
    });
    // Zoé a SON plat, et le plat de la table n'est pas recopié chez elle:
    // l'affirmer serait une individualisation que le moteur n'a pas faite.
    const titlesUnderZoe = group.people[0].entries.map((e) => e.dish.title);
    expect(titlesUnderZoe).toHaveLength(1);
    // Et Kid, qui n'a pas de plat dédié, n'a AUCUNE voie: elle mange le plat
    // de la table, et une voie « Pour Kid » vide se lirait comme un oubli.
    expect(group.people.map((p) => p.memberId)).toEqual(["mem-zoe"]);
  });

  it("⚠️ une bouche que le plan ne nomme plus ne devient PAS « la table »", () => {
    const [group] = groupDayBySlot({
      dishes: [dish(), dish({ member_id: "mem-parti" })],
      portions: [ZOE, KID],
    });
    expect(group.table, "un plat attribué a rejoint la table").toHaveLength(1);
    expect(group.unnamed).toHaveLength(1);
    expect(group.people).toHaveLength(0);
    // Rien n'est perdu: deux plats entrent, deux plats sortent.
    expect(group.table.length + group.unnamed.length).toBe(2);
  });

  it("sans aucune part connue, tout se rend à plat — le chemin individuel", () => {
    const [group] = groupDayBySlot({
      dishes: [dish(), dish({ member_id: "mem-zoe" })],
      portions: [],
    });
    expect(group.separated).toBe(false);
    expect(group.table).toHaveLength(1);
    expect(group.unnamed).toHaveLength(1);
  });
});

// ===========================================================================
// 2026-08-19 — QUI MANGE CE PLAT, ET QUI EST « LA TABLE »
//
// Deux demandes du même jour, sur la même surface:
//   · « je comprends pas non plus "pour la table" » — l'en-tête commun le
//     disait même quand une bouche mangeait à part;
//   · « quand le repas est commun, il faudrait des genre de marqueur pour les
//     personnes » — un plat commun ne portait AUCUN prénom.
// ===========================================================================

describe("2026-08-19 · les marqueurs de bouche sous un plat", () => {
  it("un plat commun nomme TOUTES ses bouches, même sans part écrite", () => {
    // Le petit-déjeuner ne puise dans rien: `shares` est vide, et c'était tout
    // ce que le modèle savait dire. On ne pouvait donc pas savoir si le foyer
    // entier était servi ou si quelqu'un avait été oublié.
    const [group] = groupDayBySlot({
      dishes: [dish()],
      portions: [ZOE, KID],
    });
    expect(group.table[0].shares).toEqual([]);
    expect(group.table[0].eaters).toEqual([
      { memberId: "mem-zoe", name: "Zoé" },
      { memberId: "mem-kid", name: "Kid" },
    ]);
  });

  it("⛔ une bouche qui mange à part sort des marqueurs du plat commun", () => {
    // Même règle que C4 sur les parts: une bouche n'est servie qu'une fois.
    const [group] = groupDayBySlot({
      dishes: [dish(), dish({ member_id: "mem-zoe" })],
      portions: [ZOE, KID],
    });
    expect(group.table[0].eaters.map((e) => e.name)).toEqual(["Kid"]);
    expect(group.people[0].entries[0].eaters.map((e) => e.name)).toEqual(["Zoé"]);
  });

  it("⛔ à une seule bouche, AUCUN marqueur — et à deux, ils reviennent", () => {
    // « Pour Zoé » sur le plan d'une personne seule serait une évidence
    // répétée vingt fois par semaine. ⚠️ Le test compte des bouches
    // LITTÉRALES: monter `SHARES_MIN_MOUTHS` à 3 le fait tomber.
    const alone = groupDayBySlot({ preparations: [], dishes: [dish()], portions: [ZOE] });
    expect(alone[0].table[0].eaters).toEqual([]);
    const pair = groupDayBySlot({ preparations: [], dishes: [dish()], portions: [ZOE, KID] });
    expect(pair[0].table[0].eaters).toHaveLength(2);
  });

  it("⚠️ un plat dédié à une bouche que le plan ne nomme plus ne marque personne", () => {
    const [group] = groupDayBySlot({
      dishes: [dish({ member_id: "mem-parti" })],
      portions: [ZOE, KID],
    });
    expect(group.unnamed[0].eaters).toEqual([]);
  });
});

describe("2026-08-19 · une bouche n'est nommée qu'aux moments où elle mange", () => {
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * ⛔ LE CAS RÉEL, TEL QU'IL A ÉTÉ VU À L'ÉCRAN LE 2026-08-19.
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Foyer de deux. Christèle a déclaré déjeuner et dîner — pas de petit-déj.
   * Elle était pourtant marquée au PETIT-DÉJEUNER, à côté d'iku. Ses mots:
   * « on a dit qu'elle voulait pas prendre de petit déj : elle est marquée
   * pour le petit déj à côté de iku ».
   *
   * ⚠️ LES MOMENTS VIENNENT DU PLAN, pas d'une relecture du foyer: « il faut
   * que le plan respecte les créneaux renseignés AU MOMENT DE FAIRE LE PLAN ».
   */
  const CHRISTELE = person({
    memberId: "mem-c",
    displayName: "Christèle",
    eatingSlots: ["lunch", "dinner"],
  });
  const IKU = person({ memberId: "mem-i", displayName: "iku", eatingSlots: null });

  it("⛔ elle ne mange pas le matin ⇒ aucun marqueur au petit-déjeuner", () => {
    const [group] = groupDayBySlot({
      dishes: [dish({ slot: "breakfast" })],
      portions: [IKU, CHRISTELE],
    });
    expect(group.table[0].eaters.map((e) => e.name)).toEqual(["iku"]);
  });

  it("⚠️ LE CAS QUI PASSE — au dîner, elle est là", () => {
    // Sans ce cas, une règle qui l'effacerait de TOUS les repas ressemblerait
    // trait pour trait à la règle juste.
    const [group] = groupDayBySlot({
      dishes: [dish({ slot: "dinner" })],
      portions: [IKU, CHRISTELE],
    });
    expect(group.table[0].eaters.map((e) => e.name)).toEqual(["iku", "Christèle"]);
  });

  it("⛔ l'en-tête de la voie commune ne la nomme pas non plus", () => {
    const [group] = groupDayBySlot({
      dishes: [dish({ slot: "breakfast" })],
      portions: [IKU, CHRISTELE],
    });
    expect(group.tableEaters.map((e) => e.name)).toEqual(["iku"]);
    // ⚠️ ET « POUR LA TABLE » RESTE VRAI: à ce petit-déjeuner, iku EST toute
    // la tablée. Compter sur le roster entier ferait dire « iku » là où « la
    // table » est exact.
    expect(group.tableIsEveryone).toBe(true);
  });

  it("⚠️ `null` = elle suit la maison, et elle est partout où la maison mange", () => {
    // ⛔ ET SURTOUT PAS `[]`. Les deux se rendraient pareil si on les
    // confondait, et une bouche muette disparaîtrait de tous ses repas.
    const MUTE = person({ memberId: "mem-m", displayName: "Mute", eatingSlots: null });
    const groups = groupDayBySlot({
      dishes: [dish({ slot: "breakfast" }), dish({ slot: "dinner" })],
      portions: [IKU, MUTE],
    });
    for (const g of groups) {
      expect(g.table[0].eaters.map((e) => e.name)).toEqual(["iku", "Mute"]);
    }
  });

  it("⚠️ un plat SANS moment ne filtre personne", () => {
    // Des plans anciens en portent; répondre « personne ne mange ça » les
    // viderait.
    const [group] = groupDayBySlot({
      dishes: [dish({ slot: null })],
      portions: [IKU, CHRISTELE],
    });
    expect(group.table[0].eaters).toHaveLength(2);
  });
});

describe("2026-08-19 · deux plats de table au même moment ⇒ silence", () => {
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * ⛔ MESURÉ À L'ÉCRAN. Au déjeuner: « Poulet rôti, courgette, aubergine » ET
   * « Thon, tomates, concombre » — les deux SANS `member_id`. Les pastilles
   * ont nommé iku ET Christèle sous LES DEUX. Or iku mange le poulet: la
   * salade est le repas à part de Christèle, que le modèle n'a pas attribué.
   * L'écran affirmait donc que chacun mange deux déjeuners.
   *
   * « Sous thon tomates, il y avait marqué iku alors qu'il mange déjà Poulet
   * rôti, courgette, aubergine et pain. »
   */
  it("⛔ aucun marqueur quand deux plats communs se disputent le moment", () => {
    const [group] = groupDayBySlot({
      dishes: [
        dish({ slot: "lunch", title: "Poulet rôti" }),
        dish({ slot: "lunch", title: "Thon, tomates" }),
      ],
      portions: [ZOE, KID],
    });
    expect(group.table).toHaveLength(2);
    for (const entry of group.table) {
      expect(entry.eaters, `« ${entry.dish.title} » nomme quelqu'un`).toEqual([]);
    }
    // L'en-tête de voie non plus: deux réponses à « qui mange ce déjeuner »
    // seraient pires qu'aucune.
    expect(group.tableEaters).toEqual([]);
  });

  /**
   * ⚠️ LE CAS QUI PASSE, ET IL EST LE CHEMIN MAJORITAIRE. Sans lui, une règle
   * qui effacerait TOUS les marqueurs ressemblerait trait pour trait à la
   * règle juste.
   */
  it("⚠️ un seul plat commun ⇒ les marqueurs reviennent", () => {
    const [group] = groupDayBySlot({
      dishes: [dish({ slot: "lunch" })],
      portions: [ZOE, KID],
    });
    expect(group.table[0].eaters.map((e) => e.name)).toEqual(["Zoé", "Kid"]);
    expect(group.tableEaters).toHaveLength(2);
  });

  /**
   * ⚠️ ET UN PLAT ATTRIBUÉ NE REND RIEN AMBIGU. Un plat commun + le plat dédié
   * d'une bouche est exactement le cas que le lot 3 existe pour rendre
   * lisible: on sait qui mange quoi, donc on le dit.
   */
  it("⚠️ un commun + un DÉDIÉ reste nommé — l'ambiguïté vient des non-attribués", () => {
    const [group] = groupDayBySlot({
      dishes: [
        dish({ slot: "lunch" }),
        dish({ slot: "lunch", member_id: "mem-zoe" }),
      ],
      portions: [ZOE, KID],
    });
    expect(group.table[0].eaters.map((e) => e.name)).toEqual(["Kid"]);
    expect(group.people[0].entries[0].eaters.map((e) => e.name)).toEqual(["Zoé"]);
  });
});

describe("2026-08-19 · « pour la table » n'est dit que si la table entière y mange", () => {
  it("rien de dédié ⇒ tout le monde mange le plat commun", () => {
    const [group] = groupDayBySlot({
      dishes: [dish()],
      portions: [ZOE, KID],
    });
    expect(group.tableIsEveryone).toBe(true);
    expect(group.tableEaters.map((e) => e.name)).toEqual(["Zoé", "Kid"]);
  });

  it("⛔ une bouche à part ⇒ la casserole commune n'est PLUS la table", () => {
    // C'est le défaut mesuré: sur un foyer de deux, « pour la table »
    // désignait UNE personne.
    const [group] = groupDayBySlot({
      dishes: [dish(), dish({ member_id: "mem-zoe" })],
      portions: [ZOE, KID],
    });
    expect(group.tableIsEveryone).toBe(false);
    expect(group.tableEaters.map((e) => e.name)).toEqual(["Kid"]);
  });

  it("⚠️ chaque bouche à part ⇒ plus personne à nommer, et l'écran retombe sur « la table »", () => {
    const [group] = groupDayBySlot({
      dishes: [dish(), dish({ member_id: "mem-zoe" }), dish({ member_id: "mem-kid" })],
      portions: [ZOE, KID],
    });
    expect(group.tableEaters).toEqual([]);
    expect(group.tableIsEveryone).toBe(false);
  });

  it("⛔ sans part connue, on n'affirme RIEN — le chemin individuel", () => {
    const [group] = groupDayBySlot({
      dishes: [dish()],
      portions: [],
    });
    // ⚠️ `tableIsEveryone` DOIT être faux ici. Sans le membre `withShares` de
    // la condition, `0 === 0` le rendrait VRAI et l'écran affirmerait « pour
    // la table » sur un plan qui ne connaît aucune bouche.
    expect(group.tableIsEveryone).toBe(false);
    expect(group.tableEaters).toEqual([]);
  });
});

describe("LOT 3 · l'ordre des moments, et rien de perdu", () => {
  it("les moments sortent dans l'ordre de la JOURNÉE, pas dans celui du modèle", () => {
    const groups = groupDayBySlot({
      dishes: [
        dish({ slot: "dinner", title: "Chicken" }),
        dish({ slot: "breakfast", title: "Yogurt" }),
        dish({ slot: "lunch", title: "Wrap" }),
      ],
      portions: [],
    });
    expect(groups.map((g) => g.slot)).toEqual(["breakfast", "lunch", "dinner"]);
  });

  it("⚠️ un moment INCONNU passe en queue, et un plat sans moment ferme la marche", () => {
    // `snack` n'est plus proposé, et des plats en base le portent: l'écarter
    // ferait disparaître un plat d'un plan vivant.
    const groups = groupDayBySlot({
      dishes: [
        dish({ slot: "snack" as GeneratedDish["slot"], title: "Nuts" }),
        dish({ slot: null, title: "Water" }),
        dish({ slot: "dinner", title: "Chicken" }),
      ],
      portions: [],
    });
    expect(groups.map((g) => g.slot)).toEqual(["dinner", "snack", null]);
    const kept = groups.flatMap((g) => g.table.map((e) => e.dish.title));
    expect(kept.sort()).toEqual(["Chicken", "Nuts", "Water"]);
  });
});

describe("LOT 3 · les parts, sous le plat qu'elles servent", () => {
  const zoeShare = person({
    shares: [{ preparationId: "prep_chicken", note: "2 portions of chicken" }],
  });
  const kidShare = person({
    memberId: "mem-kid",
    displayName: "Kid",
    shares: [{ preparationId: "prep_chicken", note: "1 small portion of chicken" }],
  });
  const bowls = dish({
    slot: "dinner",
    title: "Chicken and rice bowls",
    uses: [{ preparation_id: "prep_chicken", servings: 1 }],
  });

  it("⛔ la part de chaque bouche se lit SOUS le plat, jointe par `preparation_id`", () => {
    const [group] = groupDayBySlot({
      dishes: [bowls],
      portions: [zoeShare, kidShare],
    });
    // ⛔ `toEqual` EXACT, ET C'EST LA CEINTURE DU 2026-08-20. La ligne portait
    // `boxGrams` — la part de cette bouche dans la boîte du repas, rendue à
    // côté de son prénom sur la carte du plat. v4 l'a retirée: le contenant EST
    // la portion, et un gramme au moment du repas ferait ressortir la balance à
    // table. Un `toMatchObject` laisserait ce champ revenir sans un rouge; ce
    // `toEqual`-ci refuse TOUT champ de plus sur une ligne de part.
    expect(group.table[0].shares).toEqual([
      { memberId: "mem-zoe", name: "Zoé", note: "2 portions of chicken" },
      { memberId: "mem-kid", name: "Kid", note: "1 small portion of chicken" },
    ]);
  });

  it("⛔ v4 — UN PLAT QUI PORTE DES CONTENANTS N'A PLUS DE PHRASE DE TABLE", () => {
    // ══════════════════════════════════════════════════════════════════════
    // CE QUI A ÉTÉ VU À L'ÉCRAN LE 2026-08-20, ET QUI A DÉCIDÉ.
    // ══════════════════════════════════════════════════════════════════════
    // Sous une carte dont le couvercle disait `iku — Vendredi Déjeuner` — UN
    // seul nom, donc la portion d'iku — la phrase de table écrivait
    // « Christèle : prendre la boîte PARTAGÉE avec iku ». Le nombre de noms
    // sur le couvercle EST le marqueur de v4, et la prose disait l'inverse.
    //
    // ⛔ CE N'EST PAS UNE RÉPÉTITION QU'ON RANGE, C'EST UNE SECONDE AUTORITÉ
    // QU'ON SUPPRIME: une phrase peut contredire un contenant sans qu'aucun
    // compteur ne bouge, et c'est elle qu'on croit — elle est en français.
    const [group] = groupDayBySlot({
      dishes: [{
        ...bowls,
        boxes: [{
          id: "box_fri_dinner_zoe",
          member_ids: ["mem-zoe"],
          items: [{ preparation_id: "prep_chicken", term: "poulet rôti", grams: 140 }],
          legacy_total_grams: null,
        }],
      }],
      portions: [zoeShare, kidShare],
    });
    expect(group.table[0].shares).toEqual([]);
    // ⚠️ ET LES PASTILLES DE PRÉNOMS RESTENT: « ce plat est-il pour moi ? » est
    // une autre question que « que dois-je faire », et le couvercle n'y répond
    // que pour ceux qu'il nomme.
    expect(group.table[0].eaters.map((e) => e.memberId)).toEqual(["mem-zoe", "mem-kid"]);
  });

  it("⚠️ ET SEULEMENT LÀ — sans contenant, la phrase reste la SEULE instruction", () => {
    // ⛔ LA MOITIÉ QUI EMPÊCHE LA GARDE D'AVALER TOUT LE MONDE. Un plat
    // cuisiné de zéro le jour même n'a aucun contenant: retirer sa phrase
    // rendrait le jour muet sur qui prend quoi. Sans ce cas, un filtre cassé
    // qui viderait TOUTES les parts passerait pour un filtre qui marche.
    const [group] = groupDayBySlot({
      dishes: [bowls],
      portions: [zoeShare, kidShare],
    });
    expect(group.table[0].shares.map((s) => s.memberId)).toEqual(["mem-zoe", "mem-kid"]);
  });

  it("⚠️ LE SILENCE EST VOULU — un plat qui ne puise dans rien n'a aucune ligne", () => {
    // Le petit-déjeuner se fait de zéro: aucune bouche n'a de part pour lui.
    // Fabriquer « comme la table » ferait dire au moteur ce qu'il n'a pas dit.
    const [group] = groupDayBySlot({
      dishes: [dish()],
      portions: [zoeShare, kidShare],
    });
    expect(group.table[0].shares).toEqual([]);
  });

  it("une bouche sans part pour CE lot n'a pas de ligne, les autres si", () => {
    const [group] = groupDayBySlot({
      dishes: [bowls],
      portions: [zoeShare, person({ memberId: "mem-kid", displayName: "Kid" })],
    });
    expect(group.table[0].shares.map((s) => s.memberId)).toEqual(["mem-zoe"]);
  });

  /**
   * ⛔ LE PLANCHER DE DEUX BOUCHES, ET SON CAS QUI PASSE.
   *
   * « Qui mange quoi » n'a pas de sujet à une seule bouche, et la composition à
   * 1 est le chemin majoritaire du produit. Même plancher que `PlanByPerson`.
   * ⚠️ LE TEST N'EST PAS PARAMÉTRÉ PAR LA CONSTANTE: il compte des bouches
   * littérales (1, puis 2). Monter `SHARES_MIN_MOUTHS` à 3 le fait tomber.
   */
  it("⛔ à une seule bouche, aucune part — et à deux, elles reviennent", () => {
    const alone = groupDayBySlot({ preparations: [], dishes: [bowls], portions: [zoeShare] });
    expect(alone[0].table[0].shares, "une part récitée à une seule bouche")
      .toEqual([]);
    const pair = groupDayBySlot({ preparations: [], dishes: [bowls], portions: [zoeShare, kidShare] });
    expect(pair[0].table[0].shares.length, "le plancher bloque tout").toBe(2);
    // Le plancher est bien celui que le module publie, et il vaut deux.
    expect(SHARES_MIN_MOUTHS).toBe(2);
  });

  it("un plat DÉDIÉ porte la part du lot qu'il prélève, pour SA bouche", () => {
    const [group] = groupDayBySlot({
      dishes: [{ ...bowls, member_id: "mem-zoe" }],
      portions: [zoeShare, kidShare],
    });
    expect(group.people[0].entries[0].shares.map((s) => s.name)).toEqual(["Zoé"]);
  });

  /**
   * ══════════════════════════════════════════════════════════════════════
   * ⛔ C4 — LA PART SUIT L'ASSIETTE (défaut trouvé À L'ÉCRAN le 2026-08-17).
   * ══════════════════════════════════════════════════════════════════════
   *
   * Sur un plan réel qui porte un plat dédié, les deux sous-blocs récitaient
   * les MÊMES quatre bouches: « pour la table » nommait Paul, qui mange son
   * plat à lui juste en dessous, et « pour Paul » nommait Lea, Tom et Nina,
   * qui n'y touchent pas. Le moment demandait de servir tout le monde deux
   * fois — la ligne C4 exactement, sur la seule case que ce lot rend lisible.
   *
   * ⚠️ CE TEST AVAIT UN JUMEAU QUI DISAIT LE CONTRAIRE, et il a été CORRIGÉ,
   * pas contourné (juste au-dessus): il exigeait « Zoé, Kid » sous le plat de
   * Zoé. Il avait tort, de la même façon exactement que le test de
   * `buildPersonWeek` corrigé par le troisième commit de ce lot.
   */
  it("⛔ au moment où une bouche a SON plat, elle sort des parts de la table", () => {
    const [group] = groupDayBySlot({
      dishes: [bowls, { ...bowls, title: "Zoé's bowl", member_id: "mem-zoe" }],
      portions: [zoeShare, kidShare],
    });
    expect(group.separated).toBe(true);
    expect(group.table[0].shares.map((s) => s.name), "Zoé est servie deux fois")
      .toEqual(["Kid"]);
    expect(group.people[0].entries[0].shares.map((s) => s.name), "Kid est servi deux fois")
      .toEqual(["Zoé"]);
  });

  it("⚠️ LE CAS QUI PASSE — sans plat dédié, la table garde TOUTES ses parts", () => {
    // Sans ce cas, une règle qui couperait toutes les parts ressemblerait
    // trait pour trait à la règle juste: c'est le chemin majoritaire.
    const [group] = groupDayBySlot({
      dishes: [bowls],
      portions: [zoeShare, kidShare],
    });
    expect(group.table[0].shares.map((s) => s.name)).toEqual(["Zoé", "Kid"]);
  });

  it("⚠️ un plat dédié à une bouche que le plan ne nomme plus ne porte AUCUNE part", () => {
    // Aucune bouche nommée ne le mange; lui prêter les parts de la table
    // dirait de lui une chose fausse.
    const [group] = groupDayBySlot({
      dishes: [{ ...bowls, member_id: "mem-parti" }],
      portions: [zoeShare, kidShare],
    });
    expect(group.unnamed[0].shares).toEqual([]);
  });
});
