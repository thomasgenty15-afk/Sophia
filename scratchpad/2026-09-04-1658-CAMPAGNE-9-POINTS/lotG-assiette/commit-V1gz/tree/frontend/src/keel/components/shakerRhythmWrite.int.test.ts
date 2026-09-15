import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ===========================================================================
// LE MOMENT DU SHAKER TRAVERSE DEUX CHEMINS D'ÉCRITURE — 2026-09-01
//
// ⛔ LE DÉFAUT QUE CE FICHIER GARDE, et il n'a pas de symptôme visible.
// Choisir un moment que la personne n'a pas coché AJOUTE ce moment à son
// rythme. Mais le rythme et le shaker ne sont pas écrits par le même bouton:
//
//   · le rythme  → `saveEatingRhythm` (compte) / `setMemberRhythm` (bouche),
//                  via le bouton de la FICHE;
//   · le shaker  → `addShakerTo…Intakes`, via SON PROPRE bouton.
//
// Sans écriture conjointe, appuyer sur « enregistrer » du shaker envoyait
// l'apport en base et laissait la case ajoutée dans le brouillon. Résultat en
// base: un shaker posé sur un moment où la personne ne mange pas. Rien à
// l'écran ne l'aurait dit.
//
// ── CE QUE CE FICHIER PEUT PROUVER, ET CE QU'IL NE PEUT PAS ────────────────
// Ce dépôt n'a ni jsdom ni testing-library (`environment: "node"`): aucun test
// ici ne peut CLIQUER sur le bouton. On lit donc la source, en visant une
// forme de régression NOMMÉE — et en sachant qu'un test de source ment plus
// facilement qu'un test de valeur.
//
// ⚠️ ET LE COMPILATEUR NE COUVRE PAS CE TROU: TypeScript accepte une fermeture
// déclarée à UN argument là où DEUX sont fournis. Retirer `rhythm` d'un site de
// montage compile sans un mot. C'est très exactement pourquoi ce fichier
// existe.
// ===========================================================================

const DIALOG = readFileSync(resolve(__dirname, "./MouthFormDialog.tsx"), "utf8");
const SETUP = readFileSync(
  resolve(__dirname, "../pages/SetupPage.tsx"),
  "utf8",
);

describe("le bloc du shaker rend les deux faits", () => {
  it("son bouton d'enregistrement porte le rythme", () => {
    expect(DIALOG).toMatch(/onSave\(shaker, rhythm\)/);
    // La forme de régression: revenir à un seul argument.
    expect(DIALOG).not.toMatch(/onSave\(shaker\)/);
  });

  it("le moment se pose par le PARENT, jamais par le bloc", () => {
    // Le rythme n'appartient pas au shaker: l'écrire depuis le bloc ferait un
    // second écrivain sur un champ qui en a déjà un.
    expect(DIALOG).toMatch(/onSlot\(e\.target\.value\)/);
    expect(DIALOG).not.toMatch(/set\(\{ slot:/);
  });

  it("l'ajout automatique respecte l'ordre de la journée", () => {
    // ⚠️ `EATING_OCCASIONS.filter(...)`, jamais un `push`: deux ordres pour une
    // même liste feraient deux affichages du même rythme. Même règle que la
    // case à cocher juste au-dessus.
    const at = DIALOG.indexOf("onSlot={(slot) => {");
    expect(at).toBeGreaterThan(-1);
    const body = DIALOG.slice(at, at + 1400);
    expect(body).toMatch(/EATING_OCCASIONS\s*\n?\s*\.filter/);
    expect(body).toMatch(/s === slot \|\| current\.some/);
  });
});

describe("les deux portes d'écriture", () => {
  it("le site de montage passe les DEUX arguments, explicitement", () => {
    expect(SETUP).toMatch(/\(shaker, rhythm\) => guard\(\(\) => saveOwnShaker\(shaker, rhythm\)\)/);
    // ⟳ 2026-09-01 — LE SITE A DÉMÉNAGÉ DANS `shakerPortFor`, et la bouche y
    // est nommée `target` et non plus `prefsFor`. Ce que ce test garde n'a pas
    // bougé d'un pouce: les DEUX arguments sont passés à la main. TypeScript
    // accepte une fermeture à UN argument là où DEUX sont fournis — le rythme
    // se perdrait donc en silence, et le seul symptôme serait un shaker en
    // base sur un moment où la personne ne mange pas.
    expect(SETUP).toMatch(
      /saveMemberShaker\(target\.memberId, shaker, rhythm\)/,
    );
  });

  it("⛔ LE TITULAIRE RELIT ENTRE SES DEUX ÉCRITURES", () => {
    // `fixed_intakes` et `eating_rhythm` vivent dans le MÊME jsonb: réutiliser
    // la photo d'avant écraserait le shaker qu'on vient d'écrire. C'est la
    // cicatrice `stale-current-erases-the-previous-write`, à quatre lignes
    // d'intervalle de l'endroit où elle est déjà nommée.
    const at = SETUP.indexOf("function saveOwnShaker(");
    expect(at).toBeGreaterThan(-1);
    const body = SETUP.slice(at, at + 2600);
    const shakerWrite = body.indexOf("addShakerToOwnIntakes");
    const reread = body.indexOf("const after = await readFunnelFacts(userId)");
    const rhythmWrite = body.indexOf("saveEatingRhythm");
    expect(shakerWrite).toBeGreaterThan(-1);
    expect(reread).toBeGreaterThan(shakerWrite);
    expect(rhythmWrite).toBeGreaterThan(reread);
  });

  it("la bouche écrit sa ligne, et n'a PAS besoin de relire", () => {
    // Deux colonnes distinctes ici: aucun jsonb partagé, donc aucune relecture
    // à intercaler. En ajouter une ferait croire, en relecture, que le danger
    // existe des deux côtés.
    const at = SETUP.indexOf("function saveMemberShaker(");
    expect(at).toBeGreaterThan(-1);
    const body = SETUP.slice(at, at + 2200);
    expect(body).toMatch(/setMemberRhythm\(memberId, rhythm\)/);
    expect(body).not.toMatch(/readFunnelFacts/);
  });

  it("⛔ NI L'UN NI L'AUTRE NE REMET LE RYTHME À ZÉRO", () => {
    // Ce bouton n'est pas le propriétaire du rythme — celui de la FICHE l'est.
    // Sa seule raison d'y toucher est qu'un moment a PU s'y ajouter, et un
    // ajout produit toujours une liste non vide. Écrire `[]` ou `null` d'ici
    // supprimerait une déclaration faite ailleurs, pour un geste qui parlait
    // d'un shaker.
    for (const fn of ["function saveOwnShaker(", "function saveMemberShaker("]) {
      const at = SETUP.indexOf(fn);
      const body = SETUP.slice(at, at + 2600);
      expect(body, fn).toMatch(/if \(rhythm && rhythm\.length > 0\)/);
    }
  });
});

// ===========================================================================
// 2026-09-01 — LA FICHE D'AJOUT COLLECTE LE SHAKER, ET QUELQU'UN L'ÉCRIT
//
// ⛔ LE DÉFAUT QUE CE BLOC GARDE EST LE PIRE DES DEUX. Rendre le champ visible
// sur la fiche d'ajout sans écrivain derrière est STRICTEMENT pire que de
// l'avoir caché: on demande ses protéines et ses calories à quelqu'un, et on
// les jette avant la base — sans un refus, sans un mot. C'est le mode d'échec
// n°1 de ce dépôt, et c'est exactement ce que le lot du 2026-08-19 avait déjà
// soldé pour le titulaire.
//
// ⚠️ TESTS DE SOURCE, ET C'EST LE BON OUTIL ICI — même argument que
// `api/eatingRhythm.int.test.ts`. Ce qu'on protège n'est pas une valeur
// calculée mais une FRONTIÈRE D'ÉCRITURE: quelle fonction a le droit de
// toucher quel stock, et sous quelle condition. `SetupPage` entier ne se monte
// pas (session, routeur, deux appels modèle).
// ===========================================================================

/** La source, PRIVÉE DE SES COMMENTAIRES — cicatrice `caller-audit-must-strip-comments`. */
function stripComments(src: string): string {
  return src
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

/** Le corps d'une fonction, jusqu'à son accolade de premier niveau. */
function bodyOf(src: string, decl: string): string {
  const at = src.indexOf(decl);
  expect(at, `${decl} est introuvable`).toBeGreaterThan(-1);
  const rest = src.slice(at);
  const end = rest.indexOf("\n  }\n");
  expect(end, `la fin de ${decl} est introuvable`).toBeGreaterThan(-1);
  return rest.slice(0, end);
}

describe("2026-09-01 · le shaker d'une bouche a un écrivain sur le chemin de l'ajout", () => {
  const CLEAN = stripComments(SETUP);

  it("`writeMouthPreferences` écrit le shaker — sinon le champ est décoratif", () => {
    const body = bodyOf(CLEAN, "async function writeMouthPreferences(");
    expect(body, "le shaker collecté à l'ajout est jeté avant la base")
      .toContain("addShakerToMemberIntakes");
    // ⚠️ LES TROIS CAS QUI PASSENT — sans eux, une fonction qui n'écrirait QUE
    // le shaker passerait la ligne du dessus. Ce sont les quatre portes clées
    // sur `member_id` que cette fonction porte déjà.
    // ⟳ LOT C — `addRestriction` est devenue `writtenDislikeWriter`: le champ
    // « Aliments refusés » écrit une PRÉFÉRENCE (`food.exclude` dans
    // `retained_items`), plus un interdit de maison.
    for (const door of ["setMemberHabits", "writtenDislikeWriter", "setMemberRhythm"]) {
      expect(body, `${door} a disparu de l'écrivain des préférences`)
        .toContain(door);
    }
  });

  it("⛔ il relit AVANT d'écrire — la porte remplace le tableau entier", () => {
    // `keel_household_set_member_fixed_intakes` POSE la liste complète.
    // Écrire sans relire effacerait un second apport sur une fiche qu'on
    // reprend. Cicatrice `stale-current-erases-the-previous-write`.
    const body = bodyOf(CLEAN, "async function writeMouthPreferences(");
    const read = body.indexOf("loadMemberFixedIntakes");
    const write = body.indexOf("addShakerToMemberIntakes");
    expect(read, "aucune relecture avant l'écriture").toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(read);
  });

  it("⛔ et il SAUTE une bouche qui a un compte", () => {
    // Le lecteur du moteur choisit sa source par `userId`: pour une bouche AVEC
    // compte il lit `student_goals`, jamais sa ligne membre. Écrire ici la
    // poserait dans une colonne que rien ne relit — écrite, accusée, invisible.
    // C'est la même coupure que le régime et le rythme, deux lignes plus haut.
    const body = bodyOf(CLEAN, "async function writeMouthPreferences(");
    const at = body.indexOf("addShakerToMemberIntakes");
    // La condition qui GOUVERNE cette écriture, pas n'importe quel `!claimed`
    // du corps: on regarde les 400 caractères qui la précèdent.
    expect(
      body.slice(Math.max(0, at - 400), at),
      "l'écriture du shaker ne dépend plus de `claimed`",
    ).toMatch(/!claimed && draft\.shaker !== null/);
  });

  it("le port du shaker distingue les trois sujets", () => {
    const body = bodyOf(CLEAN, "function shakerPortFor(");
    // La fiche d'ajout COLLECTE — c'est la correction du 2026-09-01.
    expect(body, "la fiche d'ajout ne collecte plus le shaker")
      .toMatch(/kind === "new"\) return \{ kind: "with_the_card" \}/);
    // Une bouche qui a réclamé son compte n'a pas de stock lisible ICI.
    expect(body, "on réécrit dans la colonne que le moteur ne relit pas")
      .toMatch(/claimed\) return \{ kind: "none" \}/);
    // ⚠️ LE CAS QUI PASSE: le titulaire et la bouche sans compte gardent leur
    // bouton. Sans cette ligne, un `shakerPortFor` qui rendrait `none` partout
    // passerait les deux assertions du dessus.
    expect(body).toContain("saveOwnShaker");
    expect(body).toContain("saveMemberShaker");
  });
});
