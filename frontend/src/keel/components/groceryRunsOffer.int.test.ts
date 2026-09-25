import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import GroceryRunsField from "./GroceryRunsField";
import {
  type CookingSessionCount,
  GROCERY_RUNS_ANY,
  type GroceryRunsAnswer,
  offerableGroceryRuns,
  resolveGroceryRunsAnswer,
} from "../api/cookingPlan";
import { intentAfter, nearestOffered } from "../lib/cookingAnswers";
import { fr } from "../i18n/fr";
import { en } from "../i18n/en";
import { sourceFamily } from "../../test/sourceFamily";

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

const read = (rel: string) => sourceFamily(resolve(__dirname, rel));
const FIELD = read("./GroceryRunsField.tsx");
const BUILDER = read("./MealBuilder.tsx");
const SETUP = read("../pages/SetupPage.tsx");
const FIELDS = readFileSync(resolve(__dirname, "./PlanRequestFields.tsx"), "utf8");

const html = (over: {
  value?: GroceryRunsAnswer | null;
  sessions?: CookingSessionCount | null;
  daysToEat?: number;
  freezer?: boolean | null;
} = {}) =>
  renderToStaticMarkup(
    React.createElement(GroceryRunsField, {
      id: "runs",
      value: over.value ?? null,
      onChange: () => {},
      disabled: false,
      // ⟳ 2026-09-25 — le nombre de sessions choisi juste au-dessus, `null` =
      // pas encore répondu. Il remplace le style et la case « une seule fois ».
      sessions: over.sessions === undefined ? null : over.sessions,
      daysToEat: over.daysToEat ?? 7,
      // ⟳ 2026-09-21 — le congélateur entre dans l'offre; `null` = jamais demandé.
      // ⟳ 2026-09-24 — AVEC par défaut: sans lui, « une course » sort au-delà de
      // trois jours, et les cas de fenêtre et de sessions perdraient leur sens.
      // Les cas sans congélateur le disent explicitement.
      freezer: over.freezer === undefined ? true : over.freezer,
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

/**
 * ⟳ 2026-09-25 — LA VALEUR SÉLECTIONNÉE DANS LE RENDU, ou `null`. Une réponse
 * imposée doit être SÉLECTIONNÉE dans la liste, pas remplacée par une phrase.
 */
const selected = (markup: string) => {
  const found = markup.match(/<option value="(\d)"[^>]*selected/);
  return found ? Number(found[1]) : null;
};

/** La phrase du plafond des sessions, interpolée comme `t()` le fait. */
const cappedBySessions = (dict: typeof en, k: number) =>
  say(dict["plan.cooking.runs_capped_sessions"]).replace(/\{k\}/g, String(k));

describe("l'écran ne propose que ce que le plan fera", () => {
  it("sans contrainte, les trois cadences", () => {
    expect(offered(html())).toEqual([1, 2, 3]);
    // ⟳ 2026-09-16 — SANS PLAFOND, AUCUN MOTIF: l'aide générale a été retirée.
    expect(html()).not.toContain(cappedBySessions(en, 3));
    // Trois ou quatre sessions ne plafonnent rien: le plafond des courses est
    // trois.
    expect(offered(html({ sessions: 4 }))).toEqual([1, 2, 3]);
    expect(offered(html({ sessions: 3 }))).toEqual([1, 2, 3]);
  });

  it("⟳ 2026-09-25 — deux sessions retirent la troisième course, ET LE DISENT", () => {
    // Sur SEPT jours: la conservation autoriserait trois courses, c'est donc
    // bien le nombre de sessions qui plafonne — on ne va pas au magasin plus
    // souvent qu'on ne cuisine — et le motif le nomme.
    const markup = html({ sessions: 2, daysToEat: 7, freezer: true });
    expect(offered(markup)).toEqual([1, 2]);
    // ⛔ LA PHRASE EST LA MOITIÉ QUI COMPTE. Une option qui s'évapore sans
    // motif se lit comme une panne.
    expect(markup).toContain(cappedBySessions(en, 2));
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
      expect(offered(markup), `${daysToEat} jours`).toEqual([1]);
      expect(selected(markup), `${daysToEat} jours`).toBe(1);
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

  it("⛔ À ÉGALITÉ, LA FENÊTRE GAGNE — on n'envoie pas corriger les sessions", () => {
    // Deux sessions et cinq jours plafonnent tous les deux à 2. La fenêtre est
    // concrète, datée, et elle vient d'être réglée plus haut. Sur SEPT jours la
    // conservation ne plafonne plus, et ce sont les sessions qu'on nomme.
    expect(html({ sessions: 2, daysToEat: 5 })).toContain(keeping(en, 5));
    expect(html({ sessions: 2, daysToEat: 5 })).not.toContain(cappedBySessions(en, 2));
    expect(html({ sessions: 2, daysToEat: 7, freezer: true })).toContain(cappedBySessions(en, 2));
  });
});

// ===========================================================================
// ⟳ 2026-09-24 — SANS CONGÉLATEUR, « UNE FOIS » N'EST PLUS PROPOSÉE AU-DELÀ DE
// TROIS JOURS
//
// Décision produit. Avant, l'écran la proposait, le moteur la passait à deux
// courses (`runs_1_needs_freezer`), et rien ne le disait.
// ===========================================================================
describe("sans congélateur, « Une fois » ne couvre pas un plan long", () => {
  // ⟳ 2026-09-25 — LE CONGÉLATEUR N'A PLUS DE PHRASE SOUS COURSES (décision du
  // propriétaire): « Combien de fois tu veux cuisiner », juste au-dessus, le
  // dit déjà. La règle reste: « Une fois » n'est pas proposée.
  const freezerWords = [en["setup.equipment.title"], fr["setup.equipment.title"], "freezer", "congélateur"];

  it("sept jours: « Une fois » sort de la liste, sans phrase de congélateur", () => {
    for (const freezer of [false, null] as const) {
      const markup = html({ freezer, daysToEat: 7 });
      expect(offered(markup), String(freezer)).toEqual([2, 3]);
      for (const word of freezerWords) expect(markup).not.toContain(say(word));
    }
  });

  it("quatre à six jours: « Deux fois » est sélectionné, et la phrase dit pourquoi", () => {
    for (const daysToEat of [4, 5, 6]) {
      for (const sessions of [null, 2, 3, 4] as const) {
        const markup = html({ freezer: false, daysToEat, sessions });
        const où = `${daysToEat}j/${sessions}s`;
        expect(offered(markup), où).toEqual([2]);
        expect(selected(markup), où).toBe(2);
        for (const word of freezerWords) expect(markup, où).not.toContain(say(word));
      }
      // Deux courses suffisent: c'est la fenêtre qui plafonne, à égalité avec
      // deux sessions comme au-delà.
      expect(html({ freezer: false, daysToEat, sessions: 2 })).toContain(keeping(en, daysToEat));
    }
  });

  it("⛔ LE CAS DU 2026-09-25: cinq jours, deux sessions, pas de congélateur", () => {
    const markup = html({ freezer: false, daysToEat: 5, sessions: 2 });
    expect(selected(markup)).toBe(2);
    expect(markup).toMatch(/<option value="1"[^>]*disabled/);
    expect(markup).toMatch(/<option value="3"[^>]*disabled/);
    expect(markup).toContain(keeping(en, 5));
    expect(markup).not.toContain(say(en["plan.cooking.runs_unset"]));
  });

  it("jusqu'à trois jours, un seul lot suffit, avec ou sans congélateur", () => {
    const markup = html({ freezer: false, daysToEat: 3 });
    expect(markup).toContain(say(en["plan.cooking.runs_only_one_batch"]));
    expect(selected(markup)).toBe(1);
  });

  it("le congélateur coché rend « Une fois »", () => {
    expect(offered(html({ freezer: true, daysToEat: 7 }))).toEqual([1, 2, 3]);
  });

  it("⟳ 2026-09-25 — une réponse « Une fois » devenue impossible passe à « Deux fois »", () => {
    const markup = html({ value: 1, freezer: false, daysToEat: 7 });
    expect(offered(markup)).toEqual([2, 3]);
    expect(markup).toMatch(/<option value="1"[^>]*disabled/);
    expect(selected(markup)).toBe(2);
  });

  it("⛔ la phrase qui renvoyait au congélateur n'existe plus, dans aucune langue", () => {
    expect(Object.keys(fr)).not.toContain("plan.cooking.runs_needs_freezer");
    expect(Object.keys(en)).not.toContain("plan.cooking.runs_needs_freezer");
    expect(FIELD).not.toContain("runs_needs_freezer");
  });
});

describe("⟳ 2026-09-25 — quand il n'y a plus qu'une réponse, elle est SÉLECTIONNÉE", () => {
  it("un plan qu'UN SEUL LOT couvre: « Une fois » sélectionnée, et sa raison dessous", () => {
    const markup = html({ daysToEat: 3 });
    // La liste RESTE: on voit ce qui est retenu, et ce qui ne l'est pas.
    expect(markup).toContain("<select");
    expect(selected(markup)).toBe(1);
    expect(markup).toMatch(/<option value="2"[^>]*disabled/);
    expect(markup).toContain(say(en["plan.cooking.runs_only_one_batch"]));
    expect(markup).toContain(say(en["plan.cooking.runs_label"]));
    // ⚠️ PAS DE « PAS ENCORE RÉPONDU » NI DE « PEU IMPORTE »: la réponse est
    // déjà donnée.
    expect(markup).not.toContain(say(en["plan.cooking.runs_unset"]));
    expect(markup).not.toContain(say(en["plan.cooking.runs_any"]));
  });

  it("« une fois » (une seule session): sélectionnée, et la phrase nomme la session", () => {
    for (const daysToEat of [2, 5, 7]) {
      for (const freezer of [true, false] as const) {
        const markup = html({ sessions: 1, freezer, daysToEat });
        expect(selected(markup), `${freezer}/${daysToEat}j`).toBe(1);
        expect(markup).toContain(say(en["plan.cooking.runs_only_one_session"]));
      }
    }
  });

  it("⛔ ET C'EST LA SESSION UNIQUE QU'ON NOMME, pas la fenêtre", () => {
    // Nommer la fenêtre devant une réponse qu'on vient de donner juste
    // au-dessus enverrait corriger la mauvaise réponse.
    const markup = html({ sessions: 1, daysToEat: 2 });
    expect(markup).toContain(say(en["plan.cooking.runs_only_one_session"]));
    expect(markup).not.toContain(say(en["plan.cooking.runs_only_one_batch"]));
  });

  it("⛔ une réponse imposée ne dit jamais « une seule course » sous « Deux fois »", () => {
    for (const daysToEat of [4, 5, 6]) {
      const markup = html({ freezer: false, daysToEat });
      expect(selected(markup)).toBe(2);
      expect(markup).not.toContain(say(en["plan.cooking.runs_only_one_batch"]));
    }
  });

  it("chaque réponse imposée a sa phrase", () => {
    for (const sessions of [null, 1, 2, 3, 4] as const) {
      for (const freezer of [true, false, null] as const) {
        for (let daysToEat = 1; daysToEat <= 7; daysToEat++) {
          const offer = offerableGroceryRuns({ sessions, daysToEat, maxFridgeDays: 3, freezer });
          if (offer.forced === null) continue;
          const markup = html({ sessions, freezer, daysToEat });
          const où = `${sessions}s/${daysToEat}j/${freezer}`;
          expect(selected(markup), où).toBe(offer.forced);
          expect(markup, où).toMatch(/<p class="mt-2 text-sm leading-6 text-ink-soft">[^<]+<\/p>/);
        }
      }
    }
  });
});

describe("⟳ 2026-09-25 — UNE RÉPONSE DEVENUE IMPOSSIBLE GLISSE AU PLUS PROCHE", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // DÉCISION DU PROPRIÉTAIRE, QUI RENVERSE « UNE RÉPONSE DÉJÀ DONNÉE N'EST
  // JAMAIS ÉCRASÉE ». On pouvait garder coché ce qu'on ne pouvait plus
  // choisir: la réponse restait sélectionnée et grisée, partait telle quelle,
  // et le moteur la rabotait en silence. Elle passe maintenant au nombre
  // proposé le plus proche, et c'est lui qui part avec la demande.
  // ══════════════════════════════════════════════════════════════════════════

  it("trois courses, puis deux sessions: « Deux fois »", () => {
    const markup = html({ value: 3, sessions: 2, daysToEat: 7, freezer: true });
    expect(offered(markup)).toEqual([1, 2]);
    expect(markup).toMatch(/<option value="3"[^>]*disabled/);
    expect(selected(markup)).toBe(2);
  });

  it("« peu importe » ne bouge jamais, et rien encore reste rien", () => {
    expect(html({ value: GROCERY_RUNS_ANY, sessions: 2, daysToEat: 7 })).toMatch(
      /<option value="any"[^>]*selected/,
    );
    expect(selected(html({ value: null, daysToEat: 7 }))).toBe(null);
  });

  it("l'écriture automatique passe par `useOfferedAnswer`, et nulle part ailleurs", () => {
    // ⚠️ SUR LA SOURCE: `renderToStaticMarkup` ne joue pas les effets.
    expect(FIELD).toMatch(/useOfferedAnswer<GroceryRunsAnswer>\(\{/);
    expect(FIELD).toMatch(/: nearestOffered\(offer\.values, intent\)/);
    // « Peu importe » est rendu tel quel: il vaut déjà le haut de l'offre.
    expect(FIELD).toMatch(/intent === GROCERY_RUNS_ANY\s*\?\s*intent/);
    // ⛔ ET AUCUN `onChange` AUTOMATIQUE DANS LE CHAMP. Une écriture
    // automatique vit forcément avant le JSX (effet ou corps de rendu); le
    // geste passe par `pick`.
    const beforeJsx = FIELD.slice(0, FIELD.lastIndexOf("  return ("));
    const auto = beforeJsx.split("\n").filter((line) =>
      /onChange\(/.test(line) && !line.trimStart().startsWith("//")
    );
    expect(auto.length, `écriture automatique en trop:\n${auto.join("\n")}`).toBe(0);
  });

  it("⛔ `54aec009` — 3 courses, « Deux fois » en cuisine, puis « Trois fois »: 3 courses", () => {
    // Le scénario rejoué pas à pas sur la règle qu'applique `useOfferedAnswer`:
    // la correction part de la réponse CHOISIE, jamais de la précédente
    // correction.
    const correct = (intent: GroceryRunsAnswer | null, sessions: CookingSessionCount) => {
      const offer = offerableGroceryRuns({ sessions, daysToEat: 7, maxFridgeDays: 3, freezer: false });
      return intent === null || intent === GROCERY_RUNS_ANY
        ? intent
        : nearestOffered(offer.values, intent);
    };
    let wanted: GroceryRunsAnswer | null = 3;
    let auto: GroceryRunsAnswer | null | undefined = undefined;
    let value: GroceryRunsAnswer | null = 3;
    const step = (sessions: CookingSessionCount) => {
      wanted = intentAfter({ value, wanted, auto });
      const shown = correct(wanted ?? value, sessions);
      if (shown !== null && shown !== value) {
        auto = shown;
        value = shown;
      }
      return value;
    };
    expect(step(3)).toBe(3);
    expect(step(2)).toBe(2);
    expect(step(3)).toBe(3);
    // Un geste de la personne, lui, change la réponse choisie.
    wanted = 2;
    auto = undefined;
    value = 2;
    expect(step(3)).toBe(2);
  });
});

describe("les deux écrans nourrissent l'offre, et avec LES MÊMES trois entrées", () => {
  // Une seule qui manquerait ferait proposer sur un écran une cadence que
  // l'autre refuse — et c'est celui qu'on regarde le moins qui garderait
  // l'ancienne offre.
  it("`/app/plan` et l'entonnoir montent le MÊME formulaire", () => {
    // ⟳ 2026-09-23 — le champ vit dans `PlanRequestFields`; les deux écrans le
    // montent, et aucun ne remonte le champ à côté.
    for (const [name, src] of [["MealBuilder", BUILDER], ["SetupPage", SETUP]] as const) {
      expect(src, name).toMatch(/<PlanRequestFields/);
      expect(src, name).not.toMatch(/<GroceryRunsField/);
    }
  });

  it("le formulaire commun passe sessions, fenêtre et congélateur", () => {
    for (const [name, src] of [["PlanRequestFields", FIELDS]] as const) {
      const at = src.indexOf("<GroceryRunsField");
      expect(at, `${name}: le champ a disparu`).toBeGreaterThan(-1);
      const mount = src.slice(at, src.indexOf("/>", at));
      expect(mount, `${name}: les sessions n'atteignent pas l'offre`).toMatch(
        /sessions=\{props\.cookingSessions\}/,
      );
      expect(mount, `${name}: la fenêtre n'atteint pas l'offre`).toMatch(/daysToEat=\{/);
      expect(mount, `${name}: le congélateur n'atteint pas l'offre`).toMatch(/freezer=\{/);
    }
  });

  it("⛔ ET LES SESSIONS SONT LUES AU-DESSUS DU CHAMP, pas ailleurs", () => {
    // L'ordre du formulaire EST l'ordre de la dérivation: on lit les causes
    // avant l'effet.
    for (const [name, src] of [["PlanRequestFields", FIELDS]] as const) {
      expect(src.indexOf("<CookingSessionsField"), name).toBeGreaterThan(-1);
      expect(src.indexOf("<CookingSessionsField"), name).toBeLessThan(
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
        "plan.cooking.runs_capped_sessions",
      ] as const
    ) {
      expect(fr[key], `fr: ${key}`).toBeTruthy();
      expect(en[key], `en: ${key}`).toBeTruthy();
      // Une clé recopiée d'une langue à l'autre est une traduction manquante
      // qui ressemble à une traduction faite.
      expect(fr[key], key).not.toBe(en[key]);
    }
  });

  it("⟳ 2026-09-25 — LE MOTIF DES SESSIONS DIT LE NOMBRE CHOISI, et la règle", () => {
    // Le nombre est celui que la personne vient de choisir juste au-dessus: il
    // est interpolé, jamais écrit en dur — un nombre recopié dans une phrase
    // est un mensonge qui attend qu'on retouche la réponse.
    for (const [lang, dict] of [["fr", fr], ["en", en]] as const) {
      const said = dict["plan.cooking.runs_capped_sessions"];
      expect(said, lang).toContain("{k}");
      expect(said.replace(/\{k\}/g, ""), `${lang}: un chiffre en dur`).not.toMatch(/\d/);
    }
  });

  it("⛔ CHAQUE MOTIF DE L'OFFRE A SA PHRASE — aucun ne sort muet", () => {
    // La garde qui manquait à trois lots de ce dépôt: un vocabulaire fermé
    // élargi d'un cas, et l'écran rend une clé vide sans que rien ne rougisse.
    const seen = new Set<string>();
    for (const sessions of [null, 1, 2, 3, 4] as const) {
      for (const freezer of [true, null] as const) {
        for (const daysToEat of [1, 3, 5, 7]) {
          const { limit } = offerableGroceryRuns({
            sessions,
            daysToEat,
            // Littéral: voir `keeping` ci-dessus.
            maxFridgeDays: 3,
            freezer,
          });
          if (limit !== null) seen.add(limit);
        }
      }
    }
    // ⟳ 2026-09-25 — « sessions » remplace « style »: deux sessions sur sept
    // jours avec congélateur retirent la troisième course. Et « freezer » est
    // retiré: le congélateur est dit par le champ des sessions.
    expect([...seen].sort()).toEqual(["days", "one_session", "sessions"]);
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
    const markup = html({ value: null, sessions: 4, daysToEat: 7 });
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
      sessions: 1,
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
    const markup = html({ value: GROCERY_RUNS_ANY, sessions: 4, daysToEat: 7 });
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
    // ⛔ ET IL RÉSOUT CONTRE L'OFFRE, fenêtre et sessions comprises.
    expect(engine).toContain("offerableGroceryRuns({");
    // ⚠️ SUR LE CODE, COMMENTAIRES RETIRÉS: l'historique du module NOMME
    // encore `sessionCap` pour raconter pourquoi il est parti.
    const code = engine
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((line) => (line.trimStart().startsWith("//") ? "" : line))
      .join("\n");
    expect(code, "un plafond de style est revenu").not.toContain("sessionCap");
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
        sessions: null,
        daysToEat,
        maxFridgeDays: 3,
        freezer: null,
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
        sessions: null,
        daysToEat,
        maxFridgeDays: 3,
        freezer: null,
      });
      expect(top(daysToEat), `${daysToEat} jours`).toBe(
        offer.values[offer.values.length - 1],
      );
    }
  });

  it("⛔ ET « UNE FOIS » (une seule session) LE RAMÈNE À UN", () => {
    // Elle resserre l'offre à une seule valeur; « peu importe » doit la suivre,
    // sinon l'écran et le moteur diraient deux choses sur le même écran.
    expect(
      resolveGroceryRunsAnswer(
        GROCERY_RUNS_ANY,
        offerableGroceryRuns({
          sessions: 1,
          daysToEat: 7,
          maxFridgeDays: 3,
          freezer: null,
        }),
      ),
    ).toBe(1);
  });

  it("⚠️ ET UN NOMBRE DÉJÀ DONNÉ N'EST JAMAIS TOUCHÉ", () => {
    // La garde qui a un cas qui passe: « peu importe » ne doit pas devenir un
    // rabot déguisé sur une réponse que la personne a réellement donnée.
    const offer = offerableGroceryRuns({
      sessions: null,
      daysToEat: 2,
      maxFridgeDays: 3,
      freezer: null,
    });
    expect(resolveGroceryRunsAnswer(3, offer)).toBe(3);
  });
});
