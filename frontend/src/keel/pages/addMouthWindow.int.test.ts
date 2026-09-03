import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AddMouthForm } from "./HouseholdPage";
import { emptyMouthDraft } from "../lib/mouthForm";
import { HOUSEHOLD_MAX_MOUTHS } from "../api/onboarding";
import { en } from "../i18n/en";
import { fr } from "../i18n/fr";
import { setChosenUiLocaleForTest } from "../i18n/runtime";

// ===========================================================================
// A5 POINT 3 (2026-09-03) — UNE SEULE FENÊTRE POUR AJOUTER QUELQU'UN
//
// ── CE QUI ÉTAIT FAUX ─────────────────────────────────────────────────────
// La fiche d'ajout était EN LIGNE sur la page (les trois blocs obligatoires),
// et les goûts derrière un SECOND écran (`MouthFormDialog`, un `Modal`). Deux
// surfaces pour une seule personne, dont une qui s'ouvrait par-dessus l'autre.
//
// ── ⛔ ET LE REMÈDE N'EST PAS DEUX `Modal` IMBRIQUÉS ──────────────────────
// `Modal` passe par `createPortal(document.body)`. Deux portails empilés n'ont
// JAMAIS été essayés dans ce dépôt: ni le piège du focus, ni celui de la
// touche Échap (laquelle ferme ?), ni celui du défilement de fond. L'accordéon
// (`SheetFrame`) répond à la même demande sans ouvrir ce chantier-là.
//
// ── ⚠️ ON MONTE LE CORPS, JAMAIS LE CHROME ───────────────────────────────
// `renderToStaticMarkup` ne rend RIEN d'un portail: monté à travers `Modal`,
// ce formulaire serait une chaîne vide et chaque assertion serait verte quoi
// qu'il arrive. C'est la règle du dépôt, et c'est pour ça que `AddMouthForm`
// est un composant à part.
// ===========================================================================

const PATH = "/app/household";

function html(prefsOpen: boolean): string {
  Object.defineProperty(globalThis, "location", {
    value: { pathname: PATH, search: "", href: `http://localhost${PATH}` },
    configurable: true,
    writable: true,
  });
  setChosenUiLocaleForTest("en");
  const markup = renderToStaticMarkup(
    createElement(AddMouthForm, {
      draft: emptyMouthDraft(),
      onChange: () => {},
      todayLocalIso: "2026-09-03",
      busy: false,
      failure: null,
      slots: ["breakfast", "lunch", "dinner"] as const,
      onSubmit: () => {},
    }),
  );
  // L'accordéon part REPLIÉ (voir le cas dédié); `prefsOpen` n'est utile qu'à
  // la lisibilité des appels.
  return prefsOpen ? markup : markup;
}

function source(rel: string): string {
  return readFileSync(new URL(rel, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");
}

const src = source("./HouseholdPage.tsx");

describe("une seule fenêtre, et les préférences dedans", () => {
  it("la fiche obligatoire est rendue: identité, corps, direction", () => {
    const out = html(false);
    for (
      const key of [
        "household.mouth.identity",
        "household.mouth.body",
        "household.mouth.direction",
      ] as const
    ) {
      expect(out, `« ${en[key]} » manque dans la fenêtre`).toContain(en[key]);
    }
    // Et le bouton qui INSCRIT, pas celui qui enregistre une fiche existante.
    expect(out).toContain(en["household.mouth.add"]);
  });

  /**
   * ⛔ L'ACCORDÉON PART REPLIÉ, ET C'EST LE SEUL CADRE DU LOT QUI LE FAIT.
   * Les cadres d'une fiche EXISTANTE s'ouvrent parce qu'ils portent des
   * réponses déjà données. Ici il n'y a encore rien à cacher: la personne
   * n'existe pas, et six blocs de goûts au-dessus du bouton « Ajouter »
   * feraient une fenêtre de trente champs pour qui veut inscrire un prénom.
   */
  it("les préférences sont repliées, et le cadre dit ce qu'il porte", () => {
    const out = html(false);
    expect(out).toContain(en["household.member.frame_preferences"]);
    expect(out, "le cadre ne dit pas qu'il n'y a rien encore")
      .toContain(en["household.mouth.preferences_empty"]);
    expect(out, "les six blocs de goûts sont dépliés dès l'ouverture")
      .not.toContain(en["household.mouth.diet"]);
  });

  it("⛔ aucun second `Modal` n'est monté dans la fenêtre d'ajout", () => {
    const at = src.indexOf("export function AddMouthForm(");
    expect(at, "le corps de la fenêtre a disparu").toBeGreaterThan(0);
    const body = src.slice(at, src.indexOf("\nfunction ", at + 10));
    expect(body, "un `Modal` est imbriqué dans la fenêtre d'ajout")
      .not.toContain("<Modal");
    expect(body, "l'ancienne fenêtre des goûts est encore montée")
      .not.toContain("<MouthFormDialog");
    // Et le bouton des préférences bascule l'accordéon, il n'ouvre rien.
    expect(body).toContain("onOpenPreferences={() => setPrefsOpen((v) => !v)}");
  });

  it("la carte n'ouvre qu'UNE fenêtre", () => {
    const at = src.indexOf("function AddMouthCard(");
    const body = src.slice(at, src.indexOf("export function AddMouthForm(", at));
    expect([...body.matchAll(/<Modal\b/g)].length, "deux fenêtres, ou zéro")
      .toBe(1);
  });
});

describe("le plafond est écrit UNE fois, et il vit en base", () => {
  /**
   * ⛔ LE MÊME NOMBRE ÉTAIT ÉCRIT DEUX FOIS CÔTÉ FRONT, sous deux noms:
   * `HOUSEHOLD_MAX_MOUTHS` (l'entonnoir) et `HOUSEHOLD_MAX_MEMBERS` (le
   * Foyer). Le jour où la base en change un, c'est l'écran qu'on relit le
   * moins qui garde l'ancien — et il refuse, ou laisse passer, sans que rien ne
   * rougisse.
   */
  it("`HOUSEHOLD_MAX_MEMBERS` n'existe plus", () => {
    expect(src, "la seconde constante de plafond est revenue")
      .not.toContain("HOUSEHOLD_MAX_MEMBERS");
    expect(src).toContain("count >= HOUSEHOLD_MAX_MOUTHS");
  });

  /**
   * ⚠️ TEST NON PARAMÉTRÉ PAR SA PROPRE CONSTANTE: on confronte la valeur au
   * plafond que la BASE annonce (8, `keel_household_max_mouths()`), pas à
   * elle-même. Muter la constante fait tomber ce cas — c'est le but.
   */
  it("le plafond annoncé est celui de la base", () => {
    expect(HOUSEHOLD_MAX_MOUTHS).toBe(8);
  });

  it("le refus du 9e est traduit, dans les deux packs", () => {
    expect(en["household.add.full"]).toBeTruthy();
    expect(fr["household.add.full"]).toBeTruthy();
    expect(fr["household.add.full"]).not.toBe(en["household.add.full"]);
  });
});

describe("i18n du bouton d'ouverture", () => {
  it("il existe dans les deux packs et n'est pas l'anglais recopié", () => {
    expect(en["household.add.open"]).toBeTruthy();
    expect(fr["household.add.open"]).toBeTruthy();
    expect(fr["household.add.open"]).not.toBe(en["household.add.open"]);
  });
});
