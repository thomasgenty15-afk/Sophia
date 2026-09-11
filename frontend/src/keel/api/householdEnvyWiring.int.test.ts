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
   *
   * ══════════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-03 — LA QUESTION EST TOUJOURS SANS GARDE DE LANE; SA
   * DESTINATION, ELLE, EN A UNE.
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Ce test exigeait `preferences: preferences.trim() || null,` DEUX fois —
   * une par lane. C'était juste tant que `/app/plan` posait DEUX questions
   * d'envie: « Ce dont tu as envie cette fois » (le corps de la requête) et,
   * quinze lignes plus bas, « C'est la maison a envie de quoi ? » (la ligne de
   * la semaine). Un maître de foyer lisait les deux, dans le même formulaire.
   *
   * L'alignement sur l'étape 3 n'en laisse qu'UNE, avec les mots de
   * l'entonnoir. La lane foyer l'écrit par `submitEnvy` — l'écrivain de
   * l'entonnoir, sur l'ancre du départ choisi —, et `preferences` part `null`
   * dans la requête, exactement comme `draftInput`.
   *
   * ⛔ CE QUE ÇA NE RELÂCHE PAS: la prémisse ④ (le serveur LIT
   * `body.preferences`) reste vraie et gardée, la signature du client reste
   * requise et nullable (②), et le nom du champ reste celui du serveur (③).
   * Ce qui change est ce que CET écran met dans ce canal-là, pas ce que le
   * serveur sait lire — et la lane individuelle, elle, y met toujours l'envie.
   */
  it("`MealBuilder` monte UNE question d'envie, et elle a UN écrivain", () => {
    // ══════════════════════════════════════════════════════════════════════
    // ⟳ 2026-09-10 · LOT 7 — UNE QUESTION, UN CANAL.
    // ══════════════════════════════════════════════════════════════════════
    //
    // Ce cas gardait « chaque lane a son écrivain »: la ligne de la semaine
    // (`submitEnvy`) pour le foyer, le corps de la requête (`preferences`) pour
    // le solo. Il n'y a plus qu'un moteur, donc plus qu'un canal — celui de
    // l'entonnoir, qui l'écrivait déjà pour tout le monde.
    //
    // ⛔ LA PROPRIÉTÉ GARDÉE NE CHANGE PAS: la question posée à l'écran a une
    // destination, et une seule. C'est l'assertion « il y a un champ, il part
    // quelque part, et pas deux fois ».
    const src = code("frontend/src/keel/components/MealBuilder.tsx");
    expect(src, "le champ d'envie n'est plus monté").toContain(
      'htmlFor="meals-envy"',
    );
    // ⛔ UNE SEULE, ET C'EST MESURÉ: un second `<textarea>` d'envie ferait
    // revenir la question en double que ce lot a retirée.
    const asked = src.match(/t\("plan\.envy\.title"\)/g) ?? [];
    expect(asked.length, "l'envie est posée deux fois dans le même formulaire")
      .toBe(1);

    // ⛔ ET ELLE NE PART PLUS DANS LE CORPS DE LA REQUÊTE. Les deux ensemble
    // mettraient la même phrase deux fois dans la consigne — une fois comme
    // ligne de la semaine, une fois comme envie du moment.
    expect(
      src,
      "l'envie repart AUSSI dans le corps: la phrase serait servie deux fois",
    ).not.toMatch(/preferences: envy/);

    // LE CANAL — la ligne de la semaine, écrite AVANT la composition: le
    // générateur relit la table côté serveur, donc écrire après composerait le
    // plan sans ce qu'on vient de saisir.
    const write = src.indexOf("await submitEnvy(envyWeek, line)");
    const compose = src.indexOf("await generateHouseholdMeal(");
    expect(write, "l'écrivain de la ligne de la semaine a disparu")
      .toBeGreaterThan(-1);
    expect(compose, "la composition est introuvable").toBeGreaterThan(-1);
    expect(write, "l'envie est écrite APRÈS la composition").toBeLessThan(compose);

    // ⛔ ET SON REFUS NE PASSE PLUS EN SILENCE. `keel_household_submit_envy`
    // rend `{ok:false, reason}` — elle ne lève PAS. Ignorer ce résultat laissait
    // composer un plan sans la phrase qu'on venait d'écrire, sans un mot: un
    // champ visible dont le contenu disparaît est pire qu'un champ absent.
    expect(
      src,
      "le refus d'écriture de l'envie repart en silence",
    ).toMatch(/if \(!wrote\.ok\) throw new Error\(/);
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
  it("le corps de requête porte `preferences` sur les deux chemins d'appel", () => {
    expect(
      code("frontend/src/keel/api/household.ts"),
      "la génération directe n'envoie plus l'envie",
    ).toContain("preferences: args.preferences,");
    // ⟳ 2026-09-10 · LOT 7 — UNE OCCURRENCE, ET C'EST UN COMPTE EXACT.
    //
    // Il en fallait DEUX tant que `callGenerator` avait deux branches de corps:
    // un `toContain` restait vert quand on retirait la ligne de l'une des deux.
    // Le corps est unique depuis ce lot, donc `2` ferait rougir sur une règle
    // morte — et `>= 1` laisserait passer le retour d'une seconde branche sans
    // le champ, très exactement le défaut d'origine.
    const draftSends = (code("frontend/src/keel/api/planDraft.ts")
      .match(/preferences: input\.preferences,/g) ?? []).length;
    expect(
      draftSends,
      "le corps de `callGenerator` ne porte plus l'envie une fois et une seule",
    ).toBe(1);
    // ⚠️ LA PRÉMISSE QUI REND LE COMPTE LISIBLE: il n'y a bien qu'un corps.
    // Sans elle, `1` se relirait « une des deux branches l'a perdue ».
    expect(
      code("frontend/src/keel/api/planDraft.ts"),
      "`callGenerator` a retrouvé une seconde branche de corps",
    ).not.toMatch(/input\.lane === "household"/);
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
