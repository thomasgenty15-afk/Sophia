import { describe, expect, it } from "vitest";
import { sourceFamily } from "../../test/sourceFamily";

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
  return sourceFamily(new URL(rel, import.meta.url))
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
   *
   * ⛔ CE CAS A MENTI PAR SON NOM, ET ÇA A COÛTÉ UN DÉFAUT LIVRÉ. Il s'appelait
   * « … le retrait … sont gardés » — au singulier trompeur: il y a DEUX
   * retraits, `remove` (détruire la ligne) et `detach` (retirer l'accès), et
   * il ne listait que le premier. `detach` n'était donc gardé nulle part, et un
   * membre réclamé lisait sur sa propre ligne un bouton « Retirer son accès »
   * que `keel_household_detach_member` refuse `not_owner`.
   *
   * ⚠️ LES DEUX SONT NOMMÉS SÉPARÉMENT CI-DESSOUS, et le nom du cas les compte.
   * Une liste-garde ne garde que ce qu'elle NOMME (cicatrice
   * `named-gate-lists-only-guard-what-they-name`).
   *
   * ⚠️ ET UNE LECTURE DE SOURCE NE SUFFISAIT PAS À LE TROUVER: le défaut a été
   * vu en MONTANT le composant et en lisant son HTML. Ce cas-ci garde le
   * câblage; c'est `memberAccess.int.test.ts` qui garde le RENDU.
   */
  it("les six blocs `not_owner` sont gardés, LES DEUX RETRAITS COMPRIS", () => {
    const gated: [string, string][] = [
      ["le corps", "<BodyFields"],
      // ⟳ 2026-09-19 — LE RÉGIME N'A PLUS DE BLOC À LUI: c'est une SECTION de
      // la fiche partagée (`MouthPreferencesFields`), avec les allergies et
      // les dégoûts. La garde n'a pas disparu, elle a changé de porteur — et
      // c'est `sharedSheet` qui la porte, mesuré juste en dessous.
      ["la fiche de goûts", "<MouthPreferencesFields"],
      ["les allergies et règles", 't("household.constraint.kind")'],
      ["retirer du foyer (`remove`)", 't("household.member.remove")'],
      // ⛔ CELUI QUI MANQUAIT. Il vit dans `MemberAccess`, en-tête de la ligne.
      ["retirer l'accès (`detach`)", 't("household.member.detach")'],
      ["le réglage de fusion", 't("household.merge.mute")'],
    ];
    // ⚠️ ON LIT `MemberRow`, PAS LE FICHIER: `MePrefsForm` (la fenêtre du
    // titulaire) monte la MÊME fiche de goûts et il est écrit AVANT dans le
    // fichier. Un `indexOf` global viserait la sienne — qui n'est pas gardée
    // par `viewerIsOwner`, et pour cause: cette fenêtre-là n'est rendue qu'au
    // maître, par construction.
    const row = src.slice(src.indexOf("function MemberRow("));
    for (const [name, needle] of gated) {
      // ⚠️ DEUX PORTÉES, ET CHACUNE EST UN FAIT DU FICHIER: « Retirer l'accès »
      // vit dans `MemberAccess`, écrit AVANT `MemberRow`; la fiche de goûts,
      // elle, doit être lue DANS la ligne. Une seule portée perdrait l'un ou
      // viserait l'autre.
      const scope = name === "la fiche de goûts" ? row : src;
      const at = scope.indexOf(needle);
      expect(at, `${name} a disparu de la fiche`).toBeGreaterThan(0);
      // ⚠️ LA FENÊTRE EST PLUS LARGE POUR LA FICHE DE GOÛTS: sa garde est le
      // ternaire qui ouvre la branche, et le composant porte une dizaine de
      // props nommées entre les deux. Un gabarit trop court dirait « pas
      // gardé » sur une garde qui tient.
      const span = name === "la fiche de goûts" ? 2500 : 700;
      const before = scope.slice(Math.max(0, at - span), at);
      expect(before, `${name} n'est pas derrière \`viewerIsOwner\``)
        .toContain(name === "la fiche de goûts" ? "{sharedSheet" : "viewerIsOwner");
    }
    // ⛔ ET `sharedSheet` EST BIEN `viewerIsOwner`, pas un alias qui a dérivé.
    // Sans cette ligne, la garde de la fiche de goûts serait « quelque chose
    // qui s'appelle sharedSheet » — c'est-à-dire n'importe quoi.
    expect(src, "`sharedSheet` n'est plus la garde du maître")
      .toContain("const sharedSheet = viewerIsOwner;");
  });

  /**
   * ⛔ ET CE QUE LA BASE ACCEPTE N'EST PAS GARDÉ. Sans ce cas, retirer TOUT
   * derrière `viewerIsOwner` passerait le cas ci-dessus — une garde qui bloque
   * tout ressemble à une garde qui marche.
   */
  it("ses habitudes ne sont PAS derrière la garde", () => {
    // ⟳ 2026-09-19 — `<MemberWorkLunchCard` A QUITTÉ CETTE PAGE avec les trois
    // autres blocs que la fiche posait en plus de ses deux moitiés. La question
    // se pose toujours, dans l'entonnoir (`SetupPage`), et sa porte d'écriture
    // n'a pas bougé. Ce qui est gardé ici reste le PARTAGE DE DROITS, sur le
    // bloc qui reste: un membre écrit ses habitudes sur sa propre ligne.
    const at = src.indexOf("<HouseholdHabitsCard");
    expect(at, "<HouseholdHabitsCard a disparu").toBeGreaterThan(0);
    const before = src.slice(Math.max(0, at - 500), at);
    expect(before, "<HouseholdHabitsCard est devenu réservé au maître")
      .not.toContain("viewerIsOwner");
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

/**
 * ⟳ 2026-09-19 — LE CAS « LA DETTE D'A6 » A ÉTÉ RETIRÉ AVEC SON SUJET.
 *
 * Il gardait l'effet qui LIT les réponses du déjeuner en semaine: keyé sur
 * `meRole === "owner"`, un membre réclamé restait sur « Lecture… » pour
 * toujours. `/app/household` ne pose plus cette question — la fiche est deux
 * fenêtres, et rien d'autre (décision du 2026-09-19) —, donc la page ne lit
 * plus `household_member_work_lunch` du tout.
 *
 * ⛔ LA QUESTION N'EST PAS MORTE: elle vit dans l'entonnoir (`SetupPage`), et
 * sa porte SQL (`keel_household_set_member_work_lunch`, `not_your_line`) n'a
 * pas bougé. Ce qui est parti est le second endroit où on la posait.
 */

describe("FF-066 lot 4 — « Retirer du foyer » demande une confirmation", () => {
  it("le premier clic ouvre la confirmation, seul le second efface", () => {
    // ⛔ LE DÉFAUT QU'ON FERME: le bouton appelait `onRemove` au premier clic,
    // et la base effaçait la ligne (sa part, ses allergies, ses règles de
    // maison) sans retour possible — alors que le commentaire du bouton
    // promettait « une confirmation en deux temps ».
    const row = src.slice(src.indexOf("function MemberRow("));
    const first = row.indexOf('t("household.member.remove")');
    expect(first, "le bouton « Retirer du foyer » a disparu").toBeGreaterThan(0);
    const firstButton = row.slice(Math.max(0, first - 200), first);
    expect(firstButton).toContain("onClick={() => setConfirmRemove(true)}");
    expect(firstButton).not.toContain("onClick={onRemove}");
    const yes = row.indexOf('t("household.member.remove_confirm_yes")');
    expect(yes, "le bouton de confirmation a disparu").toBeGreaterThan(first);
    expect(row.slice(Math.max(0, yes - 300), yes)).toContain("onRemove();");
    // Et `onRemove` n'est appelé nulle part ailleurs dans la ligne.
    expect(row.split("onRemove()").length - 1).toBe(1);
  });
});
