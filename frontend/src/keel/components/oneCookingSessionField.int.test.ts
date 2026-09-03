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
    //
    // ⟳ A1 (2026-09-03) — IL N'EN RESTE QU'UNE. La case « je cuisine la
    // veille » a été retirée: le serveur DÉRIVE le jour de cuisine de la date
    // de départ et de l'heure locale (`leadDayFor`, coupure à 18 h). Ce test
    // s'est donc retourné une seconde fois, et il tient toujours la même
    // chose: la question de calendrier qui reste vit ENTRE les dates et le
    // reste du formulaire.
    for (const [name, src, dateKey, afterKey] of [
      ["MealBuilder", BUILDER, "meals.form.window_label", "plan.cooking.time_label"],
      ["SetupPage", SETUP, "setup.request.from", "setup.plan.time"],
    ] as const) {
      const dates = src.indexOf(dateKey);
      const session = src.indexOf("<OneCookingSessionField");
      const after = src.indexOf(afterKey);
      expect(dates, name).toBeGreaterThan(-1);
      expect(session, name).toBeGreaterThan(dates);
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

describe("⟳ A1 — « je cuisine la veille » N'EST PLUS UNE CASE", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // CE BLOC S'EST RETOURNÉ LE 2026-09-03, IL NE S'EST PAS SUPPRIMÉ.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Il exigeait `<CookDayBeforeField` sur les deux surfaces, la porte
  // `cookDayBeforeAvailable`, le décochage automatique et quatre clés
  // traduites. La règle produit du 03/09 (P1): les courses et la cuisson se
  // font la veille, AUTOMATIQUEMENT, avec une coupure à 18 h — et quand la
  // veille n'est plus possible, on le DIT.
  //
  // ⛔ CE QUE CE BLOC TIENT MAINTENANT, ET POURQUOI CE N'EST PAS « RIEN ». Une
  // case retirée sans garde revient par une page oubliée: c'est exactement ce
  // que le bloc « les jours où tu cuisines » juste au-dessus existe pour
  // empêcher, et il a déjà servi. Ici en plus, une case ressuscitée LAISSERAIT
  // LE SERVEUR DÉRIVER quand même — deux autorités sur la même fenêtre, dont
  // une invisible.

  it("le champ, ses clés et son état ont disparu des deux surfaces", () => {
    for (const [name, src] of [["MealBuilder", BUILDER], ["SetupPage", SETUP]] as const) {
      // ⚠️ MESURÉ SUR LA SOURCE PRIVÉE DE SES COMMENTAIRES. Le retrait est
      // RACONTÉ dans un commentaire qui nomme `cookTheDayBefore`; un grep naïf
      // y verrait un appelant vivant et ce test resterait vert le jour où
      // quelqu'un rebranche la case.
      const code = src
        .split("\n")
        .map((line) => (line.trimStart().startsWith("//") ? "" : line))
        .join("\n");
      expect(code, name).not.toMatch(/<CookDayBeforeField/);
      expect(code, name).not.toMatch(/cookTheDayBefore/);
      expect(code, name).not.toMatch(/plan\.cooking\.day_before_/);
    }
  });

  it("les quatre clés de la case sont parties des DEUX packs", () => {
    // Une clé orpheline est une phrase que personne ne rend et que la parité
    // fait vivre pour toujours.
    for (
      const key of [
        "plan.cooking.day_before_label",
        "plan.cooking.day_before_hint",
        "plan.cooking.day_before_starts_today",
        "plan.cooking.day_before_no_room",
      ]
    ) {
      expect(fr, `fr: ${key}`).not.toHaveProperty(key);
      expect(en, `en: ${key}`).not.toHaveProperty(key);
    }
  });

  it("ce que l'écran dit du timing vient du SERVEUR, et il ne le recalcule pas", () => {
    // ⛔ LA GARDE QUI COMPTE. Le navigateur ne connaît pas l'heure
    // (`local_date.ts` refuse tout repli UTC): un écran qui devinerait
    // annoncerait une soirée de cuisine à quelqu'un dont les magasins sont
    // fermés. Deux phrases, deux clés, et AUCUN `getHours` nulle part.
    const RESULT = read("./plan/PlanResult.tsx");
    expect(RESULT).toMatch(/props\.timing/);
    expect(RESULT).toMatch(/meals\.timing\.day_before/);
    expect(RESULT).toMatch(/meals\.timing\.same_morning/);
    for (
      const [name, src] of [
        ["PlanResult", RESULT],
        ["MealBuilder", BUILDER],
        ["SetupPage", SETUP],
        ["KitchenToday", read("./KitchenToday.tsx")],
      ] as const
    ) {
      expect(src, name).not.toMatch(/getHours\(/);
      expect(src, name).not.toMatch(/SHOPPING_CUTOFF_HOUR/);
    }
    // Les deux surfaces le passent — C6: l'aperçu et le validé rendent le même
    // corps de plan, et le timing en fait partie.
    expect(BUILDER).toMatch(/timing=\{result\?\.timing \?\? null\}/);
    expect(read("./plan/PlanDraftDialog.tsx")).toMatch(/timing=\{draft\.timing\}/);
  });

  it("les deux phrases neuves sont traduites, et pas recopiées", () => {
    for (const key of ["meals.timing.day_before", "meals.timing.same_morning"] as const) {
      expect(fr[key], `fr: ${key}`).toBeTruthy();
      expect(en[key], `en: ${key}`).toBeTruthy();
      expect(fr[key], key).not.toBe(en[key]);
    }
    // Et celle qui nomme un jour porte bien son trou.
    expect(fr["meals.timing.day_before"]).toContain("{day}");
    expect(en["meals.timing.day_before"]).toContain("{day}");
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
    // ⟳ A1 — et `cookTheDayBefore` NE PART PLUS: il n'existe plus. La garde
    // du bloc précédent le tient sur la source privée de ses commentaires.
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
