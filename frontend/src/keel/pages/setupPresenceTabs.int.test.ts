import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// ===========================================================================
// « QUI EST LÀ ? JOUR PAR JOUR » — UNE ENTRÉE PAR BOUCHE, 2026-09-20
// ===========================================================================
//
// ── LE DÉFAUT, SIGNALÉ À L'ÉCRAN ──────────────────────────────────────────
// « J'ai renseigné 3 personnes, et sur l'étape 3, quand je clique sur "Qui est
// là ? Jour par jour", je ne vois que le planning du compte maître. » C'était
// exact: ce lien n'a jamais ouvert que `practical_constraints.away_days`, la
// grille du titulaire. Les deux autres bouches n'avaient aucune entrée.
//
// ⚠️ ON LIT LA SOURCE, ET C'EST ASSUMÉ. `SetupPage` entier ne se monte pas
// sous `renderToStaticMarkup` (voir `ownAccountCards.int.test.ts`), et c'est
// le seul moyen d'attraper un DÉBRANCHEMENT: trois props parfaitement typées
// que plus personne ne lit restent vertes pour toujours — elles l'ont d'ailleurs
// été du 2026-09-08 à ce lot.
// ===========================================================================

const SRC = readFileSync(new URL("./SetupPage.tsx", import.meta.url), "utf8");

/** La source SANS ses commentaires: le dépôt en écrit plus que de code. */
const CODE = SRC
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((l) => !l.trim().startsWith("//"))
  .join("\n");

describe("l'étape 3 ouvre la présence de CHAQUE bouche", () => {
  it("les trois props du roster sont LUES, pas seulement passées", () => {
    // Elles étaient déjà dans le type et dans le montage; la destructuration
    // les ignorait. C'est exactement à quoi ressemble un bloc retiré dont
    // personne n'a nettoyé les fils — et c'est pour ça que le rebrancher n'a
    // demandé aucune nouvelle plomberie.
    const step = CODE.slice(CODE.indexOf("function RequestStep({"));
    const head = step.slice(0, step.indexOf("}: {"));
    for (const prop of ["awayFor", "onAwayFor", "onAwaySaved"]) {
      expect(head, `\`${prop}\` n'est pas destructurée`).toContain(prop);
    }
  });

  it("une bouche a sa PROPRE grille, et elle écrit dans SA colonne", () => {
    // ⛔ D14 — DEUX SOURCES QUI NE FUSIONNENT JAMAIS. Le titulaire déclare pour
    // lui-même (`practical_constraints.away_days`, `onSelfAwaySaved`); une
    // autre bouche est déclarée PAR le maître (`household_members.away_days`,
    // `onAwaySaved`). Une grille nourrie de l'union recopierait la déclaration
    // de l'un dans la colonne de l'autre, où elle survivrait à sa rétractation.
    expect(CODE).toContain("onSave={(next) => onAwaySaved(m, next)}");
    expect(CODE).toContain("away={m.away}");
    // ET LE COMPTEUR SUIT LA MÊME SÉPARATION: `selfAway` pour le titulaire,
    // sa ligne du roster pour les autres. Le confondre afficherait sous la
    // pastille « moi » un nombre que sa propre grille ne montre pas.
    expect(CODE).toContain("const marks = isSelf ? selfAway : m.away;");
  });

  it("⛔ les moments d'une bouche, sinon ceux de la maison — jamais `[]`", () => {
    // `eatingSlots === null` veut dire « aux moments de la maison », jamais
    // « ne mange pas ». Passer `[]` rendrait une grille SANS LIGNE: un contrôle
    // ouvert sur du vide, qu'on ne peut ni lire ni utiliser.
    expect(CODE).toContain("const slots = m.eatingSlots ?? rhythm;");
  });

  it("⛔ À UNE SEULE BOUCHE, LE LIEN D'AVANT — et c'est la moitié du lot", () => {
    // Le bloc par bouche avait été retiré le 2026-09-08 parce qu'en solo il
    // rendait UNE ligne ouvrant la MÊME grille que le lien: deux entrées pour
    // un geste. Ce motif ne vaut que pour le solo; la condition est donc ce
    // qui empêche ce lot de rouvrir le défaut qu'on avait fermé.
    expect(CODE).toContain("{mouths.length > 1 && (");
    expect(CODE).toContain("onClick={() => onSelfPicker(true)}");
  });

  it("⛔ LE TITULAIRE GARDE UNE PORTE MÊME SANS PASTILLE", () => {
    // `presenceRoster` ne l'ajoute que si `ownMemberId` est lu. Écrit en
    // ternaire — rangée OU lien —, le cas « roster à plusieurs, titulaire pas
    // encore dedans » laissait la personne qui remplit le formulaire sans
    // aucun geste pour ouvrir sa propre semaine.
    expect(CODE).toContain("{selfHasTab ? null : (");
    // ⛔ ET LA SENTINELLE EXIGE UN `memberId` NON NUL. Une bouche pas encore
    // inscrite en porte un `null`; `null === null` en ferait le titulaire,
    // donc deux grilles sur la même colonne pour deux personnes.
    expect(CODE).toContain("m.memberId !== null && m.memberId === selfMemberId");
  });

  it("UN SEUL COMPTEUR pour la pastille et pour le lien", () => {
    // Deux corps de calcul écrits séparément finissent par afficher deux
    // nombres pour la même semaine — c'est écrit dans ce fichier depuis que le
    // lien existe, et ça reste vrai maintenant qu'il y a N pastilles.
    expect(CODE).toContain("function awayMomentsIn(");
    expect(
      (CODE.match(/awayMomentsIn\(/g) ?? []).length,
      "le compteur est appelé ailleurs qu'aux deux endroits attendus",
    ).toBe(3); // la déclaration, la pastille, le lien du solo
    // ⛔ ET PLUS AUCUNE FORMULE EN LIGNE: l'ancienne vivait dans le `useMemo`
    // du lien, et c'est elle qu'on vient de remplacer.
    expect(CODE).not.toContain("a.slots.length === 0 ? rhythm.length");
  });
});
