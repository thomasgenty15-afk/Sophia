import { afterAll, afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import KitchenEquipmentCard from "./KitchenEquipmentCard";
import { KITCHEN_TOOLS } from "../api/kitchenEquipment";
import type { PracticalConstraints } from "../api/practicalConstraints";
import { en } from "../i18n/en";
import { fr } from "../i18n/fr";
import { setChosenUiLocaleForTest } from "../i18n/runtime";

// ===========================================================================
// L2-A (2026-08-18) — LES MOYENS DE CUISSON, SUR LA VALEUR RENDUE
//
// ⚠️ CE FICHIER MONTE LE COMPOSANT ET LIT SON HTML. Des tests de SOURCE sont
// restés verts sur du code mort dans ce dépôt — une prop passée à un tableau
// vide en dur, une garde qui recopiait du JSX. La seule question qui compte
// est « QU'EST-CE QUE LE LECTEUR VOIT, ET COMBIEN DE FOIS ».
//
// ⚠️ `.ts` ET `createElement`, JAMAIS DE JSX: `vitest.config.ts` n'inclut que
// `src/**/*.int.test.ts` — un `.tsx` ne serait JAMAIS COLLECTÉ, et le fichier
// entier serait un silence vert.
// ===========================================================================

/** Une colonne LUE et vide — « on a lu, il n'y a rien dedans ». */
const READ_EMPTY: PracticalConstraints = { cooking_time_min: 30 };

/**
 * L'ÉTAPE OÙ CETTE CARTE ATTERRIT. `uiLocale()` lit le CHEMIN COURANT — la
 * langue d'une page dépend de la page, pas seulement du visiteur —, donc un
 * rendu sans `location` sort en anglais quoi qu'on ait choisi. Patron de
 * `pages/startCheckEmail.int.test.ts`.
 */
const SETUP_PATH = "/app/setup";

function html(props: {
  practicalConstraints: PracticalConstraints | null;
  hasGoal?: boolean;
  embedded?: boolean;
}): string {
  Object.defineProperty(globalThis, "location", {
    value: { pathname: SETUP_PATH, search: "", href: `http://localhost${SETUP_PATH}` },
    configurable: true,
    writable: true,
  });
  return renderToStaticMarkup(
    createElement(KitchenEquipmentCard, {
      practicalConstraints: props.practicalConstraints,
      hasGoal: props.hasGoal ?? true,
      embedded: props.embedded,
      onSaved: () => {},
    }),
  );
}

/**
 * ⚠️ `disabled` EST DANS LA CLASSE TAILWIND DE CHAQUE BOUTON
 * (`disabled:cursor-not-allowed`). Chercher le mot dans le markup brut rend
 * VRAI sur un bouton parfaitement actif — première version de ce fichier,
 * rouge au premier lancement. On enlève donc les classes avant de regarder.
 */
function withoutClasses(markup: string): string {
  return markup.replace(/\sclass="[^"]*"/g, "");
}

function hasDisabledAttribute(markup: string): boolean {
  return /\sdisabled(=""|\s|>)/.test(withoutClasses(markup));
}

function decode(markup: string): string {
  return markup
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#x2F;/g, "/")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Chaque bouton de la carte: son libellé, et s'il est enfoncé. */
function chips(markup: string): Array<{ label: string; pressed: boolean | null }> {
  const out: Array<{ label: string; pressed: boolean | null }> = [];
  for (const m of markup.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)) {
    const attrs = m[1];
    const pressed = /aria-pressed="true"/.test(attrs)
      ? true
      : /aria-pressed="false"/.test(attrs)
      ? false
      : null;
    out.push({ label: decode(m[2].replace(/<[^>]*>/g, "")).trim(), pressed });
  }
  return out;
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "location");
  setChosenUiLocaleForTest("en");
});

afterAll(() => setChosenUiLocaleForTest("en"));

// ---------------------------------------------------------------------------
// LES SEPT CASES EXISTENT, ET ELLES SE LISENT
// ---------------------------------------------------------------------------

describe("la question est posée, en toutes lettres", () => {
  it("les sept outils sont rendus, dans l'ordre de la liste", () => {
    setChosenUiLocaleForTest("en");
    const markup = decode(html({ practicalConstraints: READ_EMPTY }));
    const labels = chips(markup)
      .filter((c) => c.pressed !== null)
      .map((c) => c.label);
    expect(labels).toEqual([
      en["setup.equipment.tool_oven"],
      en["setup.equipment.tool_stovetop"],
      en["setup.equipment.tool_microwave"],
      en["setup.equipment.tool_freezer"],
      en["setup.equipment.tool_air_fryer"],
      en["setup.equipment.tool_pressure_cooker"],
      en["setup.equipment.tool_blender"],
    ]);
    expect(labels).toHaveLength(KITCHEN_TOOLS.length);
  });

  it("les TROIS qui changent le plan sont nommées à l'écran", () => {
    // Congélateur, micro-ondes, four: sans elles, la stratégie « une course,
    // je congèle », le geste « à réchauffer » et le batch cooking n'ont aucune
    // base. Une case qui disparaît de la carte est un fait qu'on cesse de
    // collecter, et rien d'autre ne le dirait.
    const markup = decode(html({ practicalConstraints: READ_EMPTY }));
    for (
      const key of [
        "setup.equipment.tool_freezer",
        "setup.equipment.tool_microwave",
        "setup.equipment.tool_oven",
      ] as const
    ) {
      expect(count(markup, en[key]), key).toBe(1);
    }
  });

  it("la carte dit que la question est celle du FOYER, pas d'une personne", () => {
    // Une cuisine est partagée. Si la copie laissait croire à une question par
    // bouche, on la reposerait cinq fois — et le lot suivant l'écrirait sur
    // `household_members`.
    const markup = decode(html({ practicalConstraints: READ_EMPTY }));
    expect(markup).toContain(en["setup.equipment.title"]);
    expect(markup).toContain(en["setup.equipment.intro"]);
  });

  it("montée dans une étape, la carte ne porte ni cadre ni titre", () => {
    // `embedded` sert au tunnel: le parent porte le cadre. Un second titre
    // ferait deux en-têtes empilés sur la même question.
    const markup = decode(html({ practicalConstraints: READ_EMPTY, embedded: true }));
    expect(markup).not.toContain(en["setup.equipment.title"]);
    expect(markup).toContain(en["setup.equipment.tool_oven"]);
  });
});

// ---------------------------------------------------------------------------
// ⛔ RIEN N'EST PRÉ-COCHÉ
// ---------------------------------------------------------------------------

describe("⛔ un foyer à qui on n'a rien demandé n'a AUCUNE case cochée", () => {
  it("zéro coche sur une colonne lue et vide", () => {
    // ⚠️ LE TEST DE LA DOCTRINE DE CETTE ÉTAPE, et il compte sur le RENDU.
    // La maquette du §2.1 dessine « ☑ Four ☑ Plaques »: c'est un formulaire
    // rempli, pas un défaut. Pré-cocher écrirait un four que personne n'a
    // déclaré au premier Enregistrer — « coche automatique = faits faux
    // indémentables ».
    const markup = html({ practicalConstraints: READ_EMPTY });
    expect(count(markup, 'aria-pressed="true"')).toBe(0);
    expect(count(markup, 'aria-pressed="false"')).toBe(KITCHEN_TOOLS.length);
  });

  it("une réponse déjà donnée revient cochée, et elle SEULE", () => {
    const markup = decode(
      html({ practicalConstraints: { kitchen_equipment: ["freezer", "oven"] } }),
    );
    const pressed = chips(markup).filter((c) => c.pressed === true).map((c) => c.label);
    expect(pressed).toEqual([
      en["setup.equipment.tool_oven"],
      en["setup.equipment.tool_freezer"],
    ]);
    expect(count(markup, 'aria-pressed="false"')).toBe(KITCHEN_TOOLS.length - 2);
  });

  it("un jeton inconnu en base ne coche rien et n'efface pas ses voisins", () => {
    const markup = decode(
      html({ practicalConstraints: { kitchen_equipment: ["oven", "fourneau"] } }),
    );
    const pressed = chips(markup).filter((c) => c.pressed === true).map((c) => c.label);
    expect(pressed).toEqual([en["setup.equipment.tool_oven"]]);
  });
});

// ---------------------------------------------------------------------------
// LA PORTE DE LECTURE
// ---------------------------------------------------------------------------

describe("un formulaire figé au montage a besoin d'une porte", () => {
  it("colonne pas encore lue ⇒ aucune case, et un mot qui le dit", () => {
    // Cicatrice `mount-snapshot-forms-need-a-loading-gate`: monté pendant que
    // la lecture court, ce formulaire afficherait sept cases décochées — donc
    // du VIDE NON LU — puis l'écrirait tel quel au premier Enregistrer.
    const markup = decode(html({ practicalConstraints: null }));
    expect(count(markup, "aria-pressed=")).toBe(0);
    expect(markup).toContain(en["setup.equipment.loading"]);
  });

  it("⛔ et AUCUNE pastille n'est appuyable tant que la lecture court", () => {
    // ── LE BOUTON « ENREGISTRER » A DISPARU LE 2026-08-19 ─────────────────
    // Ce cas gardait qu'il restait rendu ET grisé pendant la lecture. Il
    // n'existe plus: les pastilles écrivent au clic, comme tout le reste de
    // l'entonnoir depuis ce matin.
    //
    // Ce qui doit rester vrai est la MÊME garde, déplacée sur ce qui écrit
    // maintenant: tant que la colonne n'est pas lue, il n'y a AUCUNE pastille à
    // cliquer — donc rien qui puisse écrire du vide non lu par-dessus une
    // sélection existante. Cicatrice `mount-snapshot-forms-need-a-loading-gate`.
    const markup = html({ practicalConstraints: null });
    expect(count(decode(markup), "aria-pressed=")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// LE REFUS EST PRÈS DU GESTE
// ---------------------------------------------------------------------------

describe("le refus d'une sélection vide n'est PAS un bouton gris", () => {
  it("rien de coché, et les pastilles restent appuyables", () => {
    // « Un refus loin du geste se lit comme un bouton mort » — trois fois dans
    // `SetupPage`. Rien de coché n'est pas une impossibilité: on clique, et le
    // refus se lit juste en dessous.
    const markup = html({ practicalConstraints: READ_EMPTY });
    expect(hasDisabledAttribute(markup)).toBe(false);
  });

  it("sans ligne d'objectif, l'impossibilité est DITE et le bouton coupé", () => {
    // Ce cas-là n'est pas un refus mais une impossibilité: il n'y a aucune
    // ligne à mettre à jour, et un update qui ne matche rien répond 204 sans
    // erreur — l'écran afficherait « Enregistré » sur une saisie partie nulle
    // part.
    // ⚠️ CE SONT LES PASTILLES QUI SONT COUPÉES depuis le 2026-08-19: ce sont
    // elles qui écrivent. Sans ligne d'objectif il n'y a rien à mettre à jour,
    // et un update qui ne matche rien répond 204 — l'écran dirait
    // « Enregistré » sur une saisie partie nulle part.
    const markup = decode(html({ practicalConstraints: READ_EMPTY, hasGoal: false }));
    expect(markup).toContain(en["setup.equipment.no_goal"]);
    expect(hasDisabledAttribute(markup)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// LES DEUX LANGUES
// ---------------------------------------------------------------------------

describe("la carte se rend entièrement dans les deux langues", () => {
  it("le français rend les sept outils et la ligne d'aide", () => {
    setChosenUiLocaleForTest("fr");
    try {
      const markup = decode(html({ practicalConstraints: READ_EMPTY }));
      for (const tool of KITCHEN_TOOLS) {
        const key = `setup.equipment.tool_${tool}` as keyof typeof fr;
        expect(markup, key).toContain(fr[key]);
      }
      expect(markup).toContain(fr["setup.equipment.hint"]);
      // Une couture se voit ici: un mot anglais au milieu d'un écran français.
      expect(markup).not.toContain(en["setup.equipment.tool_freezer"]);
    } finally {
      setChosenUiLocaleForTest("en");
    }
  });

  it("les sept libellés sont distincts, dans chaque langue", () => {
    // Deux cases qui portent le même mot sont deux cases dont une ne sert à
    // rien — et la réponse devient indevinable pour qui la relit.
    for (const pack of [en, fr]) {
      const labels = KITCHEN_TOOLS.map((tool) =>
        pack[`setup.equipment.tool_${tool}` as keyof typeof pack]
      );
      expect(new Set(labels).size).toBe(KITCHEN_TOOLS.length);
      for (const label of labels) expect(label.trim()).not.toBe("");
    }
  });
});
