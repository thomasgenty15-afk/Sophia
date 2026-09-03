import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  curveGeometry,
  periodStart,
  pointsInPeriod,
  WEIGHT_PERIODS,
} from "./weightCurve";
import { TRACKING_BASES } from "../api/tracking";

const BOX = { width: 300, height: 120, padding: 10 };

function pt(localDate: string, value: number) {
  return { localDate, value };
}

describe("A7 — la courbe de poids, six fenêtres et aucune moyenne mobile", () => {
  it("les six périodes existent, et `all` n'a pas de borne basse", () => {
    expect([...WEIGHT_PERIODS]).toEqual(["1w", "1m", "3m", "6m", "12m", "all"]);
    expect(periodStart("all", "2026-09-03")).toBeNull();
  });

  it("une fenêtre de sept jours contient AUJOURD'HUI et les six d'avant", () => {
    // Le décalage payé le 2026-08-05: `-7` mettait J-7 dans le dénominateur
    // sans qu'il puisse s'afficher.
    expect(periodStart("1w", "2026-09-03")).toBe("2026-08-28");
    expect(periodStart("12m", "2026-09-03")).toBe("2025-09-04");
  });

  it("`pointsInPeriod` coupe aux deux bouts et trie", () => {
    const series = [
      pt("2026-08-01", 74),
      pt("2026-08-30", 72.5),
      pt("2026-09-03", 71.8),
      pt("2026-09-10", 71.0), // dans le futur: hors fenêtre
    ];
    expect(pointsInPeriod(series, "1w", "2026-09-03").map((p) => p.localDate))
      .toEqual(["2026-08-30", "2026-09-03"]);
    expect(pointsInPeriod(series, "all", "2026-09-03")).toHaveLength(3);
  });

  it("une série vide n'a pas de géométrie — et surtout pas une géométrie vide", () => {
    // Une géométrie « vide » ferait dessiner un cadre sans données, ce qui se
    // lit comme « ton poids est à zéro ».
    expect(curveGeometry([], BOX)).toBeNull();
  });

  it("un seul point donne un rond et AUCUNE ligne", () => {
    const g = curveGeometry([pt("2026-09-03", 71.4)], BOX);
    expect(g?.dots).toHaveLength(1);
    expect(g?.path).toBe("");
    // Il est centré horizontalement: le poser à gauche suggérerait un début de
    // série qu'on n'a pas.
    expect(g?.dots[0].x).toBeCloseTo(BOX.padding + (BOX.width - 20) / 2, 5);
  });

  it("une série PLATE ne divise pas par zéro et passe au milieu", () => {
    const g = curveGeometry(
      [pt("2026-09-01", 70), pt("2026-09-02", 70), pt("2026-09-03", 70)],
      BOX,
    );
    expect(g).not.toBeNull();
    for (const d of g!.dots) {
      expect(Number.isFinite(d.x)).toBe(true);
      expect(Number.isFinite(d.y)).toBe(true);
      expect(d.y).toBeCloseTo(BOX.height / 2, 5);
    }
    expect(g!.path).toContain("M");
    expect(g!.path).not.toContain("NaN");
  });

  it("l'échelle ne part PAS de zéro, et la marge ne descend jamais sous 0,5 kg", () => {
    const g = curveGeometry(
      [pt("2026-09-01", 71.0), pt("2026-09-03", 71.4)],
      BOX,
    );
    expect(g!.low).toBeGreaterThan(60);
    // amplitude 0,4 kg ⇒ 5 % vaudrait 0,02: le plancher de 0,5 mord.
    expect(g!.low).toBeCloseTo(70.5, 5);
    expect(g!.high).toBeCloseTo(71.9, 5);
  });

  it("l'axe horizontal est le TEMPS, pas le rang du point", () => {
    // Deux pesées rapprochées puis un trou d'un mois: si l'axe était le rang,
    // les trois seraient équidistants.
    const g = curveGeometry(
      [pt("2026-08-01", 74), pt("2026-08-02", 73.8), pt("2026-09-01", 72)],
      BOX,
    );
    const [a, b, c] = g!.dots;
    expect(b.x - a.x).toBeLessThan((c.x - b.x) / 5);
    expect(c.x).toBeCloseTo(BOX.width - BOX.padding, 5);
  });

  it("le point le plus haut de la série est le plus HAUT à l'écran", () => {
    const g = curveGeometry(
      [pt("2026-09-01", 70), pt("2026-09-02", 75), pt("2026-09-03", 72)],
      BOX,
    );
    const [a, b, c] = g!.dots;
    expect(b.y).toBeLessThan(a.y);
    expect(b.y).toBeLessThan(c.y);
    expect(g!.min).toBe(70);
    expect(g!.max).toBe(75);
  });

  it("aucune moyenne mobile, aucun lissage: la source le prouve", () => {
    // FF-031 §3 n'est renversée que sur « pas de graphe ». « Pas de moyenne
    // mobile montrée à l'élève » RESTE. Un lissage ferait disparaître le bruit
    // que la courbe existe justement pour montrer.
    const source = readFileSync(
      resolve(__dirname, "./weightCurve.ts"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "");
    for (const forbidden of ["rollingAverage", "movingAverage", "smooth", "ema"]) {
      expect(
        source.includes(forbidden),
        `« ${forbidden} » est entré dans la géométrie de la courbe`,
      ).toBe(false);
    }
  });
});

describe("A7 — le miroir des bases ne dérive pas de la source serveur", () => {
  it("`TRACKING_BASES` du front est mot pour mot celui de `tracking_window.ts`", () => {
    // Le front NE PEUT PAS importer le module serveur: il tire
    // `meal_generation.ts`, donc `sophia-brain/skills/…`, donc la moitié du
    // serveur dans le bundle. Le miroir est assumé; c'est CE test qui le tient.
    const source = readFileSync(
      resolve(
        __dirname,
        "../../../../supabase/functions/_shared/keel/tracking_window.ts",
      ),
      "utf8",
    );
    const block = source.slice(
      source.indexOf("export const TRACKING_BASES = ["),
    );
    const list = block.slice(0, block.indexOf("] as const"));
    const names = [...list.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    // `plan_quantities` arrive par la constante `PLAN_ENERGY_BASIS`, pas par un
    // littéral: on la remet en tête, et le reste doit correspondre.
    expect(["plan_quantities", ...names]).toEqual([...TRACKING_BASES]);
  });
});
