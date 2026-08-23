import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  cookingShapeApplies,
  COOKING_SHAPES,
  readCookingShape,
} from "./cookingShape";
// ⚠️ LE MODULE SERVEUR EST IMPORTÉ, PAS RECOPIÉ. Patron de
// `api/householdReference.int.test.ts` et de `api/servingDivergence.ts`, en
// production depuis le 2026-08-10: une seconde définition d'une même règle est
// une divergence en attente, et celle qu'on regarde le moins garde l'ancien
// comportement. Ce qu'on épingle ici est très exactement que les DEUX listes de
// jetons sont la même, dans le même ordre.
import {
  capCookingShape,
  COOKING_SHAPES as SERVER_COOKING_SHAPES,
} from "../../../../supabase/functions/_shared/keel/household_portions.ts";

/**
 * LOT B — LE MODE DE CUISSON, DU CHAMP JUSQU'AU MOTEUR.
 *
 * ── CE QUE CE FICHIER PROTÈGE ─────────────────────────────────────────────
 * Un jeton qui part de l'écran et n'arrive pas au serveur est un réglage qui
 * ne sert à rien — et « un choix silencieusement ignoré est pire que pas de
 * choix ». Trois choses peuvent le casser sans que rien n'échoue:
 *
 *   ① les deux listes de jetons divergent (l'écran envoie `separate`, le
 *      serveur lit `separate_sessions` et retombe sur `null`);
 *   ② un site de montage oublie de passer le champ, et il part `undefined`;
 *   ③ le choix se met à s'ÉCRIRE quelque part, et redevient le réglage de
 *      profil que ce lot a refusé d'écrire.
 *
 * Les trois sont épinglés ici.
 */

const ROOT = resolve(__dirname, "../../../..");

/** ⚠️ COMMENTAIRES RETIRÉS — cicatrice `caller-audit-must-strip-comments`. */
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

describe("les deux bouts nomment les mêmes trois modes", () => {
  /**
   * ① LE CAS QUI FAIT TOUT LE TEST. Un jeton renommé d'un seul côté ne casse
   * RIEN à la compilation: le serveur lit une chaîne inconnue, rend `null`, et
   * le choix disparaît en silence — l'écran continue d'afficher trois options
   * qui ne font plus rien.
   */
  it("la liste de l'écran est celle du serveur, dans le même ordre", () => {
    expect([...COOKING_SHAPES]).toEqual([...SERVER_COOKING_SHAPES]);
  });

  it("le lecteur d'écran et celui du serveur refusent la même chose", () => {
    for (const brut of ["", "  ", "ONE_DISH", "one dish", "chacun le sien"]) {
      expect(readCookingShape(brut), brut).toBeNull();
    }
    for (const shape of COOKING_SHAPES) {
      expect(readCookingShape(shape)).toBe(shape);
    }
  });

  /**
   * ⛔ LA RÈGLE DU PLAFOND N'EST PAS RECOPIÉE CÔTÉ ÉCRAN, et ce test le
   * démontre en l'important. Une garde en double est « la cicatrice la plus
   * chère de ce dépôt »: les deux moitiés divergent, et c'est celle qu'on
   * regarde le moins qui décide.
   */
  it("le plafond vit côté serveur, et il ne fabrique jamais un second plat", () => {
    expect(capCookingShape("one_session", "one_dish").shape).toBe("one_dish");
    expect(capCookingShape("one_dish", "separate_sessions").shape).toBe("one_dish");
    const front = code("frontend/src/keel/api/cookingShape.ts");
    expect(front, "la règle du plafond a été recopiée côté écran")
      .not.toContain("capped");
  });
});

describe("la question n'est posée que là où elle a un sujet", () => {
  it("une seule bouche ⇒ pas de question", () => {
    expect(cookingShapeApplies(1)).toBe(false);
    expect(cookingShapeApplies(0)).toBe(false);
    // Deux bouches est la première taille où « un seul plat pour tout le
    // monde » veut dire quelque chose.
    expect(cookingShapeApplies(2)).toBe(true);
    expect(cookingShapeApplies(6)).toBe(true);
  });

  it("un compte de bouches illisible ne pose pas la question", () => {
    // Direction sûre: ne pas poser une question dont on ne sait pas si elle a
    // un sujet. Un `NaN` traité comme « oui » afficherait le champ à quelqu'un
    // qui mange seul, et sa réponse partirait sur une lane qui la refuse.
    expect(cookingShapeApplies(Number.NaN)).toBe(false);
  });
});

describe("le câblage — le jeton part des trois écrans qui composent", () => {
  /**
   * ② LE CHAMP EST POSÉ SUR LES DEUX ÉCRANS QUI COMPOSENT, et sur le même
   * composant. Deux champs écrits séparément divergeraient au premier libellé
   * retouché, et c'est celui qu'on regarde le moins qui garderait l'ancien mot.
   */
  it("`MealBuilder` monte le champ et envoie le jeton", () => {
    const src = code("frontend/src/keel/components/MealBuilder.tsx");
    expect(src, "le champ n'est plus monté").toContain("<CookingShapeField");
    expect(src, "le champ est monté hors du foyer").toContain(
      "composingForHousehold && (",
    );
    // ⚠️ L'ANCRE ÉTAIT `/cookingShape,\s*\}\);/`, C'EST-À-DIRE « DERNIÈRE
    // PROPRIÉTÉ DE L'OBJET ». Elle a rougi le 2026-08-19 quand le lot D a
    // branché l'envie du foyer JUSTE APRÈS — un champ de plus dans le même
    // appel, et la garde tombait sans que le jeton ait bougé d'un octet. Une
    // garde qui dépend de l'ORDRE des propriétés d'un littéral surveille la
    // mise en page, pas le câblage. Ce qui compte est: le jeton part DANS
    // l'appel de la lane foyer.
    expect(src, "le jeton ne part plus avec la demande").toMatch(
      /generateHouseholdMeal\(\{[\s\S]*?\bcookingShape,[\s\S]*?\n\s*\}\);/,
    );
  });

  it("l'entonnoir monte le champ et le passe aux TROIS gestes", () => {
    const src = code("frontend/src/keel/pages/SetupPage.tsx");
    expect(src, "le champ n'est plus monté").toContain("<CookingShapeField");
    // `draftInput` est la source unique: aperçu, reprise et adoption.
    expect(src, "le jeton ne part plus dans la demande").toContain(
      "cookingShape,",
    );
  });

  it("le corps de requête porte `cooking_shape` sur les deux chemins", () => {
    expect(
      code("frontend/src/keel/api/household.ts"),
      "la génération directe n'envoie plus le jeton",
    ).toContain("cooking_shape: args.cookingShape ?? null");
    expect(
      code("frontend/src/keel/api/planDraft.ts"),
      "l'aperçu et l'adoption n'envoient plus le jeton",
    ).toContain("cooking_shape: input.cookingShape");
  });

  /**
   * ③ ⛔ ET IL NE S'ÉCRIT NULLE PART. C'est la moitié qui se perd le plus vite:
   * une ligne `cooking_shape` dans `savePlanAnswers` ou
   * `mergePracticalConstraints` en referait un réglage de profil — « il s'écrit
   * une fois et s'applique en silence à toutes les semaines suivantes, y
   * compris celle où on reçoit du monde ».
   */
  it("le choix n'est écrit dans AUCUNE colonne", () => {
    for (
      const rel of [
        "frontend/src/keel/api/onboarding.ts",
        "frontend/src/keel/api/planBudget.ts",
        "frontend/src/keel/api/practicalConstraints.ts",
        "frontend/src/keel/components/CookingCapacityCard.tsx",
      ]
    ) {
      expect(code(rel), `${rel} écrit le mode de cuisson`).not.toContain(
        "cooking_shape",
      );
    }
  });
});
