import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PAGE_NAMESPACES } from "../i18n/catalog";
import { en } from "../i18n/en";
import { fr } from "../i18n/fr";

/**
 * P4 (2026-09-03, décision D4.1) — « IDÉES DE REPAS » N'EXISTE PLUS CÔTÉ ÉLÈVE.
 *
 * ── CE QUE CE FICHIER GARDE ──────────────────────────────────────────────
 * `/app/meals` montrait la bibliothèque de recettes du coach, en lecture seule.
 * Elle n'entrait nulle part dans la composition (`generate-meal-v1` le dit),
 * n'écrivait rien, n'avait aucun aval. L'écran, sa route, son onglet, son
 * lecteur `loadStudentRecipes`, sept de ses huit clés et son entrée de
 * catalogue ont été retirés ensemble. La huitième, `meals.loading`, a deux
 * appelants vivants sur `/app/plan` — la liste du mandat venait d'un motif de
 * noms, pas d'un audit d'appelants, et `tsc` l'a dit. Le côté coach
 * (`/coach/meals`, `coach-recipe-image-v1`, la table `meal_ideas`) reste —
 * c'est le LECTEUR élève qui est parti.
 *
 * Le mode d'échec que ce test empêche est celui que CLAUDE.md nomme pour la
 * lane de semaine: « ne rebranche pas un écrivain par symétrie ». Une route
 * réintroduite « parce que le côté coach existe » redonnerait un cinquième
 * onglet à une barre dimensionnée pour quatre, et un écran sans aval.
 *
 * ── POURQUOI UN TEST DE SOURCE ───────────────────────────────────────────
 * Même raison que `routeGuards.int.test.ts`: la suite ne monte pas de
 * composant (environnement `node`). Une absence de route se relit dans le
 * routeur, une absence d'onglet dans la table `NAV`. Les commentaires sont
 * blanchis avant lecture — la note qui explique le retrait cite l'ancienne
 * URL, et ne doit pas compter comme une route.
 */

const APP = resolve(__dirname, "../../App.tsx");
const SHELL = resolve(__dirname, "./KeelAppShell.tsx");
const MODEL = resolve(__dirname, "../api/mealPlanModel.ts");
const PAGE = resolve(__dirname, "../pages/mealPlan/StudentMealPlanPage.tsx");
const COPY = resolve(__dirname, "../pages/mealPlan/copy.ts");

/**
 * Même blanchiment que `pageSeams.int.test.ts`: un exemple cité dans une note
 * n'est pas un rendu, et une URL citée dans une note n'est pas une route.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
}

const app = stripComments(readFileSync(APP, "utf8"));
const shell = stripComments(readFileSync(SHELL, "utf8"));
const model = stripComments(readFileSync(MODEL, "utf8"));

/** Le tableau `student: [ … ]` de `NAV`, jusqu'à `coach: [`. */
function studentNav(): string {
  const start = shell.indexOf("student: [");
  const end = shell.indexOf("coach: [", start);
  expect(start, "NAV.student a disparu de KeelAppShell").toBeGreaterThan(0);
  expect(end, "NAV.coach a disparu de KeelAppShell").toBeGreaterThan(start);
  return shell.slice(start, end);
}

/** Les chemins des onglets du bas (`bottom: true`), dans l'ordre du tableau. */
function bottomTabs(nav: string): string[] {
  const tabs: string[] = [];
  for (const m of nav.matchAll(/\{[^{}]*?\bto:\s*"([^"]+)"[^{}]*?\}/g)) {
    if (/\bbottom:\s*true\b/.test(m[0])) tabs.push(m[1]);
  }
  return tabs;
}

/** Les sept clés de l'écran — et SEULEMENT elles: `meals.*` est le vocabulaire du moteur. */
const REMOVED_KEYS = [
  "app.nav.meals",
  "app.nav.meals.short",
  "meals.title",
  "meals.subtitle",
  "meals.list.title",
  "meals.list.empty",
  "meals.error",
] as const;

/**
 * La clé que la liste du mandat donnait pour morte, et qui ne l'est pas:
 * rendue par `MealBuilder.tsx` et `StudentWeekPlanPage.tsx` pendant que les
 * plans se chargent. Retirée, `tsc` rougit sur ses deux appelants.
 */
const KEPT_KEY = "meals.loading";

describe("P4 — les idées de repas n'existent plus côté élève", () => {
  it("la route /app/meals a quitté le routeur, avec son import", () => {
    expect(app).not.toContain('path="/app/meals"');
    expect(app).not.toContain("StudentMealPlanPage");
    // LE CAS QUI PASSE: le routeur est bien celui qu'on lit, et le catch-all
    // qui reçoit l'ancienne URL (la 404 du produit) est toujours en bas.
    expect(app).toContain('path="/app/plan"');
    expect(app).toContain('path="*"');
  });

  it("la page et son module de copie mort n'existent plus", () => {
    expect(existsSync(PAGE)).toBe(false);
    expect(existsSync(COPY)).toBe(false);
  });

  it("la barre du bas de l'élève a quatre onglets, et aucun ne mène à /app/meals", () => {
    const nav = studentNav();
    expect(nav).not.toContain('"/app/meals"');
    expect(bottomTabs(nav)).toEqual([
      "/app/today",
      "/app/chat",
      "/app/plan",
      "/app/progress",
    ]);
  });

  it("loadStudentRecipes n'a plus de définition — le côté coach du module reste", () => {
    expect(model).not.toContain("loadStudentRecipes");
    expect(model).toContain("export async function loadCoachRecipes(");
  });

  it("le catalogue ne déclare plus /app/meals", () => {
    expect(Object.keys(PAGE_NAMESPACES)).not.toContain("/app/meals");
    // LE CAS QUI PASSE: la table est bien lue, et `/app/plan` — où l'élève
    // compose — y est déclaré.
    expect(Object.keys(PAGE_NAMESPACES)).toContain("/app/plan");
  });

  it("sept clés de l'écran sont parties des DEUX packs; `meals.loading` et le namespace du moteur restent", () => {
    const enKeys = new Set(Object.keys(en));
    const frKeys = new Set(Object.keys(fr));
    for (const key of REMOVED_KEYS) {
      expect(enKeys.has(key), `${key} survit dans en.ts`).toBe(false);
      expect(frKeys.has(key), `${key} survit dans fr.ts`).toBe(false);
    }
    // LE CAS QUI PASSE: `meals.*` est le vocabulaire du moteur de repas, monté
    // par `/app/plan`, `/app/household`, `/app/setup` — il survit entier, et
    // l'onglet court du plan aussi.
    expect(enKeys.has(KEPT_KEY), `${KEPT_KEY} a deux appelants sur /app/plan`).toBe(true);
    expect(frKeys.has(KEPT_KEY), `${KEPT_KEY} a deux appelants sur /app/plan`).toBe(true);
    expect(enKeys.has("meals.slot.breakfast")).toBe(true);
    expect(frKeys.has("meals.slot.breakfast")).toBe(true);
    expect(enKeys.has("app.nav.plan.short")).toBe(true);
    expect(frKeys.has("app.nav.plan.short")).toBe(true);
  });
});
