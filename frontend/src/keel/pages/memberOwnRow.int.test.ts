import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ===========================================================================
// A5 POINT 6 (2026-09-03) — LA LIGNE D'UN MEMBRE RÉCLAMÉ S'ÉDITE
//
// ── CE QUI ÉTAIT FAUX ─────────────────────────────────────────────────────
// `/app/household` était ENTIÈREMENT en lecture seule pour un profil réclamé:
// huit pastilles, et rien d'autre. Or la base ne lui refuse pas tout — elle
// distingue DEUX refus, et l'écran n'en connaissait qu'un:
//   · `not_owner`  → le corps, le régime, les allergies, les règles de maison,
//                    l'invitation, les deux retraits, le réglage de fusion;
//   · `not_your_line` → son prénom, sa date de naissance, ses habitudes, ses
//                    absences, son déjeuner de semaine — c'est-à-dire ce qu'il
//                    PEUT écrire, sur SA ligne.
// Un écran qui ne propose pas ce que la base accepte décide, par omission, de
// ce qu'une personne a le droit de dire d'elle-même.
//
// ── ⛔ ET IL NE VOIT PAS « PERSONNE N'A DE CORPS » ────────────────────────
// `keel_household_member_bodies` rend ZÉRO LIGNE à un membre. Un cadre monté
// là-dessus n'afficherait pas « rien de renseigné », il AFFIRMERAIT une
// absence qu'il n'a pas lue. La règle du fichier (`HouseholdPage.tsx:345-350`)
// est donc tenue par `viewerIsOwner`, qui retire le bloc — pas par une valeur
// vide qui voudrait dire « lu, rien ».
//
// ── POURQUOI CE FICHIER EST UNE LECTURE DE SOURCE ────────────────────────
// `MembersCard` n'est pas exporté et ne se monte pas seul (il lit `household`,
// `me`, quatre Maps et dix-huit gestes). Ce qui doit être prouvé ici est un
// PARTAGE DE DROITS — quel bloc est derrière quelle garde —, et un partage se
// lit dans la source. Commentaires blanchis: cicatrice
// `caller-audit-must-strip-comments`, et ce fichier-là PARLE longuement de
// `not_owner`.
// ===========================================================================

function source(rel: string): string {
  return readFileSync(new URL(rel, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");
}

const src = source("./HouseholdPage.tsx");

describe("le partage des droits est tenu par UNE garde, pas par une liste", () => {
  it("`viewerIsOwner` est requis, jamais optionnel", () => {
    expect(src, "la garde est devenue facultative — donc désarmée par défaut")
      .toContain("viewerIsOwner: boolean;");
    expect(src).not.toMatch(/viewerIsOwner\?:/);
  });

  /**
   * LES SIX BLOCS QUE LA BASE REFUSE À UN MEMBRE SONT DERRIÈRE LA GARDE.
   * On cherche, pour chacun, un `viewerIsOwner` dans les lignes qui le
   * précèdent immédiatement — c'est ce qui distingue « gardé » de « présent
   * quelque part dans le fichier ».
   */
  it("le corps, le régime, les contraintes, le retrait et la fusion sont gardés", () => {
    const gated: [string, string][] = [
      ["le corps", "<BodyFields"],
      ["le régime", 't("household.member.diet")'],
      ["les allergies et règles", 't("household.constraint.kind")'],
      ["retirer du foyer", 't("household.member.remove")'],
      ["le réglage de fusion", 't("household.merge.mute")'],
    ];
    for (const [name, needle] of gated) {
      const at = src.indexOf(needle);
      expect(at, `${name} a disparu de la fiche`).toBeGreaterThan(0);
      const before = src.slice(Math.max(0, at - 700), at);
      expect(before, `${name} n'est pas derrière \`viewerIsOwner\``)
        .toContain("viewerIsOwner");
    }
  });

  /**
   * ⛔ ET CE QUE LA BASE ACCEPTE N'EST PAS GARDÉ. Sans ce cas, retirer TOUT
   * derrière `viewerIsOwner` passerait le cas ci-dessus — une garde qui bloque
   * tout ressemble à une garde qui marche.
   */
  it("ses habitudes et son déjeuner de semaine ne sont PAS derrière la garde", () => {
    for (const needle of ["<HouseholdHabitsCard", "<MemberWorkLunchCard"]) {
      const at = src.indexOf(needle);
      expect(at, `${needle} a disparu`).toBeGreaterThan(0);
      const before = src.slice(Math.max(0, at - 500), at);
      expect(before, `${needle} est devenu réservé au maître`)
        .not.toContain("viewerIsOwner");
    }
  });
});

describe("la vue d'un membre: sa ligne, et les autres en pastilles", () => {
  it("la branche non-maître monte `MemberRow` sur SA ligne seulement", () => {
    const at = src.indexOf("if (!isOwner) {");
    expect(at).toBeGreaterThan(0);
    const branch = src.slice(at, src.indexOf("</Card>", at));
    expect(branch, "sa propre ligne n'est pas éditable")
      .toContain("m.memberId === me?.memberId");
    expect(branch, "la ligne est montée sans la garde de droits")
      .toContain("viewerIsOwner={false}");
    expect(branch, "les autres lignes ne sont plus des pastilles")
      .toContain("<MemberBadges");
  });

  /**
   * ⛔ IL NE REÇOIT PAS UN CORPS « LU ET VIDE ». `body={null}` seul voudrait
   * dire « lu, cette bouche n'a pas de corps » — un fait qu'il n'a pas. Ce qui
   * retire le bloc est la garde, et c'est elle qu'on vérifie ici.
   */
  it("aucun cadre « personne n'a de corps » ne lui est rendu", () => {
    const at = src.indexOf("if (!isOwner) {");
    const branch = src.slice(at, src.indexOf("</Card>", at));
    expect(branch).toContain("body={null}");
    expect(branch).toContain("viewerIsOwner={false}");
  });
});

describe("⟳ la dette d'A6 est payée ici, et pas ailleurs", () => {
  /**
   * L'effet qui lit les réponses du déjeuner était keyé sur
   * `meRole === "owner"`. C'était JUSTE tant qu'un non-maître ne voyait aucune
   * fiche. Le point 6 ouvre sa ligne: sans ce changement, sa propre carte
   * resterait sur « Lecture… » pour toujours — la lecture n'aurait jamais lieu,
   * et la porte de chargement, qui a raison, ne rendrait aucune question.
   *
   * ⚠️ LA PORTE D'ÉCRITURE N'A PAS BOUGÉ:
   * `keel_household_set_member_work_lunch` répond `not_your_line` à qui vise la
   * ligne d'un autre, et c'est elle qui décide — pas cet effet.
   */
  it("la lecture du déjeuner n'est plus réservée au maître", () => {
    expect(src, "l'effet est encore keyé sur le rôle")
      .not.toMatch(/if \(meRole !== "owner"\) return;/);
    expect(src).toContain("const meMemberId = household?.me?.memberId ?? null;");
    expect(src).toContain("if (meMemberId === null) return;");
  });
});
