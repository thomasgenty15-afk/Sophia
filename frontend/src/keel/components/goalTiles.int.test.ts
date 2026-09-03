import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import GoalTiles from "./GoalTiles";
import type { MemberAgeState, MemberGoal } from "../api/household";
import { en } from "../i18n/en";
import { fr } from "../i18n/fr";
import { setChosenUiLocaleForTest } from "../i18n/runtime";
import { GOAL_TOKENS } from "../../../../supabase/functions/_shared/keel/tokens.ts";

// ===========================================================================
// P3 (2026-09-03) — LES TUILES DE DIRECTION, SUR LA VALEUR RENDUE
//
// Un seul composant pour les six sélecteurs du dépôt (la fiche, trois sites de
// l'entonnoir, deux de `/app/household`). Ce fichier mesure ce que le lecteur
// voit — combien de tuiles, laquelle est cochée, quel mot, quelle phrase —, et
// il est le harnais des DEUX mutations du mandat: réintroduire une option vide
// (une tuile de plus, valeur `""`) et lire `unknown` comme `minor` (une tuile
// au lieu de trois sur un âge inconnu). Les deux tombent ici.
//
// ⚠️ `.ts` ET `createElement`, JAMAIS DE JSX: `vitest.config.ts` n'inclut que
// `src/**/*.int.test.ts`.
// ===========================================================================

const PATH = "/app/household";

function html(args: {
  value: MemberGoal | "";
  ageState: MemberAgeState;
  locale?: "en" | "fr";
  disabled?: boolean;
}): string {
  // `uiLocale()` lit le CHEMIN COURANT — patron de `mouthFormDialog.int.test.ts`.
  Object.defineProperty(globalThis, "location", {
    value: { pathname: PATH, search: "", href: `http://localhost${PATH}` },
    configurable: true,
    writable: true,
  });
  setChosenUiLocaleForTest(args.locale ?? "en");
  return renderToStaticMarkup(
    createElement(GoalTiles, {
      value: args.value,
      ageState: args.ageState,
      onChange: () => {},
      // Les MOTS viennent de la page: on passe un vocabulaire reconnaissable
      // pour prouver qu'il est honoré, et qu'il n'est PAS celui d'un enfant.
      labelOf: (g: MemberGoal) => `label:${g}`,
      name: "goal",
      id: "goal",
      ariaLabel: "direction",
      disabled: args.disabled,
    }),
  );
}

/**
 * Les balises `<input>` du groupe, telles quelles.
 *
 * ⚠️ ON LIT LA BALISE ENTIÈRE, PAS UN ORDRE D'ATTRIBUTS. React (SSR) émet
 * `checked=""` et `value="…"` EN DERNIER, dans cet ordre, quel que soit l'ordre
 * des props — mesuré: `name="goal" checked="" value="maintenance"`. Une regex
 * qui supposerait `value` avant `checked` serait verte sur « rien de coché ».
 */
function tagsOf(markup: string): string[] {
  return [...markup.matchAll(/<input[^>]*name="goal"[^>]*>/g)].map((m) => m[0]);
}
function valueOf(tag: string): string {
  return /value="([a-z_]*)"/.exec(tag)?.[1] ?? "(sans valeur)";
}

/** Les valeurs des boutons radio du groupe, dans l'ordre du document. */
function offered(markup: string): string[] {
  return tagsOf(markup).filter((t) => t.includes('type="radio"')).map(valueOf);
}

/** Celles qui sont cochées. */
function checkedValues(markup: string): string[] {
  return tagsOf(markup).filter((t) => /\bchecked(=""|\s|\/)/.test(t)).map(valueOf);
}

describe("combien de tuiles, et pour qui", () => {
  it("un adulte: les trois jetons du socle, dans l'ordre, et rien d'autre", () => {
    expect(offered(html({ value: "", ageState: "adult" }))).toEqual([...GOAL_TOKENS]);
  });

  /**
   * ⚠️ « JE NE SAIS PAS » N'EST PAS « C'EST UN ENFANT ». Muter `goalsForAge`
   * pour lire `unknown` comme `minor` tombe ici: une tuile au lieu de trois.
   */
  it("un âge INCONNU: les trois aussi", () => {
    expect(offered(html({ value: "", ageState: "unknown" }))).toEqual([...GOAL_TOKENS]);
  });

  it("un mineur: UNE tuile, `maintenance`, libellée « Eat normally » — pas le mot de la page", () => {
    const markup = html({ value: "", ageState: "minor" });
    expect(offered(markup)).toEqual(["maintenance"]);
    expect(markup).toContain(en["household.goal.minor_maintenance"]);
    expect(markup, "la tuile d'un enfant porte le mot de la page")
      .not.toContain("label:maintenance");
    expect(markup).toContain(en["household.goal.minor_only"]);
  });

  /**
   * ⛔ LA MUTATION DU MANDAT: réintroduire l'option vide. Une tuille de plus,
   * ou une valeur `""`, tombe sur l'une de ces deux lignes.
   */
  it("⛔ aucune option vide: ni une quatrième tuile, ni une valeur \"\"", () => {
    const markup = html({ value: "", ageState: "adult" });
    expect(offered(markup)).toHaveLength(GOAL_TOKENS.length);
    expect(offered(markup)).not.toContain("");
    expect(markup).not.toContain("<select");
  });

  it("le vocabulaire de la page est honoré sur les tuiles d'un adulte", () => {
    const markup = html({ value: "", ageState: "adult" });
    for (const g of GOAL_TOKENS) expect(markup).toContain(`label:${g}`);
    expect(markup).not.toContain(en["household.goal.minor_only"]);
  });
});

describe("laquelle est cochée", () => {
  it("rien de coché tant que personne n'a choisi — aucune pré-sélection", () => {
    expect(checkedValues(html({ value: "", ageState: "adult" }))).toEqual([]);
    expect(checkedValues(html({ value: "", ageState: "unknown" }))).toEqual([]);
    expect(checkedValues(html({ value: "", ageState: "minor" }))).toEqual([]);
  });

  it("la direction choisie est cochée, et elle seule", () => {
    expect(checkedValues(html({ value: "muscle_gain", ageState: "adult" })))
      .toEqual(["muscle_gain"]);
    expect(checkedValues(html({ value: "maintenance", ageState: "unknown" })))
      .toEqual(["maintenance"]);
  });

  /**
   * LE PLI, ET LA PHRASE. Une direction que l'âge ne peut pas porter est rendue
   * comme « Eat normally » COCHÉ, et la phrase nomme — dans les mots de la page
   * — celle qu'elle remplace. Une bascule muette serait un renversement
   * silencieux.
   */
  it("une direction refusée à cet âge est pliée sur `maintenance`, cochée, et DITE", () => {
    for (const goal of ["fat_loss", "muscle_gain"] as const) {
      const markup = html({ value: goal, ageState: "minor" });
      expect(offered(markup)).toEqual(["maintenance"]);
      expect(checkedValues(markup)).toEqual(["maintenance"]);
      expect(markup).toContain(
        en["household.goal.minor_switched"].replace("{from}", `label:${goal}`),
      );
    }
  });

  it("…et la phrase n'apparaît que là: ni pour un adulte, ni pour `maintenance`, ni sans choix", () => {
    const sentence = en["household.goal.minor_switched"].split("{from}")[0];
    expect(html({ value: "fat_loss", ageState: "adult" })).not.toContain(sentence);
    expect(html({ value: "fat_loss", ageState: "unknown" })).not.toContain(sentence);
    expect(html({ value: "maintenance", ageState: "minor" })).not.toContain(sentence);
    expect(html({ value: "", ageState: "minor" })).not.toContain(sentence);
  });
});

describe("le reste du contrat", () => {
  it("`disabled` désarme chaque tuile, et aucune sinon", () => {
    const off = tagsOf(html({ value: "", ageState: "adult", disabled: true }));
    expect(off).toHaveLength(GOAL_TOKENS.length);
    for (const tag of off) expect(tag, tag).toMatch(/\bdisabled(=""|\s|\/)/);
    const on = tagsOf(html({ value: "", ageState: "adult" }));
    expect(on).toHaveLength(GOAL_TOKENS.length);
    for (const tag of on) expect(tag, tag).not.toMatch(/\bdisabled/);
  });

  it("le groupe porte son `id` et son rôle — c'est ce que les harnais d'ordre mesurent", () => {
    const markup = html({ value: "", ageState: "adult" });
    expect(markup).toMatch(/<div[^>]*id="goal"[^>]*role="radiogroup"/);
    expect(markup).toContain('aria-label="direction"');
  });

  it("en français, les mots d'un enfant sont français — et pas l'anglais à la place", () => {
    const markup = html({ value: "fat_loss", ageState: "minor", locale: "fr" });
    expect(markup).toContain(fr["household.goal.minor_maintenance"]);
    expect(markup).toContain(fr["household.goal.minor_only"]);
    expect(markup).toContain(
      fr["household.goal.minor_switched"].replace("{from}", "label:fat_loss"),
    );
    expect(markup).not.toContain(en["household.goal.minor_maintenance"]);
    expect(markup).not.toContain(en["household.goal.minor_only"]);
  });
});
