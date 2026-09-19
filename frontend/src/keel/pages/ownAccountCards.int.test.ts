import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { PAGE_NAMESPACES } from "../i18n/catalog";

// ===========================================================================
// A5 POINT 7 (2026-09-03) — LES DEUX CARTES DU COMPTE, SUR SA PROPRE LIGNE
//
// Le rythme (quand on mange, et quelle taille de part) et ce que la
// conversation a retenu des goûts vivaient dans la fenêtre de réglages de
// `/app/plan`. Ils parlent de la même personne que la fiche du Foyer, et c'est
// là qu'on les cherche.
//
// ── ⛔ LES DEUX RÈGLES QUI TIENNENT CE LOT, ET ELLES SONT MÉCANIQUES ──────
//
//   ① SUR `isMe`, ET SEULEMENT LÀ. Les deux cartes lisent `auth.user.id`
//      ELLES-MÊMES (`const uid = sess.user?.id`) et écrivent
//      `student_goals.practical_constraints` de la SESSION. Montées sur la
//      ligne de quelqu'un d'autre, elles afficheraient les réponses du lecteur
//      sous le prénom d'un tiers — et le premier Enregistrer écrirait la
//      colonne du lecteur en croyant écrire celle de l'autre.
//
//   ② PAS SUR UNE LECTURE NON FAITE. `mergePracticalConstraints` FUSIONNE sur
//      ce qu'on lui donne: nourri d'un objet vide non lu, il effacerait le
//      rythme et les goûts déjà déclarés, en silence.
//
// ⚠️ LECTURE DE SOURCE, commentaires blanchis: ce qui doit être prouvé est un
// CÂBLAGE (quelle carte, derrière quelle garde, avec quelle colonne), et
// `HouseholdPage` ne se monte pas sous `renderToStaticMarkup`.
// ===========================================================================

function source(rel: string): string {
  return readFileSync(new URL(rel, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");
}


describe("⟳ 2026-09-19 — LES DEUX CARTES N'EXISTENT PLUS", () => {
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * CE QUI S'EST PASSÉ, EN DEUX TEMPS DANS LA MÊME JOURNÉE
   * ══════════════════════════════════════════════════════════════════════════
   *
   * A5 point 7 les avait rapatriées de `/app/plan` sur la fiche du Foyer: elles
   * parlent de la même personne, et c'est là qu'on les cherchait.
   *
   * ① RETIRÉES DE LA FICHE (matin). « Comment se passe ta journée » cochait les
   *    six moments, avec une TAILLE par moment; la section « Quand tu manges,
   *    et quoi » de la fiche coche les six MÊMES moments et écrit la MÊME
   *    colonne. Deux formulaires, une colonne, un écran.
   *
   * ② SUPPRIMÉES DU CODE (après-midi), sur une phrase du propriétaire: « ça
   *    doit disparaître du code, on ne pose plus jamais ces questions ». Le
   *    dernier montage de `EatingRhythmCard` — `/app/plan` — est donc parti
   *    avec, et les deux composants n'existent plus.
   *
   * ── CE QUE ÇA LAISSE, ET IL FAUT LE SAVOIR AVANT D'Y TOUCHER ─────────────
   *   · UN SEUL ÉCRIVAIN pour `practical_constraints.eating_rhythm`: la fiche
   *     du foyer (`ownFiche.setRhythm` → `saveEatingRhythm`) et l'entonnoir,
   *     qui est le même écrivain. Vérifié bout en bout le 2026-09-19.
   *   · LA TAILLE PAR MOMENT n'a plus AUCUN contrôle. La colonne la porte
   *     toujours et le moteur la relit; plus aucun écran ne la règle. C'est la
   *     moitié assumée de la demande.
   *   · « Ce que Sophia sait » (`FoodPreferencesCard`) était déjà démontée de
   *     `/app/plan` au lot C. Ce qui est écrit en base reste lisible et
   *     rangeable sur `/app/about-you`, en « Anciennes notes ».
   */
  it("les deux composants n'existent plus, et personne ne les monte", () => {
    for (const page of [
      "./HouseholdPage.tsx",
      "./StudentWeekPlanPage.tsx",
      "./SetupPage.tsx",
    ]) {
      expect(source(page), `${page} monte « comment se passe ta journée »`)
        .not.toContain("<EatingRhythmCard");
      expect(source(page), `${page} monte « ce que Sophia sait »`)
        .not.toContain("<FoodPreferencesCard");
    }
    // ⚠️ SEULE `EatingRhythmCard` EST SUPPRIMÉE DU DISQUE. `FoodPreferencesCard`
    // survit sans montage: le lot C a gardé son lecteur (`api/foodPreferences`)
    // pour l'archive, et le fichier avec. Ce qui est mesuré ici est ce que le
    // propriétaire a demandé — « on ne pose plus jamais ces questions ».
    expect(
      existsSync(resolve(__dirname, "../components/EatingRhythmCard.tsx")),
      "« comment se passe ta journée » est revenue sur le disque",
    ).toBe(false);
  });

  /**
   * ⛔ LE CAS QUI PASSE — sans lui, les assertions du dessus resteraient vertes
   * sur un produit où PERSONNE ne peut plus dire quand il mange.
   */
  it("…et la question est toujours posée, une fois, dans la fiche du foyer", () => {
    const household = source("./HouseholdPage.tsx");
    expect(household, "la fiche ne pose plus les moments")
      .toContain("<MouthPreferencesFields");
    expect(household, "la fiche ne les écrit plus dans la colonne du compte")
      .toContain("saveEatingRhythm({");
  });

  /**
   * ⚠️ LA RELECTURE DE LA COLONNE RESTE, ET ELLE A GAGNÉ UN APPELANT. Elle
   * servait les deux cartes; elle sert maintenant la carte d'équipement et
   * l'accusé d'allergie d'une bouche, qui FUSIONNENT sur la même colonne.
   * Cicatrice `stale-current-erases-the-previous-write`.
   */
  it("la colonne du compte se relit toujours après une écriture", () => {
    const household = source("./HouseholdPage.tsx");
    const decl = household.indexOf(
      "const refreshPracticalConstraints = React.useCallback(",
    );
    expect(decl, "la relecture nommée n'existe pas").toBeGreaterThan(0);
    expect(
      household.slice(decl, decl + 400),
      "le rappel de relecture ne relit pas la colonne",
    ).toContain("loadPracticalConstraints(userId)");
    expect(household, "l'accusé d'allergie ne relit pas après avoir fusionné")
      .toContain("await refreshPracticalConstraints();");
  });

  it("`CookingCapacityCard` n'a pas suivi", () => {
    expect(source("./StudentWeekPlanPage.tsx")).toContain("<CookingCapacityCard");
    expect(source("./HouseholdPage.tsx")).not.toContain("<CookingCapacityCard");
  });
});

describe("les namespaces suivent les montages, pas les intentions", () => {
  /**
   * Les deux cartes parlent `plan.*` (`plan.section.day.title`,
   * `plan.section.told.title`, et leur propre copie sous `plan.told.*`), un
   * namespace que `/app/household` déclare depuis longtemps.
   */
  it("`plan` est déclaré sur /app/household", () => {
    expect(PAGE_NAMESPACES["/app/household"]).toContain("plan");
  });

  /**
   * ⛔ `known` N'EST PAS DÉCLARÉ, ET C'EST EXACT: `KnownAboutYouCard` n'est PAS
   * montée ici. Le mandat prévoyait qu'elle rejoigne le cadre des préférences;
   * elle réclame quatre lectures que cette page ne fait pas — `store`,
   * `members`, `roster`, `today` — plus son écrivain, et la monter sur un
   * `store` non lu est exactement l'interdit « un cadre monté sur une lecture
   * non faite ». `/app/about-you` garde donc la route ET la carte (D5.4 le
   * prévoit), et rien n'est perdu aujourd'hui.
   *
   * ⚠️ UNE DÉCLARATION SANS MONTAGE SERAIT UN MENSONGE DE PLUS: `pageSeams`
   * mesure ce qu'une page ATTEINT, et déclarer un namespace qu'elle n'atteint
   * pas rend la déclaration inutile à relire. Le jour où la carte est montée,
   * `pageSeams` rougit et demande la déclaration — c'est lui qui la réclame,
   * pas ce commentaire.
   */
  it("`known` n'est pas déclaré tant que sa carte n'est pas montée", () => {
    expect(source("./HouseholdPage.tsx"), "la carte est montée sans que le namespace soit déclaré")
      .not.toContain("<KnownAboutYouCard");
    expect(PAGE_NAMESPACES["/app/household"]).not.toContain("known");
  });
});
