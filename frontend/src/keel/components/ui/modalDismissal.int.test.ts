import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ===========================================================================
// COMMENT ON SORT D'UNE FENÊTRE — et ce que ça coûte quand on en sort par
// accident.
//
// ⛔ LE DÉFAUT QUE CE FICHIER FERME, SIGNALÉ À L'ÉCRAN LE 2026-09-07:
// « lors de la preview draft onboarding, quand tu cliques ou que tu fais un
// mouvement d'écran, ça supprime la preview ». Deux causes, pas une:
//
//   1. Le voile fermait sur tout `click` dont la CIBLE était lui. Or un
//      navigateur émet `click` sur le plus proche ancêtre commun du
//      `pointerdown` et du `pointerup`: presser DANS le dialogue et relâcher
//      sur le voile — sélectionner du texte, faire défiler à la souris, tirer
//      l'écran au doigt — donne le voile pour cible. Le commentaire d'à côté
//      promettait pourtant que le test de cible couvrait ce cas.
//   2. Cet aperçu-là ne se ROUVRE PAS: `setDraftOpen(true)` n'a qu'un
//      appelant, le chemin de composition. Refermer ne range pas le
//      brouillon, ça oblige à en recomposer un — un tour de modèle — et
//      l'effet d'ouverture de `PlanDraftDialog` remet les reprises à zéro.
//
// ⚠️ CE TEST LIT LA SOURCE, PAS LE COMPORTEMENT, ET C'EST DIT ICI PLUTÔT QUE
// SOUS-ENTENDU. La suite tourne en `environment: "node"` (`vitest.config.ts`)
// et le patron de rendu du dépôt est `renderToStaticMarkup`, qui n'exécute ni
// les effets ni les gestionnaires d'événement: aucun test d'ici ne peut
// appuyer sur Échap. Ce qui rend la lecture de source suffisante: chacune des
// trois règles ci-dessous est UNE LIGNE de garde dans un fichier de 250
// lignes, et sa disparition est exactement la régression qu'on craint.
//
// ⚠️ COMMENTAIRES RETIRÉS AVANT TOUTE MESURE. Ce dépôt écrit des pavés qui
// NOMMENT la règle pour l'expliquer: les lire comme du code ferait passer le
// test sur sa propre justification.
// ===========================================================================

const read = (rel: string) => readFileSync(resolve(__dirname, rel), "utf8");

const bare = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => (line.trimStart().startsWith("//") ? "" : line))
    .join("\n");

const MODAL = bare(read("./Modal.tsx"));
const DRAFT = bare(read("../plan/PlanDraftDialog.tsx"));

describe("le voile ne ferme que sur un geste qui lui appartient EN ENTIER", () => {
  it("⛔ le geste doit COMMENCER sur le voile (`pointerdown`)", () => {
    // Sans ce drapeau, presser dans le dialogue et relâcher sur le fond ferme
    // la fenêtre — le défaut signalé, mot pour mot.
    expect(MODAL).toMatch(/onPointerDown=\{\(e\) =>\s*\{\s*pressStartedOnVeil\.current = e\.target === e\.currentTarget;/);
  });

  it("⛔ ET FINIR sur le voile (`pointerup`) — le cas miroir du téléphone", () => {
    // La fenêtre est collée en bas sous `sm` (`items-end`): il y a du voile
    // AU-DESSUS d'elle, et un doigt parti de là pour faire défiler la feuille
    // finit dans le dialogue.
    expect(MODAL).toMatch(/onPointerUp=\{\(e\) =>\s*\{\s*if \(e\.target !== e\.currentTarget\) pressStartedOnVeil\.current = false;/);
    expect(MODAL, "le voile est en bas sous `sm`, donc le cas miroir existe")
      .toMatch(/items-end/);
  });

  it("⛔ et le `click` exige LES DEUX, pas seulement la cible", () => {
    const handler = MODAL.slice(MODAL.indexOf("onClick={(e) => {"));
    expect(handler).toMatch(/const started = pressStartedOnVeil\.current;/);
    expect(handler).toMatch(/if \(!started \|\| e\.target !== e\.currentTarget\) return;/);
  });

  it("⚠️ LE DRAPEAU EST DÉSARMÉ À CHAQUE `click`, y compris sur une sortie hâtive", () => {
    // La remise à zéro doit précéder tout `return`: la laisser après ferait
    // porter un geste au geste suivant, et une fenêtre se fermerait sur un
    // clic qui n'a jamais touché le voile.
    const handler = MODAL.slice(MODAL.indexOf("onClick={(e) => {"));
    const reset = handler.indexOf("pressStartedOnVeil.current = false;");
    const firstReturn = handler.indexOf("return;");
    expect(reset, "le drapeau n'est plus remis à zéro").toBeGreaterThan(-1);
    expect(reset, "un `return` passe avant la remise à zéro").toBeLessThan(firstReturn);
  });
});

describe("`closeOnlyByButton` — la sortie est une décision, pas un réflexe", () => {
  it("⛔ il est OPT-IN: sans lui, le voile et Échap ferment comme avant", () => {
    // Une liste de courses rouverte est la même liste. Le durcissement ne doit
    // pas se répandre sur les fenêtres qui se referment sans conséquence.
    expect(MODAL).toMatch(/closeOnlyByButton = false,/);
  });

  it("⛔ il coupe ÉCHAP", () => {
    expect(MODAL).toMatch(/if \(!open \|\| closeOnlyByButton\) return;/);
    // La prémisse: c'est bien l'effet d'Échap qu'il garde, et pas un autre.
    const gate = MODAL.indexOf("if (!open || closeOnlyByButton) return;");
    const key = MODAL.indexOf('e.key === "Escape"');
    expect(key, "la garde ne protège plus la touche Échap").toBeGreaterThan(gate);
    expect(MODAL.slice(gate, key), "un autre effet s'est glissé entre les deux")
      .not.toMatch(/React\.useEffect/);
  });

  it("⛔ il coupe LE VOILE", () => {
    const handler = MODAL.slice(MODAL.indexOf("onClick={(e) => {"));
    expect(handler).toMatch(/if \(closeOnlyByButton\) return;/);
  });

  it("⛔ MAIS IL NE TOUCHE PAS AU VERROU DE DÉFILEMENT", () => {
    // ══════════════════════════════════════════════════════════════════════
    // LA GARDE LA PLUS FACILE À CASSER SANS S'EN APERCEVOIR.
    // ══════════════════════════════════════════════════════════════════════
    //
    // Le verrou partageait un effet avec Échap (« les deux moitiés du même
    // contrat »). Y ajouter `closeOnlyByButton` aurait retiré le verrou à la
    // seule fenêtre qui ne peut PAS se fermer d'un geste — donc la page se
    // serait mise à défiler derrière un dialogue dont on ne sort que par un
    // bouton. On vérifie que l'effet du verrou ne connaît pas la prop.
    const lock = MODAL.indexOf('document.body.style.overflow = "hidden"');
    expect(lock, "le verrou de défilement a disparu").toBeGreaterThan(-1);
    const start = MODAL.lastIndexOf("React.useEffect", lock);
    const end = MODAL.indexOf("}, [", lock);
    const effect = MODAL.slice(start, end);
    expect(effect, "le verrou de défilement est devenu conditionnel")
      .not.toMatch(/closeOnlyByButton/);
    expect(effect, "le verrou ne restaure plus la valeur précédente")
      .toMatch(/const previous = document\.body\.style\.overflow;/);
  });
});

describe("l'aperçu de brouillon EST la fenêtre qui en a besoin", () => {
  it("⛔ `PlanDraftDialog` passe `closeOnlyByButton`", () => {
    expect(DRAFT).toMatch(/closeOnlyByButton/);
  });

  it("⛔ et sa sortie porte le mot du RENONCEMENT, pas « fermer »", () => {
    // Une fenêtre dont on ne sort que par un bouton doit dire ce que ce bouton
    // fait. « Fermer » sur un brouillon qu'aucun écran ne rouvre serait le
    // même mensonge que le voile, en plus lent.
    expect(DRAFT).toMatch(/closeLabel=\{t\("plan\.draft\.discard"\)\}/);
  });

  it("⚠️ LA PRÉMISSE DU COÛT: rien d'autre ne rouvre un brouillon", () => {
    // Si un jour un écran rouvre l'aperçu sans recomposer, le durcissement
    // ci-dessus perd son motif et pourra être retiré. Ce test dit où regarder:
    // `setDraftOpen(true)` n'a qu'un appelant, le chemin de composition.
    const setup = bare(read("../../pages/SetupPage.tsx"));
    const opens = setup.match(/setDraftOpen\(true\)/g) ?? [];
    expect(opens.length, "un second chemin ouvre l'aperçu: relire le motif")
      .toBe(1);
  });
});
