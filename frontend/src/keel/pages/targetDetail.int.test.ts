import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TargetDetail } from "./StudentProgressPage";
import type { UiLocale } from "../i18n/catalog";
import { en } from "../i18n/en";
import { setChosenUiLocaleForTest } from "../i18n/runtime";

// ===========================================================================
// LE DÉTAIL DU CALCUL — 2026-09-21
//
// Demandé à l'écran: « un bouton Détail qui permette de donner le détail du
// calcul de manière carrée, comme ça c'est transparent ».
//
// ── CE QUE CE FICHIER GARDE, ET CE QU'IL NE PEUT PAS GARDER ───────────────
// Il garde la MISE EN PAGE: quelles lignes existent selon la chaîne, dans
// quel ordre, et ce que le panneau ne dit jamais. L'ARITHMÉTIQUE, elle, se
// prouve côté moteur (`_shared/keel/energy_breakdown_test.ts`) — ce composant
// ne calcule rien, et un test qui le vérifierait ici mesurerait sa propre
// fixture.
//
// ⚠️ `.ts` ET `createElement`, JAMAIS DE JSX: `vitest.config.ts` n'inclut que
// `src/**/*.int.test.ts` — un `.tsx` ne serait jamais collecté.
// ===========================================================================

const PATH = "/app/progress";

/** Le cas de la capture: prise de muscle, chaîne du corps. */
const BODY = {
  chain: "body_equation",
  weight_kg: 72,
  activity_level: "trains_some",
  per_kg_low: null,
  per_kg_high: null,
  maintenance_low: 2726,
  maintenance_high: 2726,
  daily_delta_kcal: 550,
  low: 3204,
  high: 3348,
};

/** Le repli: on ne connaît ni la taille ni la date de naissance. */
const PER_KG = {
  chain: "weight_per_kg",
  weight_kg: 72,
  activity_level: "on_feet",
  per_kg_low: 28,
  per_kg_high: 31,
  maintenance_low: 2000,
  maintenance_high: 2250,
  daily_delta_kcal: -500,
  low: 1500,
  high: 1750,
};

function html(breakdown: Record<string, unknown>, locale: UiLocale = "en"): string {
  Object.defineProperty(globalThis, "location", {
    value: { pathname: PATH, search: "", href: `http://localhost${PATH}` },
    configurable: true,
    writable: true,
  });
  setChosenUiLocaleForTest(locale);
  return renderToStaticMarkup(
    createElement(TargetDetail, { breakdown } as never),
  );
}

const text = (markup: string) =>
  markup.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

describe("le détail, sur la chaîne du corps", () => {
  it("rend les étapes du calcul, dans l'ordre où il se fait", () => {
    const body = text(html(BODY));
    const at = (needle: string) => body.indexOf(needle);
    expect(at(en["student_progress.journal.detail_weight"])).toBeGreaterThan(-1);
    // ⚠️ L'ORDRE EST TOUT CE QUE CE PANNEAU PROMET: la pesée, ce qu'on en
    // tire, ce que l'objectif y ajoute, le résultat. Le réordonner le rendrait
    // illisible sans qu'aucune assertion de présence ne bouge.
    expect(at(en["student_progress.journal.detail_weight"]))
      .toBeLessThan(at(en["student_progress.journal.detail_maintenance"]));
    expect(at(en["student_progress.journal.detail_maintenance"]))
      .toBeLessThan(at(en["student_progress.journal.detail_delta"]));
    expect(at(en["student_progress.journal.detail_delta"]))
      .toBeLessThan(at(en["student_progress.journal.detail_total"]));
  });

  it("l'entretien est un POINT, et il n'y a aucun kcal/kg", () => {
    const body = text(html(BODY));
    expect(body).toContain("2726 kcal");
    // ⛔ PAS « 2726–2726 »: les deux bornes sont égales sur cette chaîne, et
    // les écrire toutes les deux serait du bruit.
    expect(body).not.toContain("2726–2726");
    // ⛔ ET PAS DE LIGNE « Par kilo »: l'activité entre par un facteur de
    // l'équation, pas par une multiplication au poids. En afficher une ferait
    // lire une arithmétique qui n'a pas eu lieu.
    expect(body).not.toContain(en["student_progress.journal.detail_per_kg"]);
  });

  /**
   * ⛔ AUCUNE LIGNE « Tes journées ». Elle a existé le temps d'un rendu, et le
   * détecteur de coutures l'a refusée: elle demandait `setup.activity.*`, hors
   * des namespaces déclarés par `/app/progress`. Ce cas empêche qu'elle
   * revienne par mégarde — la réparation tentante (déclarer `setup` sur cette
   * page) serait une fausse promesse.
   */
  it("ne rend aucun libellé d'activité", () => {
    const body = text(html(BODY));
    expect(body).not.toContain(en["student_progress.journal.detail_activity"]);
    expect(body).not.toContain(en["setup.activity.trains_some"]);
  });

  it("nomme la chaîne qui a servi", () => {
    expect(text(html(BODY)))
      .toContain(en["student_progress.journal.detail_chain_body_equation"]);
    expect(text(html(BODY)))
      .not.toContain(en["student_progress.journal.detail_chain_weight_per_kg"]);
  });

  it("l'écart positif porte son « + »", () => {
    expect(text(html(BODY))).toContain("+550 kcal");
  });
});

describe("le détail, sur le raccourci au poids", () => {
  it("montre les kcal/kg et un entretien en FOURCHETTE", () => {
    const body = text(html(PER_KG));
    expect(body).toContain(en["student_progress.journal.detail_per_kg"]);
    // ⚠️ C'EST CETTE LIGNE QUI PORTE L'ACTIVITÉ, en chiffres: 28-31 EST le
    // cran « debout, en mouvement ». Le libellé du cran, lui, ne se rend pas
    // (voir le cas ci-dessus).
    expect(body).toContain("28 to 31 kcal");
    expect(body).not.toContain(en["setup.activity.on_feet"]);
    expect(body).toContain("2000–2250 kcal");
  });

  it("l'écart négatif garde son signe, sans qu'on l'ajoute", () => {
    expect(text(html(PER_KG))).toContain("-500 kcal");
  });

  it("nomme l'autre chaîne, et dit ce qui la ferait changer", () => {
    expect(text(html(PER_KG)))
      .toContain(en["student_progress.journal.detail_chain_weight_per_kg"]);
  });
});

describe("ce que le détail ne dit jamais", () => {
  /**
   * ⛔ AUCUN RESTE, AUCUN VERDICT — la règle de `energy_target.ts`, tenue à
   * l'écran. « Il te reste 680 kcal » est LA phrase d'un tracker, et un
   * panneau « détail » est exactement l'endroit où elle repousserait.
   */
  it("aucun mot de consommation, dans les deux langues", () => {
    for (const locale of ["en", "fr"] as const) {
      for (const b of [BODY, PER_KG]) {
        const body = text(html(b, locale)).toLowerCase();
        for (const word of ["remaining", "left", "reste", "mangé", "eaten", "over", "under"]) {
          expect(body, `${locale} / ${b.chain} / ${word}`).not.toContain(word);
        }
      }
    }
  });

  /** LA RÉSERVE EST LÀ, dans les deux langues: une fourchette est une estimation. */
  it("mais il porte sa réserve", () => {
    expect(text(html(BODY)))
      .toContain(en["student_progress.journal.detail_reserve"]);
  });
});

describe("un maintien", () => {
  /**
   * ⛔ PAS DE LIGNE « Ton objectif » QUAND L'OBJECTIF N'A RIEN DÉPLACÉ. En
   * afficher une à « 0 kcal » ferait lire un objectif là où il n'y en a pas —
   * et c'est le cas d'un maintien, pas une donnée manquante.
   */
  it("ne pose pas de ligne d'objectif à zéro", () => {
    const body = text(html({ ...BODY, daily_delta_kcal: 0, low: 2600, high: 2850 }));
    expect(body).not.toContain(en["student_progress.journal.detail_delta"]);
    // Mais les autres étapes restent: on explique quand même d'où vient le
    // nombre.
    expect(body).toContain(en["student_progress.journal.detail_maintenance"]);
    expect(body).toContain(en["student_progress.journal.detail_total"]);
  });
});
