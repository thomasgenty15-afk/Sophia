import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import TableStepPlanning from "./TableStepPlanning";
import { commitWorkLunch } from "../lib/workLunchCommit";
import type { PracticalConstraints } from "../api/practicalConstraints";
import type { WorkLunch } from "../lib/presenceMarks";
import type { WorkLunchPerson } from "../lib/workLunchForm";
import { fr } from "../i18n/fr";
import { setChosenUiLocaleForTest } from "../i18n/runtime";

// ===========================================================================
// L6 (2026-08-18) — LA TÊTE DE L'ÉTAPE `table`, SUR LA VALEUR RENDUE
//
// ⚠️ `.ts` ET `createElement`, JAMAIS DE JSX: `vitest.config.ts` n'inclut que
// `src/**/*.int.test.ts` — un `.tsx` ne serait JAMAIS COLLECTÉ, et le fichier
// entier serait un silence vert. Patron de `kitchenEquipmentCard.int.test.ts`.
//
// ⚠️ `renderToStaticMarkup` NE JOUE AUCUN EFFET. C'est une contrainte, et c'est
// aussi ce que ce fichier mesure de plus utile: le PREMIER rendu est celui où
// rien n'a encore été lu, et c'est là qu'un formulaire figé au montage écrit du
// vide par-dessus une réponse. Le geste d'écriture, lui, est mesuré à part par
// `commitWorkLunch`, qui a été sorti du JSX exprès.
// ===========================================================================

const SETUP_PATH = "/app/setup";

/** Une colonne LUE et vide — « on a lu, il n'y a rien dedans ». */
const READ_EMPTY: PracticalConstraints = { cooking_time_min: 30 };

const ADULT: WorkLunchPerson = {
  memberId: "own",
  firstName: "Ahmed",
  ageState: "adult",
};

function html(props: {
  practicalConstraints?: PracticalConstraints | null;
  hasGoal?: boolean;
  people?: readonly WorkLunchPerson[];
}): string {
  // `uiLocale()` lit le CHEMIN COURANT — la langue d'une page dépend de la page,
  // pas seulement du visiteur —, donc un rendu sans `location` sort en anglais
  // quoi qu'on ait choisi.
  Object.defineProperty(globalThis, "location", {
    value: { pathname: SETUP_PATH, search: "", href: `http://localhost${SETUP_PATH}` },
    configurable: true,
    writable: true,
  });
  return renderToStaticMarkup(
    createElement(TableStepPlanning, {
      practicalConstraints: props.practicalConstraints === undefined
        ? READ_EMPTY
        : props.practicalConstraints,
      hasGoal: props.hasGoal ?? true,
      people: props.people ?? [ADULT],
      busy: false,
      onSaved: () => {},
    }),
  );
}

/**
 * LA LANGUE EST UN ÉTAT DE MODULE, DONC ELLE FUIT D'UN TEST À L'AUTRE.
 * Même filet que `kitchenEquipmentCard.int.test.ts`: un fichier qui laisserait
 * `fr` derrière lui ferait tomber un voisin sur une assertion anglaise, et le
 * rouge apparaîtrait ailleurs que là où il est né.
 */
afterEach(() => setChosenUiLocaleForTest("en"));
afterAll(() => setChosenUiLocaleForTest("en"));

describe("l'ordre de l'étape `table`", () => {
  it("⛔ LES MOYENS DE CUISSON PASSENT AVANT LE DÉJEUNER", () => {
    // §2: « on demande AVEC QUOI on cuisine avant de demander QUAND — sinon on
    // planifie des cuissons impossibles ». L'ordre est mesuré sur le HTML RENDU,
    // pas sur la lecture du fichier: un ordre qui ne tient que par l'œil se
    // défait au premier déplacement de bloc.
    setChosenUiLocaleForTest("fr");
    const out = html({});
    const oven = out.indexOf(fr["setup.equipment.tool_oven"]);
    const lunch = out.indexOf(fr["setup.work_lunch.title"]);
    expect([oven >= 0, lunch >= 0]).toEqual([true, true]);
    expect(oven).toBeLessThan(lunch);
    setChosenUiLocaleForTest("en");
  });

  it("les deux cartes sont là, et rien d'autre ne s'est glissé entre elles", () => {
    setChosenUiLocaleForTest("fr");
    const out = html({});
    expect(out).toContain(fr["setup.equipment.legend"]);
    expect(out).toContain(fr["setup.work_lunch.intro"]);
    setChosenUiLocaleForTest("en");
  });
});

describe("⛔ le premier rendu n'affiche AUCUNE réponse non lue", () => {
  it("le déjeuner dit qu'il lit, et ne pose pas encore sa question", () => {
    // `renderToStaticMarkup` ne joue pas l'effet de lecture: `answers` vaut
    // `null`, c'est-à-dire exactement l'instant que la cicatrice
    // `mount-snapshot-forms-need-a-loading-gate` vise. Sept questions vierges
    // ici, c'est « personne ne mange au bureau » montré à un foyer qui a
    // répondu — et le premier clic l'écrirait.
    setChosenUiLocaleForTest("fr");
    const out = html({});
    expect(out).toContain(fr["setup.work_lunch.loading"]);
    expect(out).not.toContain("déjeune au bureau");
    setChosenUiLocaleForTest("en");
  });

  it("l'équipement dit qu'il lit tant que la colonne n'est pas arrivée", () => {
    setChosenUiLocaleForTest("fr");
    const out = html({ practicalConstraints: null });
    expect(out).toContain(fr["setup.equipment.loading"]);
    expect(out).not.toContain(fr["setup.equipment.tool_oven"]);
    setChosenUiLocaleForTest("en");
  });
});

describe("à qui la question se pose", () => {
  it("aucun majeur ⇒ aucune carte de déjeuner, mais l'équipement RESTE", () => {
    // L'équipement est une propriété du FOYER: une table de mineurs cuisine
    // quand même. Les deux cartes ne se tiennent pas par la main.
    setChosenUiLocaleForTest("fr");
    const out = html({
      people: [
        { memberId: "m1", firstName: "Lino", ageState: "minor" },
        { memberId: "m2", firstName: "Zoé", ageState: "unknown" },
      ],
    });
    expect(out).not.toContain(fr["setup.work_lunch.title"]);
    expect(out).toContain(fr["setup.equipment.tool_oven"]);
    setChosenUiLocaleForTest("en");
  });

  it("sans ligne d'objectif, l'équipement le DIT au lieu de se taire", () => {
    setChosenUiLocaleForTest("fr");
    const out = html({ hasGoal: false });
    expect(out).toContain(fr["setup.equipment.no_goal"]);
    setChosenUiLocaleForTest("en");
  });
});

describe("⛔ enregistrer une réponse RELIT ce qui est enregistré", () => {
  const ANSWER: WorkLunch = { atWork: true, mode: "outside", microwave: null };

  it("la relecture a lieu, et AVANT la relecture de la page", async () => {
    // ═══════════════════════════════════════════════════════════════════════
    // C'EST LA GARDE QUI EMPÊCHE LE FORMULAIRE D'EFFACER LA GRILLE.
    //
    // La porte SQL ré-applique son pré-remplissage à CHAQUE écriture, même
    // identique (L3-B): réécrire `{"at_work":true,"mode":"outside"}` REMET les
    // cinq midis « dehors », y compris celui qu'on venait de décocher à la main.
    // `WorkLunchCard` s'en garde en comparant à ce qui est ENREGISTRÉ — et
    // « enregistré » ne redevient vrai que si on relit.
    // ═══════════════════════════════════════════════════════════════════════
    const order: string[] = [];
    const save = vi.fn(async () => {
      order.push("save");
      return { ok: true, reason: null };
    });
    const reread = vi.fn(async () => {
      order.push("reread");
    });
    const onSaved = vi.fn(async () => {
      order.push("onSaved");
    });

    const result = await commitWorkLunch({
      memberId: "own",
      answer: ANSWER,
      save,
      reread,
      onSaved,
    });

    expect(result).toEqual({ ok: true, reason: null });
    expect(order).toEqual(["save", "reread", "onSaved"]);
  });

  it("un refus ne relit RIEN — le motif reste sous le geste", async () => {
    const reread = vi.fn(async () => {});
    const onSaved = vi.fn(async () => {});
    const result = await commitWorkLunch({
      memberId: "m1",
      answer: ANSWER,
      save: async () => ({ ok: false, reason: "not_adult" }),
      reread,
      onSaved,
    });
    expect(result).toEqual({ ok: false, reason: "not_adult" });
    expect(reread).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("la réponse part telle quelle, sans être recomposée en route", async () => {
    const save = vi.fn(async () => ({ ok: true, reason: null }));
    await commitWorkLunch({
      memberId: "own",
      answer: ANSWER,
      save,
      reread: async () => {},
      onSaved: () => {},
    });
    expect(save).toHaveBeenCalledWith("own", ANSWER);
  });
});
