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
  WEEKLY_SCALE_VALUES,
  WEIGHT_KG_MAX,
  WEIGHT_KG_MIN,
} from "./weeklyCheckIn";
import { en as EN } from "../i18n/en";
import { fr as FR } from "../i18n/fr";

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

  it("chaque axe proposé porte un libellé DANS LES DEUX LANGUES", () => {
    // Le lot 4 a sorti les onze libellés d'ici vers le seed. La question qu'il
    // fallait garder n'a pas changé — « l'écran a-t-il un mot pour cet axe ? » —
    // mais elle se pose maintenant une fois par langue: un axe traduit d'un côté
    // seulement rendrait une clé brute à l'écran d'un francophone.
    for (const axis of WEEKLY_AXES) {
      const key = `chat.weekly.axis.${axis}` as keyof typeof EN;
      expect(EN[key], `libellé anglais manquant: ${axis}`).toBeTruthy();
      expect(
        (FR as Record<string, string>)[key],
        `libellé français manquant: ${axis}`,
      ).toBeTruthy();
    }
  });

  it("les libellés ANGLAIS sont ceux du serveur, mot pour mot", () => {
    // ⚠️ CE TEST A CHANGÉ D'ANCRE AU LOT 4, PAS D'EXIGENCE. Il comparait
    // `WEEKLY_AXIS_LABELS[axis]` — un `Record` en dur dans `weeklyCheckIn.ts` —
    // au fichier Deno. Ce `Record` a disparu dans le seed; l'ancre est
    // maintenant `en["chat.weekly.axis.<axe>"]`, c'est-à-dire LA MÊME CHAÎNE.
    //
    // Ce qui a été tranché, et pourquoi le français n'a PAS de jumelle serveur:
    // les constantes `WEEKLY_AXIS_LABELS_EN` / `WEEKLY_SCALE_LABELS_EN` ne
    // servent aucun écran. Elles nourrissent (1) des consignes de modèle —
    // `meal_generation.ts:1679` et `week_plan_generation.ts:524` écrivent « the
    // one thing they want to see improve: … » dans un prompt anglais — et (2)
    // `weeklyFlowJson()`, la définition d'un formulaire Meta héritée du canal
    // WhatsApp. Traduire ces deux-là serait un bug, pas un progrès: le premier
    // dégraderait la consigne, le second un contrat externe.
    //
    // Donc: le mot-pour-mot reste sur l'ANGLAIS, et le pack français vit
    // entièrement côté front. Aucune ligne de Deno n'a été touchée.
    for (const axis of WEEKLY_AXES) {
      const escaped = axis.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const m = BACKEND.match(new RegExp(`${escaped}:\\s*"([^"]+)"`));
      expect(m, `libellé serveur introuvable: ${axis}`).toBeTruthy();
      expect(EN[`chat.weekly.axis.${axis}` as keyof typeof EN]).toBe(m![1]);
    }
  });

  it("l'échelle proposée est EXACTEMENT celle que le serveur accepte", () => {
    expect([...WEEKLY_SCALE_VALUES]).toEqual([1, 2, 3, 4, 5]);
    for (const score of WEEKLY_SCALE_VALUES) {
      const key = `chat.weekly.scale.${score}` as keyof typeof EN;
      expect(EN[key], `cran anglais manquant: ${score}`).toBeTruthy();
      expect(
        (FR as Record<string, string>)[key],
        `cran français manquant: ${score}`,
      ).toBeTruthy();
      // Le mot-pour-mot vaut aussi pour les crans: le serveur les recopie dans
      // le `data-source` du formulaire Meta.
      const m = BACKEND.match(new RegExp(`\\s${score}:\\s*"([^"]+)"`));
      expect(m, `cran serveur introuvable: ${score}`).toBeTruthy();
      expect(EN[key]).toBe(m![1]);
    }
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
