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
// La chrome partagée: c'est elle qui DESSINE la parenthèse et fixe le corps.
const CHECKBOX = read("./ui/CheckboxField.tsx");

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

  it("⛔ ET LES DEUX LA POSENT SOUS LE SÉLECTEUR DE STYLE, pas ailleurs", () => {
    // ══════════════════════════════════════════════════════════════════════
    // TROISIÈME ANCRE EN QUATRE JOURS, ET CELLE-CI DIT POURQUOI.
    // ══════════════════════════════════════════════════════════════════════
    //
    // Elle a d'abord tenu « sous les jours où tu cuisines » (rangée retirée le
    // 2026-09-01), puis « avec les dates » — au motif que « quand la cuisine a
    // lieu » est une question de calendrier. Ce motif tenait tant que « je
    // cuisine la veille » était la case d'à côté; celle-là a été retirée le
    // 2026-09-03 (le serveur DÉRIVE la veille), et il ne restait qu'une case
    // isolée à trois champs de la seule question qu'elle précise.
    //
    // ⟳ 2026-09-04 — L'ANCRE EST MAINTENANT LA QUESTION QU'ELLE PRÉCISE.
    // `plan.cooking.style_hint` annonce déjà « le nombre de fois où le plan
    // vous demande de cuisiner »: la case en est le cas extrême, et elle se lit
    // SOUS le sélecteur. Elle reste AVANT « combien de courses » — une seule
    // course implique la session unique, et les deux entrent par la même porte
    // côté moteur.
    //
    // ⚠️ CE QUE CE TEST TIENT N'A PAS BOUGÉ: les deux surfaces posent la même
    // question au même endroit. Une seule qui bouge, et on a deux formulaires.
    for (const [name, src] of [["MealBuilder", BUILDER], ["SetupPage", SETUP]] as const) {
      const style = src.indexOf("<CookingStyleField");
      const session = src.indexOf("<OneCookingSessionField");
      const runs = src.indexOf("<GroceryRunsField");
      expect(style, `${name}: le sélecteur de style a disparu`).toBeGreaterThan(-1);
      expect(runs, `${name}: la cadence de courses a disparu`).toBeGreaterThan(-1);
      expect(session, name).toBeGreaterThan(style);
      expect(session, name).toBeLessThan(runs);
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

  it("⟳ 2026-09-04 — LE REFUS EST UNE PARENTHÈSE, ET IL S'EFFACE UNE FOIS LEVÉ", () => {
    // ══════════════════════════════════════════════════════════════════════
    // LES DEUX MOITIÉS, ET AUCUNE N'EST DÉCORATIVE.
    // ══════════════════════════════════════════════════════════════════════
    //
    // ① SANS congélateur: la condition se lit ENTRE PARENTHÈSES à côté du
    //    libellé — au plus près du geste refusé —, et la ligne d'aide générale
    //    se tait (elle décrirait un geste que la personne ne peut pas faire).
    // ② AVEC congélateur: la parenthèse DISPARAÎT. Une condition qui reste
    //    affichée une fois remplie apprend à ne plus la lire, et « il faut un
    //    congélateur » sous une case cochable est un refus qui ment.
    expect(FIELD).toMatch(
      /note=\{hasFreezer \? null : t\("plan\.cooking\.one_session_needs_freezer"\)\}/,
    );
    expect(FIELD).toMatch(
      /hint=\{hasFreezer \? t\("plan\.cooking\.one_session_hint"\) : null\}/,
    );
    // ⛔ LES PARENTHÈSES SONT DANS LA MARKUP, JAMAIS DANS LA TRADUCTION. Une
    // chaîne qui les porterait se retrouverait un jour au milieu d'une phrase
    // qui n'en veut pas — et les deux langues divergeraient sur la ponctuation.
    expect(CHECKBOX, "la parenthèse n'est plus dessinée par la chrome").toMatch(
      /\(\{props\.note\}\)/,
    );
    for (const [lang, dict] of [["fr", fr], ["en", en]] as const) {
      expect(dict["plan.cooking.one_session_needs_freezer"], lang).not.toMatch(/[()]/);
    }
  });

  it("⛔ ET LE REFUS NOMME L'ÉCRAN OÙ ON LE LÈVE, dans les deux langues", () => {
    // « Un refus qui ne dit pas ce qui le lèverait n'est pas un refus, c'est un
    // mur. » Le titre est LU du dictionnaire, pas recopié: le jour où la carte
    // d'équipement change de nom, ce test tombe au lieu d'envoyer la personne
    // chercher une section qui n'existe plus.
    for (const [lang, dict] of [["fr", fr], ["en", en]] as const) {
      expect(
        dict["plan.cooking.one_session_needs_freezer"],
        `${lang}: le refus ne nomme plus « ${dict["setup.equipment.title"]} »`,
      ).toContain(dict["setup.equipment.title"]);
    }
  });

  it("⟳ 2026-09-04 — LA CASE EST UNE SOUS-OPTION, ET SA TYPOGRAPHIE LE DIT", () => {
    // Au même corps que le champ au-dessus, elle se lisait comme une question
    // de plein droit; un cran plus petit dit qu'elle appartient au sélecteur
    // qui la précède. `text-sm` ici, et le déplacement ne se voit plus.
    // ⚠️ SUR LA SOURCE PRIVÉE DE SES COMMENTAIRES. L'en-tête du fichier DIT
    // « `text-xs`, pas `text-sm` » — un grep naïf lit sa propre justification
    // et rougit sur un fichier juste. Cicatrice du dépôt: « un audit
    // d'appelants doit retirer les commentaires ».
    const chrome = CHECKBOX.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(chrome, "la chrome est repassée au corps d'un champ").not.toMatch(
      /text-sm/,
    );
    expect(chrome).toMatch(/text-xs/);
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

describe("la réponse part vraiment, sur le seul moteur", () => {
  it("MealBuilder l'envoie, et il n'a plus qu'un site d'envoi", () => {
    // ⟳ 2026-09-10 · LOT 7 — LE COMPTE ATTENDU EST PASSÉ DE DEUX À UN, ET LA
    // PROPRIÉTÉ EST LA MÊME: « chaque site d'envoi de ce fichier porte le
    // champ ». Il y en avait deux (`generateHouseholdMeal`, `generateMeal`), et
    // un seul câblé aurait fait un champ qui marche une fois sur deux. Il n'y a
    // plus qu'un moteur, donc plus qu'un site.
    //
    // ⛔ ET ON MESURE UNE ÉGALITÉ, PAS UN PLANCHER. `>= 1` resterait vert le
    // jour où une seconde lane réapparaît sans que le champ y soit — c'est
    // exactement le défaut que ce cas existait pour attraper, à l'envers.
    const sends = BUILDER.match(/^\s+oneCookingSession,$/gm) ?? [];
    expect(sends.length, "un site d'envoi, ni plus ni moins").toBe(1);
    // ⚠️ LA PRÉMISSE, ARMÉE: il n'y a bien plus qu'un appel de composition dans
    // ce fichier. Sans elle, « un site » se lirait aussi bien « le champ a été
    // débranché d'une lane qui existe encore ».
    expect(BUILDER, "`generateMeal` est revenu").not.toContain("generateMeal(");
    expect((BUILDER.match(/await generateHouseholdMeal\(/g) ?? []).length).toBe(1);
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

describe("⟳ P2 — le style et la cadence de courses, montés aux DEUX endroits", () => {
  // ⛔ MÊME EXIGENCE QUE POUR LA SESSION UNIQUE, et pour la même raison: deux
  // champs écrits séparément divergeraient au premier libellé retouché, et
  // c'est celui qu'on regarde le moins qui garderait l'ancien mot.
  it("les deux composants sont montés sur `/app/plan` ET dans l'entonnoir", () => {
    for (const [name, src] of [["MealBuilder", BUILDER], ["SetupPage", SETUP]] as const) {
      expect(src, name).toMatch(/<CookingStyleField/);
      expect(src, name).toMatch(/<GroceryRunsField/);
    }
  });

  it("⛔ le STYLE vient AVANT la cadence, sur les deux surfaces", () => {
    // L'ordre est le sens: c'est le style qui PLAFONNE le nombre de sessions,
    // donc lire « trois courses » avant de savoir qu'on cuisine le moins
    // possible ferait attendre trois séances que le plan ne fera pas.
    for (const [name, src] of [["MealBuilder", BUILDER], ["SetupPage", SETUP]] as const) {
      const style = src.indexOf("<CookingStyleField");
      const runs = src.indexOf("<GroceryRunsField");
      expect(style, name).toBeGreaterThan(-1);
      expect(runs, name).toBeGreaterThan(style);
    }
  });

  it("⛔ ET LA SESSION UNIQUE VIENT ENTRE LES DEUX, sur les deux surfaces", () => {
    // ══════════════════════════════════════════════════════════════════════
    // CE TEST S'EST RETOURNÉ DEUX FOIS, ET CHAQUE RETOURNEMENT ÉTAIT LE LOT.
    // ══════════════════════════════════════════════════════════════════════
    //
    // Il a exigé « la session APRÈS la cadence de courses » (motif: une seule
    // course implique la session unique), puis « la session AVANT les deux »
    // (motif: c'est une question de calendrier, elle vit avec les dates).
    //
    // ⟳ 2026-09-04 — LES DEUX MOTIFS SURVIVENT, DANS LA MÊME POSITION. Elle
    // précise le style (elle est donc APRÈS lui) et elle conditionne la lecture
    // des courses (elle est donc AVANT elles): style → session → courses. Ce
    // que le test tient reste l'invariant du lot: les deux surfaces posent les
    // trois champs dans le MÊME ordre.
    for (const [name, src] of [["MealBuilder", BUILDER], ["SetupPage", SETUP]] as const) {
      const style = src.indexOf("<CookingStyleField");
      const session = src.indexOf("<OneCookingSessionField");
      const runs = src.indexOf("<GroceryRunsField");
      expect(style, `${name}: le style a disparu`).toBeGreaterThan(-1);
      expect(session, `${name}: la case a disparu`).toBeGreaterThan(-1);
      expect(session, `${name}: la case ne suit plus le style`).toBeGreaterThan(style);
      expect(runs, `${name}: la case ne précède plus les courses`).toBeGreaterThan(session);
    }
  });

  it("⛔ l'équipement précède la case qu'il conditionne, sur `/app/plan`", () => {
    // La case est GRISÉE sans congélateur, et son refus renvoie mot pour mot à
    // « Avec quoi vous cuisinez ». Un refus posé au-dessus de son remède se lit
    // comme un bouton mort — cicatrice mesurée trois fois sur l'écran de
    // réglages. L'entonnoir tient le même ordre en montant la carte AVANT
    // `RequestStep`; ici les deux vivent dans le même formulaire.
    const equipment = BUILDER.indexOf("<KitchenEquipmentCard");
    const session = BUILDER.indexOf("<OneCookingSessionField");
    expect(equipment, "la carte d'équipement a disparu").toBeGreaterThan(-1);
    expect(session, "la case a disparu").toBeGreaterThan(equipment);
  });

  it("⛔ « combien de temps dure une session » N'EST PLUS DEMANDÉ — NULLE PART", () => {
    // La suppression EST le lot. Un champ qui revient par une page oubliée
    // ferait deux autorités sur `cooking_time_min`, dont une invisible.
    //
    // ⟳ 2026-09-03 (soir) — `MealBuilder` REJOINT LA GARDE. La rangée y a
    // survécu une demi-journée à son retrait de l'entonnoir: `/app/plan`
    // écrivait donc `cooking_time_min` depuis un choix d'écran pendant que le
    // moteur le DÉRIVAIT du style, et c'est la composition suivante qui
    // départageait. Une garde qui ne couvre qu'une des deux surfaces laisse
    // exactement ce trou-là.
    for (const [name, src] of [["MealBuilder", BUILDER], ["SetupPage", SETUP]] as const) {
      const code = src
        .split("\n")
        .map((line) => (line.trimStart().startsWith("//") ? "" : line))
        .join("\n");
      expect(code, name).not.toMatch(/setup\.plan\.time/);
      expect(code, name).not.toMatch(/plan\.cooking\.time_label/);
      expect(code, name).not.toMatch(/COOKING_SESSION_MINUTES/);
    }
  });

  it("⚠️ mais la VALEUR déjà en base n'est pas effacée: elle fait l'aller-retour", () => {
    // ⛔ LA MOITIÉ QUI MANQUAIT AU RETRAIT. `savePlanInputs` réécrit la clé à
    // CHAQUE composition: cesser de la lire aurait écrit `null` par-dessus la
    // réponse de tout compte d'avant P2, et le moteur serait retombé sur son
    // défaut sans qu'aucun écran ne le dise. Les deux surfaces relisent et
    // réécrivent à l'identique.
    expect(BUILDER, "la valeur n'est plus relue").toMatch(
      /setCookingTimeMin\(last\.cookingTimeMin\)/,
    );
    expect(BUILDER, "un nombre inventé est réécrit à la place").not.toMatch(
      /cookingTimeMin:\s*Number\(/,
    );
  });

  it("les deux réponses sont DURABLES: elles s'écrivent et se relisent", () => {
    // ⚠️ CONTRAIREMENT À « une seule session » et à la forme de cuisine, qui
    // sont des arbitrages de SEMAINE et ne s'écrivent nulle part. Sans la
    // relecture, le premier `savePlanInputs` de la composition suivante
    // écrirait `null` et effacerait la réponse de l'entonnoir.
    expect(BUILDER).toMatch(/setCookingStyle\(last\.cookingStyle\)/);
    expect(BUILDER).toMatch(/setGroceryRuns\(last\.groceryRuns\)/);
    expect(BUILDER).toMatch(/^\s+cookingStyle,$/m);
    expect(BUILDER).toMatch(/^\s+groceryRuns,$/m);
  });
});

describe("⛔ P2 — l'ÉQUIPEMENT vient AVANT le nombre de courses", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // LE DÉFAUT QUE CE BLOC FERME, ET IL A ÉTÉ LIVRÉ.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Sur `/app/plan`, l'inventaire de cuisine vivait **178 lignes plus bas** que
  // « combien de courses ». On acceptait donc « une seule course » avant de
  // savoir s'il y a un congélateur — et « une seule course » ne tient QUE par
  // le congélateur. La personne répondait, puis découvrait le refus dans
  // l'explication du plan, pour une question qui était sous ses yeux.
  //
  // ⚠️ CE QUE CE TEST NE MESURE PAS, DIT ICI PLUTÔT QUE SOUS-ENTENDU: il lit
  // la SOURCE, pas le HTML rendu. Monter `MealBuilder` demanderait un client
  // Supabase vivant (il lit le foyer, les plans, l'inventaire au montage), et
  // le patron `renderToStaticMarkup` du dépôt ne s'applique qu'aux composants
  // qui n'en ont pas besoin — `kitchenEquipmentCard.int.test.ts` en est
  // l'exemple. Ce qui rend la lecture de source SUFFISANTE ici, et seulement
  // ici: aucun des blocs n'est déplacé par rapport à sa position dans le
  // fichier, donc l'ordre du fichier EST l'ordre du DOM. La seconde assertion
  // vérifie cette prémisse au lieu de la supposer.
  //
  // ⟳ 2026-09-07 — LA PRÉMISSE A ÉTÉ AMENDÉE, PAS AFFAIBLIE. Elle disait « les
  // trois blocs sont des FRÈRES du même parent JSX, sans enveloppe entre eux ».
  // Il y a maintenant UNE enveloppe: le style et la case partagent une ligne
  // (`grid sm:grid-cols-2`), parce qu'ils sont une seule question. Une grille
  // en flux normal place ses enfants dans l'ordre du DOM — premier enfant =
  // colonne de gauche —, donc la conclusion tient. Ce qui la casserait est une
  // CLASSE, pas une balise: `order-*`, `*-reverse`, `grid-flow-*-dense`. Le
  // troisième test ci-dessous refuse ces classes dans l'enveloppe; sans lui, la
  // prémisse redeviendrait une supposition.

  it("sur `/app/plan`, l'inventaire précède la session, le style et les courses", () => {
    // ⟳ 2026-09-04 — L'ORDRE D'APRÈS: inventaire → style → session → courses.
    // La case est passée SOUS le sélecteur qu'elle précise (l'aide du style
    // annonce déjà « le nombre de fois où le plan vous demande de cuisiner »),
    // et elle reste AVANT les courses. Ce que ce test tient n'a pas bougé:
    // l'inventaire vient AVANT tout ce qui en dépend — la case du congélateur
    // comme « une seule course ».
    const equipment = BUILDER.indexOf("<KitchenEquipmentCard");
    const style = BUILDER.indexOf("<CookingStyleField");
    const runs = BUILDER.indexOf("<GroceryRunsField");
    const session = BUILDER.indexOf("<OneCookingSessionField");
    for (const [name, at] of [["équipement", equipment], ["style", style], ["courses", runs], ["session", session]] as const) {
      expect(at, `${name} introuvable`).toBeGreaterThan(-1);
    }
    expect(equipment, "l'inventaire ne précède plus le style").toBeLessThan(style);
    expect(style, "la case ne suit plus le sélecteur de style").toBeLessThan(session);
    expect(session, "la case ne précède plus les courses").toBeLessThan(runs);
  });

  it("⛔ LA PRÉMISSE: aucune BRANCHE ne reste ouverte, donc la source dit le DOM", () => {
    // Si l'inventaire était rendu dans une branche conditionnelle ou déplacé
    // par du CSS, l'ordre du fichier ne dirait plus rien du DOM et le test
    // au-dessus serait une garde désarmée. On vérifie donc que le `<details>`
    // qui porte l'inventaire est FERMÉ avant que le champ de style ne s'ouvre.
    //
    // ⚠️ CE QUE CETTE MESURE COUVRE, ET CE QU'ELLE NE COUVRE PAS — dit ici
    // depuis que l'enveloppe de la paire style/case existe (2026-09-07). Elle
    // compte des DÉLIMITEURS JS: elle refuse une branche `{cond && (` laissée
    // ouverte, qui rendrait le style conditionnel. Elle ne voit pas les BALISES,
    // et c'est sans conséquence: un élément imbriqué se rend quand même APRÈS
    // les frères qui le précèdent, donc l'inventaire reste avant le style. Ce
    // qui casserait l'ordre est une CLASSE de déplacement — le test suivant.
    const equipment = BUILDER.indexOf("<KitchenEquipmentCard");
    const closes = BUILDER.indexOf("</details>", equipment);
    const style = BUILDER.indexOf("<CookingStyleField");
    expect(closes).toBeGreaterThan(equipment);
    expect(closes, "le style est DANS le bloc de l'inventaire").toBeLessThan(style);
    // ══════════════════════════════════════════════════════════════════════
    // ⟳ 2026-09-03 — LA MESURE A CHANGÉ, LA PRÉMISSE NON.
    // ══════════════════════════════════════════════════════════════════════
    //
    // Elle cherchait « aucune branche ouverte dans l'intervalle »
    // (`/\{\s*\w+\s*(\?|&&)/`). C'était juste tant que rien ne se rendait
    // entre les deux; la grille de présence du foyer vit maintenant là, et
    // elle EST conditionnelle. Or une branche qui s'ouvre ET SE REFERME entre
    // les deux ne déplace personne: c'est un FRÈRE de plus, pas une enveloppe.
    //
    // Ce qui distingue les deux cas est la PROFONDEUR: si l'intervalle ne
    // change pas le niveau d'imbrication, les deux blocs ont le même parent.
    // On compte donc les délimiteurs, commentaires retirés — ce dépôt en écrit
    // des pavés, pleins de parenthèses françaises qui fausseraient le compte.
    const between = BUILDER.slice(closes, style)
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((line) => (line.trimStart().startsWith("//") ? "" : line))
      .join("\n");
    const depth = (open: string, close: string) =>
      (between.split(open).length - 1) - (between.split(close).length - 1);
    expect(depth("(", ")"), `parenthèses non refermées: ${between.trim().slice(0, 160)}`)
      .toBe(0);
    expect(depth("{", "}"), `accolades non refermées: ${between.trim().slice(0, 160)}`)
      .toBe(0);
  });

  it("⛔ LA PAIRE EST SUR UNE LIGNE, ET LA GRILLE NE RETOURNE PAS L'ORDRE", () => {
    // ══════════════════════════════════════════════════════════════════════
    // ⟳ 2026-09-07 — LE STYLE ET LA CASE PARTAGENT UNE LIGNE.
    // ══════════════════════════════════════════════════════════════════════
    //
    // Ils sont UNE question — l'aide du sélecteur annonce « le nombre de fois
    // où le plan vous demande de cuisiner », la case en est le cas extrême —,
    // et c'est la règle des deux écrans: on n'aligne que ce qui n'en fait
    // qu'une (les deux dates de la fenêtre sont l'autre cas).
    //
    // ⛔ CE QUE CE TEST GARDE N'EST PAS LA JOLIESSE, C'EST L'ORDRE DE LECTURE.
    // Une grille en flux normal rend son premier enfant à GAUCHE, donc le DOM
    // et l'écran disent la même chose. Trois familles de classes brisent ça
    // sans toucher une ligne de JSX — `order-*`, `*-reverse`, `*-dense` —, et
    // les quatre tests d'ordre de ce fichier lisent la SOURCE: aucun ne les
    // verrait. La case passerait à gauche du champ qu'elle précise, et la
    // suite verte.
    //
    // ⚠️ COMMENTAIRES RETIRÉS AVANT LA MESURE. Les pavés de ce dépôt NOMMENT
    // les classes interdites pour expliquer pourquoi elles le sont; les lire
    // comme du code ferait échouer le test sur sa propre justification.
    const bare = (src: string) =>
      src
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .map((line) => (line.trimStart().startsWith("//") ? "" : line))
        .join("\n");

    for (const [name, src] of [["MealBuilder", BUILDER], ["SetupPage", SETUP]] as const) {
      const style = src.indexOf("<CookingStyleField");
      const session = src.indexOf("<OneCookingSessionField");
      expect(style, `${name}: le style a disparu`).toBeGreaterThan(-1);
      expect(session, `${name}: la case a disparu`).toBeGreaterThan(style);

      // L'ENVELOPPE: la dernière balise ouvrante avant le sélecteur.
      const open = src.lastIndexOf("<div className=", style);
      expect(open, `${name}: la paire n'a plus d'enveloppe`).toBeGreaterThan(-1);
      const envelope = src.slice(open, style);
      expect(envelope, `${name}: l'enveloppe de la paire n'est pas une grille`)
        .toMatch(/\bgrid\b/);
      // ⚠️ LE REPLI MOBILE EST UNE PIÈCE DE LA GARDE, pas un détail: deux
      // colonnes de texte à 150 px ne rangent rien. `sm:grid-cols-2` dit que
      // la case retombe SOUS le sélecteur en dessous de 640 px.
      expect(envelope, `${name}: la paire ne retombe plus en colonne sous sm`)
        .toMatch(/\bsm:grid-cols-2\b/);

      const inside = bare(src.slice(open, session));
      for (const banned of [/\border-(?:\d|first|last)\b/, /-reverse\b/, /\bdense\b/]) {
        expect(
          banned.test(inside),
          `${name}: ${banned} peut mettre la case à gauche du champ qu'elle précise`,
        ).toBe(false);
      }
    }
  });

  it("dans l'entonnoir aussi, et là c'est l'ÉTAPE qui le garantit", () => {
    // `/app/setup` pose l'inventaire à l'étape « table » et le style à l'étape
    // « demande »: l'ordre y est tenu par la machine d'étapes, pas par la
    // position dans le fichier. On vérifie quand même la position, parce que
    // les deux cartes vivent dans le même composant.
    expect(SETUP.indexOf("<KitchenEquipmentCard")).toBeGreaterThan(-1);
    expect(SETUP.indexOf("<KitchenEquipmentCard")).toBeLessThan(
      SETUP.indexOf("<CookingStyleField"),
    );
  });
});
