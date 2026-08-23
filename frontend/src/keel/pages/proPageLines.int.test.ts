import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { en } from "../i18n/en";
import { fr } from "../i18n/fr";

/**
 * `/pro` — LE COMPTE ANNONCÉ EST CELUI QUI EST RENDU, ET LA PROMESSE RETIRÉE
 * NE REVIENT PAS SEULE.
 *
 * ── CE QUE CE FICHIER A TROUVÉ LE JOUR OÙ IL A ÉTÉ ÉCRIT ──────────────────
 * La ligne 05 « chaque ligne cite la conviction qu'elle applique » (B27) a été
 * retirée le 2026-08-19 avec ses clés. La grille est passée à CINQ lignes — et
 * le titre de section et le `lede` du hero ont continué d'en annoncer SIX,
 * dans les deux langues. Une page de vente qui se trompe sur son propre compte
 * est la première phrase fausse que le lecteur peut vérifier lui-même.
 *
 * ── POURQUOI LE COMPTE EST LU, ET PAS ÉCRIT ───────────────────────────────
 * Même règle que `pageSeams.int.test.ts`: une constante recopiée ici
 * vieillirait exactement comme la copie qu'elle surveille. `ProPage.tsx` est la
 * seule autorité sur « combien de lignes la grille rend »; on la lit.
 */

const ROOT = resolve(__dirname, "../../../..");

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

/** Les seuls comptes qu'une grille de vente peut porter. Au-delà, on ne vend plus. */
const WORDS: Record<number, { en: string; fr: string }> = {
  3: { en: "Three", fr: "Trois" },
  4: { en: "Four", fr: "Quatre" },
  5: { en: "Five", fr: "Cinq" },
  6: { en: "Six", fr: "Six" },
  7: { en: "Seven", fr: "Sept" },
};

describe("le compte annoncé est le compte rendu", () => {
  const rendered = (read("frontend/src/keel/pages/ProPage.tsx")
    .match(/<Line\s/g) ?? []).length;

  it("la grille rend un nombre de lignes qu'on sait dire", () => {
    expect(WORDS[rendered], `grille à ${rendered} lignes`).toBeDefined();
  });

  it("le titre de section porte ce compte, dans les deux langues", () => {
    expect(en["pro.lines.title"]).toContain(WORDS[rendered].en);
    expect(fr["pro.lines.title"]).toContain(WORDS[rendered].fr);
  });

  /**
   * ⚠️ LE HERO PORTE LE MÊME COMPTE, et c'est la moitié qui se perd. Il est à
   * 200 lignes du titre de section, dans un autre bloc de clés: le 2026-08-19,
   * la ligne retirée a été soustraite de la grille et d'aucun des deux.
   */
  it("le lede du hero porte ce compte, dans les deux langues", () => {
    expect(en["pro.hero.lede"]).toContain(WORDS[rendered].en.toLowerCase());
    expect(fr["pro.hero.lede"]).toContain(WORDS[rendered].fr.toLowerCase());
  });
});

describe("la garantie de traçabilité ne remonte pas en vitrine toute seule", () => {
  /**
   * ⛔ B27 — « chaque ligne cite la conviction qu'elle applique ». La promesse
   * était adossée au CHECK `student_week_plans_doctrine_traceable_check`, qui
   * existe TOUJOURS et qui est armé — et qui n'a plus aucun écrivain depuis que
   * la lane `generate-week-plan-v1` a été retirée. Une garantie dont le point
   * d'application ne peut plus tirer n'est pas tenue: elle en a l'air.
   */
  it("aucune clé `pro.line.cite.*` n'est revenue", () => {
    for (const [name, table] of [["en", en], ["fr", fr]] as const) {
      const back = Object.keys(table).filter((k) => k.startsWith("pro.line.cite"));
      expect(back, `${name}: la promesse B27 est revenue en vitrine`).toEqual([]);
    }
  });

  /**
   * ⚠️ LE JOUR OÙ L'ÉCRIVAIN REVIENT, CE TEST ROUGIT — ET C'EST SON POINT. Il
   * ne dit pas « la lane est interdite »: il dit « la raison pour laquelle la
   * ligne de vente a été retirée vient de changer, va re-trancher ». C'est la
   * seule forme de trace qui survive à trois jours.
   */
  it("la lane qui honorait le CHECK n'est toujours pas revenue", () => {
    expect(
      existsSync(resolve(ROOT, "supabase/functions/generate-week-plan-v1/index.ts")),
      "`generate-week-plan-v1` est de retour: le CHECK a de nouveau un écrivain, "
        + "et la ligne 05 de `/pro` doit être re-tranchée, pas réécrite de mémoire",
    ).toBe(false);
  });
});
