import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * LOT D — L'ENVIE TAPÉE AU MOMENT DE COMPOSER, DE L'ÉCRAN JUSQU'AU MOTEUR.
 *
 * ── LE DÉFAUT QUE CE FICHIER ÉPINGLE ──────────────────────────────────────
 * `MealBuilder` rend le champ « ce dont ils ont envie pour ces repas » SANS
 * garde de lane: un maître de foyer le voit et le remplit. La branche foyer du
 * submit ne le transmettait pas, la signature du client ne l'acceptait pas, et
 * `body.preferences` valait donc `null` sur TOUS les appels de foyer — alors
 * que la fonction edge le relit à trois endroits.
 *
 * ⚠️ LA JUSTIFICATION ÉCRITE EN FACE DISAIT L'INVERSE. Le commentaire de
 * `api/planDraft.ts` affirmait qu'envoyer les champs de la lane individuelle
 * « ne les ferait pas lire ». C'est cette phrase-là qui a fait tenir l'absence,
 * et c'est pour ça que le test le plus important de ce fichier n'est pas sur
 * l'écran: c'est celui qui prouve que LE SERVEUR LIT.
 *
 * Quatre choses peuvent le recasser sans que rien n'échoue:
 *
 *   ① la branche foyer du submit cesse de passer le champ;
 *   ② la signature du client le rend OPTIONNEL, et un appelant l'oublie sans
 *      un mot du compilateur (cicatrice « paramètre de garde optionnel =
 *      garde désarmée »);
 *   ③ le corps de la requête le renomme, et la fonction edge l'ignore
 *      poliment — un 200 qui n'a rien lu;
 *   ④ le serveur cesse de le lire, et le câblage devient une décoration.
 *
 * Les quatre sont épinglés ici.
 */

const ROOT = resolve(__dirname, "../../../..");

/**
 * ⚠️ COMMENTAIRES RETIRÉS — cicatrice `caller-audit-must-strip-comments`. Ce
 * dépôt est très commenté, et le mot `preferences` apparaît des dizaines de
 * fois dans de la prose: un `grep` naïf compterait ces lignes-ci comme des
 * lecteurs vivants. Copié tel quel de `api/cookingShape.int.test.ts`.
 */
function code(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8")
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
}

describe("le serveur LIT l'envie du foyer — la prémisse de tout ce câblage", () => {
  /**
   * ④ LE TEST QUI PORTE LES TROIS AUTRES. Si cette assertion tombe, le
   * câblage d'en dessous n'est plus un correctif mais une décoration, et il
   * faut le retirer plutôt que le maintenir.
   *
   * Les trois lectures, dans l'ordre du fichier:
   *   · la CONSIGNE      — `buildMealPrompt({ …, preferences })`
   *   · le COMPTE-RENDU  — FF-061, `reportOnRequest({ preferences })`
   *   · la COLONNE       — `write_student_meal_plan`, payload du plan écrit
   */
  it("`generate-household-meal-v1` relit `body.preferences` trois fois", () => {
    const src = code("supabase/functions/generate-household-meal-v1/index.ts");
    const reads = src.match(/String\(body\.preferences \?\? ""\)/g) ?? [];
    expect(reads.length, "la fonction edge ne lit plus l'envie trois fois")
      .toBe(3);
  });

  /**
   * ⚠️ ET LA LANE INDIVIDUELLE LA LIT PAR LE MÊME TRONC. C'est ce qui rend le
   * nom du champ non négociable côté client: `buildMealPrompt` est partagé.
   */
  it("le tronc porte la ligne d'envie, et elle porte son rang", () => {
    const trunk = code("supabase/functions/_shared/keel/meal_generation.ts");
    expect(trunk).toContain("what they feel like eating THIS TIME");
    // La ligne de rang est ce qui rend ce branchement sûr sur une TABLE: sans
    // elle, une envie qui nomme un allergène médical est servie à tout le
    // monde (mesuré, run `2a000000-3100-…`, 21 occurrences en sortie).
    expect(
      trunk,
      "la ligne d'envie a reperdu son rang — ne la branche pas nue sur un foyer",
    ).toContain("never at the cost of a hard constraint");
  });
});

describe("le câblage — l'envie part quand le maître compose pour le foyer", () => {
  /**
   * ① LE CHAMP EST RENDU SANS GARDE DE LANE, ET C'EST VOLONTAIRE: une envie a
   * un sujet à une bouche comme à six. Ce qui manquait était le départ.
   */
  it("`MealBuilder` monte le champ sans garde de lane et l'envoie sur la branche foyer", () => {
    const src = code("frontend/src/keel/components/MealBuilder.tsx");
    expect(src, "le champ d'envie n'est plus monté").toContain(
      'htmlFor="meals-preferences"',
    );
    // Deux départs, un par lane, et la MÊME expression. Deux normalisations
    // pour un seul champ finissent par diverger.
    const sent = src.match(/preferences: preferences\.trim\(\) \|\| null,/g) ?? [];
    expect(
      sent.length,
      "l'envie ne part plus des DEUX lanes (foyer + individuelle)",
    ).toBe(2);
  });

  /**
   * ② REQUIS ET NULLABLE, JAMAIS OPTIONNEL. Un `preferences?:` ici aurait
   * laissé le seul appelant vivant l'oublier en silence — c'est très
   * exactement le défaut qu'on ferme.
   */
  it("la signature du client réclame le champ, elle ne le propose pas", () => {
    const src = code("frontend/src/keel/api/household.ts");
    expect(
      src,
      "`preferences` est redevenu optionnel: un appelant peut l'oublier sans un mot du compilateur",
    ).not.toContain("preferences?:");
    expect(src).toContain("preferences: string | null;");
  });

  /** ③ LE NOM DU CHAMP EST CELUI DU SERVEUR, sur les DEUX chemins d'appel. */
  it("le corps de requête porte `preferences` sur les deux chemins du foyer", () => {
    expect(
      code("frontend/src/keel/api/household.ts"),
      "la génération directe n'envoie plus l'envie",
    ).toContain("preferences: args.preferences,");
    // ⚠️ UN COMPTE, PAS UNE PRÉSENCE — ET C'EST UNE MUTATION QUI L'A DIT.
    // `preferences: input.preferences,` vit DÉJÀ dans la branche individuelle
    // de ce fichier: un `toContain` restait VERT quand on retirait la ligne de
    // la branche FOYER, c'est-à-dire exactement le défaut qu'on ferme. Les deux
    // branches doivent la porter, donc deux occurrences.
    const draftSends = (code("frontend/src/keel/api/planDraft.ts")
      .match(/preferences: input\.preferences,/g) ?? []).length;
    expect(
      draftSends,
      "l'envie a disparu d'une des deux branches de `callGenerator`",
    ).toBe(2);
  });

  /**
   * ⚠️ LA VERSION DU PROMPT SUIT LA POPULATION. Deux plans de foyer stampés
   * pareil ne peuvent pas porter des consignes différentes: la ligne d'envie
   * apparaît pour qui a tapé quelque chose, donc l'axe foyer a bougé. Le
   * TRONC, lui, ne bouge pas — pas un octet de la lane individuelle ne change.
   */
  it("l'axe foyer a bougé, le tronc n'a pas bougé", () => {
    const household = code(
      "supabase/functions/_shared/keel/household_meal_generation.ts",
    );
    expect(
      household,
      "la version de la lane foyer est restée sur v17 alors que sa consigne a changé",
    ).not.toContain('HOUSEHOLD_PROMPT_VERSION = "v17');
    expect(household).toMatch(/HOUSEHOLD_PROMPT_VERSION = "v1[89]|HOUSEHOLD_PROMPT_VERSION = "v[2-9]\d/);
  });
});
