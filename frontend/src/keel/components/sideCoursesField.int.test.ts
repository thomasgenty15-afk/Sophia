import { afterEach, describe, expect, it } from "vitest";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";

import SideCoursesField from "./SideCoursesField";
import { MouthPreferencesFields } from "./MouthFormDialog";
import { emptyMouthDraft } from "../lib/mouthForm";
import type { SideCoursesDraft } from "../lib/mealExtras";
import { EATING_OCCASIONS } from "../api/mealGeneration";
import { setChosenUiLocaleForTest } from "../i18n/runtime";
import { en } from "../i18n/en";
import { fr } from "../i18n/fr";

// ===========================================================================
// ⟳ 2026-09-23 — LE CHAMP DES À-CÔTÉS: ENTRÉE, FROMAGE, DESSERT, PAIN
//
// Plan « assiettes normales », décision 2 du propriétaire: un réglage par
// personne, trois états par type — « Oui », « Non », « Selon l'objectif » (la
// clé ABSENTE en base). Le même au déjeuner et au dîner.
//
// ⚠️ CE FICHIER REND DU MARKUP STATIQUE (`environment: "node"`), en
// `createElement`, sans JSX. Le clic est rejoué en appelant le composant comme
// une fonction — il n'a aucun crochet, donc c'est son vrai rendu — et en
// déclenchant le `onClick` du bouton trouvé dans l'arbre.
// ===========================================================================

const PATH = "/app/household";

/** `uiLocale()` lit le chemin courant: sans `location`, tout sort en anglais. */
function atLocale(locale: "en" | "fr"): void {
  Object.defineProperty(globalThis, "location", {
    value: { pathname: PATH, search: "", href: `http://localhost${PATH}` },
    configurable: true,
    writable: true,
  });
  setChosenUiLocaleForTest(locale);
}

afterEach(() => setChosenUiLocaleForTest("en"));

function fieldHtml(
  value: SideCoursesDraft,
  { locale = "fr", disabled = false }: { locale?: "en" | "fr"; disabled?: boolean } = {},
): string {
  atLocale(locale);
  return renderToStaticMarkup(
    createElement(SideCoursesField, { value, onChange: () => {}, disabled }),
  );
}

function decode(markup: string): string {
  return markup
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

function text(markup: string): string {
  return decode(markup.replace(/\sclass="[^"]*"/g, "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function countOf(markup: string, needle: string): number {
  return markup.split(needle).length - 1;
}

/** Le `<li>` d'un type, et rien d'autre. */
function rowOf(markup: string, kind: string): string {
  const at = markup.indexOf(`data-side-course="${kind}"`);
  expect(at, `ligne « ${kind} » absente`).toBeGreaterThan(-1);
  return markup.slice(at, markup.indexOf("</li>", at));
}

/** Le choix allumé d'une ligne, ou `null` quand aucun ne l'est. */
function checkedOf(row: string): string | null {
  const m = /aria-checked="true"[^>]*data-side-course-choice="([a-z]+)"/.exec(row);
  return m ? m[1] : null;
}

describe("le champ rend quatre lignes et trois réponses par ligne", () => {
  it("les quatre types, dans l'ordre, avec les mots de l'écran (fr)", () => {
    const markup = fieldHtml({});
    const body = text(markup);
    expect(body).toContain(fr["household.mouth.side_courses.title"]);
    expect(body).toContain(decode(fr["household.mouth.side_courses.hint"]));
    const rows = [...markup.matchAll(/data-side-course="([a-z]+)"/g)].map((m) => m[1]);
    expect(rows).toEqual(["starter", "cheese", "dessert", "bread"]);
    expect(text(rowOf(markup, "starter"))).toContain("Entrée");
    expect(text(rowOf(markup, "cheese"))).toContain("Fromage");
    expect(text(rowOf(markup, "dessert"))).toContain("Dessert");
    expect(text(rowOf(markup, "bread"))).toContain("Pain");
    // Oui / Non / Selon l'objectif, dans cet ordre, sur chaque ligne.
    for (const kind of ["starter", "cheese", "dessert", "bread"]) {
      const choices = [...rowOf(markup, kind).matchAll(/data-side-course-choice="([a-z]+)"/g)]
        .map((m) => m[1]);
      expect(choices, kind).toEqual(["yes", "no", "auto"]);
      expect(text(rowOf(markup, kind))).toMatch(/Oui\s+Non\s+Selon l'objectif/);
    }
    expect(countOf(markup, "<button")).toBe(12);
  });

  it("les mêmes lignes en anglais", () => {
    const body = text(fieldHtml({}, { locale: "en" }));
    expect(body).toContain(en["household.mouth.side_courses.title"]);
    for (const word of ["Starter", "Cheese", "Dessert", "Bread", "Yes", "No", "Based on the goal"]) {
      expect(body).toContain(word);
    }
  });

  it("⛔ une fiche vierge montre « Selon l'objectif » — l'état réel, rien d'écrit", () => {
    // La clé absente EST le défaut de l'objectif: l'afficher n'est pas une
    // coche automatique, et elle ne s'écrit jamais (voir `setSideCourseChoice`).
    const markup = fieldHtml({});
    for (const kind of ["starter", "cheese", "dessert", "bread"]) {
      expect(checkedOf(rowOf(markup, kind)), kind).toBe("auto");
    }
    expect(countOf(markup, 'aria-checked="true"')).toBe(4);
    // ⚠️ AUCUN `aria-pressed`: la fiche compte ceux-là à zéro sur une fiche
    // vierge, et ce champ n'est pas une tuile qui écrirait une réponse.
    expect(markup).not.toContain("aria-pressed");
    expect(countOf(markup, 'role="radiogroup"')).toBe(4);
  });

  it("le réglage lu est celui qui s'allume, type par type", () => {
    const markup = fieldHtml({
      lunch: { dessert: false, cheese: true },
      dinner: { dessert: false, cheese: true },
    });
    expect(checkedOf(rowOf(markup, "dessert"))).toBe("no");
    expect(checkedOf(rowOf(markup, "cheese"))).toBe("yes");
    expect(checkedOf(rowOf(markup, "starter"))).toBe("auto");
    expect(checkedOf(rowOf(markup, "bread"))).toBe("auto");
  });

  it("⚠️ déjeuner et dîner en désaccord: la ligne n'allume RIEN", () => {
    // « pas d'entrée le soir », posé par la mémoire sur le seul dîner.
    const markup = fieldHtml({ dinner: { starter: false } });
    expect(checkedOf(rowOf(markup, "starter"))).toBe(null);
    // LA PRÉMISSE: les autres lignes s'allument bien.
    expect(checkedOf(rowOf(markup, "dessert"))).toBe("auto");
    expect(countOf(markup, 'aria-checked="true"')).toBe(3);
  });

  it("occupé: les douze boutons sont désactivés — et libres sinon", () => {
    const busy = fieldHtml({}, { disabled: true });
    expect(countOf(busy.replace(/\sclass="[^"]*"/g, ""), 'disabled=""')).toBe(12);
    const free = fieldHtml({});
    expect(countOf(free.replace(/\sclass="[^"]*"/g, ""), 'disabled=""')).toBe(0);
  });

  it("⛔ aucune phrase d'échec, aucun chiffre d'énergie, aucun nom de code", () => {
    for (const locale of ["fr", "en"] as const) {
      const body = text(fieldHtml({ lunch: { bread: true } }, { locale })).toLowerCase();
      for (const word of ["kcal", "calor", "échec", "erreur", "fail", "error", "keel", "takes"]) {
        expect(body, `${locale}: « ${word} »`).not.toContain(word);
      }
      expect(body).not.toMatch(/\d/);
    }
  });
});

// ---------------------------------------------------------------------------
// LE CLIC — rejoué sur l'arbre que le composant rend
// ---------------------------------------------------------------------------

/** Tous les éléments de l'arbre, en profondeur. */
function walk(node: ReactNode, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, out);
    return out;
  }
  if (node && typeof node === "object" && "props" in node) {
    const el = node as ReactElement<{ children?: ReactNode }>;
    out.push(el);
    walk(el.props.children, out);
  }
  return out;
}

function click(
  value: SideCoursesDraft,
  kind: string,
  choice: string,
): SideCoursesDraft | undefined {
  atLocale("fr");
  let got: SideCoursesDraft | undefined;
  const tree = SideCoursesField({ value, onChange: (next) => { got = next; }, disabled: false });
  const rows = walk(tree).filter((el) =>
    (el.props as Record<string, unknown>)["data-side-course"] === kind
  );
  expect(rows.length, `ligne ${kind}`).toBe(1);
  const button = walk(rows[0]).find((el) =>
    (el.props as Record<string, unknown>)["data-side-course-choice"] === choice
  );
  expect(button, `bouton ${kind}/${choice}`).toBeDefined();
  (button!.props as { onClick: () => void }).onClick();
  return got;
}

describe("un clic écrit la même réponse au déjeuner et au dîner", () => {
  it("« Non » sur le dessert", () => {
    expect(click({}, "dessert", "no")).toEqual({
      lunch: { dessert: false },
      dinner: { dessert: false },
    });
  });

  it("« Oui » sur le pain garde le fromage déjà réglé", () => {
    expect(click({ lunch: { cheese: false }, dinner: { cheese: false } }, "bread", "yes"))
      .toEqual({
        lunch: { cheese: false, bread: true },
        dinner: { cheese: false, bread: true },
      });
  });

  it("⛔ « Selon l'objectif » retire la clé, il n'écrit pas de valeur", () => {
    expect(click({ lunch: { starter: true }, dinner: { starter: true } }, "starter", "auto"))
      .toEqual({});
  });

  it("un clic sur une ligne en désaccord la rend unique, et ne touche pas aux autres", () => {
    expect(click({ dinner: { starter: false, dessert: true } }, "starter", "yes")).toEqual({
      lunch: { starter: true },
      dinner: { starter: true, dessert: true },
    });
  });
});

// ---------------------------------------------------------------------------
// LES DEUX MONTAGES
// ---------------------------------------------------------------------------

describe("le champ est monté là où la personne règle sa fiche", () => {
  function prefsHtml(sideCourses: SideCoursesDraft): string {
    atLocale("fr");
    return renderToStaticMarkup(
      createElement(MouthPreferencesFields, {
        draft: { ...emptyMouthDraft(), sideCourses },
        onChange: () => {},
        subject: { existing: true, hasAccount: false, isSelf: false },
        busy: false,
        onClose: () => {},
        slots: [...EATING_OCCASIONS],
        shakerPort: { kind: "now", save: () => {} },
        structure: null,
      }),
    );
  }

  it("dans la fiche partagée (`MouthPreferencesFields`), sur le brouillon", () => {
    const markup = prefsHtml({ lunch: { cheese: false }, dinner: { cheese: false } });
    expect(countOf(markup, "data-side-courses")).toBe(1);
    expect(checkedOf(rowOf(markup, "cheese"))).toBe("no");
    // ⚠️ DANS une section existante, pas une septième: le compte de cadres de
    // la fiche est tenu à six par `mouthFormDialog.int.test.ts`.
    expect(countOf(markup, "data-sheet-section")).toBe(6);
    const sectionStart = markup.lastIndexOf("data-sheet-section", markup.indexOf("data-side-courses"));
    expect(markup.slice(sectionStart, markup.indexOf("data-side-courses")))
      .toContain('id="mouth-rhythm-dinner"');
  });

  it("⛔ la fiche vierge rend le champ aussi — il n'est réservé à personne", () => {
    for (const subject of [
      { existing: false, hasAccount: false, isSelf: false },
      { existing: true, hasAccount: true, isSelf: false },
      { existing: true, hasAccount: true, isSelf: true },
    ]) {
      atLocale("fr");
      const markup = renderToStaticMarkup(
        createElement(MouthPreferencesFields, {
          draft: emptyMouthDraft(),
          onChange: () => {},
          subject,
          busy: false,
          onClose: () => {},
          slots: [...EATING_OCCASIONS],
          shakerPort: { kind: "now", save: () => {} },
          structure: null,
        }),
      );
      expect(countOf(markup, "data-side-courses"), JSON.stringify(subject)).toBe(1);
    }
  });

  it("sur la ligne d'un membre, à côté de sa carte d'habitudes, après la lecture", () => {
    // ⚠️ SOURCE, COMMENTAIRES RETIRÉS: `MemberRow` ne se monte pas sous
    // `renderToStaticMarkup` (session, routeur). Ce qui est vérifié est la
    // place (la branche du membre, juste après la carte), la garde de lecture
    // et l'écrivain (le seul sérialiseur, avec le réglage cliqué).
    const src = readFileSync(new URL("../pages/HouseholdPage.tsx", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    const card = src.indexOf("<HouseholdHabitsCard");
    const field = src.indexOf("<SideCoursesField", card);
    expect(card).toBeGreaterThan(-1);
    expect(field).toBeGreaterThan(card);
    const between = src.slice(card, field);
    expect(between).toContain("habitsLoaded ?");
    const mount = src.slice(field, src.indexOf("/>", src.indexOf("finally", field)));
    expect(mount).toMatch(/value=\{sidePending \?\? habits\?\.sideCourses \?\? \{\}\}/);
    expect(mount).toMatch(/habitEntriesToWrite\(\{[\s\S]*sideCourses:\s*next,/);
    expect(mount).toMatch(/light:\s*habits\?\.light \?\? \{\}/);
    // Un seul montage sur cette page: la fiche du maître passe par
    // `MouthPreferencesFields`.
    expect(countOf(src, "<SideCoursesField")).toBe(1);
  });
});
