import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { fr } from "../i18n/fr";
import { readDishes } from "../api/mealGeneration";
import { boxLinesForDish } from "../lib/mealBoxes";
import { en } from "../i18n/en";
import { sourceFamily } from "../../test/sourceFamily";
import CookingSessionsField from "./CookingSessionsField";
import SessionTimeField from "./SessionTimeField";
import { type CookingSessionCount, type SessionTimeBound } from "../api/cookingPlan";

// ===========================================================================
// « COMBIEN DE FOIS TU VEUX CUISINER » ET « TEMPS PAR SESSION » — 2026-09-25
//
// Ils remplacent « Comment tu cuisines » (le style) et « Tout cuisiner en une
// seule fois » (la case), dont ce fichier tenait le câblage sous le nom
// `oneCookingSessionField.int.test.ts`.
//
// ⛔ CE QUI EST TESTÉ ICI N'EST PAS SEULEMENT LE COMPOSANT, C'EST QU'IL SOIT
// BRANCHÉ. Ce dépôt a mesuré trois fois la même forme d'échec: un champ écrit,
// traduit, testé, visible — et dont la réponse ne va nulle part. Ce qui compte
// est qu'un écran le monte, qu'il reçoive SES portes (la fenêtre, le
// congélateur, les repas), et que la valeur parte.
// ===========================================================================

const read = (rel: string) => sourceFamily(resolve(__dirname, rel));
const BUILDER = read("./MealBuilder.tsx");
const SETUP = read("../pages/SetupPage.tsx");
// LES CHAMPS VIVENT ICI, et les deux écrans montent ce composant. L'ordre et le
// câblage des champs se lisent donc dans ce fichier.
const FIELDS = read("./PlanRequestFields.tsx");

/** Le texte tel que `renderToStaticMarkup` l'échappe. */
const say = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
/** Les valeurs réellement PROPOSABLES dans le rendu — `disabled` exclu. */
const offered = (markup: string) =>
  [...markup.matchAll(/<option value="(\d+)"(?![^>]*disabled)/g)].map((m) => Number(m[1]));
const greyed = (markup: string) =>
  [...markup.matchAll(/<option value="(\d+)"[^>]*disabled/g)].map((m) => Number(m[1]));

const sessionsHtml = (over: {
  value?: CookingSessionCount | null;
  daysToEat?: number;
  freezer?: boolean;
  showMissing?: boolean;
} = {}) =>
  renderToStaticMarkup(
    React.createElement(CookingSessionsField, {
      id: "sessions",
      value: over.value ?? null,
      onChange: () => {},
      disabled: false,
      daysToEat: over.daysToEat ?? 7,
      freezer: over.freezer ?? true,
      showMissing: over.showMissing ?? false,
    }),
  );

const timeHtml = (over: {
  value?: SessionTimeBound | null;
  daysToEat?: number;
  sessions?: CookingSessionCount | null;
  mealsPerDay?: number;
  showMissing?: boolean;
} = {}) =>
  renderToStaticMarkup(
    React.createElement(SessionTimeField, {
      id: "time",
      value: over.value ?? null,
      onChange: () => {},
      disabled: false,
      daysToEat: over.daysToEat ?? 7,
      sessions: over.sessions === undefined ? 1 : over.sessions,
      mealsPerDay: over.mealsPerDay ?? 2,
      showMissing: over.showMissing ?? false,
    }),
  );

const bare = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => (line.trimStart().startsWith("//") ? "" : line))
    .join("\n");

describe("UN SEUL FORMULAIRE, MONTÉ PAR LES DEUX ÉCRANS", () => {
  // Demandé: « quand on change dans l'un ça doit changer dans l'autre ». La
  // garde: chaque écran monte `PlanRequestFields`, et aucun ne remonte un des
  // champs à côté.
  const FIELD_TAGS = [
    "<CookingSessionsField",
    "<SessionTimeField",
    "<GroceryRunsField",
    "<KitchenEquipmentCard",
    "<MealPickerGrid",
  ];

  it("les deux écrans montent `PlanRequestFields`", () => {
    expect(BUILDER).toMatch(/<PlanRequestFields/);
    expect(SETUP).toMatch(/<PlanRequestFields/);
  });

  it("⛔ l'entonnoir ne remonte AUCUN champ à côté", () => {
    for (const tag of FIELD_TAGS) {
      expect(bare(SETUP), `SetupPage monte encore ${tag}`).not.toContain(tag);
    }
  });

  it("⛔ `/app/plan` non plus — sauf la grille du membre secondaire", () => {
    for (const tag of FIELD_TAGS.filter((x) => x !== "<MealPickerGrid")) {
      expect(bare(BUILDER), `MealBuilder monte encore ${tag}`).not.toContain(tag);
    }
    expect(bare(BUILDER).split("<MealPickerGrid").length - 1).toBe(1);
  });

  it("⛔ LE STYLE ET LA CASE SONT PARTIS DES DEUX ÉCRANS, et leurs mots aussi", () => {
    for (const [name, src] of [["MealBuilder", BUILDER], ["SetupPage", SETUP], ["PlanRequestFields", FIELDS]] as const) {
      const code = bare(src);
      expect(code, name).not.toMatch(/CookingStyleField|OneCookingSessionField/);
      expect(code, name).not.toMatch(/cookingStyle|oneCookingSession/);
    }
    for (
      const key of [
        "plan.cooking.style_label",
        "plan.cooking.style_unset",
        "plan.cooking.style_minimal",
        "plan.cooking.style_balanced",
        "plan.cooking.style_keen",
        "plan.cooking.one_session_label",
        "plan.cooking.one_session_needs_freezer",
        "plan.cooking.runs_capped_style",
      ]
    ) {
      expect(fr, `fr: ${key}`).not.toHaveProperty(key);
      expect(en, `en: ${key}`).not.toHaveProperty(key);
    }
  });
});

describe("les deux champs sont montés et branchés sur les DEUX surfaces", () => {
  it("sur `/app/plan` (MealBuilder)", () => {
    expect(BUILDER).toMatch(/cookingSessions=\{cookingSessions\}/);
    expect(BUILDER).toMatch(/onCookingSessions=\{setCookingSessions\}/);
    expect(BUILDER).toMatch(/sessionTime=\{sessionTime\}/);
    expect(BUILDER).toMatch(/onSessionTime=\{setSessionTime\}/);
    expect(BUILDER).toMatch(/showCookingMisses=\{cookingMissesShown\}/);
  });

  it("sur l'entonnoir (SetupPage, étape « demande »)", () => {
    expect(SETUP).toMatch(/cookingSessions=\{cookingSessions\}/);
    expect(SETUP).toMatch(/onCookingSessions=\{onCookingSessions\}/);
    // La plage est une réponse DURABLE: elle vit dans les réponses de plan.
    expect(SETUP).toMatch(/cookingTimeMin: next/);
    expect(SETUP).toMatch(/showCookingMisses=\{showCookingMisses\}/);
  });

  it("et le formulaire commun les branche, avec leurs portes", () => {
    expect(FIELDS).toMatch(/<CookingSessionsField/);
    expect(FIELDS).toMatch(/value=\{props\.cookingSessions\}/);
    expect(FIELDS).toMatch(/<SessionTimeField/);
    expect(FIELDS).toMatch(/value=\{props\.sessionTime\}/);
    // ⛔ LE TEMPS LIT LE NOMBRE DE SESSIONS CHOISI JUSTE À CÔTÉ, et les
    // courses aussi: une seule source, jamais un second état.
    expect(FIELDS).toMatch(/sessions=\{props\.cookingSessions\}/);
    expect((FIELDS.match(/sessions=\{props\.cookingSessions\}/g) ?? []).length).toBe(2);
    // Les repas de la maison viennent de « Qui mange à la maison ».
    expect(FIELDS).toMatch(/mealsPerDay=\{presenceMealsPerDay\(props\.presence\)\}/);
    // Le congélateur, par le MIROIR du moteur.
    expect(FIELDS).toMatch(/hasFreezerDeclared\(/);
    expect(FIELDS).toMatch(/freezer=\{hasFreezer\}/);
  });

  it("⛔ L'ORDRE: combien de fois, puis combien de temps, puis les courses", () => {
    // Les sessions bornent le temps et les courses: on lit les causes avant
    // les effets. Les deux surfaces montent le même formulaire, donc le même
    // ordre.
    const sessions = FIELDS.indexOf("<CookingSessionsField");
    const time = FIELDS.indexOf("<SessionTimeField");
    const runs = FIELDS.indexOf("<GroceryRunsField");
    expect(sessions).toBeGreaterThan(-1);
    expect(time).toBeGreaterThan(sessions);
    expect(runs).toBeGreaterThan(time);
  });

  it("⛔ « LES JOURS OÙ TU CUISINES » N'EST PLUS NULLE PART", () => {
    // Un champ qui revient par une page oubliée réécrirait `cook_days` et
    // ressusciterait une contrainte que le moteur lit encore.
    for (const [name, src] of [["MealBuilder", BUILDER], ["SetupPage", SETUP], ["PlanRequestFields", FIELDS]] as const) {
      expect(src, name).not.toMatch(/plan\.cooking\.days_label/);
      expect(src, name).not.toMatch(/setup\.plan\.cook_days/);
      expect(src, name).not.toMatch(/cookDays/);
    }
  });
});

describe("« combien de fois »: ce qu'il propose, ce qu'il grise, et pourquoi", () => {
  it("de 1 au nombre de jours, quatre au plus", () => {
    expect(offered(sessionsHtml({ daysToEat: 7 }))).toEqual([1, 2, 3, 4]);
    expect(offered(sessionsHtml({ daysToEat: 2 }))).toEqual([1, 2]);
  });

  it("⛔ sans congélateur, les options trop basses restent VISIBLES, grisées, et la phrase dit pourquoi", () => {
    const markup = sessionsHtml({ daysToEat: 7, freezer: false });
    expect(offered(markup)).toEqual([3, 4]);
    expect(greyed(markup)).toEqual([1, 2]);
    expect(markup).toContain(
      say(en["plan.cooking.sessions_needs_freezer"]).replace("{d}", "3").replace("{n}", "7").replace(
        "{min}",
        "3",
      ),
    );
    // Avec congélateur, rien n'est grisé, et rien n'est dit.
    const ok = sessionsHtml({ daysToEat: 7, freezer: true });
    expect(greyed(ok)).toEqual([]);
    expect(ok).not.toContain(say(en["plan.cooking.sessions_needs_freezer"]).slice(0, 20));
  });

  it("la phrase nomme la carte où on lève le refus, dans les deux langues", () => {
    for (const [lang, dict] of [["fr", fr], ["en", en]] as const) {
      expect(dict["plan.cooking.sessions_needs_freezer"], lang).toContain(dict["setup.equipment.title"]);
    }
  });

  // ⟳ 2026-09-25 — la seule réponse possible est SÉLECTIONNÉE, avec sa raison
  // dessous (décision du propriétaire). Avant, une phrase remplaçait la liste.
  it("un plan d'un jour: « Une fois » sélectionnée, et une phrase dessous", () => {
    const markup = sessionsHtml({ daysToEat: 1 });
    expect(markup).toContain("<select");
    expect(markup).toMatch(/<option value="1"[^>]*selected/);
    expect(offered(markup)).toEqual([1]);
    expect(markup).not.toContain(say(en["plan.cooking.sessions_unset"]));
    expect(markup).toContain(say(en["plan.cooking.sessions_only_one"]));
    expect(markup).toContain(say(en["plan.cooking.sessions_label"]));
  });

  it("⟳ 2026-09-25 — une réponse devenue impossible glisse au plus proche, et c'est elle qui part", () => {
    // SUR LA SOURCE: `renderToStaticMarkup` ne joue pas les effets.
    const FIELD = read("./CookingSessionsField.tsx");
    expect(FIELD).toMatch(/useOfferedAnswer<CookingSessionCount>\(\{/);
    expect(FIELD).toMatch(/: nearestOffered\(offer\.values, intent\)/);
    // Le rendu montre la réponse corrigée même avant que l'effet ait joué.
    expect(sessionsHtml({ value: 3, daysToEat: 1 })).toMatch(/<option value="1"[^>]*selected/);
    // Quatre fois sur deux jours ⇒ deux fois.
    expect(sessionsHtml({ value: 4, daysToEat: 2 })).toMatch(/<option value="2"[^>]*selected/);
    // Une fois sur sept jours, congélateur décoché ⇒ trois fois, le minimum.
    expect(sessionsHtml({ value: 1, daysToEat: 7, freezer: false })).toMatch(
      /<option value="3"[^>]*selected/,
    );
    // Rien encore ⇒ rien: on ne répond pas à la place de la personne.
    expect(sessionsHtml({ daysToEat: 7 })).not.toMatch(/<option value="\d"[^>]*selected/);
  });

  it("« Une fois » sur un plan long dit l'autre moitié du marché", () => {
    expect(sessionsHtml({ value: 1, daysToEat: 7, freezer: true })).toContain(
      say(en["plan.cooking.one_session_hint"]),
    );
    // Sur deux jours, le frigo suffit: rien à dire.
    expect(sessionsHtml({ value: 1, daysToEat: 2, freezer: true })).not.toContain(
      say(en["plan.cooking.one_session_hint"]),
    );
  });

  it("le refus du clic se lit SOUS le champ, et meurt avec sa cause", () => {
    expect(sessionsHtml({ showMissing: true })).toContain(say(en["plan.cooking.sessions_required"]));
    expect(sessionsHtml({ showMissing: true, value: 3 })).not.toContain(
      say(en["plan.cooking.sessions_required"]),
    );
  });
});

describe("« temps par session »: des durées « environ », bornées par le plan", () => {
  // ⟳ 2026-09-25 (soir) — 30 min · 1 h · 1 h 30 · 2 h · 2 h 30; 10 min par repas;
  // « 30 min » seulement quand chaque session couvre deux jours au plus.
  it("le libellé dit « environ »", () => {
    expect(fr["plan.cooking.time_label"]).toBe("Temps par session de cuisine (environ)");
    expect(timeHtml()).toContain(say(en["plan.cooking.time_label"]));
  });

  it("⛔ une session pour sept jours: « 2 h 30 » sélectionnée d'office, et la raison dessous", () => {
    const markup = timeHtml({ daysToEat: 7, sessions: 1 });
    expect(offered(markup)).toEqual([150]);
    expect(greyed(markup)).toEqual([30, 60, 90, 120]);
    expect(markup).toMatch(/<option value="150"[^>]*selected/);
    expect(markup).not.toContain(say(en["plan.cooking.time_unset"]));
    expect(markup).toContain(
      say(en["plan.cooking.time_minimum"]).replace("{d}", "7").replace(
        "{band}",
        say(en["plan.cooking.time_band_150"]),
      ),
    );
  });

  it("trois sessions pour sept jours: « 1 h » suffit", () => {
    expect(offered(timeHtml({ daysToEat: 7, sessions: 3 }))).toEqual([60, 90, 120, 150]);
  });

  it("quatre sessions pour sept jours: tout, dès « 30 min »", () => {
    expect(offered(timeHtml({ daysToEat: 7, sessions: 4 }))).toEqual([30, 60, 90, 120, 150]);
  });

  it("⛔ « 30 min » jamais au-delà de deux jours par session, même le soir seulement", () => {
    // 3 jours × 1 repas × 10 min = 30 min au calcul: refusé quand même.
    expect(offered(timeHtml({ daysToEat: 3, sessions: 1, mealsPerDay: 1 }))).toEqual([60, 90, 120, 150]);
  });

  it("une maison qui ne mange à la maison que le soir a besoin de moins", () => {
    // 7 jours, 2 sessions: 4 jours × 1 repas × 10 min = 40 min.
    expect(offered(timeHtml({ daysToEat: 7, sessions: 2, mealsPerDay: 1 }))).toEqual([60, 90, 120, 150]);
    expect(offered(timeHtml({ daysToEat: 7, sessions: 2, mealsPerDay: 2 }))).toEqual([90, 120, 150]);
  });

  it("sans nombre de sessions, aucune durée n'est grisée", () => {
    const markup = timeHtml({ sessions: null });
    expect(greyed(markup)).toEqual([]);
    expect(offered(markup)).toEqual([30, 60, 90, 120, 150]);
  });

  it("⛔ le chiffre en minutes n'est JAMAIS affiché — seulement des durées proposées", () => {
    const markup = timeHtml({ daysToEat: 7, sessions: 1 });
    expect(markup).not.toContain("140");
    expect(markup).not.toContain("2 h 20");
  });

  it("⟳ 2026-09-25 — une durée devenue trop courte glisse à la plus courte qui suffit", () => {
    const FIELD = read("./SessionTimeField.tsx");
    expect(FIELD).toMatch(/useOfferedAnswer<SessionTimeBound>\(\{/);
    expect(FIELD).toMatch(/: nearestOffered\(offer\.values, intent\)/);
    const markup = timeHtml({ value: 60, daysToEat: 7, sessions: 2, showMissing: true });
    expect(markup).toMatch(/<option value="90"[^>]*selected/);
    expect(markup).not.toContain("text-red-700");
    // Une durée plus longue que nécessaire ne bouge pas.
    expect(timeHtml({ value: 150, daysToEat: 7, sessions: 4 })).toMatch(/<option value="150"[^>]*selected/);
  });
});

describe("la réponse part vraiment, sur le seul moteur", () => {
  it("MealBuilder envoie le nombre de sessions, et il n'a qu'un site d'envoi", () => {
    const sends = BUILDER.match(/^\s+cookingSessions,$/gm) ?? [];
    expect(sends.length, "un site d'envoi, ni plus ni moins").toBe(1);
    expect(BUILDER, "`generateMeal` est revenu").not.toContain("generateMeal(");
    expect((BUILDER.match(/await props\.onPreviewPlan\(/g) ?? []).length).toBe(1);
    expect(BUILDER, "l'écriture directe est revenue").not.toContain("generateHouseholdMeal(");
  });

  it("l'entonnoir l'envoie sur les TROIS gestes", () => {
    expect(SETUP).toMatch(/^\s+cookingSessions,$/m);
  });

  it("⛔ LE NOMBRE DE SESSIONS NE S'ÉCRIT DANS AUCUNE COLONNE", () => {
    // Il dépend de la longueur du plan: l'écrire dans `practical_constraints`
    // le rejouerait en silence sur un plan de deux jours.
    for (
      const [name, src] of [
        ["MealBuilder", BUILDER],
        ["SetupPage", SETUP],
        ["PlanRequestFields", FIELDS],
        ["planBudget", read("../api/planBudget.ts")],
        ["onboarding", read("../api/onboarding.ts")],
      ] as const
    ) {
      expect(src, name).not.toMatch(/cooking_sessions:/);
    }
  });

  it("⛔ LE CLIC EST RETENU SUR LES DEUX ÉCRANS, par les MÊMES offres que les champs", () => {
    for (const [name, src] of [["MealBuilder", BUILDER], ["SetupPage", SETUP]] as const) {
      expect(bare(src), name).toMatch(/cookingAnswersVerdict\(/);
      expect(bare(src), name).toMatch(/setCookingMissesShown\(true\)/);
    }
  });

  it("⛔ la plage de temps est DURABLE: elle se relit et se réécrit", () => {
    expect(BUILDER).toMatch(/setSessionTime\(last\.sessionTime\)/);
    expect(BUILDER).toMatch(/cookingTimeMin: sessionTime,/);
    expect(BUILDER).toMatch(/setGroceryRuns\(last\.groceryRuns\)/);
    expect(BUILDER).toMatch(/^\s+groceryRuns,$/m);
  });

  it("⛔ l'ancienne rangée de six durées ne revient PAS", () => {
    for (const [name, src] of [["MealBuilder", BUILDER], ["SetupPage", SETUP], ["PlanRequestFields", FIELDS]] as const) {
      expect(bare(src), name).not.toMatch(/COOKING_SESSION_MINUTES/);
      expect(bare(src), name).not.toMatch(/setup\.plan\.time/);
    }
  });
});

describe("les mots existent dans les deux langues", () => {
  it("chaque clé des deux champs est traduite, et pas recopiée", () => {
    for (
      const key of [
        "plan.cooking.sessions_label",
        "plan.cooking.sessions_unset",
        "plan.cooking.sessions_1",
        "plan.cooking.sessions_2",
        "plan.cooking.sessions_3",
        "plan.cooking.sessions_4",
        "plan.cooking.sessions_only_one",
        "plan.cooking.sessions_needs_freezer",
        "plan.cooking.sessions_required",
        "plan.cooking.time_label",
        "plan.cooking.time_unset",
        "plan.cooking.time_minimum",
        "plan.cooking.time_minimum_one_day",
        "plan.cooking.time_required",
        "plan.cooking.runs_capped_sessions",
        "plan.cooking.one_session_hint",
      ] as const
    ) {
      expect(fr[key], `fr: ${key}`).toBeTruthy();
      expect(en[key], `en: ${key}`).toBeTruthy();
      expect(fr[key], key).not.toBe(en[key]);
    }
  });

  it("l'aide de « Une fois » dit les DEUX moitiés du marché", () => {
    expect(fr["plan.cooking.one_session_hint"]).toMatch(/congélateur/);
    expect(en["plan.cooking.one_session_hint"]).toMatch(/freezer/);
  });
});

describe("⛔ L'ÉQUIPEMENT vient AVANT ce qu'il conditionne", () => {
  // Sur `/app/plan`, l'inventaire de cuisine a vécu 178 lignes plus bas que
  // « combien de courses ». Un refus posé au-dessus de son remède se lit comme
  // un bouton mort. Ce test lit la SOURCE: aucun bloc n'est déplacé par
  // rapport à sa position dans le fichier, donc l'ordre du fichier EST l'ordre
  // du DOM — et la prémisse est vérifiée juste en dessous.

  it("l'inventaire précède les sessions, le temps et les courses", () => {
    const equipment = FIELDS.indexOf("<KitchenEquipmentCard");
    const sessions = FIELDS.indexOf("<CookingSessionsField");
    const time = FIELDS.indexOf("<SessionTimeField");
    const runs = FIELDS.indexOf("<GroceryRunsField");
    for (const [name, at] of [["équipement", equipment], ["sessions", sessions], ["temps", time], ["courses", runs]] as const) {
      expect(at, `${name} introuvable`).toBeGreaterThan(-1);
    }
    expect(equipment).toBeLessThan(sessions);
    expect(sessions).toBeLessThan(time);
    expect(time).toBeLessThan(runs);
  });

  it("⛔ LA PRÉMISSE: aucune BRANCHE ne reste ouverte, donc la source dit le DOM", () => {
    const equipment = FIELDS.indexOf("<KitchenEquipmentCard");
    const closes = FIELDS.indexOf("</details>", equipment);
    const sessions = FIELDS.indexOf("<CookingSessionsField");
    expect(closes).toBeGreaterThan(equipment);
    expect(closes, "les sessions sont DANS le bloc de l'inventaire").toBeLessThan(sessions);
    const between = bare(FIELDS.slice(closes, sessions));
    const depth = (open: string, close: string) =>
      (between.split(open).length - 1) - (between.split(close).length - 1);
    expect(depth("(", ")"), `parenthèses non refermées: ${between.trim().slice(0, 160)}`).toBe(0);
    expect(depth("{", "}"), `accolades non refermées: ${between.trim().slice(0, 160)}`).toBe(0);
  });

  it("⛔ LA PAIRE EST SUR UNE LIGNE, ET LA GRILLE NE RETOURNE PAS L'ORDRE", () => {
    // « Combien de fois » et « combien de temps » sont lus ensemble: le second
    // dépend du premier. Une grille en flux normal rend son premier enfant à
    // GAUCHE; `order-*`, `*-reverse` et `*-dense` brisent ça sans toucher une
    // ligne de JSX.
    const sessions = FIELDS.indexOf("<CookingSessionsField");
    const time = FIELDS.indexOf("<SessionTimeField");
    const open = FIELDS.lastIndexOf("<div className=", sessions);
    expect(open, "la paire n'a plus d'enveloppe").toBeGreaterThan(-1);
    const envelope = FIELDS.slice(open, sessions);
    expect(envelope).toMatch(/\bgrid\b/);
    expect(envelope, "la paire ne retombe plus en colonne sous sm").toMatch(/\bsm:grid-cols-2\b/);
    const inside = bare(FIELDS.slice(open, time));
    for (const banned of [/\border-(?:\d|first|last)\b/, /-reverse\b/, /\bdense\b/]) {
      expect(banned.test(inside), `${banned} peut retourner la paire`).toBe(false);
    }
  });

  it("dans l'entonnoir aussi — c'est le MÊME formulaire", () => {
    expect(SETUP).toMatch(/<PlanRequestFields/);
    expect(SETUP).toMatch(/practicalConstraints=\{facts\.practicalConstraints\}/);
  });

  it("la question de l'équipement est COLLECTABLE depuis `/app/plan`", () => {
    expect(FIELDS).toMatch(/<KitchenEquipmentCard/);
    expect(FIELDS).toMatch(/practicalConstraints=\{props\.practicalConstraints\}/);
    expect(BUILDER).toMatch(/practicalConstraints=\{planConstraints\}/);
    expect(FIELDS).not.toMatch(/KITCHEN_TOOLS\.map/);
    expect(BUILDER).not.toMatch(/KITCHEN_TOOLS\.map/);
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
    for (const [name, src] of [["MealBuilder", BUILDER], ["SetupPage", SETUP], ["PlanRequestFields", FIELDS]] as const) {
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
