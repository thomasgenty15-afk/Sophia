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
    const groups = groupDayBySlot({ preparations: [],
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
    const [group] = groupDayBySlot({ preparations: [],
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
    const [group] = groupDayBySlot({ preparations: [],
      dishes: [dish({ title: named }), dish({ title: named, member_id: "mem-zoe" })],
      portions: [ZOE_AS_WRITTEN, KID],
    });
    expect(group.table).toHaveLength(1);
    expect(group.people).toHaveLength(1);
    expect(group.people[0].entries[0].dish.title).toBe(named);
  });

  it("un plat commun ne se répète JAMAIS sous une bouche", () => {
    const [group] = groupDayBySlot({ preparations: [],
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
    const [group] = groupDayBySlot({ preparations: [],
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
    const [group] = groupDayBySlot({ preparations: [],
      dishes: [dish(), dish({ member_id: "mem-zoe" })],
      portions: [],
    });
    expect(group.separated).toBe(false);
    expect(group.table).toHaveLength(1);
    expect(group.unnamed).toHaveLength(1);
  });
});

describe("LOT 3 · l'ordre des moments, et rien de perdu", () => {
  it("les moments sortent dans l'ordre de la JOURNÉE, pas dans celui du modèle", () => {
    const groups = groupDayBySlot({ preparations: [],
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
    const groups = groupDayBySlot({ preparations: [],
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
    const [group] = groupDayBySlot({ preparations: [],
      dishes: [bowls],
      portions: [zoeShare, kidShare],
    });
    expect(group.table[0].shares).toEqual([
      // LOT 4 — `boxGrams` est vide ici, et c'est le CAS QUI PASSE: aucune
      // préparation n'a de boîte dans cette fixture, donc la part reste la
      // phrase seule, exactement comme avant ce lot.
      { memberId: "mem-zoe", name: "Zoé", note: "2 portions of chicken", boxGrams: [] },
      {
        memberId: "mem-kid",
        name: "Kid",
        note: "1 small portion of chicken",
        boxGrams: [],
      },
    ]);
  });

  it("⚠️ LE SILENCE EST VOULU — un plat qui ne puise dans rien n'a aucune ligne", () => {
    // Le petit-déjeuner se fait de zéro: aucune bouche n'a de part pour lui.
    // Fabriquer « comme la table » ferait dire au moteur ce qu'il n'a pas dit.
    const [group] = groupDayBySlot({ preparations: [],
      dishes: [dish()],
      portions: [zoeShare, kidShare],
    });
    expect(group.table[0].shares).toEqual([]);
  });

  it("une bouche sans part pour CE lot n'a pas de ligne, les autres si", () => {
    const [group] = groupDayBySlot({ preparations: [],
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
    const [group] = groupDayBySlot({ preparations: [],
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
    const [group] = groupDayBySlot({ preparations: [],
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
    const [group] = groupDayBySlot({ preparations: [],
      dishes: [bowls],
      portions: [zoeShare, kidShare],
    });
    expect(group.table[0].shares.map((s) => s.name)).toEqual(["Zoé", "Kid"]);
  });

  it("⚠️ un plat dédié à une bouche que le plan ne nomme plus ne porte AUCUNE part", () => {
    // Aucune bouche nommée ne le mange; lui prêter les parts de la table
    // dirait de lui une chose fausse.
    const [group] = groupDayBySlot({ preparations: [],
      dishes: [{ ...bowls, member_id: "mem-parti" }],
      portions: [zoeShare, kidShare],
    });
    expect(group.unnamed[0].shares).toEqual([]);
  });
});
