import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { fr } from "../i18n/fr";
import { readDishes } from "../api/mealGeneration";
import { boxLinesForDish } from "../lib/mealBoxes";
import { en } from "../i18n/en";

// ===========================================================================
// « TOUT CUISINER EN UNE SEULE FOIS » — LE CÂBLAGE DES DEUX ÉCRANS
//
// ⛔ CE QUI EST TESTÉ ICI N'EST PAS LE COMPOSANT, C'EST QU'IL SOIT BRANCHÉ.
// Ce dépôt a mesuré trois fois la même forme d'échec: un champ écrit, traduit,
// testé, visible — et dont la réponse ne va nulle part (`coach_food_rules`,
// l'équipement de cuisine sur la lane solo, l'envie du foyer). Le composant
// seul ne prouve rien; ce qui compte est qu'un écran le monte, qu'il reçoive
// SA porte, et que la valeur parte dans le corps de la requête.
//
// ⚠️ ET LA PORTE DOIT ÊTRE COLLECTABLE. L'option est conditionnée par le
// congélateur, dont la question ne vivait QUE dans l'entonnoir — une route sans
// entrée de nav. Sans la carte d'équipement sur `/app/plan`, quelqu'un qui a un
// congélateur y lisait « il faut un congélateur » sans le moindre endroit
// atteignable pour le dire: la cicatrice « port à null = champ incollectable ».
// ===========================================================================

const read = (rel: string) => readFileSync(resolve(__dirname, rel), "utf8");
const BUILDER = read("./MealBuilder.tsx");
const SETUP = read("../pages/SetupPage.tsx");
const FIELD = read("./OneCookingSessionField.tsx");

describe("le champ est monté sur les DEUX surfaces", () => {
  it("sur `/app/plan` (MealBuilder)", () => {
    expect(BUILDER).toMatch(/<OneCookingSessionField/);
    expect(BUILDER).toMatch(/value=\{oneCookingSession\}/);
    expect(BUILDER).toMatch(/onChange=\{setOneCookingSession\}/);
  });

  it("sur l'entonnoir (SetupPage, étape « demande »)", () => {
    expect(SETUP).toMatch(/<OneCookingSessionField/);
    expect(SETUP).toMatch(/value=\{oneCookingSession\}/);
    expect(SETUP).toMatch(/onChange=\{onOneCookingSession\}/);
  });

  it("⛔ ET LES DEUX VIVENT AVEC LES DATES, pas ailleurs", () => {
    // ══════════════════════════════════════════════════════════════════════
    // CE TEST A CHANGÉ D'ANCRE LE 2026-09-01, ET C'EST LE POINT DU LOT.
    // ══════════════════════════════════════════════════════════════════════
    //
    // Il ancrait les cases sous « les jours où tu cuisines ». Cette rangée
    // n'existe plus: le plan ne demande plus QUELS jours on cuisine, seulement
    // QUAND la cuisine a lieu. Les deux cases sont donc les seules questions
    // de calendrier qui restent, et elles se lisent avec les dates — « je
    // cuisine la veille » RECULE le premier jour du champ juste au-dessus.
    //
    // ⚠️ L'ORDRE ENTRE ELLES COMPTE AUSSI: d'abord QUAND commence la cuisine,
    // ensuite si elle tient en une fois.
    for (const [name, src, dateKey, afterKey] of [
      ["MealBuilder", BUILDER, "meals.form.window_label", "plan.cooking.time_label"],
      ["SetupPage", SETUP, "setup.request.from", "setup.plan.time"],
    ] as const) {
      const dates = src.indexOf(dateKey);
      const before = src.indexOf("<CookDayBeforeField");
      const session = src.indexOf("<OneCookingSessionField");
      const after = src.indexOf(afterKey);
      expect(dates, name).toBeGreaterThan(-1);
      expect(before, name).toBeGreaterThan(dates);
      expect(session, name).toBeGreaterThan(before);
      expect(session, name).toBeLessThan(after);
    }
  });

  it("⛔ « LES JOURS OÙ TU CUISINES » N'EST PLUS NULLE PART", () => {
    // La suppression est le lot, pas un effet de bord. Un champ qui revient
    // par une page oubliée réécrirait `cook_days` et ressusciterait une
    // contrainte que le moteur lit encore.
    for (const [name, src] of [["MealBuilder", BUILDER], ["SetupPage", SETUP]] as const) {
      expect(src, name).not.toMatch(/plan\.cooking\.days_label/);
      expect(src, name).not.toMatch(/setup\.plan\.cook_days/);
      expect(src, name).not.toMatch(/cookDays/);
    }
  });
});

describe("« je cuisine la veille »", () => {
  const FIELD_BEFORE = read("./CookDayBeforeField.tsx");

  it("est monté sur les DEUX surfaces", () => {
    expect(BUILDER).toMatch(/<CookDayBeforeField/);
    expect(SETUP).toMatch(/<CookDayBeforeField/);
  });

  it("⛔ LA DISPONIBILITÉ VIENT DU MOTEUR, elle n'est pas recopiée", () => {
    // `cookDayBeforeAvailable` rend le MÊME verdict que `withCookDayBefore`
    // côté serveur — la même fonction, appelée. Une case cochable qui serait
    // refusée ensuite promettrait un geste que le moteur ne fera pas.
    expect(FIELD_BEFORE).toMatch(/cookDayBeforeAvailable\(/);
    expect(FIELD_BEFORE).toMatch(/meal_plan_window\.ts/);
    // Et le plafond de fenêtre est la constante partagée, jamais `7` en dur.
    expect(FIELD_BEFORE).toMatch(/MAX_WINDOW_DAYS/);
  });

  it("le refus NOMME laquelle des deux conditions manque", () => {
    // Les deux se réparent par des gestes OPPOSÉS — reculer la date de début,
    // ou raccourcir la fenêtre. Une phrase commune ne dirait ni l'un ni
    // l'autre, et se lirait comme un bouton mort.
    expect(FIELD_BEFORE).toMatch(/day_before_no_room/);
    expect(FIELD_BEFORE).toMatch(/day_before_starts_today/);
    expect(fr["plan.cooking.day_before_no_room"]).not.toBe(
      fr["plan.cooking.day_before_starts_today"],
    );
  });

  it("elle se décoche quand la fenêtre cesse de le permettre", () => {
    // Atteignable en UN geste: cocher la veille, puis pousser la date de fin à
    // sept jours.
    expect(FIELD_BEFORE).toMatch(/if \(!available && value\) onChange\(false\)/);
  });

  it("les quatre clés sont traduites, et pas recopiées", () => {
    for (
      const key of [
        "plan.cooking.day_before_label",
        "plan.cooking.day_before_hint",
        "plan.cooking.day_before_starts_today",
        "plan.cooking.day_before_no_room",
      ] as const
    ) {
      expect(fr[key], `fr: ${key}`).toBeTruthy();
      expect(en[key], `en: ${key}`).toBeTruthy();
      expect(fr[key], key).not.toBe(en[key]);
    }
  });
});

describe("la porte du congélateur", () => {
  it("les deux écrans la lisent par le MIROIR, pas par un `includes` écrit là", () => {
    // Deux définitions d'une même règle divergent, et c'est celle qu'on regarde
    // le moins qui garde l'ancienne. `freezerMirror.int.test.ts` compare déjà
    // le miroir au serveur sur les trois états.
    for (const [name, src] of [["MealBuilder", BUILDER], ["SetupPage", SETUP]] as const) {
      expect(src, name).toMatch(/hasFreezerDeclared\(/);
      expect(src, name).toMatch(/hasFreezer=\{/);
    }
  });

  it("le champ REFUSE de se cocher sans congélateur, et il le dit", () => {
    // Désactivée ET visible, jamais cachée: une question qui disparaît est une
    // réponse que personne ne sait qu'il lui manque.
    expect(FIELD).toMatch(/disabled=\{props\.disabled \|\| !hasFreezer\}/);
    expect(FIELD).toMatch(/plan\.cooking\.one_session_needs_freezer/);
  });

  it("⛔ ET ELLE SE DÉCOCHE TOUTE SEULE QUAND LE CONGÉLATEUR DISPARAÎT", () => {
    // Décor atteignable en deux gestes dans l'entonnoir: cocher l'option à
    // l'étape « demande », revenir à l'étape « table », décocher le
    // congélateur. Sans cet effet, l'écran garderait une case cochée et grisée
    // et l'enverrait quand même.
    expect(FIELD).toMatch(/if \(!hasFreezer && value\) onChange\(false\)/);
  });

  it("la question de l'équipement est COLLECTABLE depuis `/app/plan`", () => {
    // Sans elle, la porte existe et la clé n'est nulle part: `/app/setup` n'a
    // aucune entrée de nav, et `/app/about-you` ne pose pas la question.
    expect(BUILDER).toMatch(/<KitchenEquipmentCard/);
    expect(BUILDER).toMatch(/practicalConstraints=\{planConstraints\}/);
    // ⚠️ LA MÊME CARTE, jamais une rangée de pastilles réécrite: elle porte sa
    // garde de chargement, son refus de sélection vide, et son écriture qui
    // RELIT la colonne avant de fusionner.
    expect(BUILDER).not.toMatch(/KITCHEN_TOOLS\.map/);
  });
});

describe("la réponse part vraiment, sur les deux lanes", () => {
  it("MealBuilder l'envoie au foyer ET à la lane individuelle", () => {
    // Deux sites d'envoi dans ce fichier: `generateHouseholdMeal` et
    // `generateMeal`. Un seul câblé serait un champ qui marche une fois sur
    // deux, sans qu'aucun test ne rougisse.
    const sends = BUILDER.match(/^\s+oneCookingSession,$/gm) ?? [];
    expect(sends.length).toBeGreaterThanOrEqual(2);
    const before = BUILDER.match(/^\s+cookTheDayBefore,$/gm) ?? [];
    expect(before.length).toBeGreaterThanOrEqual(2);
  });

  it("l'entonnoir l'envoie sur les TROIS gestes", () => {
    // `draftInput` est la source unique de l'aperçu, de la reprise et de
    // l'adoption. Sans lui à l'adoption, le plan ÉCRIT ne serait pas celui
    // qu'on vient de montrer.
    expect(SETUP).toMatch(/^\s+oneCookingSession,$/m);
  });

  it("⛔ ET IL NE S'ÉCRIT DANS AUCUNE COLONNE", () => {
    // « Cette semaine-ci, je cuisine une seule fois » est un arbitrage de
    // semaine. L'écrire dans `practical_constraints` le rejouerait en silence
    // sur celle où on reçoit du monde — l'arbitrage qui a sorti le budget et le
    // mode de cuisson du profil le 2026-08-13.
    for (const [name, src] of [["MealBuilder", BUILDER], ["SetupPage", SETUP]] as const) {
      expect(src, name).not.toMatch(/one_cooking_session:\s*(true|false|oneCookingSession)/);
    }
  });
});

describe("les mots existent dans les deux langues", () => {
  it("les trois clés sont traduites", () => {
    for (
      const key of [
        "plan.cooking.one_session_label",
        "plan.cooking.one_session_hint",
        "plan.cooking.one_session_needs_freezer",
      ] as const
    ) {
      expect(fr[key], `fr: ${key}`).toBeTruthy();
      expect(en[key], `en: ${key}`).toBeTruthy();
      // Une clé recopiée d'une langue à l'autre est une traduction manquante
      // qui ressemble à une traduction faite.
      expect(fr[key], key).not.toBe(en[key]);
    }
  });

  it("l'aide dit les DEUX moitiés du marché", () => {
    // Sans « le surplus part au congélateur », la case ressemble à un raccourci
    // gratuit — et la personne le découvre devant son frigo.
    expect(fr["plan.cooking.one_session_hint"]).toMatch(/congélateur/);
    expect(en["plan.cooking.one_session_hint"]).toMatch(/freezer/);
  });
});

describe("le couvercle SANS NOM survit à la lecture", () => {
  // ═════════════════════════════════════════════════════════════════════════
  // LE DERNIER MAILLON, TROUVÉ DANS LE NAVIGATEUR LE 2026-09-01.
  // ═════════════════════════════════════════════════════════════════════════
  //
  // Le moteur écrivait ONZE contenants, la base les portait
  // (`box_counts: {with_box: 11, delivery: "served", names: 0}`) — et le
  // dépliant de session à l'écran était VIDE. `readBoxV4` jetait tout
  // contenant sans `member_ids`, avec un motif qui était vrai tant que les
  // boîtes n'existaient que sur la lane foyer: « un contenant sans personne
  // n'est pas une instruction ».
  //
  // ⛔ LA GARDE N'EST PAS PERDUE, ELLE EST REMONTÉE. `parseGeneratedMeal`
  // refuse toujours un couvercle anonyme sur la lane FOYER, là où la lane est
  // connue. Cet écran-ci reçoit une ligne de base sans savoir d'où elle vient:
  // y refaire la décision, c'était la prendre à l'aveugle.

  it("un contenant solo (aucun nom) est LU, pas jeté", () => {
    const [dish] = readDishes([
      {
        title: "Chili de lentilles",
        day: "thu",
        slot: "lunch",
        uses: [{ preparation_id: "prep_chili", servings: 1 }],
        boxes: [{
          id: "box_thu_lunch",
          member_ids: [],
          items: [{ preparation_id: "prep_chili", term: "chili prêt", grams: 220 }],
        }],
      },
    ]);
    expect(dish.boxes).toHaveLength(1);
    expect(dish.boxes[0].id).toBe("box_thu_lunch");
    expect(dish.boxes[0].member_ids).toEqual([]);
    expect(dish.boxes[0].items[0].grams).toBe(220);
  });

  it("et son couvercle se lit « jour repas — plat », sans prénom", () => {
    // C'est ce qui le fait RECONNAÎTRE devant le frigo: il n'y a personne à
    // départager, donc le jour et le moment sont l'étiquette.
    const [dish] = readDishes([
      {
        title: "Chili de lentilles",
        day: "thu",
        slot: "lunch",
        uses: [{ preparation_id: "prep_chili", servings: 1 }],
        boxes: [{
          id: "box_thu_lunch",
          member_ids: [],
          items: [{ preparation_id: "prep_chili", term: "chili prêt", grams: 220 }],
        }],
      },
    ]);
    const [line] = boxLinesForDish(dish, []);
    expect(line.eaterCount).toBe(0);
    expect(line.shared, "un bac sans nom n'est le bac de personne d'autre").toBe(false);
    expect(line.lid).toContain("Chili de lentilles");
    expect(line.lid).not.toContain("—  —");
  });

  it("⛔ UN CONTENANT VIDE RESTE REFUSÉ", () => {
    // Ce que la ligne retirée protégeait vraiment: un bac dont on ne sait pas
    // quoi mettre dedans envoie quelqu'un au frigo chercher une boîte que
    // personne n'a remplie. Cette garde-là n'a pas bougé.
    const [dish] = readDishes([
      {
        title: "Chili",
        day: "thu",
        slot: "lunch",
        uses: [{ preparation_id: "prep_chili", servings: 1 }],
        boxes: [{ id: "box_vide", member_ids: [], items: [] }],
      },
    ]);
    expect(dish.boxes).toHaveLength(0);
  });
});
