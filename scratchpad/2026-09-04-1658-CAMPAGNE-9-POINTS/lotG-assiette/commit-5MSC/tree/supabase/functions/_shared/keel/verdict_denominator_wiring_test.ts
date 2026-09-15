import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@^1.0.0";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LE CÂBLAGE DU DÉNOMINATEUR — la mutation qui ne rougissait nulle part.
 * 2026-09-04 · ferme le trou nommé au §5/§9 de la fiche du lot
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le lot du dénominateur a muté ses neuf gardes. Huit ont rougi. La neuvième —
 * remettre `daysCovered: durationDays` dans `generate-meal-v1/index.ts` — est
 * passée VERTE: `deno check` d'accord, 5 178 tests d'accord. Aucun test
 * n'exécute cette lane (`Deno.serve` au chargement du module), donc rien ne
 * regardait ce qu'elle passe à son juge.
 *
 * ⛔ CE QUE CE FICHIER DOIT EMPÊCHER: que le verdict se rebranche en silence
 * sur la FENÊTRE. Le défaut d'origine ne cassait rien — il rendait `within` sur
 * un plan qui débordait de 34 %. Un câblage débranché ressemblerait trait pour
 * trait à un câblage qui marche, et la seule chose qui bougerait serait le
 * verdict de l'élève.
 *
 * ⚠️ ON ASSERTE L'ABSENCE DE LA MUTATION, PAS LA PRÉSENCE D'UNE LIGNE. Un test
 * qui épingle le texte exact d'un appel photographie le code au lieu de le
 * vérifier: il rougit sur un renommage innocent et reste vert si quelqu'un
 * AJOUTE un cinquième lecteur mal câblé. Ici on compte les alimentations de
 * `daysCovered:` et on refuse toute source qui ne soit pas l'appel partagé.
 */

const LANE = "../../generate-meal-v1/index.ts";

/**
 * La source, PRIVÉE DE SES COMMENTAIRES.
 *
 * ⛔ SANS ÇA CE TEST SERAIT FAUX, et le fichier le prouve tout seul: il
 * RACONTE le défaut qu'il ferme en écrivant `durationDays` à côté de
 * `daysCovered` dans un pavé de vingt lignes. Un grep naïf y verrait la
 * mutation qu'il cherche et rougirait sur du code correct.
 */
async function codeOf(rel: string): Promise<string> {
  const src = await Deno.readTextFile(new URL(rel, import.meta.url));
  return src
    .split("\n")
    .map((line) => (line.trimStart().startsWith("//") ? "" : line))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

Deno.test("le dénominateur n'a qu'UNE source dans la lane solo", async () => {
  const code = await codeOf(LANE);
  // Une seule définition: c'est elle qui rend impossible une divergence
  // ACCIDENTELLE entre les quatre lecteurs. La perdre, c'est rouvrir le défaut
  // par recopie plutôt que par débranchement.
  const defs = code.match(/const coveredDaysOf\s*=/g) ?? [];
  assertEquals(defs.length, 1, "`coveredDaysOf` doit être défini une seule fois");
  assertStringIncludes(code, "windowCoverageOf({");
});

Deno.test("AUCUN `daysCovered:` n'est alimenté par la FENÊTRE", async () => {
  const code = await codeOf(LANE);
  const feeds = [...code.matchAll(/daysCovered:\s*([^,\n]+)/g)].map((m) =>
    m[1].trim()
  );
  // Il y en a au moins trois: le verdict, la couverture, la distance de
  // correction. Zéro voudrait dire que le grep ne trouve plus rien — une garde
  // qui ne peut plus mordre.
  assert(feeds.length >= 3, `attendu ≥3 alimentations, vu ${feeds.length}`);
  for (const feed of feeds) {
    assert(
      feed.includes("covered.days") || feed.includes("coveredDaysOf("),
      `\`daysCovered: ${feed}\` ne vient pas de l'appel partagé — c'est la mutation 9`,
    );
    // La mutation exacte qui est passée verte, nommée pour que l'échec se lise.
    assert(
      !/\bdurationDays\b|\bdaysToFill\b/.test(feed),
      `\`daysCovered: ${feed}\` rebranche le verdict sur la FENÊTRE`,
    );
  }
});

Deno.test("la CADENCE des sentinelles, elle, reste sur la fenêtre", async () => {
  const code = await codeOf(LANE);
  // ⛔ LE SENS INVERSE, et il compte autant. `SENTINEL_MIN_DAYS` vaut 7 comme
  // `MAX_WINDOW_DAYS`: brancher la cadence sur les journées NOURRIES éteindrait
  // `place_missing_sentinel` sur tout plan de sept jours commencé en cours de
  // journée, sans que rien n'échoue.
  const cadence = [...code.matchAll(/windowDays:\s*([^,\n]+)/g)]
    .map((m) => m[1].trim())
    .filter((v) => !v.includes("as never"));
  assert(cadence.length >= 1, "aucun `windowDays:` trouvé dans la lane");
  assert(
    cadence.some((v) => /\bdurationDays\b|\bdaysToFill\b/.test(v)),
    "la cadence doit recevoir la SPAN, pas les journées nourries",
  );
  for (const v of cadence) {
    assert(
      !v.includes("covered.days") && !v.includes("coveredDaysOf("),
      `\`windowDays: ${v}\` branche la cadence sur les journées nourries`,
    );
  }
});
