import { readFileSync } from "node:fs";
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

const src = source("./HouseholdPage.tsx");

describe("les deux cartes du compte sont montées, et gardées deux fois", () => {
  it("elles sont là", () => {
    expect(src).toContain("<EatingRhythmCard");
    expect(src).toContain("<FoodPreferencesCard");
  });

  /**
   * ⛔ LA DOUBLE GARDE, SUR LA MÊME LIGNE DE CODE: `isMe` (la bonne personne)
   * ET `practicalConstraints !== null` (la lecture faite). Retirer l'une des
   * deux est une régression différente, et les deux sont mesurées ici.
   */
  it("elles sont derrière `isMe` ET derrière la lecture de la colonne", () => {
    const at = src.indexOf("<EatingRhythmCard");
    expect(at).toBeGreaterThan(0);
    const before = src.slice(Math.max(0, at - 900), at);
    expect(before, "elles se montent sur la ligne de n'importe qui")
      .toContain("isMe && practicalConstraints !== null");
  });

  it("elles reçoivent la colonne LUE, pas un objet fabriqué", () => {
    const at = src.indexOf("<EatingRhythmCard");
    const block = src.slice(at, at + 600);
    expect(block).toContain("practicalConstraints={practicalConstraints}");
    expect(block, "un objet vide est passé à un écrivain qui FUSIONNE")
      .not.toContain("practicalConstraints={{}}");
  });

  /**
   * ⚠️ ET LA COLONNE SE RELIT APRÈS L'ÉCRITURE. `refresh` ne lit pas
   * `student_goals`: sans relecture, les deux cartes se remonteraient sur la
   * valeur d'avant, et la fusion suivante partirait de cette valeur périmée.
   * Cicatrice `stale-current-erases-the-previous-write`.
   */
  it("la colonne est relue après chaque écriture des deux cartes", () => {
    const at = src.indexOf("onSavedOwnConstraints={");
    expect(at, "le geste de relecture n'est pas câblé").toBeGreaterThan(0);
    expect(src.slice(at, at + 500)).toContain("loadPracticalConstraints(userId)");
  });

  /**
   * ⛔ `CookingCapacityCard` NE VIENT PAS (mandat point 7): elle reste sur
   * `/app/plan`, où la lane CUISINE la remplace. La rapatrier ici en ferait
   * deux, et c'est celle qu'on regarde le moins qui garderait l'ancienne
   * question.
   */
  it("`CookingCapacityCard` n'a pas suivi", () => {
    expect(src).not.toContain("<CookingCapacityCard");
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
    expect(src, "la carte est montée sans que le namespace soit déclaré")
      .not.toContain("<KnownAboutYouCard");
    expect(PAGE_NAMESPACES["/app/household"]).not.toContain("known");
  });
});
