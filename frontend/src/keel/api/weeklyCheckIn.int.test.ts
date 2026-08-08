// LE GARDE-FRONTIÈRE ENTRE LES DEUX RUNTIMES.
//
// `weeklyCheckIn.ts` recopie des constantes qui vivent dans
// `supabase/functions/_shared/keel/weekly_flow.ts`. Le front est en Vite/TS, le
// back en Deno : aucun import n'est possible entre les deux, donc la copie est
// assumée. Ce fichier est ce qui l'empêche de dériver — il LIT le module Deno
// sur le disque et compare.
//
// Le défaut que ça interdit est concret : un axe que l'écran propose mais que
// le parseur ignore est une case que l'élève remplit dans le vide, et personne
// ne s'en aperçoit — ni le typecheck, ni les tests de chaque côté, qui sont
// verts séparément. C'est la version « deux runtimes » du défaut n°1 de ce
// dépôt.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildWeeklySubmission,
  isWeeklyCheckInToken,
  WAIST_CM_MAX,
  WAIST_CM_MIN,
  WEEKLY_AXES,
  WEEKLY_AXIS_LABELS,
  WEEKLY_SCALE_LABELS,
  WEIGHT_KG_MAX,
  WEIGHT_KG_MIN,
} from "./weeklyCheckIn";
import { en as EN } from "../i18n/en";

const BACKEND = readFileSync(
  resolve(__dirname, "../../../../supabase/functions/_shared/keel/weekly_flow.ts"),
  "utf8",
);

function backendArray(name: string): string[] {
  const at = BACKEND.indexOf(`export const ${name} = [`);
  if (at < 0) throw new Error(`${name} introuvable côté serveur`);
  const body = BACKEND.slice(at, BACKEND.indexOf("] as const", at));
  return [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

function backendNumber(name: string): number {
  const m = BACKEND.match(new RegExp(`export const ${name} = (-?[\\d.]+)`));
  if (!m) throw new Error(`${name} introuvable côté serveur`);
  return Number(m[1]);
}

describe("le formulaire hebdo ne peut pas dériver du parseur", () => {
  it("les axes proposés sont EXACTEMENT ceux que le serveur lit", () => {
    expect([...WEEKLY_AXES]).toEqual(backendArray("WEEKLY_AXES"));
  });

  it("chaque axe proposé porte un libellé", () => {
    for (const axis of WEEKLY_AXES) {
      expect(WEEKLY_AXIS_LABELS[axis], `libellé manquant: ${axis}`).toBeTruthy();
    }
  });

  it("les libellés sont ceux du serveur, mot pour mot", () => {
    // Un libellé qui diverge produit deux expériences différentes selon le
    // canal — exactement ce que le dépôt a payé avec les boutons de template.
    for (const axis of WEEKLY_AXES) {
      const escaped = axis.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const m = BACKEND.match(new RegExp(`${escaped}:\\s*"([^"]+)"`));
      expect(m, `libellé serveur introuvable: ${axis}`).toBeTruthy();
      expect(WEEKLY_AXIS_LABELS[axis]).toBe(m![1]);
    }
  });

  it("l'échelle proposée est EXACTEMENT celle que le serveur accepte", () => {
    expect(Object.keys(WEEKLY_SCALE_LABELS).map(Number).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(backendNumber("WEEKLY_SCALE_MIN")).toBe(1);
    expect(backendNumber("WEEKLY_SCALE_MAX")).toBe(5);
  });

  it("les bornes de plausibilité sont les mêmes des deux côtés", () => {
    // Une borne plus large côté écran laisse l'élève saisir une valeur que le
    // serveur rejettera; plus étroite, elle lui interdit une valeur légitime.
    expect(WEIGHT_KG_MIN).toBe(backendNumber("WEIGHT_KG_MIN"));
    expect(WEIGHT_KG_MAX).toBe(backendNumber("WEIGHT_KG_MAX"));
    expect(WAIST_CM_MIN).toBe(backendNumber("WAIST_CM_MIN"));
    expect(WAIST_CM_MAX).toBe(backendNumber("WAIST_CM_MAX"));
  });

  it("le préfixe de jeton est celui que le serveur sait relire", () => {
    expect(BACKEND).toContain('WEEKLY_FLOW_TOKEN_PREFIX = "KEEL_WEEKLY_"');
  });
});

// ---------------------------------------------------------------------------
// R4 — LE DIMANCHE POIDS-SEUL EST LE CAS NOMINAL, PAS UN ÉTAT PARTIEL
//
// Les six axes n'ont qu'un lecteur — la synthèse de cohorte du coach — donc ils
// ne se demandent que là où un coach HUMAIN existe. Poids et tour de taille
// restent pour tous: leurs lecteurs (`/app/progress`, la ceinture restrictive,
// FF-008) ne dépendent pas du coach.
//
// Ce bloc existe parce que le retrait a failli casser la boucle du poids: la
// garde de vacuité ne comptait que les axes, donc un écran sans axe était un
// écran insoumettable. Ce dépôt n'a pas de jsdom — la décision a été sortie du
// composant exprès pour pouvoir être épinglée ici.
// ---------------------------------------------------------------------------

describe("R4 — le point hebdo se réduit sans casser la boucle du poids", () => {
  const NO_SCORES = {};

  it("sans axes, un POIDS SEUL passe — c'est le dimanche B2C nominal", () => {
    const built = buildWeeklySubmission({
      showAxes: false,
      scores: NO_SCORES,
      weight: "78,4",
      waist: "",
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    // La virgule décimale est ce que tape la moitié de l'Europe.
    expect(built.values).toEqual({ weight_kg: 78.4 });
  });

  it("sans axes, un TOUR DE TAILLE SEUL passe aussi", () => {
    const built = buildWeeklySubmission({
      showAxes: false,
      scores: NO_SCORES,
      weight: "",
      waist: "82",
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.values).toEqual({ waist_cm: 82 });
  });

  it("sans axes, un formulaire VIDE est refusé — et pas au nom des six", () => {
    const built = buildWeeklySubmission({
      showAxes: false,
      scores: NO_SCORES,
      weight: "",
      waist: "",
    });
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.error).toEqual({ kind: "empty", axesShown: false });
  });

  it("un score n'est JAMAIS envoyé depuis un écran qui ne l'affiche pas", () => {
    // L'état `scores` peut être non vide (l'élève a noté, puis la visibilité a
    // changé). Envoyer ces valeurs écrirait une donnée que personne n'a saisie
    // sur l'écran qu'il a sous les yeux, et le serveur l'accepterait.
    const built = buildWeeklySubmission({
      showAxes: false,
      scores: { energy: 4, sleep: 2 },
      weight: "70",
      waist: "",
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.values).toEqual({ weight_kg: 70 });
  });

  it("AVEC les axes, un poids seul passe aussi: la question reste optionnelle", () => {
    // La règle est la même des deux côtés — « vacuité = rien du tout ». Un élève
    // coaché qui ne veut donner que son poids n'a pas à noter six axes pour ça.
    const built = buildWeeklySubmission({
      showAxes: true,
      scores: NO_SCORES,
      weight: "70",
      waist: "",
    });
    expect(built.ok).toBe(true);
  });

  it("AVEC les axes, les scores partent, et le message de vacuité les cite", () => {
    const built = buildWeeklySubmission({
      showAxes: true,
      scores: { energy: 4, sleep: 2 },
      weight: "",
      waist: "",
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.values).toEqual({ energy: 4, sleep: 2 });

    const vide = buildWeeklySubmission({
      showAxes: true,
      scores: NO_SCORES,
      weight: "",
      waist: "",
    });
    expect(vide.ok).toBe(false);
    if (vide.ok) return;
    expect(vide.error).toEqual({ kind: "empty", axesShown: true });
  });

  it("hors bornes est REFUSÉ ET NOMMÉ, jamais ramené au bord", () => {
    // Un 500 kg ramené à 400 produit une donnée fausse qui a l'air vraie. Et la
    // garde mord dans les DEUX modes: le retrait des axes ne relâche rien.
    for (const showAxes of [true, false]) {
      const lourd = buildWeeklySubmission({
        showAxes,
        scores: NO_SCORES,
        weight: "500",
        waist: "",
      });
      expect(lourd.ok, `showAxes=${showAxes}`).toBe(false);
      if (lourd.ok) return;
      expect(lourd.error).toEqual({
        kind: "out_of_range",
        field: "weight",
        min: WEIGHT_KG_MIN,
        max: WEIGHT_KG_MAX,
      });

      const mot = buildWeeklySubmission({
        showAxes,
        scores: NO_SCORES,
        weight: "",
        waist: "beaucoup",
      });
      expect(mot.ok, `showAxes=${showAxes}`).toBe(false);
      if (mot.ok) return;
      expect(mot.error).toEqual({ kind: "not_a_number", field: "waist" });
    }
  });

  it("chaque erreur possible a un libellé dans le catalogue", () => {
    // Une erreur sans message affiche une chaîne vide sous le formulaire, et
    // l'élève ne sait pas ce qu'on lui refuse. `error.empty.measures` est né avec
    // R4: sans lui, le mode poids-seul aurait cité « les six ».
    for (
      const key of [
        "chat.weekly.error.empty",
        "chat.weekly.error.empty.measures",
        "chat.weekly.error.number",
        "chat.weekly.error.range",
        "chat.weekly.subtitle",
        "chat.weekly.subtitle.measures",
      ]
    ) {
      expect(EN[key], `clé absente: ${key}`).toBeTruthy();
    }
    // Et le message du mode poids-seul ne parle PAS des six axes.
    expect(EN["chat.weekly.error.empty.measures"]).not.toMatch(/six/i);
    expect(EN["chat.weekly.subtitle.measures"]).not.toMatch(/six/i);
  });
});

describe("isWeeklyCheckInToken", () => {
  it("reconnaît un jeton de semaine bien formé", () => {
    expect(isWeeklyCheckInToken("KEEL_WEEKLY_2026-08-02")).toBe(true);
  });

  it("refuse tout le reste — un bouton de pouls n'ouvre pas le formulaire", () => {
    for (
      const bad of [
        "KEEL_PULSE_GOOD",
        "KEEL_WEEKLY_",
        "KEEL_WEEKLY_2026-8-2",
        "keel_weekly_2026-08-02",
        "KEEL_WEEKLY_2026-08-02x",
        "",
        "   ",
      ]
    ) {
      expect(isWeeklyCheckInToken(bad), bad).toBe(false);
    }
  });
});
