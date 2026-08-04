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
  isWeeklyCheckInToken,
  WAIST_CM_MAX,
  WAIST_CM_MIN,
  WEEKLY_AXES,
  WEEKLY_AXIS_LABELS,
  WEEKLY_SCALE_LABELS,
  WEIGHT_KG_MAX,
  WEIGHT_KG_MIN,
} from "./weeklyCheckIn";

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
