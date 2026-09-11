import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { NAV, visibleNavFor } from "./KeelAppShell";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UN ONGLET QUI MÈNE À UN REFUS — MESURÉ LE 2026-09-09
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `NAV` n'a que deux variantes, `student` et `coach`. Un profil de foyer
 * RÉCLAMÉ — le compte supplémentaire — recevait donc la nav de l'élève, dont la
 * PREMIÈRE entrée, `/app/today`, est le seul écran de tout son espace qui lui
 * réponde « tu n'es pas un élève »: `KeelStudentRoute` exige
 * `profiles.keel_role = 'student'`, et la réclamation ne l'écrit JAMAIS
 * (`20260811060000`, en toutes lettres, avec sa garde QA).
 *
 * Les cinq autres entrées sont sous `KeelHouseholdRoute` et l'accueillent.
 * C'est donc bien UNE entrée, et c'est celle qu'on touche en premier.
 *
 * ── CE QUE CE FICHIER TIENT, ET POURQUOI DEUX MOITIÉS ─────────────────────
 * ① la règle: qui perd l'entrée, qui la garde, et le troisième état — « pas
 *   encore lu » — qui n'est ni l'un ni l'autre;
 * ② la jointure avec le routeur: l'entrée marquée `needsStudentRole` doit être
 *   EXACTEMENT celle que `App.tsx` met derrière la garde élève. Sans ②, la
 *   marque pourrait se poser sur la mauvaise ligne, ou une route pourrait
 *   passer sous la garde élève sans que sa marque suive — et ① resterait vert.
 */

const HERE = __dirname;
const APP = resolve(HERE, "../../App.tsx");

/** Même blanchiment que les autres tests de source: une note n'est pas du code. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
}

describe("l'onglet « Aujourd'hui » et le compte supplémentaire", () => {
  it("un profil réclamé (`keel_role` NULL) ne le voit PAS", () => {
    const shown = visibleNavFor(NAV.student, null).map((i) => i.to);
    expect(shown).not.toContain("/app/today");
    // ⚠️ ET IL GARDE TOUT LE RESTE. Une règle qui retire une entrée de trop
    // laisserait quelqu'un sans chemin vers sa part ou sa conversation, et le
    // test « il ne voit pas Aujourd'hui » resterait vert.
    expect(shown).toEqual([
      "/app/chat",
      "/app/plan",
      "/app/progress",
      "/app/household",
      "/app/about-you",
    ]);
  });

  it("un élève le garde", () => {
    expect(visibleNavFor(NAV.student, "student").map((i) => i.to))
      .toContain("/app/today");
  });

  it("⚠️ tant que le rôle n'est pas lu, l'onglet RESTE", () => {
    // Le troisième état. Cacher pendant la lecture ferait sauter la barre de
    // tout le monde; le cas courant est l'élève, et c'est lui qu'on protège.
    expect(visibleNavFor(NAV.student, undefined).map((i) => i.to))
      .toContain("/app/today");
  });

  it("`null` et `undefined` ne se confondent pas", () => {
    // `null` EST la valeur réelle d'un profil réclamé. Les fondre en un seul
    // « pas de rôle » rendrait l'onglet à qui il refuse — c'est-à-dire
    // annulerait tout ce lot sans faire rougir le test du dessus.
    expect(visibleNavFor(NAV.student, null).length)
      .not.toBe(visibleNavFor(NAV.student, undefined).length);
  });

  it("le coach n'a aucune entrée marquée: sa nav ne dépend d'aucune lecture", () => {
    expect(NAV.coach.some((i) => i.needsStudentRole)).toBe(false);
  });
});

describe("la marque suit le routeur, pas une intention", () => {
  it("les entrées marquées sont EXACTEMENT les routes sous `KeelStudentRoute`", () => {
    const app = stripComments(readFileSync(APP, "utf8"));

    // Les routes `/app/*` que le routeur met derrière la garde ÉLÈVE.
    const studentGated = new Set<string>();
    for (const m of app.matchAll(/<Route\s+path="(\/app\/[a-z-]+)"([\s\S]*?)\/>/g)) {
      const path = m[1];
      const body = m[2];
      // La garde la plus EXTERNE décide. `KeelHouseholdRoute` retombe sur la
      // garde élève en interne, et compter cette retombée ferait de toute
      // route une route élève.
      const first = body.indexOf("KeelStudentRoute");
      const household = body.indexOf("KeelHouseholdRoute");
      if (first >= 0 && (household < 0 || first < household)) {
        studentGated.add(path);
      }
    }
    expect(
      studentGated.size,
      "aucune route `/app/*` sous `KeelStudentRoute` — le motif de lecture " +
        "d'`App.tsx` a changé, cette garde est aveugle et doit être révisée",
    ).toBeGreaterThan(0);

    const marked = new Set(
      Object.values(NAV).flat().filter((i) => i.needsStudentRole).map((i) => i.to),
    );
    // Chaque entrée marquée mène bien à une route gardée élève…
    for (const to of marked) {
      expect(studentGated.has(to), `\`${to}\` est marquée mais n'est pas sous la garde élève`)
        .toBe(true);
    }
    // …et chaque route gardée élève QUI A UNE ENTRÉE porte la marque. Une
    // route sans entrée de nav ne concerne pas ce fichier.
    const linked = new Set(Object.values(NAV).flat().map((i) => i.to));
    for (const path of studentGated) {
      if (!linked.has(path)) continue;
      expect(
        marked.has(path),
        `\`${path}\` a un onglet et refuse un profil réclamé, sans porter ` +
          "`needsStudentRole`: le compte supplémentaire y sera envoyé sur " +
          "« tu n'es pas un élève ».",
      ).toBe(true);
    }
  });
});
