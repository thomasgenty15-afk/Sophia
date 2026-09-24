import { describe, expect, it } from "vitest";
import { sourceFamily } from "../../test/sourceFamily";

// ===========================================================================
// « QUI MANGE À LA MAISON » À L'ÉTAPE 3 — UNE LIGNE PAR BOUCHE
// ===========================================================================
//
// ── L'HISTOIRE ─────────────────────────────────────────────────────────────
// 2026-09-20: « j'ai renseigné 3 personnes, et sur l'étape 3 je ne vois que le
// planning du compte maître ». Réparé par une pastille par bouche.
// ⟳ 2026-09-23: les pastilles laissent la place à la liste de `/app/plan`
// (une ligne par personne, son état, « Absence », « Modifier »), montée par
// le formulaire commun `PlanRequestFields`. Le rendu de la liste est testé
// dans `components/planRequestPresence.int.test.ts`; ici, on lit comment
// l'entonnoir construit ses lignes.
//
// ⚠️ ON LIT LA SOURCE, ET C'EST ASSUMÉ. `SetupPage` entier ne se monte pas
// sous `renderToStaticMarkup` (voir `ownAccountCards.int.test.ts`).
// ===========================================================================

const SRC = sourceFamily(new URL("./SetupPage.tsx", import.meta.url));

/** La source SANS ses commentaires: le dépôt en écrit plus que de code. */
const CODE = SRC
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((l) => !l.trim().startsWith("//"))
  .join("\n");

// ⟳ 2026-09-24 (lot 4b) — LA TRANCHE S'ARRÊTE À LA FIN DE LA FONCTION. Elle
// allait « jusqu'à la fin du fichier », ce qui ne prenait que l'étape et deux
// cartes. `RequestStep` vit maintenant dans `setup/RequestStep.tsx`, et
// `sourceFamily` range les modules AVANT la page: la même tranche aurait couru
// sur toute la page, où `away: m.away,` existe aussi — le cas D14 serait resté
// vert sans rien lire de l'étape. Tous les marqueurs cherchés dans `STEP` sont
// dans le corps de la fonction, avant comme après la découpe.
const STEP_AT = CODE.indexOf("function RequestStep({");
const STEP = CODE.slice(STEP_AT, CODE.indexOf("\n}\n", STEP_AT) + 2);

describe("l'étape 3 ouvre la présence de CHAQUE bouche", () => {
  it("les deux écrivains sont LUS, pas seulement passés", () => {
    const head = STEP.slice(0, STEP.indexOf("}: {"));
    for (const prop of ["selfAway", "onSelfAwaySave", "onMouthAwaySave"]) {
      expect(head, `\`${prop}\` n'est pas destructurée`).toContain(prop);
    }
    expect(STEP).toContain("presence={presence}");
  });

  it("⛔ D14 — une bouche écrit dans SA colonne, le titulaire dans la sienne", () => {
    // Le titulaire déclare pour lui-même (`practical_constraints.away_days`);
    // une autre bouche est déclarée PAR le maître (`household_members.
    // away_days`). Une ligne nourrie de l'union recopierait la déclaration de
    // l'un dans la colonne de l'autre, où elle survivrait à sa rétractation.
    expect(STEP).toContain("save: (next) => onMouthAwaySave(m, next),");
    expect(STEP).toContain("away: m.away,");
    expect(STEP).toMatch(/away: selfAway,\n\s+save: onSelfAwaySave,/);
    expect(CODE).toContain("onSelfAwaySave={saveSelfAway}");
    expect(CODE).toMatch(/onMouthAwaySave=\{async \(m, next\) => \{\n\s+const result = await setMemberAway\(/);
  });

  it("⛔ les moments d'une bouche, sinon ceux de la maison — jamais `[]`", () => {
    expect(STEP).toContain("slots: m.eatingSlots ?? rhythm,");
  });

  it("⛔ LE TITULAIRE GARDE SA LIGNE MÊME QUAND LE ROSTER NE LE PORTE PAS", () => {
    // `presenceRoster` ne l'ajoute que si `ownMemberId` est lu. Sans cette
    // ligne, la personne qui remplit le formulaire n'aurait aucun geste pour
    // ouvrir sa propre semaine.
    expect(STEP).toContain("return hasSelf ? rows : [selfRow(selfName), ...rows];");
    // ⛔ ET LA SENTINELLE EXIGE UN `memberId` NON NUL: `null === null` ferait
    // d'une bouche pas encore inscrite le titulaire.
    expect(STEP).toContain("m.memberId !== null && m.memberId === selfMemberId");
  });

  it("UN SEUL COMPTEUR, dans `lib/presenceAbsence.ts`", () => {
    // Deux corps de calcul écrits séparément finissent par afficher deux
    // nombres pour la même semaine.
    expect(CODE).not.toContain("function awayMomentsIn(");
    expect(CODE).not.toContain("a.slots.length === 0 ? rhythm.length");
  });
});
