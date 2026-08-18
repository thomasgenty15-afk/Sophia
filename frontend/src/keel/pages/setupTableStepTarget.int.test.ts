import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { TableStep } from "./SetupPage";
import { emptyMouthDraft, type MouthFormDraft } from "../lib/mouthForm";
import { en } from "../i18n/en";
import { setChosenUiLocaleForTest } from "../i18n/runtime";

// ===========================================================================
// D6 (2026-08-18) — L'ÉTAPE 3 PORTE LE POIDS VISÉ ET LE RYTHME
//
// Décision de l'utilisateur, mot pour mot: « le poids visé et le rythme
// d'évolution, il faut pas que ce soit dans la pop-up, il faut que ce soit dans
// le cadre de l'étape 3 ».
//
// L'état d'avant, mesuré au navigateur: l'entonnoir n'en portait AUCUN des
// deux — zéro `input[type=range]` sur la page après avoir choisi une direction,
// et aucun champ de poids visé. Quelqu'un qui s'inscrivait choisissait une
// direction sans jamais pouvoir dire ni où il va, ni à quelle vitesse.
//
// ⚠️ ET LE CORPS EST DEMANDÉ À L'ÉTAPE D'AVANT. C'est ce qui rend cet ordre
// juste: le curseur est BORNÉ par la taille et le poids. Quand ils manquent, il
// doit le DIRE — un dépliage vide se lit comme une fonctionnalité absente, et
// c'est exactement le défaut qui a été rapporté.
// ===========================================================================

const PATH = "/app/setup";
const TODAY = "2026-08-18";

function draftOf(patch: Partial<MouthFormDraft>): MouthFormDraft {
  return { ...emptyMouthDraft(), ...patch };
}

/** Un adulte dont on connaît le corps, et qui veut perdre. */
const KNOWN_BODY = draftOf({
  firstName: "Ada",
  birthDate: "1990-05-04",
  goal: "fat_loss",
  heightCm: "170",
  weightKg: "72",
  gender: "female",
});

function html(
  target: MouthFormDraft | null,
  extra: { mouths?: number } = {},
): string {
  Object.defineProperty(globalThis, "location", {
    value: { pathname: PATH, search: "", href: `http://localhost${PATH}` },
    configurable: true,
    writable: true,
  });
  setChosenUiLocaleForTest("en");
  const mouths = Array.from({ length: extra.mouths ?? 0 }, (_, i) => ({
    memberId: `m-${i}`,
    firstName: `Autre ${i}`,
    claimed: false,
    diet: null,
    eatingSlots: null,
    away: [],
    heightCm: null,
    weightKg: null,
    gender: null,
    activityLevel: null,
    kind: "adult" as const,
    birthDate: null,
    goal: null,
    allergiesReviewed: true,
  }));
  return renderToStaticMarkup(
    createElement(TableStep, {
      draft: {
        eatingRhythm: [],
        cookingMinutes: null,
        budgetAmount: null,
        budgetCurrency: null,
      },
      onChange: () => {},
      mouths,
      onMouthRhythm: () => {},
      onMouthDiet: () => {},
      busy: false,
      missing: [],
      selfDiet: "",
      onSelfDiet: () => {},
      selfFirstName: "Ada",
      selfMemberId: "m-self",
      habits: new Map(),
      onSaveNote: () => Promise.resolve(true),
      selfTarget: target === null ? null : {
        draft: target,
        onChange: () => {},
        todayLocalIso: TODAY,
      },
      // deno-lint-ignore no-explicit-any
    } as any),
  );
}

describe("l'étape 3 porte le poids visé et le curseur de rythme", () => {
  it("corps connu et direction qui bouge: les DEUX contrôles sont là", () => {
    const markup = html(KNOWN_BODY);
    expect(markup, "le poids visé n'est pas dans l'étape 3").toContain(
      'id="mouth-target-weight"',
    );
    expect(markup, "le curseur de rythme n'est pas dans l'étape 3").toContain(
      'id="mouth-pace"',
    );
    expect(markup).toContain('type="range"');
  });

  /**
   * ⚠️ LE CAS QUI A ÉTÉ RAPPORTÉ. Sans corps, le curseur ne peut pas exister —
   * son plafond se calcule dessus. Ce qui compte est qu'il DISE pourquoi, au
   * lieu de laisser un blanc.
   */
  it("corps inconnu: une PHRASE à la place du curseur, jamais un blanc", () => {
    const markup = html(draftOf({ goal: "fat_loss", birthDate: "1990-05-04" }));
    expect(markup).not.toContain('id="mouth-pace"');
    expect(markup).toContain(en["household.mouth.pace_needs_body"]);
    // ET LE POIDS VISÉ, LUI, RESTE RENDU: il ne dépend pas du corps.
    expect(markup).toContain('id="mouth-target-weight"');
  });

  /**
   * ET « PAS DE MARGE » N'EST PAS LA MÊME CHOSE — `null` contre `0`. Ce corps
   * de 25 kg est connu, et son plafond tombe à zéro: on ne rend pas un curseur
   * de 0,05 à 0, on rend l'AUTRE phrase.
   */
  it("corps sans marge: l'autre phrase, et toujours pas de curseur mort", () => {
    const markup = html(draftOf({
      firstName: "Ada",
      birthDate: "1990-05-04",
      goal: "fat_loss",
      heightCm: "140",
      weightKg: "25",
      gender: "female",
    }));
    expect(markup).not.toContain('id="mouth-pace"');
    expect(markup).toContain(en["household.mouth.pace_no_margin"]);
    expect(markup).not.toContain(en["household.mouth.pace_needs_body"]);
  });

  it("direction qui ne bouge pas: rien ne se déplie, et rien ne promet", () => {
    const markup = html(draftOf({ ...KNOWN_BODY, goal: "maintenance" }));
    expect(markup).not.toContain('id="mouth-target-weight"');
    expect(markup).not.toContain('id="mouth-pace"');
  });

  /**
   * ⚠️ LA LECTURE N'A PAS EU LIEU ⇒ AUCUN CHAMP. Ces deux valeurs existent
   * peut-être déjà en base (`/app/household` les écrit): un formulaire figé sur
   * du vide non lu les écraserait au « Continuer ».
   */
  it("lecture non faite: aucun champ, plutôt qu'un vide qui s'écrira", () => {
    const markup = html(null);
    expect(markup).not.toContain('id="mouth-target-weight"');
    expect(markup).not.toContain('id="mouth-pace"');
    // ET LE RESTE DE LA CARTE EST BIEN LÀ: sans ce cas, l'assertion du dessus
    // serait vraie d'une étape qui ne rend plus rien.
    expect(markup).toContain(en["setup.table.diet_label"]);
  });

  /**
   * LES AUTRES BOUCHES N'EN PORTENT PAS ENCORE, ET C'EST DÉLIBÉRÉ: leur cible
   * s'écrit par une AUTRE porte (`setMemberTarget`), et rendre le champ sans
   * son écrivain serait un contrôle qui promet. Le compte le prouve: un seul
   * jeu de contrôles sur une étape à trois cartes.
   */
  it("une seule cible à l'écran, celle du titulaire", () => {
    const markup = html(KNOWN_BODY, { mouths: 2 });
    expect(markup.split('id="mouth-target-weight"').length - 1).toBe(1);
    expect(markup.split('id="mouth-pace"').length - 1).toBe(1);
  });
});

/**
 * L'ÉCRITURE — la seule assertion de source, et elle est bornée.
 *
 * Le « Continuer » de l'étape 3 est un `onClick` dans un composant qui ne se
 * monte pas ici (session, routeur). Ce qui est épinglé est qu'il APPELLE
 * l'écrivain: un champ qu'on remplit et qui ne part nulle part est pire qu'un
 * champ absent, parce qu'il promet.
 *
 * ⚠️ COMMENTAIRES RETIRÉS — `SetupPage.tsx` PARLE longuement de ces deux
 * symboles dans ses en-têtes, et un grep naïf compterait ces morts-là comme des
 * vivants.
 */
describe("et ce que l'étape 3 collecte, elle l'écrit", () => {
  const src = readFileSync(new URL("./SetupPage.tsx", import.meta.url), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .split("\n")
    .map((line) => {
      const at = line.indexOf("//");
      if (at < 0) return line;
      if (at > 0 && line[at - 1] === ":") return line;
      return line.slice(0, at);
    })
    .join("\n");

  it("la cible part par `setOwnTarget`, décidée par `targetPayloadOf`", () => {
    expect(src, "plus personne n'écrit la cible du titulaire").toContain(
      "setOwnTarget(",
    );
    expect(src, "l'entonnoir décide lui-même de ce qui part en base").toContain(
      "targetPayloadOf(",
    );
  });

  it("et l'écran ne refait PAS le calcul du curseur", () => {
    // Une seconde lecture de `paceControlFor` ici divergerait de celle de
    // `/app/household` au premier correctif. Le composant est partagé, exprès.
    expect(src).not.toContain("paceControlFor(");
    expect(src).toContain("TargetAndPaceFields");
  });
});
