import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { HouseholdDishView, MemberPortionView } from "../api/household";
import { buildPersonWeek, buildPlanByPerson, shareFor } from "./planByPersonModel";

/**
 * « QUI MANGE QUOI » — CE QUI DÉCIDE SI CETTE VUE A DE LA VALEUR.
 *
 * ⚠️ LE FAIT QUI PORTE TOUT CE FICHIER, ET IL A ÉTÉ MESURÉ AVANT D'ÉCRIRE UNE
 * LIGNE D'ÉCRAN: deux bouches sans profil réclamé mangent LE MÊME PLAT. La
 * divergence est dans la PART. Si les `portion_note` et les
 * `preparation_shares` étaient génériques, cette vue rendrait deux lignes
 * JUMELLES — correcte, et inutile.
 *
 * Mesuré en base le 2026-08-14 (plan `3cc7915d`, foyer de deux, objectifs
 * divergents), les notes citées telles quelles:
 *   ILi       · prep_chicken_bowls · « Take a bigger portion of chicken, rice,
 *                                      and vegetables. »
 *   Christèle · prep_chicken_bowls · « Take a balanced bowl of chicken, rice,
 *                                      and vegetables. »
 * Le moteur fait donc son travail, et le test le plus important de ce fichier
 * est celui qui PROUVE que deux bouches ne rendent pas la même case.
 */

const DISHES: HouseholdDishView[] = [
  {
    title: "Chicken rice bowls with roasted vegetables",
    day: "fri",
    slot: "dinner",
    uses: ["prep_chicken_bowls"],
    memberId: null,
  },
  {
    title: "Chicken rice bowls with roasted vegetables",
    day: "sat",
    slot: "dinner",
    uses: ["prep_chicken_bowls"],
    memberId: null,
  },
  // ⚠️ UN PLAT SANS LOT. C'est le cas qui décide s'il faut fabriquer une phrase
  // de repli, et la réponse est non.
  { title: "Apple and nuts", day: "fri", slot: "snack_pm", uses: [], memberId: null },
];

const PORTIONS: MemberPortionView[] = [
  {
    memberId: "m-ili",
    displayName: "ILi",
    portionNote: "Serve a larger share of the protein and starch.",
    shares: [
      {
        preparationId: "prep_chicken_bowls",
        note: "Take a bigger portion of chicken, rice, and vegetables.",
      },
    ],
  },
  {
    memberId: "m-chris",
    displayName: "Christèle",
    portionNote: "Serve a balanced share of every component.",
    shares: [
      {
        preparationId: "prep_chicken_bowls",
        note: "Take a balanced bowl of chicken, rice, and vegetables.",
      },
    ],
  },
];

describe("la vue parallèle", () => {
  const model = buildPlanByPerson({
    days: ["fri", "sat"],
    dishes: DISHES,
    portions: PORTIONS,
  });

  it("le plat commun n'apparaît QU'UNE FOIS par moment, pas sous chaque bouche", () => {
    const dinner = model.groups.find((g) => g.slot === "dinner");
    expect(dinner?.dishes).toEqual([
      "Chicken rice bowls with roasted vegetables",
      "Chicken rice bowls with roasted vegetables",
    ]);
    // Les lignes de bouche ne portent PAS de titre: elles n'ont que des parts.
    // Répéter l'intitulé affirmerait une individualisation du plat qui n'existe
    // pas dans le moteur.
    expect(Object.keys(dinner?.people[0] ?? {}).sort()).toEqual(
      ["cells", "displayName", "memberId", "portionNote"],
    );
  });

  it("une ligne par bouche, dans l'ordre de `member_portions`", () => {
    for (const group of model.groups) {
      expect(group.people.map((p) => p.displayName)).toEqual(["ILi", "Christèle"]);
    }
  });

  /**
   * ⛔ LE TEST QUI DÉCIDE SI CE LOT VALAIT LA PEINE.
   *
   * Deux lignes visuellement identiques rendraient la vue inutile — alors même
   * qu'elle serait correcte. Ce test échoue le jour où la jointure retombe sur
   * la note générale, ou sur rien: les deux défauts produiraient des jumelles.
   */
  it("deux bouches ne rendent PAS la même case — c'est toute la valeur de la vue", () => {
    const dinner = model.groups.find((g) => g.slot === "dinner");
    const [ili, chris] = dinner?.people ?? [];
    expect(ili.cells[0].note).toBe(
      "Take a bigger portion of chicken, rice, and vegetables.",
    );
    expect(chris.cells[0].note).toBe(
      "Take a balanced bowl of chicken, rice, and vegetables.",
    );
    expect(ili.cells[0].note).not.toBe(chris.cells[0].note);
  });

  it("un plat sans lot ne fabrique aucune phrase — la case reste vide", () => {
    const snack = model.groups.find((g) => g.slot === "snack_pm");
    expect(snack?.people.map((p) => p.cells[0].note)).toEqual([null, null]);
    // Et le jour où le plat n'existe pas non plus (samedi), c'est vide aussi,
    // sans le confondre avec « rien de particulier »: le titre est `null`.
    expect(snack?.dishes[1]).toBeNull();
  });

  it("les moments suivent l'ordre canonique, jamais l'ordre d'apparition", () => {
    // `snack_pm` apparaît en DERNIER dans `DISHES` et doit sortir AVANT
    // `dinner`: sans ça, la grille lirait le goûter après le dîner.
    expect(model.groups.map((g) => g.slot)).toEqual(["snack_pm", "dinner"]);
  });

  it("un moment inconnu n'est pas jeté, il passe en queue", () => {
    // Des plats déjà en base portent `snack`, un jeton qui n'est plus proposé.
    // Les écarter ferait disparaître des plats d'un plan VIVANT.
    const withLegacy = buildPlanByPerson({
      days: ["fri"],
      dishes: [
        ...DISHES,
        { title: "Legacy snack", day: "fri", slot: "snack", uses: [] },
      ],
      portions: PORTIONS,
    });
    expect(withLegacy.groups.map((g) => g.slot)).toEqual(["snack_pm", "dinner", "snack"]);
  });

  it("sans bouche ou sans jour, le modèle est vide — pas d'état vide fabriqué", () => {
    expect(buildPlanByPerson({ days: [], dishes: DISHES, portions: PORTIONS }).groups)
      .toEqual([]);
    expect(buildPlanByPerson({ days: ["fri"], dishes: DISHES, portions: [] }).groups)
      .toEqual([]);
  });

  it("un plat hors de la fenêtre ne crée pas de colonne fantôme", () => {
    const model2 = buildPlanByPerson({
      days: ["fri"],
      dishes: [...DISHES, { title: "Ghost", day: "wed", slot: "lunch", uses: [] }],
      portions: PORTIONS,
    });
    expect(model2.days).toEqual(["fri"]);
    expect(model2.groups.map((g) => g.slot)).not.toContain("lunch");
  });
});

describe("la jointure plat → part", () => {
  it("prend le PREMIER lot qui matche, pas une concaténation", () => {
    const person = {
      shares: [
        { preparationId: "prep_rice", note: "More rice." },
        { preparationId: "prep_chicken", note: "More chicken." },
      ],
    };
    // L'ordre du PLAT décide, pas l'ordre des parts: `prep_chicken` est cité
    // en premier par le plat.
    expect(shareFor(person, { uses: ["prep_chicken", "prep_rice"] }))
      .toBe("More chicken.");
  });

  it("aucun lot connu ⇒ `null`, jamais une phrase de repli", () => {
    expect(shareFor({ shares: [] }, { uses: ["prep_x"] })).toBeNull();
    expect(shareFor(PORTIONS[0], { uses: [] })).toBeNull();
  });
});

describe("la vue individuelle", () => {
  it("rend la semaine d'UNE bouche, ses moments dans l'ordre canonique", () => {
    const week = buildPersonWeek({
      days: ["fri", "sat"],
      dishes: DISHES,
      person: PORTIONS[0],
    });
    expect(week.map((d) => d.day)).toEqual(["fri", "sat"]);
    expect(week[0].dishes.map((d) => d.slot)).toEqual(["snack_pm", "dinner"]);
    expect(week[0].dishes[1].note).toBe(
      "Take a bigger portion of chicken, rice, and vegetables.",
    );
    // Le goûter n'a pas de part: rien, et pas une phrase inventée.
    expect(week[0].dishes[0].note).toBeNull();
  });

  it("un jour sans plat ne rend pas une journée vide", () => {
    const week = buildPersonWeek({
      days: ["fri", "sun"],
      dishes: DISHES,
      person: PORTIONS[0],
    });
    expect(week.map((d) => d.day)).toEqual(["fri"]);
  });
});

/**
 * LES GARDES D'AFFICHAGE SE TESTENT, PARCE QU'ELLES SONT DES RÈGLES PRODUIT.
 *
 * Un plan de foyer se lit À TABLE, devant tout le monde. Une carte qui affiche
 * l'objectif de quelqu'un ne se rattrape pas: la phrase a été lue.
 *
 * ⚠️ COMMENTAIRES RETIRÉS — cicatrice `caller-audit-must-strip-comments`. Les
 * en-têtes de ces fichiers PARLENT longuement d'objectifs et de calories pour
 * dire qu'ils sont interdits; un `includes` sur la source brute serait rouge
 * sur le commentaire qui protège la règle.
 */
describe("les gardes d'affichage (câblage)", () => {
  const ROOT = resolve(__dirname, "../../../..");

  function code(rel: string): string {
    return readFileSync(resolve(ROOT, rel), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .split("\n")
      .map((line) => {
        const at = line.indexOf("//");
        if (at < 0) return line;
        if (at > 0 && line[at - 1] === ":") return line;
        return line.slice(0, at);
      })
      .join("\n");
  }

  const VIEW = "frontend/src/keel/components/plan/PlanByPerson.tsx";

  it("aucun objectif, aucun poids, aucune calorie ne peut atteindre ces vues", () => {
    const src = code(VIEW) + code("frontend/src/keel/lib/planByPersonModel.ts");
    for (const forbidden of ["goal", "kcal", "calorie", "weightKg", "heightCm", "energy"]) {
      expect(src, `« ${forbidden} » est entré dans la vue par personne`)
        .not.toMatch(new RegExp(forbidden, "i"));
    }
  });

  /**
   * ⛔ LA CEINTURE STRUCTURELLE, ET ELLE VAUT PLUS QUE LA PRÉCÉDENTE.
   *
   * Le test du dessus interdit des MOTS; celui-ci interdit un CHEMIN. Les deux
   * seuls types d'entrée de la vue sont `MemberPortionView` (bouche, prénom,
   * instruction de service, parts) et `HouseholdDishView` (titre, jour, moment,
   * `uses`). Aucun des deux n'a de champ où un objectif pourrait passer, donc
   * un mineur ne peut pas avoir d'objectif affiché — il n'y a nulle part où en
   * mettre un. Le jour où quelqu'un passe `HouseholdMemberView` (qui porte
   * `goal`) à ce composant, ce test devient rouge.
   */
  it("la vue ne reçoit que des parts et des plats, jamais un membre de roster", () => {
    const src = code(VIEW);
    expect(src, "un type porteur d'objectif est entré dans les props")
      .not.toContain("HouseholdMemberView");
    expect(src).toContain("MemberPortionView");
    expect(src).toContain("HouseholdDishView");
  });

  it("`isOwner` est REQUIS et ferme le rendu — la part d'un autre ne fuit pas", () => {
    const src = code(VIEW);
    // REQUIS: pas de `isOwner?`, pas de valeur par défaut. `false` est une
    // affirmation, pas un défaut — « paramètre de garde optionnel = garde
    // désarmée ».
    expect(src, "la garde est devenue optionnelle").toMatch(/^\s*isOwner: boolean;/m);
    expect(src, "la garde ne ferme plus le rendu").toContain(
      "if (!props.isOwner) return null;",
    );
  });

  it("le site de montage passe la garde au lieu de la deviner", () => {
    const src = code("frontend/src/keel/pages/StudentWeekPlanPage.tsx");
    expect(src, "la vue est montée sans sa garde").toMatch(
      /<PlanByPerson[\s\S]*?isOwner=\{isOwner\}/,
    );
  });

  it("à une seule bouche, la vue se tait — elle n'a pas de sujet", () => {
    const src = code(VIEW);
    expect(src).toContain("if (props.portions.length < 2) return null;");
  });
});

// ---------------------------------------------------------------------------
// LOT C — LE PLAT DÉDIÉ EST ATTRIBUÉ, ET IL SORT DE LA SEMAINE DES AUTRES
//
// ⛔ LE DÉFAUT, MESURÉ LE 2026-08-14 ET CITÉ TEL QUEL. Sur le plan `de4309ba`,
// la vue individuelle de Kid affichait au vendredi:
//
//     Breakfast — Greek yogurt bowls with peaches, granola and seeds
//     Breakfast — Greek yogurt bowls with peaches, granola and seeds for Zoe
//
// Le second est le plat DÉDIÉ de Zoé (barreau ②). Il apparaissait dans la
// semaine de tout le monde parce que `dishes[]` ne portait AUCUN `member_id`:
// le seul marqueur était « for Zoe » écrit dans le TITRE par le modèle.
//
// ⛔ ET ON NE LE DEVINE TOUJOURS PAS DEPUIS LE TITRE. Les plats de ce bloc
// portent volontairement le MÊME titre, sans aucune mention de prénom: si un
// matcher revenait un jour, ces tests continueraient de passer pour la
// mauvaise raison — donc ils sont écrits pour qu'aucun matcher ne PUISSE les
// faire passer.
// ---------------------------------------------------------------------------

/** Le cas mesuré: une case, deux plats, l'un dédié. Titres IDENTIQUES. */
const DEDICATED: HouseholdDishView[] = [
  {
    title: "Greek yogurt bowls with peaches",
    day: "fri",
    slot: "breakfast",
    uses: [],
    memberId: null,
  },
  {
    title: "Greek yogurt bowls with peaches",
    day: "fri",
    slot: "breakfast",
    uses: [],
    memberId: "m-chris",
  },
];

describe("LOT C — un plat dédié appartient à une bouche", () => {
  it("la semaine d'une autre bouche ne porte PAS le plat dédié", () => {
    const week = buildPersonWeek({
      days: ["fri"],
      dishes: DEDICATED,
      person: PORTIONS[0], // ILi — le plat dédié est celui de Christèle
    });
    expect(week[0].dishes).toHaveLength(1);
    expect(week[0].dishes[0].title).toBe("Greek yogurt bowls with peaches");
  });

  it("la semaine de SA bouche porte les deux — le commun et le sien", () => {
    // ⚠️ LE CAS QUI PASSE, et il compte autant que le précédent: une garde
    // qu'on ne sait pas faire dire « oui » bloque tout en ressemblant à une
    // garde qui marche. Le plat commun de la table reste le sien aussi.
    const week = buildPersonWeek({
      days: ["fri"],
      dishes: DEDICATED,
      person: PORTIONS[1], // Christèle
    });
    expect(week[0].dishes).toHaveLength(2);
  });

  it("⛔ la ligne « le plat » ne montre JAMAIS le plat d'une seule personne", () => {
    // Sans la séparation, le « premier arrivé » de la case pouvait être le plat
    // dédié — au hasard de l'ordre du modèle — et la table entière lisait le
    // plat d'une bouche comme le sien.
    const model = buildPlanByPerson({
      days: ["fri"],
      // L'ORDRE EST INVERSÉ EXPRÈS: le plat dédié arrive EN PREMIER.
      dishes: [DEDICATED[1], DEDICATED[0]],
      portions: PORTIONS,
    });
    const breakfast = model.groups.find((g) => g.slot === "breakfast");
    expect(breakfast?.dishes).toEqual(["Greek yogurt bowls with peaches"]);
    const ili = breakfast?.people.find((p) => p.memberId === "m-ili");
    const chris = breakfast?.people.find((p) => p.memberId === "m-chris");
    // Le plat dédié est sous SA ligne, et sous elle seule.
    expect(chris?.cells[0].ownDish).toBe("Greek yogurt bowls with peaches");
    expect(ili?.cells[0].ownDish).toBeNull();
  });

  it("un plat commun ne porte AUCUNE attribution — la contre-épreuve", () => {
    const model = buildPlanByPerson({
      days: ["fri", "sat"],
      dishes: DISHES,
      portions: PORTIONS,
    });
    for (const group of model.groups) {
      for (const person of group.people) {
        for (const cell of person.cells) {
          expect(cell.ownDish).toBeNull();
        }
      }
    }
  });

  it("⛔ AUCUNE lecture de titre nulle part sur ce chemin", () => {
    // « Jamais de matcher maison »: 12 faux positifs sur 12 mesurés. Ici un
    // matcher attribuerait de travers dès « Chicken for Zoe and Marc », et rien
    // du tout dès que le plan sort en français.
    const model = readFileSync(
      resolve(__dirname, "../../../..", "frontend/src/keel/lib/planByPersonModel.ts"),
      "utf8",
    );
    for (const forbidden of ["includes(", "toLowerCase(", "match(", "indexOf("]) {
      expect(model, `${forbidden} sur les titres est revenu`).not.toContain(
        `title.${forbidden}`,
      );
    }
    // L'attribution passe par l'IDENTIFIANT, et par lui seul.
    expect(model).toContain("dish.memberId !== null");
    expect(model).toContain("d.memberId === args.person.memberId");
  });
});
