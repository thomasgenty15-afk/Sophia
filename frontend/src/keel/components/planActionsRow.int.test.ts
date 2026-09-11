import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TROIS RANGÉES, PARCE QUE LES QUATRE BOUTONS NE PARLAIENT PAS DE LA MÊME CHOSE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `TES REPAS` portait une seule rangée: « Tes sessions de cuisine », « Liste de
 * courses », « Préparer le plan suivant », « Composer un autre plan ». Les deux
 * premiers OUVRENT le plan qu'on regarde; les deux derniers en FABRIQUENT un
 * autre — et « Composer un autre plan » remplace celui qui est à l'écran.
 * Quatre boutons de même forme, côte à côte, annoncent quatre gestes de même
 * nature: il fallait lire les libellés pour découvrir que deux d'entre eux
 * jettent ce qu'on est en train de lire.
 *
 * L'ordre est maintenant celui de la lecture:
 *
 *   ① QUEL PLAN   — titre, sélecteur, et les deux gestes qui en font un autre
 *   ② QUELS JOURS — le rail (« Toute la semaine », puis chaque jour)
 *   ③ CE QU'IL DEMANDE — les deux fenêtres du plan filtré
 *
 * ── CE QUE CE FICHIER TIENT ──────────────────────────────────────────────
 * ① la rangée du haut ne porte QUE le plan — les deux outils l'ont quittée;
 * ② `PlanResult` rend la fente `tools` APRÈS le rail et AVANT les jours;
 * ③ la décision de les montrer reste chez l'appelant, qui seul sait s'il y a
 *   quelque chose à ouvrir et si une génération est en cours;
 * ④ le sélecteur est nommé — deux boutons voisins ne forment pas un choix pour
 *   qui ne voit pas la rangée.
 *
 * ⚠️ ÉPREUVE SUR LA SOURCE, ET C'EST UN CHOIX. `MealBuilder` monte une session,
 * un client Supabase et six chargeurs: la suite front tourne en `node` et ne
 * monte aucun composant. Lire l'ordre dans le rendu attrape la seule régression
 * qui compte ici — un bouton qui remonte dans la mauvaise rangée.
 */

const SRC = resolve(__dirname, "../..");

/** Même blanchiment que les autres tests de source: une note n'est pas du code. */
function code(rel: string): string {
  return readFileSync(resolve(SRC, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
}

const BUILDER = code("keel/components/MealBuilder.tsx");
const RESULT = code("keel/components/plan/PlanResult.tsx");

/**
 * LA RANGÉE DU HAUT, ET SEULEMENT ELLE.
 *
 * ⛔ INDEXER LE FICHIER ENTIER RENDAIT UNE ASSERTION MUETTE, et une mutation
 * l'a montré: `meals.rebuild.prepare_next` est rendue DEUX fois — le titre du
 * formulaire de composition, puis le bouton. Une recherche depuis le début
 * tombait donc toujours sur le titre, qui ne bouge jamais: le test restait vert
 * alors que le bouton avait changé de rangée. C'est le défaut du test paramétré
 * par sa propre constante, sur quatre lignes d'assertion.
 */
const HEADER_ROW = (() => {
  const from = BUILDER.indexOf(
    'className="mb-3 flex flex-wrap items-center justify-between gap-3"',
  );
  expect(from, "la rangée du haut a changé de forme — l'ancre du test est morte")
    .toBeGreaterThan(0);
  const to = BUILDER.indexOf("{!building && (", from);
  expect(to, "la fin de la rangée du haut est introuvable").toBeGreaterThan(from);
  return BUILDER.slice(from, to);
})();

/** La position d'une clé DANS la rangée du haut. */
function at(key: string): number {
  const i = HEADER_ROW.indexOf(`"${key}"`);
  expect(i, `la clé ${key} n'est plus rendue dans la rangée du haut`)
    .toBeGreaterThan(-1);
  // ⚠️ UNE SEULE FOIS. Deux occurrences rendraient l'ordre ambigu, et c'est
  // exactement ce qui a rendu une assertion muette.
  expect(HEADER_ROW.indexOf(`"${key}"`, i + 1), `${key} est rendue deux fois`)
    .toBe(-1);
  return i;
}

describe("① la rangée du haut ne porte que le plan", () => {
  it("le titre ouvre la rangée, le sélecteur suit", () => {
    expect(at("meals.result.title")).toBeLessThan(at("meals.result.plan_switch"));
  });

  it("les deux gestes qui FABRIQUENT un plan y sont", () => {
    // ⛔ « Composer un autre plan » est le geste le plus coûteux de l'écran: il
    // remplace le plan affiché. Sa place est en haut, à côté du choix du plan,
    // et jamais au milieu des outils de ce plan-là.
    expect(at("meals.rebuild.prepare_next")).toBeGreaterThan(
      at("meals.result.plan_switch"),
    );
    expect(at("meals.rebuild.button")).toBeGreaterThan(
      at("meals.result.plan_switch"),
    );
  });

  it("⛔ les deux OUTILS l'ont quittée", () => {
    // C'est la régression que ce lot répare: on lisait « Liste de courses »
    // avant de savoir de quels jours il s'agissait.
    expect(HEADER_ROW, "« Tes sessions de cuisine » est remontée dans l'en-tête")
      .not.toContain('"meals.sessions.title"');
    expect(HEADER_ROW, "« Liste de courses » est remontée dans l'en-tête")
      .not.toContain('"meals.result.shopping_title"');
  });
});

describe("② la fente `tools` se rend sous le rail", () => {
  it("`PlanResult` la rend APRÈS le rail des jours", () => {
    const rail = RESULT.indexOf('"meals.result.day_rail"');
    const slot = RESULT.indexOf("{props.tools");
    expect(rail, "le rail n'est plus nommé").toBeGreaterThan(-1);
    expect(slot, "la fente `tools` n'est plus rendue").toBeGreaterThan(-1);
    expect(slot, "les outils sont repassés AU-DESSUS du rail")
      .toBeGreaterThan(rail);
  });

  it("et AVANT les jours eux-mêmes", () => {
    const slot = RESULT.indexOf("{props.tools");
    const days = RESULT.indexOf("shownGroups.map(");
    expect(days).toBeGreaterThan(-1);
    expect(slot, "les outils sont tombés sous les jours").toBeLessThan(days);
  });

  it("la prop est OPTIONNELLE — le brouillon et les tests n'en passent pas", () => {
    expect(RESULT).toMatch(/^\s*tools\?: React\.ReactNode;/m);
  });
});

describe("③ la décision de les montrer reste chez l'appelant", () => {
  it("la fente est gardée par `showPlanTools`", () => {
    // ⛔ Une fente qui rendrait un conteneur vide laisserait une gouttière sous
    // le rail, qui se lit comme un bloc qui n'a pas fini de charger.
    expect(BUILDER).toMatch(/tools=\{showPlanTools\s*\n?\s*\?/);
  });

  it("sa condition est la DISJONCTION des deux boutons", () => {
    // Une troisième règle écrite à la main serait une rangée vide (ou absente à
    // tort) le jour où l'une des deux bouge.
    expect(BUILDER).toContain(
      "const showPlanTools = showSessionsButton || showShoppingButton;",
    );
  });

  it("les deux outils restent coupés pendant une génération", () => {
    // `result` décrit encore les plats qu'on est en train de remplacer: faire
    // ses courses dessus, c'est acheter pour un plan mort.
    for (const flag of ["showSessionsButton", "showShoppingButton"]) {
      const decl = BUILDER.slice(BUILDER.indexOf(`const ${flag} =`));
      expect(decl.slice(0, 160), `${flag} ne garde plus \`building\``)
        .toContain("!building");
    }
  });
});

describe("④ le sélecteur se nomme", () => {
  it("les deux onglets vivent dans un `role=\"group\"` qui porte un nom", () => {
    expect(BUILDER).toMatch(
      /role="group"\s*\n?\s*aria-label=\{t\("meals\.result\.plan_switch"\)\}/,
    );
  });

  it("le nom du groupe est traduit dans les deux packs", async () => {
    const { en } = await import("../i18n/en");
    const { fr } = await import("../i18n/fr");
    expect(en["meals.result.plan_switch"]).toBeTruthy();
    expect(fr["meals.result.plan_switch"]).toBeTruthy();
  });
});
