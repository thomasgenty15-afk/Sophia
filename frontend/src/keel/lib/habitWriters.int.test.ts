import { globSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// ===========================================================================
// UN SEUL SÉRIALISEUR POUR `household_member_habits.slots`
//
// ── LE DÉFAUT MESURÉ (2026-09-01) ─────────────────────────────────────────
// Il en existait TROIS, recopiés: deux dans `SetupPage.tsx` et un dans
// `mouthForm.ts`. Les trois faisaient la même chose — un `map` sur `habits`,
// puis `.filter((h) => h.usual !== "")` — et cette dernière ligne JETTE
// l'entrée sans prose, c'est-à-dire exactement celle qui porte les bulles de
// ce qui est pris à côté du plat.
//
// Livrer les bulles en n'en corrigeant que deux sur trois aurait donné un
// écran où cocher « + pain » marche depuis une carte et pas depuis l'autre,
// sans une erreur nulle part.
//
// ⛔ CE TEST GARDE LA FORME, PAS LE COMPORTEMENT, et c'est assumé: le
// comportement est tenu par `mealExtrasMirror.int.test.ts`. Ce qu'on refuse
// ici est le QUATRIÈME sérialiseur — celui qu'on écrit sans savoir que les
// trois autres existent.
// ===========================================================================

describe("un seul écrivain pour les entrées d'habitude", () => {
  // ⚠️ LA RACINE VIENT DU FICHIER, PAS DE `process.cwd()`. Un `cwd` qui ne
  // tombe pas où on croit rend une liste VIDE, et une garde d'absence sur une
  // liste vide est verte pour rien — mesuré à la première rédaction.
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const files = globSync("**/*.{ts,tsx}", { cwd: root })
    .map((f) => resolve(root, f))
    .filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"))
    .filter((f) => !f.endsWith("lib/mealExtras.ts"));

  /** Commentaires retirés: ce dépôt PARLE de ces formes dans ses notes. */
  const strip = (src: string): string =>
    src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .join("\n");

  it("LA PRÉMISSE — le balayage voit bien les fichiers de `src/keel`", () => {
    expect(files.length, "aucun fichier balayé: les deux cas seraient vides")
      .toBeGreaterThan(50);
  });

  it("⛔ PERSONNE NE JETTE UNE ENTRÉE SUR SON `usual` VIDE", () => {
    // ⚠️ C'EST LE DÉFAUT LUI-MÊME, PAS SON VOISINAGE. Les trois sérialiseurs
    // recopiés finissaient tous par la même ligne — `.filter((h) => h.usual
    // !== "")` — et c'est ELLE qui jetait l'entrée des bulles. Le test la
    // nomme donc directement, plutôt que de deviner la forme d'un `map`.
    //
    // ⛔ LE PARSEUR DE LECTURE A LE DROIT, LUI, et il est nommé: une entrée
    // relue sans prose n'a rien à afficher, et `parseHabitExtras` la lit de
    // son côté. Ce qui est interdit est de JETER AVANT D'ÉCRIRE.
    const allowed = new Set([
      resolve(root, "api/householdHabits.ts"), // `parseHabitSlots`, en LECTURE
    ]);
    const guilty: string[] = [];
    for (const f of files) {
      if (allowed.has(f)) continue;
      const src = strip(readFileSync(f, "utf8"));
      if (/usual\s*(?:\.trim\(\))?\s*(?:!==\s*""|\.length\s*===\s*0|===\s*"")/.test(src)) {
        guilty.push(f);
      }
    }
    expect(
      guilty.sort(),
      "ces fichiers jettent une entrée d'habitude sur son texte vide, donc " +
        "avec ses extras — passer par `habitEntriesToWrite`",
    ).toEqual([]);
  });

  it("⛔ ET LE FICHIER AUTORISÉ NE LE FAIT QU'EN LECTURE", () => {
    // ⚠️ SANS CE CAS, L'EXEMPTION CI-DESSUS EST UNE PORTE OUVERTE: on pourrait
    // réécrire un sérialiseur dans `householdHabits.ts` et rien ne bougerait.
    // Ce qui est vérifié est que la seule occurrence tolérée vit DANS le
    // parseur de lecture, et que `habitPayload` délègue.
    const src = strip(readFileSync(resolve(root, "api/householdHabits.ts"), "utf8"));
    const parser = src.slice(src.indexOf("export function parseHabitSlots"));
    const parserEnd = parser.indexOf("\n}\n");
    expect(parserEnd).toBeGreaterThan(-1);
    const inParser = (parser.slice(0, parserEnd).match(/usual\.length === 0/g) ?? []).length;
    const total = (src.match(/usual\.length === 0/g) ?? []).length;
    expect(inParser, "l'occurrence n'est plus dans le parseur de lecture").toBe(1);
    expect(total, "une SECONDE occurrence est apparue hors du parseur").toBe(1);
    const payload = src.slice(src.indexOf("export function habitPayload"));
    expect(
      payload.slice(0, payload.indexOf("\n}\n")),
      "`habitPayload` a cessé de déléguer",
    ).toContain("habitEntriesToWrite(");
  });

  it("le sérialiseur, LUI, existe et il est appelé", () => {
    // LA PRÉMISSE, ARMÉE: une garde d'absence qui garderait un dépôt où plus
    // rien n'écrit d'habitude serait verte et vide de sens.
    const callers = files.filter((f) =>
      readFileSync(f, "utf8").includes("habitEntriesToWrite(")
    );
    expect(callers.length, "personne n'appelle `habitEntriesToWrite`")
      .toBeGreaterThanOrEqual(2);
  });
});

describe("le « + repas léger » traverse CHAQUE écrivain", () => {
  // ⛔ MÊME RAISON QUE LE TEST AU-DESSUS, UN CRAN PLUS LOIN. Le sérialiseur est
  // unique, mais il a DEUX entrées (`habits`, `light`), et un appelant qui en
  // oublie une n'a pas d'erreur: il écrit une fiche amputée.
  // Le typecheck l'attrape sur le code de production — pas sur les tests, qui
  // sont compilés à part. Ce scan couvre les deux.
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const files = globSync("**/*.{ts,tsx}", { cwd: root })
    .filter((f) => !f.endsWith(".int.test.ts") && !f.endsWith(".test.ts"))
    .map((f) => resolve(root, f));

  it("aucun appel à `habitEntriesToWrite` n'oublie `light`", () => {
    const coupables: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      let i = src.indexOf("habitEntriesToWrite({");
      while (i !== -1) {
        // Le bloc d'arguments s'arrête à `})` — ces appels sont tous à plat.
        const fin = src.indexOf("})", i);
        const bloc = src.slice(i, fin === -1 ? src.length : fin);
        if (!bloc.includes("light:")) coupables.push(file.replace(root, ""));
        i = src.indexOf("habitEntriesToWrite({", i + 1);
      }
    }
    expect(coupables).toEqual([]);
  });

  it("aucun appel à `habitPayload` n'oublie `light`", () => {
    // `habitPayload` prend un OBJET (`{light}`) et pas un argument positionnel,
    // précisément pour que le compilateur recense ses appelants.
    // Ce test est la ceinture: il attrape aussi ceux des fichiers de test.
    const coupables: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      let i = src.indexOf("habitPayload(");
      while (i !== -1) {
        const bloc = src.slice(i, src.indexOf(")", src.indexOf("}", i)) + 1);
        if (!bloc.includes("light:")) coupables.push(file.replace(root, ""));
        i = src.indexOf("habitPayload(", i + 1);
      }
    }
    expect(coupables).toEqual([]);
  });

  it("⛔ LE SCAN N'EST PAS MORT — il voit bien des appels", () => {
    // Une garde d'absence sur une liste vide est verte pour rien.
    const total = files
      .map((f) => readFileSync(f, "utf8"))
      .filter((s) => s.includes("habitEntriesToWrite({") || s.includes("habitPayload(")).length;
    expect(total).toBeGreaterThan(0);
  });
});
