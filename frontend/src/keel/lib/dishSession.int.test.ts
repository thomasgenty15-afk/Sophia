import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { CookingSession } from "../api/mealGeneration";
import { sessionForDish } from "./dishSession";

/**
 * LE PLAT ET SA SESSION — le chemin existait, l'écran non.
 *
 *     dish.uses[].preparation_id → cooking_sessions[].preparation_ids
 *
 * Aucun appel modèle, aucune colonne, aucune migration: deux tableaux
 * d'identifiants qui se répondent depuis toujours et ne se rencontraient nulle
 * part à l'écran.
 */

const SESSIONS: CookingSession[] = [
  {
    day: "wed",
    preparation_ids: ["prep_chicken", "prep_rice", "prep_veg"],
    run_through: "Roast the thighs, start the rice, tray the vegetables.",
    total_minutes: 60,
  },
  {
    day: "sat",
    preparation_ids: ["prep_chilli"],
    run_through: "Brown the beef, add the beans, simmer.",
    total_minutes: 45,
  },
];

const PREPS = [
  { id: "prep_chicken", title: "Roast chicken thighs" },
  { id: "prep_rice", title: "Cooked rice" },
  { id: "prep_veg", title: "Roast vegetables" },
  { id: "prep_chilli", title: "Beef and bean chilli" },
];

describe("la session d'un plat", () => {
  it("relie le plat à la session qui a cuit son lot", () => {
    const found = sessionForDish(
      { uses: [{ preparation_id: "prep_chicken", servings: 2 }] },
      SESSIONS,
      PREPS,
    );
    expect(found?.day).toBe("wed");
    expect(found?.runThrough).toContain("Roast the thighs");
    // CE QUI EST SORTI DE LA MÊME CASSEROLÉE — la moitié que le plat n'avait
    // nulle part.
    expect(found?.preparations).toEqual([
      "Roast chicken thighs",
      "Cooked rice",
      "Roast vegetables",
    ]);
  });

  /**
   * ⚠️ L'IDENTIFIANT QUI A FAIT LE LIEN EST GARDÉ. Il ne s'affiche pas — un
   * slug de lot ne veut rien dire à table — mais l'écran le pose en
   * `data-preparation-id`, donc la jointure est auditable dans le DOM. Une
   * jointure invisible est une jointure qu'on ne sait pas prouver juste.
   */
  it("garde l'identifiant qui a fait le lien", () => {
    const found = sessionForDish(
      { uses: [{ preparation_id: "prep_chilli", servings: 4 }] },
      SESSIONS,
      PREPS,
    );
    expect(found?.viaPreparationId).toBe("prep_chilli");
    expect(found?.day).toBe("sat");
  });

  it("un plat cuisiné de zéro n'a pas de session — donc pas de bouton", () => {
    expect(sessionForDish({ uses: [] }, SESSIONS, PREPS)).toBeNull();
  });

  it("un lot qu'aucune session ne revendique ne fabrique pas de session", () => {
    expect(
      sessionForDish(
        { uses: [{ preparation_id: "prep_ghost", servings: 1 }] },
        SESSIONS,
        PREPS,
      ),
    ).toBeNull();
  });

  it("deux lots dans deux sessions ⇒ celle du PREMIER lot cité par le plat", () => {
    // Nommer deux sessions sous un plat ferait de la carte une liste de
    // sessions, ce que « discret par défaut » interdit.
    const found = sessionForDish(
      {
        uses: [
          { preparation_id: "prep_chilli", servings: 1 },
          { preparation_id: "prep_rice", servings: 1 },
        ],
      },
      SESSIONS,
      PREPS,
    );
    expect(found?.day).toBe("sat");
    expect(found?.viaPreparationId).toBe("prep_chilli");
  });

  it("un lot inconnu de la liste des préparations est écarté, pas rendu tel quel", () => {
    // Afficher `prep_veg` sous un plat ne veut rien dire à table.
    const found = sessionForDish(
      { uses: [{ preparation_id: "prep_chicken", servings: 2 }] },
      SESSIONS,
      [{ id: "prep_chicken", title: "Roast chicken thighs" }],
    );
    expect(found?.preparations).toEqual(["Roast chicken thighs"]);
  });

  it("un premier lot sans session n'empêche pas de trouver la suivante", () => {
    const found = sessionForDish(
      {
        uses: [
          { preparation_id: "prep_ghost", servings: 1 },
          { preparation_id: "prep_rice", servings: 1 },
        ],
      },
      SESSIONS,
      PREPS,
    );
    expect(found?.day).toBe("wed");
    expect(found?.viaPreparationId).toBe("prep_rice");
  });
});

/**
 * LES DEUX GARDES DU LOT, TESTÉES SUR LA SOURCE.
 *
 * ⚠️ COMMENTAIRES RETIRÉS — cicatrice `caller-audit-must-strip-comments`. Les
 * en-têtes de ces fichiers PARLENT longuement de `active_minutes` pour dire
 * qu'il est interdit ici; un `includes` sur la source brute serait rouge sur le
 * commentaire qui protège la règle.
 */
describe("les gardes du lot (câblage)", () => {
  const ROOT = resolve(__dirname, "../../../..");

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

  /**
   * ⛔ AUCUNE DURÉE **DE SESSION** NE REMONTE SUR LA CARTE D'UN PLAT.
   *
   * `active_minutes` vit sur les PRÉPARATIONS et `total_minutes` sur la
   * session. Les remonter jusqu'à la carte d'un plat donnerait à un ASSEMBLAGE
   * le temps d'une CUISSON — « réchauffe une portion » annoncé à 50 minutes.
   *
   * ── LOT 2 (2026-08-17) · LA RÈGLE SE PRÉCISE, ELLE NE SE DESSERRE PAS ────
   * Un plat porte désormais SA propre durée: `same_day.minutes`, le temps du
   * GESTE DU JOUR J — huit minutes pour sortir la boîte et la réchauffer. Ce
   * n'est pas une exception à la règle ci-dessus, c'est le champ qui la rend
   * tenable: la carte disait « réchauffe une portion » sans durée précisément
   * parce que la seule durée à portée était fausse.
   *
   * Trois temps, trois surfaces, et la carte n'a le droit que du troisième:
   *   · `preparations[].active_minutes` / `.total_minutes` → sessions de cuisine
   *   · `cooking_sessions[].total_minutes`                 → sessions de cuisine
   *   · `dishes[].same_day.minutes`                        → LA CARTE DU PLAT
   *
   * Les trois littéraux interdits ci-dessous n'ont donc pas bougé d'un octet.
   */
  it("aucune durée DE SESSION ne remonte du lot jusqu'à la carte du plat", () => {
    const src = code("frontend/src/keel/lib/dishSession.ts") +
      code("frontend/src/keel/components/DishCard.tsx");
    expect(src, "une durée est remontée sur un plat").not.toContain("active_minutes");
    expect(src, "une durée est remontée sur un plat").not.toContain("total_minutes");
    expect(src, "une durée est remontée sur un plat").not.toContain("totalMinutes");
  });

  /**
   * ⚠️ LE CAS QUI DOIT PASSER, ET IL EST INDISPENSABLE.
   *
   * Une garde sans cas passant bloque tout et ressemble à une garde qui marche.
   * Celle du dessus interdit TROIS littéraux; sans ce test, on ne saurait pas
   * distinguer « la carte n'affiche aucune durée de session » de « la carte
   * n'affiche aucune durée du tout », et le LOT 2 aurait pu être livré désarmé
   * en restant vert.
   */
  it("la durée du GESTE DU JOUR, elle, est bien sur la carte", () => {
    const card = code("frontend/src/keel/components/DishCard.tsx");
    // ⚠️ ON ASSÈRE LE MONTAGE, PAS LA LIGNE ENTIÈRE. La version d'avant recopiait
    // le JSX au caractère près, `sameDay={dish.same_day} />` compris — et elle est
    // tombée le 2026-08-17 pour un ajout de prop qui ne retirait rien. Un test qui
    // casse quand on AJOUTE fait relire le test au lieu du changement.
    expect(card, "le bandeau du jour J a disparu de la carte").toContain(
      "{dish.same_day && <SameDayLine",
    );
    expect(card, "la durée du geste du jour n'est plus rendue").toContain(
      "sameDay.minutes !== null",
    );
  });

  /**
   * ⛔ LE LIBELLÉ VIENT DU JETON, JAMAIS DE LA PROSE.
   *
   * Le seul marqueur de réchauffage qui existait avant le LOT 2 était le mot
   * « reheat » dans `method`. Un matcher là-dessus se tromperait sur « do not
   * reheat », sur « assemble the reheated chicken », et sur la totalité des
   * plans rendus en français. « Jamais de matcher maison. »
   */
  it("⛔ le geste du jour ne se devine pas dans la méthode", () => {
    const card = code("frontend/src/keel/components/DishCard.tsx");
    for (const probe of ["method.includes", "method.toLowerCase", "method.match"]) {
      expect(card, `${probe} est apparu: le geste est deviné, plus déclaré`)
        .not.toContain(probe);
    }
    for (const word of ["reheat", "réchauff"]) {
      expect(card, `« ${word} » est écrit en dur dans la carte`)
        .not.toMatch(new RegExp(word, "i"));
    }
  });

  /**
   * ⛔ LA PRÉPARATION EST ATTACHÉE AU PLAT, JAMAIS À LA PERSONNE.
   *
   * Même plat, deux personnes ⇒ UNE préparation: on réchauffe une fois, on
   * tranche une fois. Ce qui diffère est la PART, pas le geste. Écrire
   * « réchauffe 10 min » deux fois avec deux quantités transformerait une
   * cuisine en service à la carte — le contraire du produit, dont l'unité est
   * la session de cuisson PARTAGÉE. La ceinture est structurelle: le résolveur
   * n'a aucune entrée où une personne pourrait passer.
   */
  it("le résolveur ne connaît aucune personne — ceinture structurelle", () => {
    const src = code("frontend/src/keel/lib/dishSession.ts");
    for (const forbidden of ["member", "portion", "person", "household"]) {
      expect(src, `« ${forbidden} » est entré dans la résolution de session`)
        .not.toMatch(new RegExp(forbidden, "i"));
    }
  });

  it("l'écran pose l'identifiant du lien, et le montage passe les sessions", () => {
    const card = code("frontend/src/keel/components/DishCard.tsx");
    expect(card, "la jointure n'est plus auditable dans le DOM").toContain(
      "data-preparation-id={session.viaPreparationId}",
    );
    // LOT 1 (2026-08-17): le bloc jour est extrait de `PlanResult` en
    // `PlanDayBlock` — c'est LUI qui résout la session d'un plat maintenant.
    // La garde suit le code, elle ne se contourne pas: `PlanResult` doit
    // toujours faire DESCENDRE la prop jusqu'au bloc, et le bloc doit
    // toujours la rendre. Un seul des deux qui lâche, et `cookingSessions`
    // redevient la prop morte de 2026-08-14.
    const block = code("frontend/src/keel/components/plan/PlanDayBlock.tsx");
    expect(block, "la prop `cookingSessions` est redevenue morte").toContain(
      "sessionForDish(dish, props.cookingSessions, props.preparations)",
    );
    const result = code("frontend/src/keel/components/plan/PlanResult.tsx");
    expect(result, "`PlanResult` ne passe plus les sessions au bloc jour").toContain(
      "cookingSessions={props.cookingSessions}",
    );
  });

  it("un plat sans session ne rend aucun bouton", () => {
    const card = code("frontend/src/keel/components/DishCard.tsx");
    expect(card).toContain("{session && <SessionLink session={session} />}");
  });
});
