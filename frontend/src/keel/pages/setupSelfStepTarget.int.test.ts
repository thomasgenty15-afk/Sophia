import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { SelfStep } from "./SetupPage";
import { emptyMouthDraft, type MouthFormDraft } from "../lib/mouthForm";
import { en } from "../i18n/en";
import { setChosenUiLocaleForTest } from "../i18n/runtime";

// ===========================================================================
// D7 (2026-08-18) — LE POIDS VISÉ ET LE RYTHME SONT SOUS LA DIRECTION
//
// Décision de l'utilisateur, mot pour mot: « quand quelqu'un renseigne qu'il
// veut perdre ou gagner du poids, alors se débloquent deux choses: le poids
// visé, et le curseur pour dire combien par semaine ».
//
// ── CE QUI A ÉTÉ MESURÉ À L'ÉCRAN, ET CE QUE CE FICHIER GARDE ─────────────
// Les deux champs ont d'abord été montés sur l'étape du PLANNING (`TableStep`),
// deux écrans plus loin. Le lot était vert: un fichier de test montait
// `TableStep`, y trouvait ses deux `id`, et un test de SOURCE trouvait le mot
// `TargetAndPaceFields` dans `SetupPage.tsx`. L'utilisateur, lui, choisissait
// « Perdre du poids » sur l'écran d'à côté et ne voyait RIEN.
//
// La leçon est dans le montage de ce fichier: on rend L'ÉCRAN OÙ LA QUESTION
// EST POSÉE, et rien d'autre. Un test qui monte le bon composant est la seule
// chose qui distingue « c'est livré » de « le mot est dans le fichier ».
//
// ⚠️ `.ts` ET `createElement`, JAMAIS DE JSX: `vitest.config.ts` n'inclut que
// `src/**/*.int.test.ts` — un `.tsx` ne serait JAMAIS COLLECTÉ.
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

/**
 * L'ÉTAPE 2, RENDUE — la carte « moi », telle que l'entonnoir la monte.
 *
 * `self` suit le brouillon de cible: c'est la page qui garantit les deux
 * d'accord (`selfMouthDraft` se recalcule à partir de `self`), et un rendu qui
 * les laisserait diverger prouverait un écran qui n'existe pas.
 */
function html(target: MouthFormDraft | null): string {
  Object.defineProperty(globalThis, "location", {
    value: { pathname: PATH, search: "", href: `http://localhost${PATH}` },
    configurable: true,
    writable: true,
  });
  setChosenUiLocaleForTest("en");
  const seed = target ?? KNOWN_BODY;
  return renderToStaticMarkup(
    createElement(SelfStep, {
      draft: {
        firstName: seed.firstName,
        birthDate: seed.birthDate,
        heightCm: seed.heightCm,
        weightKg: seed.weightKg,
        gender: seed.gender,
        activityLevel: null,
        goal: seed.goal,
        diet: "",
        allergies: [],
        allergiesNone: false,
      },
      onChange: () => {},
      branch: "solo",
      onSave: null,
      busy: false,
      target: target === null ? null : {
        draft: target,
        onChange: () => {},
        todayLocalIso: TODAY,
      },
      onOpenPreferences: target === null ? null : () => {},
      // deno-lint-ignore no-explicit-any
    } as any),
  );
}

describe("l'étape « moi » porte le poids visé et le curseur de rythme", () => {
  it("corps connu et direction qui bouge: les DEUX contrôles sont là", () => {
    const markup = html(KNOWN_BODY);
    expect(markup, "le poids visé n'est pas sur l'écran de la direction")
      .toContain('id="setup-self-target-weight"');
    expect(markup, "le curseur de rythme n'est pas sur l'écran de la direction")
      .toContain('id="setup-self-pace"');
    expect(markup).toContain('type="range"');
  });

  /**
   * ⚠️ ET ILS SUIVENT LE CHOIX D'OBJECTIF, JAMAIS L'INVERSE. Le libellé de la
   * direction doit apparaître AVANT le poids visé dans le HTML: c'est l'ordre
   * de lecture, et c'est ce qui fait qu'un champ « se débloque » au lieu
   * d'attendre au-dessus de la question qu'il complète.
   */
  it("ils viennent APRÈS le choix de la direction", () => {
    const markup = html(KNOWN_BODY);
    const goal = markup.indexOf('id="setup-goal"');
    const target = markup.indexOf('id="setup-self-target-weight"');
    expect(goal).toBeGreaterThan(-1);
    expect(target).toBeGreaterThan(goal);
  });

  /**
   * ⚠️ ET LE CORPS VIENT AVANT LES DEUX. Le plafond du curseur est BORNÉ par la
   * taille et le poids: demander le rythme avant le corps qui le borne rend un
   * contrôle muet, et un contrôle muet se lit comme une fonctionnalité absente.
   * C'est le défaut exact que `MOUTH_FORM_BLOCKS` a déjà payé une fois.
   */
  it("le corps est demandé AVANT la direction qu'il borne", () => {
    const markup = html(KNOWN_BODY);
    const height = markup.indexOf('id="setup-height"');
    const weight = markup.indexOf('id="setup-weight"');
    const gender = markup.indexOf('id="setup-gender"');
    const goal = markup.indexOf('id="setup-goal"');
    expect(height).toBeGreaterThan(-1);
    expect(goal).toBeGreaterThan(height);
    expect(goal).toBeGreaterThan(weight);
    expect(goal).toBeGreaterThan(gender);
  });

  /**
   * ⚠️ LE CAS QUI A ÉTÉ RAPPORTÉ. Sans corps, le curseur ne peut pas exister —
   * son plafond se calcule dessus. Ce qui compte est qu'il DISE pourquoi, au
   * lieu de laisser un blanc.
   */
  it("corps inconnu: une PHRASE à la place du curseur, jamais un blanc", () => {
    const markup = html(draftOf({ goal: "fat_loss", birthDate: "1990-05-04" }));
    expect(markup).not.toContain('id="setup-self-pace"');
    expect(markup).toContain(en["household.mouth.pace_needs_body"]);
    // ET LE POIDS VISÉ, LUI, RESTE RENDU: il ne dépend pas du corps.
    expect(markup).toContain('id="setup-self-target-weight"');
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
    expect(markup).not.toContain('id="setup-self-pace"');
    expect(markup).toContain(en["household.mouth.pace_no_margin"]);
    expect(markup).not.toContain(en["household.mouth.pace_needs_body"]);
  });

  it("direction qui ne bouge pas: rien ne se déplie, et rien ne promet", () => {
    const markup = html(draftOf({ ...KNOWN_BODY, goal: "maintenance" }));
    expect(markup).not.toContain('id="setup-self-target-weight"');
    expect(markup).not.toContain('id="setup-self-pace"');
  });

  it("prise de poids: les deux se débloquent aussi", () => {
    const markup = html(draftOf({ ...KNOWN_BODY, goal: "muscle_gain" }));
    expect(markup).toContain('id="setup-self-target-weight"');
    expect(markup).toContain('id="setup-self-pace"');
  });

  /**
   * ⚠️ LA LECTURE N'A PAS EU LIEU ⇒ AUCUN CHAMP. Ces deux valeurs existent
   * peut-être déjà en base (`/app/household` les écrit): un formulaire figé sur
   * du vide non lu les écraserait au « Continuer ».
   */
  it("lecture non faite: aucun champ, plutôt qu'un vide qui s'écrira", () => {
    const markup = html(null);
    expect(markup).not.toContain('id="setup-self-target-weight"');
    expect(markup).not.toContain('id="setup-self-pace"');
    // ET LE RESTE DE LA CARTE EST BIEN LÀ: sans ce cas, l'assertion du dessus
    // serait vraie d'une carte qui ne rend plus rien.
    expect(markup).toContain('id="setup-goal"');
  });
});

/**
 * L'ÉCRITURE — la seule assertion de source, et elle est bornée.
 *
 * « Continuer » est un `onClick` dans un composant qui ne se monte pas ici
 * (session, routeur). Ce qui est épinglé est qu'il APPELLE l'écrivain: un champ
 * qu'on remplit et qui ne part nulle part est pire qu'un champ absent, parce
 * qu'il promet.
 *
 * ⚠️ COMMENTAIRES RETIRÉS — `SetupPage.tsx` PARLE longuement de ces symboles
 * dans ses en-têtes, et un grep naïf compterait ces morts-là comme des vivants.
 */
describe("et ce que l'étape 2 collecte, elle l'écrit", () => {
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

// ===========================================================================
// D7 (2026-08-18) — LES ALLERGIES SONT DERRIÈRE LE BOUTON, ET LE BOUTON EST LÀ
//
// Décision de l'utilisateur: « le reste — allergies, habitudes, ce qu'on n'aime
// pas, le shaker — dans une pop-up accessible depuis "Renseigner ses
// préférences alimentaires" », et « bien sûr qu'il y ait le bouton pour
// l'ouvrir ».
//
// ⚠️ LES DEUX MOITIÉS COMPTENT, ET LA SECONDE EST LA PLUS DANGEREUSE À OUBLIER:
// retirer le champ en ligne SANS la porte rendrait les allergies
// inatteignables, pendant que `canGenerate` continue de réclamer la réponse.
// Un écran qui exige ce qu'il n'offre plus est pire que le doublon qu'on
// referme.
// ===========================================================================
describe("les allergies ont quitté la ligne, et la porte est visible", () => {
  it("le bouton des préférences est rendu", () => {
    const markup = html(KNOWN_BODY);
    expect(markup).toContain(en["household.mouth.preferences_open"]);
  });

  /**
   * ⚠️ PLUS AUCUN CHAMP D'ALLERGIE EN LIGNE. Deux formulaires sur la même
   * colonne, c'est la garantie qu'un jour l'un des deux cessera d'écrire ce que
   * l'autre écrit — le motif exact qui avait servi à ne rien faire.
   */
  it("plus aucun sélecteur d'allergies sur la carte", () => {
    const markup = html(KNOWN_BODY);
    expect(markup, "le champ d'allergies en ligne est revenu")
      .not.toContain(en["setup.people.allergies_none"]);
  });

  /** ET IL DIT CE QUI EST DÉJÀ RENSEIGNÉ — sinon fermer se lit comme perdre. */
  it("le récapitulatif nomme ce qui est déjà là", () => {
    const empty = html(KNOWN_BODY);
    expect(empty).toContain(en["household.mouth.preferences_empty"]);
    const filled = html(draftOf({ ...KNOWN_BODY, allergies: ["peanut"] }));
    expect(filled).toContain(en["household.mouth.block_allergies"]);
  });
});
