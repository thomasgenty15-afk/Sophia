import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import GroceryRunsField from "./GroceryRunsField";
import {
  type CookingStyle,
  GROCERY_RUNS_ANY,
  type GroceryRunsAnswer,
  offerableGroceryRuns,
  resolveGroceryRunsAnswer,
} from "../api/cookingPlan";
import { fr } from "../i18n/fr";
import { en } from "../i18n/en";

// ===========================================================================
// « COMBIEN DE COURSES ? » — L'OFFRE, 2026-09-04
//
// ⛔ CE QUE CES TESTS TIENNENT, ET CE QU'ILS NE TIENNENT PAS. La RÈGLE est
// épinglée côté serveur (`cooking_plan_test.ts`, dont un test compare l'offre à
// `deriveCookingPlan` cadence par cadence). Ici on tient ce que la règle
// DEVIENT à l'écran: la liste courte, la phrase qui la motive, le contrôle qui
// disparaît quand il n'y a plus de question, et — le point le plus cher — la
// réponse déjà donnée qu'on n'écrase JAMAIS.
//
// ⚠️ `renderToStaticMarkup` NE JOUE PAS LES EFFETS. L'amorce (`onChange` quand
// rien n'est enregistré) se tient donc sur la SOURCE, comme les autres câblages
// de ce dépôt — et le bloc du bas explique pourquoi ce n'est pas une garde au
// rabais ici.
// ===========================================================================

const read = (rel: string) => readFileSync(resolve(__dirname, rel), "utf8");
const FIELD = read("./GroceryRunsField.tsx");
const BUILDER = read("./MealBuilder.tsx");
const SETUP = read("../pages/SetupPage.tsx");

const html = (over: {
  value?: GroceryRunsAnswer | null;
  style?: CookingStyle | null;
  oneCookingSession?: boolean;
  daysToEat?: number;
} = {}) =>
  renderToStaticMarkup(
    React.createElement(GroceryRunsField, {
      id: "runs",
      value: over.value ?? null,
      onChange: () => {},
      disabled: false,
      style: over.style ?? null,
      oneCookingSession: over.oneCookingSession ?? false,
      daysToEat: over.daysToEat ?? 7,
    }),
  );

/**
 * LE TEXTE TEL QUE REACT L'ÉCRIT DANS LA MARKUP.
 *
 * ⚠️ `renderToStaticMarkup` ÉCHAPPE LES GUILLEMETS DROITS (`&quot;`), et l'une
 * des phrases anglaises en porte deux. Comparer la chaîne brute faisait rougir
 * un rendu parfaitement juste — et pire, aurait pu faire « corriger » la
 * traduction pour arranger le test.
 */
const say = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/**
 * LA PHRASE DE CONSERVATION, INTERPOLÉE COMME `t()` LE FAIT.
 *
 * ⚠️ `d` EST UN LITTÉRAL `3`, pas `MAX_FRIDGE_DAYS`. Un test paramétré par sa
 * propre constante reste vert le jour où elle change; la valeur est épinglée
 * une fois pour toutes côté serveur (`week_bounds_test.ts:392`), et c'est
 * CELUI-LÀ qui doit tomber.
 */
const keeping = (dict: typeof en, n: number) =>
  say(dict["plan.cooking.runs_capped_days"]).replace("{n}", String(n)).replace(
    "{d}",
    "3",
  );

/** Les valeurs réellement PROPOSABLES dans le rendu — `disabled` exclu. */
const offered = (markup: string) =>
  [...markup.matchAll(/<option value="(\d)"(?![^>]*disabled)/g)].map((m) => Number(m[1]));

describe("l'écran ne propose que ce que le plan fera", () => {
  it("sans contrainte, les trois cadences", () => {
    expect(offered(html())).toEqual([1, 2, 3]);
    expect(html()).toContain(say(en["plan.cooking.runs_hint"]));
  });

  it("« le moins possible » retire la troisième, ET DIT POURQUOI", () => {
    // Sur SEPT jours: la conservation autoriserait trois sessions, c'est donc
    // bien le style qui plafonne — et le motif le nomme.
    const markup = html({ style: "minimal", daysToEat: 7 });
    expect(offered(markup)).toEqual([1, 2]);
    // ⛔ LA PHRASE EST LA MOITIÉ QUI COMPTE. Une option qui s'évapore sans
    // motif se lit comme une panne, et envoie chercher le réglage manquant
    // dans le mauvais écran.
    expect(markup).toContain(say(en["plan.cooking.runs_capped_style"]));
    expect(markup, "l'aide générale s'empile sous le motif").not.toContain(
      say(en["plan.cooking.runs_hint"]),
    );
  });

  it("⛔ LE PLAFOND DE FENÊTRE EST LA CONSERVATION, pas le compte de jours", () => {
    // ══════════════════════════════════════════════════════════════════════
    // LE DÉFAUT VU SUR UNE CAPTURE, LE SOIR DU LOT: un plan du 4 au 5
    // septembre proposait DEUX courses pour DEUX jours. Un lot cuisiné couvre
    // trois jours — la question n'est pas « combien de courses tiennent dans
    // la fenêtre », c'est « combien il en faut ».
    // ══════════════════════════════════════════════════════════════════════
    for (const daysToEat of [1, 2, 3]) {
      const markup = html({ daysToEat });
      expect(markup, `${daysToEat} jours: un contrôle est resté`).not.toContain(
        "<select",
      );
      expect(markup).toContain(say(en["plan.cooking.runs_only_one_batch"]));
    }
    for (const daysToEat of [4, 5, 6]) {
      const markup = html({ daysToEat });
      expect(offered(markup), `${daysToEat} jours`).toEqual([1, 2]);
      // ⚠️ LES DEUX NOMBRES SONT DANS LA PHRASE, et c'est la soustraction que
      // la personne fait de tête: « cinq jours, un plat en tient trois ».
      expect(markup).toContain(keeping(en, daysToEat));
    }
    expect(offered(html({ daysToEat: 7 }))).toEqual([1, 2, 3]);
  });

  it("⛔ À ÉGALITÉ, LA FENÊTRE GAGNE — on n'envoie pas corriger le style", () => {
    // « le moins possible » et cinq jours plafonnent tous les deux à 2. La
    // fenêtre est concrète, datée, et elle vient d'être réglée trois champs
    // plus haut. Sur SEPT jours la conservation ne plafonne plus, et c'est le
    // style qu'on nomme.
    expect(html({ style: "minimal", daysToEat: 5 })).toContain(keeping(en, 5));
    expect(html({ style: "minimal", daysToEat: 5 })).not.toContain(
      say(en["plan.cooking.runs_capped_style"]),
    );
    expect(html({ style: "minimal", daysToEat: 7 })).toContain(
      say(en["plan.cooking.runs_capped_style"]),
    );
  });
});

describe("quand il n'y a plus qu'une réponse, il n'y a plus de question", () => {
  it("un plan qu'UN SEUL LOT couvre: une phrase, et AUCUN contrôle", () => {
    const markup = html({ daysToEat: 3 });
    // ⛔ PAS DE `<select>` À UNE OPTION. C'est un contrôle qui n'en est pas un:
    // il demande un geste dont le résultat est déjà écrit.
    expect(markup).not.toContain("<select");
    expect(markup).toContain(say(en["plan.cooking.runs_only_one_batch"]));
    // ⚠️ L'ÉTIQUETTE RESTE. La réponse doit rester identifiable: une phrase
    // seule au milieu d'un formulaire ne dit pas de quelle question elle est
    // la réponse.
    expect(markup).toContain(say(en["plan.cooking.runs_label"]));
  });

  it("« tout cuisiner en une seule fois »: une phrase, et elle NOMME la case", () => {
    for (const daysToEat of [2, 5, 7]) {
      for (const style of [null, "minimal", "keen"] as const) {
        const markup = html({ oneCookingSession: true, style, daysToEat });
        expect(markup, `${style}/${daysToEat}j`).not.toContain("<select");
        expect(markup).toContain(say(en["plan.cooking.runs_only_one_session"]));
      }
    }
  });

  it("⛔ ET C'EST LA CASE QU'ON NOMME, pas la fenêtre ni le style", () => {
    // Nommer la fenêtre devant une case qu'on vient de cocher enverrait
    // corriger la mauvaise réponse.
    const markup = html({ oneCookingSession: true, style: "minimal", daysToEat: 2 });
    expect(markup).toContain(say(en["plan.cooking.runs_only_one_session"]));
    expect(markup).not.toContain(say(en["plan.cooking.runs_only_one_batch"]));
  });
});

describe("⛔ UNE RÉPONSE DÉJÀ DONNÉE N'EST JAMAIS ÉCRASÉE", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // LE DÉFAUT QUE CE BLOC EXISTE POUR EMPÊCHER, ET IL EST SILENCIEUX.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // `grocery_runs` est DURABLE — c'est la tolérance de la personne, pas une
  // propriété de la semaine. Un champ qui raboterait « trois courses » à
  // « deux » parce que CETTE fenêtre fait deux jours lui retirerait, pour
  // toujours, une réponse qu'elle avait donnée: la semaine suivante repartirait
  // d'un chiffre que personne n'a choisi. C'est mot pour mot la cicatrice
  // « la coche automatique écrit des faits faux indémentables ».

  it("une valeur hors offre reste VISIBLE et sélectionnée, désactivée", () => {
    const markup = html({ value: 3, style: "minimal", daysToEat: 7 });
    expect(offered(markup), "trois est redevenu proposable").toEqual([1, 2]);
    expect(markup, "la réponse enregistrée a disparu du contrôle").toMatch(
      /<option value="3"[^>]*disabled/,
    );
  });

  it("l'amorce n'écrit QUE sur une réponse absente", () => {
    // ⚠️ SUR LA SOURCE: `renderToStaticMarkup` ne joue pas les effets. Ce qui
    // rend la lecture suffisante ici, c'est que la condition tient en une
    // ligne et qu'elle porte les DEUX moitiés — la seule forme qui puisse être
    // lue de travers est `if (forced !== null)` tout court.
    expect(FIELD).toMatch(
      /if \(forced !== null && value === null\) onChange\(forced\)/,
    );
    // ⛔ ET AUCUN AUTRE `onChange` AUTOMATIQUE. Un `clamp` ajouté plus tard
    // ferait exactement le rabotage que ce bloc interdit.
    //
    // ⟳ 2026-09-09 — LA MESURE ÉTAIT LIGNE À LIGNE, ET ELLE A CRIÉ AU LOUP.
    // Elle comptait les lignes portant `onChange(` sans `e.target.value` sur
    // LA MÊME ligne. Un gestionnaire écrit sur plusieurs lignes — celui de
    // « peu importe », qui doit tester le jeton avant de nombrifier — met donc
    // `onChange(` seul sur sa ligne, et le test le lisait comme une écriture
    // automatique. Replier le code pour plaire à la mesure aurait été le
    // mauvais sens: c'est la mesure qui ne disait pas ce qu'elle voulait dire.
    //
    // ⚠️ CE QU'ELLE VEUT DIRE: « aucune écriture HORS d'un geste ». Une
    // écriture automatique vit forcément avant le JSX (effet ou corps de
    // rendu); tout ce qui est dans le `return (` est accroché à un événement.
    // On coupe donc à la frontière plutôt que de deviner ligne par ligne.
    const beforeJsx = FIELD.slice(0, FIELD.lastIndexOf("  return ("));
    const auto = beforeJsx.split("\n").filter((line) =>
      /onChange\(/.test(line) && !line.trimStart().startsWith("//")
    );
    expect(auto.length, `écriture automatique en trop:\n${auto.join("\n")}`).toBe(1);
  });
});

describe("les deux écrans nourrissent l'offre, et avec LES MÊMES trois entrées", () => {
  // Une seule qui manquerait ferait proposer sur un écran une cadence que
  // l'autre refuse — et c'est celui qu'on regarde le moins qui garderait
  // l'ancienne offre.
  it("`/app/plan` et l'entonnoir passent style, case et fenêtre", () => {
    for (const [name, src] of [["MealBuilder", BUILDER], ["SetupPage", SETUP]] as const) {
      const at = src.indexOf("<GroceryRunsField");
      expect(at, `${name}: le champ a disparu`).toBeGreaterThan(-1);
      const mount = src.slice(at, src.indexOf("/>", at));
      expect(mount, `${name}: le style n'atteint pas l'offre`).toMatch(/\bstyle=\{/);
      expect(mount, `${name}: la case n'atteint pas l'offre`).toMatch(
        /oneCookingSession=\{/,
      );
      expect(mount, `${name}: la fenêtre n'atteint pas l'offre`).toMatch(/daysToEat=\{/);
    }
  });

  it("⛔ ET LA CASE EST LUE AU-DESSUS DU CHAMP, pas ailleurs", () => {
    // L'ordre du formulaire EST l'ordre de la dérivation: on lit les causes
    // avant l'effet. Une case posée SOUS la liste ferait bouger la liste
    // au-dessus du geste qui la change.
    for (const [name, src] of [["MealBuilder", BUILDER], ["SetupPage", SETUP]] as const) {
      expect(src.indexOf("<OneCookingSessionField"), name).toBeLessThan(
        src.indexOf("<GroceryRunsField"),
      );
      expect(src.indexOf("<CookingStyleField"), name).toBeLessThan(
        src.indexOf("<GroceryRunsField"),
      );
    }
  });
});

describe("les mots existent dans les deux langues", () => {
  it("les quatre phrases de l'offre sont traduites", () => {
    for (
      const key of [
        "plan.cooking.runs_only_one_session",
        "plan.cooking.runs_only_one_batch",
        "plan.cooking.runs_capped_days",
        "plan.cooking.runs_capped_style",
      ] as const
    ) {
      expect(fr[key], `fr: ${key}`).toBeTruthy();
      expect(en[key], `en: ${key}`).toBeTruthy();
      // Une clé recopiée d'une langue à l'autre est une traduction manquante
      // qui ressemble à une traduction faite.
      expect(fr[key], key).not.toBe(en[key]);
    }
  });

  it("⛔ LE MOTIF DU STYLE EXPLIQUE LA SESSION, il ne compte pas les courses", () => {
    // ══════════════════════════════════════════════════════════════════════
    // ⟳ 2026-09-04 (soir) — LA PHRASE COMPTAIT AU LIEU D'EXPLIQUER.
    // ══════════════════════════════════════════════════════════════════════
    //
    // « le plan ne cuisine pas trois fois : une troisième course n'aurait rien
    // à acheter ». Le nombre n'intéresse personne — ce qui manque à la
    // personne, c'est CE QU'EST une session de cuisine, l'unité sur laquelle
    // repose toute la question, et qui n'était dite nulle part dans l'écran.
    for (const [lang, dict] of [["fr", fr], ["en", en]] as const) {
      const said = dict["plan.cooking.runs_capped_style"];
      // ⛔ AUCUN NOMBRE, ni en chiffres ni en toutes lettres: le seul qui
      // comptait était le plafond du style, une valeur de moteur.
      expect(said, `${lang}: un chiffre est revenu`).not.toMatch(/\d/);
      for (const word of lang === "fr" ? ["trois", "deux"] : ["three", "two"]) {
        expect(said.toLowerCase(), `${lang}: « ${word} » est revenu`).not.toContain(
          word,
        );
      }
      // ⚠️ ET ELLE NOMME LA RÉPONSE CHOISIE, mot pour mot le libellé de
      // l'option. Le libellé est LU du dictionnaire, jamais recopié: le jour
      // où l'option est renommée, ce test tombe au lieu de laisser la phrase
      // seule avec l'ancien mot.
      const label = dict["plan.cooking.style_minimal"].split("—")[0].trim();
      expect(
        said.toLowerCase(),
        `${lang}: le motif ne cite plus « ${label} »`,
      ).toContain(label.toLowerCase());
    }
  });

  it("⛔ CHAQUE MOTIF DE L'OFFRE A SA PHRASE — aucun ne sort muet", () => {
    // La garde qui manquait à trois lots de ce dépôt: un vocabulaire fermé
    // élargi d'un cas, et l'écran rend une clé vide sans que rien ne rougisse.
    const seen = new Set<string>();
    for (const style of [null, "minimal", "balanced", "keen"] as const) {
      for (const oneCookingSession of [true, false]) {
        for (const daysToEat of [1, 3, 5, 7]) {
          const { limit } = offerableGroceryRuns({
            style,
            oneCookingSession,
            daysToEat,
            // Littéral: voir `keeping` ci-dessus.
            maxFridgeDays: 3,
          });
          if (limit !== null) seen.add(limit);
        }
      }
    }
    expect([...seen].sort()).toEqual(["days", "one_session", "style"]);
    for (const limit of seen) {
      expect(FIELD, `motif sans phrase: ${limit}`).toContain(`${limit}:`);
    }
  });
});

// ===========================================================================
// « PEU IMPORTE » — 2026-09-09
//
// ⛔ CE QUI EST TESTÉ N'EST PAS L'OPTION, C'EST QU'ELLE ALLE QUELQUE PART.
// Ce dépôt a mesuré quatre fois la même forme d'échec: un champ écrit,
// traduit, visible, et dont la réponse ne va nulle part. Ici le piège est
// particulier: « peu importe » RESSEMBLE à « pas répondu », donc une mauvaise
// lecture ne plante pas — elle repose la question.
// ===========================================================================

describe("« peu importe » est une RÉPONSE, et elle circule", () => {
  it("l'option est offerte quand il reste plusieurs cadences", () => {
    const markup = html({ value: null, style: "keen", daysToEat: 7 });
    expect(markup).toContain(`value="${GROCERY_RUNS_ANY}"`);
    // ⚠️ `en`, PAS `fr`: ce harnais rend dans la langue par défaut, et les
    // autres cas du fichier comparent déjà aux clés anglaises. `say()` refait
    // l'échappement de React plutôt que de le contourner.
    expect(markup).toContain(say(en["plan.cooking.runs_any"]));
    // ET LES DEUX PACKS LA PORTENT: une option rendue sans libellé français
    // sortirait en anglais au milieu d'un formulaire français.
    expect(fr["plan.cooking.runs_any"]).toBeTruthy();
  });

  it("⛔ ET PAS QUAND IL N'Y A RIEN À CHOISIR", () => {
    // « Choisis pour moi » devant une liste d'une seule valeur est une porte
    // qui n'ouvre sur rien — et deux façons de dire le même nombre.
    const markup = html({
      value: null,
      style: "minimal",
      oneCookingSession: true,
      daysToEat: 7,
    });
    expect(markup).not.toContain(`value="${GROCERY_RUNS_ANY}"`);
  });

  it("⛔ LE JETON PASSE AVANT LE `Number()` — sinon « peu importe » vaut `null`", () => {
    // `Number("any")` est `NaN`, et `readGroceryRuns` rend `null` dessus: la
    // réponse serait relue comme « pas encore répondu », donc l'entonnoir se
    // rebloquerait sur une question à laquelle on vient de répondre.
    const handler = FIELD.slice(FIELD.indexOf("onChange={(e) =>"));
    const token = handler.indexOf(`e.target.value === GROCERY_RUNS_ANY`);
    const num = handler.indexOf("Number(e.target.value)");
    expect(token, "le jeton n'est plus testé").toBeGreaterThan(-1);
    expect(token, "le `Number()` passe avant le jeton").toBeLessThan(num);
  });

  it("⚠️ ET IL N'EST JAMAIS « PÉRIMÉ »: il ne nomme aucun nombre", () => {
    // Une valeur hors offre est rendue désactivée. « peu importe » ne nomme
    // aucune cadence, donc aucun resserrement ne peut le rendre impossible —
    // le tester contre l'offre le grillerait au premier plan court.
    const markup = html({ value: GROCERY_RUNS_ANY, style: "keen", daysToEat: 7 });
    expect(markup).not.toMatch(
      new RegExp(`<option value="${GROCERY_RUNS_ANY}"[^>]*disabled`),
    );
  });

  it("⛔ LA GARDE DE L'ÉTAPE LE COMPTE COMME RÉPONDU", () => {
    // Le maillon qui manquait le plus facilement: `missesForStep` lit
    // `state.plan.groceryRuns`, alimenté par `readGroceryRunsAnswer`. Avec
    // `readGroceryRuns`, « peu importe » y arrive en `null` et l'entonnoir
    // reste bloqué devant un contrôle déjà rempli.
    const onboarding = readFileSync(
      resolve(__dirname, "../api/onboarding.ts"),
      "utf8",
    );
    expect(onboarding).toContain("groceryRuns: readGroceryRunsAnswer(pc)");
  });

  it("⛔ ET LE MOTEUR LE RÉSOUT EN NOMBRE, à UN seul endroit", () => {
    // `runs === null` ne veut pas dire « le moteur choisit »: ça veut dire
    // AUCUN plan de cuisine dérivé (`resolveCookingCapacity` rend
    // `plan: null`). « peu importe » doit donc devenir un nombre, et une seule
    // fois — deux résolutions divergeraient au premier plafond retouché.
    const engine = readFileSync(
      resolve(__dirname, "../../../../supabase/functions/_shared/keel/cooking_plan.ts"),
      "utf8",
    );
    expect(engine).toContain("resolveGroceryRunsAnswer(");
    // ⛔ ET IL RÉSOUT CONTRE L'OFFRE, PAS CONTRE LE PLAFOND DU STYLE. Voir le
    // test ci-dessous: le style ne sait rien de la FENÊTRE.
    expect(engine).toContain("offerableGroceryRuns({");
    expect(engine, "le plafond du style est redevenu la source")
      .not.toContain("COOKING_STYLE_PROFILE[style].sessionCap");
  });
});

// ===========================================================================
// ⛔ « PEU IMPORTE » SUIT LA FENÊTRE — 2026-09-09
//
// LE DÉFAUT, SIGNALÉ AVANT D'AVOIR MORDU EN RÉEL: « ça peut pas être 3 sessions
// de courses si le plan fait 2 jours ». Exact. La résolution lisait le plafond
// du STYLE, qui ne sait rien de la fenêtre. Mesuré en `balanced`:
//
//     plan     l'écran offrait   résolvait à   le plan sortait
//     2 jours  [1]               3             runs=2 + note « raboté »
//     3 jours  [1]               3             runs=3, AUCUNE note
//     5 jours  [1, 2]            3             runs=3, AUCUNE note
//
// Deux défauts. À 2 jours, `runs_capped_by_sessions` dit « tu en as demandé
// plus » à quelqu'un qui n'a rien demandé. À 3 et 5 jours rien ne rabote: trois
// passages au magasin pour un plan couvrable en une course, sans une phrase.
// ===========================================================================

describe("« peu importe » vaut le HAUT DE L'OFFRE, fenêtre comprise", () => {
  const top = (daysToEat: number) =>
    resolveGroceryRunsAnswer(
      GROCERY_RUNS_ANY,
      offerableGroceryRuns({
        style: "balanced",
        oneCookingSession: false,
        daysToEat,
        maxFridgeDays: 3,
      }),
    );

  it("⛔ UN PLAN COURT NE DEMANDE PAS TROIS COURSES", () => {
    expect(top(2), "2 jours").toBe(1);
    expect(top(3), "3 jours").toBe(1);
  });

  it("et il monte avec la fenêtre, sans jamais dépasser l'offre", () => {
    expect(top(5)).toBe(2);
    expect(top(7)).toBe(3);
  });

  it("⚠️ LA PRÉMISSE: c'est EXACTEMENT le haut de ce que l'écran propose", () => {
    // Une seconde arithmétique écrite à côté (`min(styleCap, ceil(jours / 3))`)
    // divergerait au premier plafond retouché — le jumeau que ce dépôt a déjà
    // supprimé une fois. On compare donc à l'offre elle-même, pas à un nombre.
    for (const daysToEat of [1, 2, 3, 4, 5, 6, 7]) {
      const offer = offerableGroceryRuns({
        style: "balanced",
        oneCookingSession: false,
        daysToEat,
        maxFridgeDays: 3,
      });
      expect(top(daysToEat), `${daysToEat} jours`).toBe(
        offer.values[offer.values.length - 1],
      );
    }
  });

  it("⛔ ET LA CASE « une seule fois » LE RAMÈNE À UN", () => {
    // Elle resserre l'offre à une seule valeur; « peu importe » doit la suivre,
    // sinon l'écran et le moteur diraient deux choses sur le même écran.
    expect(
      resolveGroceryRunsAnswer(
        GROCERY_RUNS_ANY,
        offerableGroceryRuns({
          style: "keen",
          oneCookingSession: true,
          daysToEat: 7,
          maxFridgeDays: 3,
        }),
      ),
    ).toBe(1);
  });

  it("⚠️ ET UN NOMBRE DÉJÀ DONNÉ N'EST JAMAIS TOUCHÉ", () => {
    // La garde qui a un cas qui passe: « peu importe » ne doit pas devenir un
    // rabot déguisé sur une réponse que la personne a réellement donnée.
    const offer = offerableGroceryRuns({
      style: "balanced",
      oneCookingSession: false,
      daysToEat: 2,
      maxFridgeDays: 3,
    });
    expect(resolveGroceryRunsAnswer(3, offer)).toBe(3);
  });
});
