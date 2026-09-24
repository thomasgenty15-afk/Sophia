/**
 * ⟳ 2026-09-20 — « AJUSTER LE PLAN », LA ZONE QUI S'OUVRE, ET LA BARRE COLLÉE.
 *
 * Trois demandes du même message, et elles tiennent ensemble:
 *   · « Refaire avec ça » devient « Ajuster le plan »;
 *   · les deux boutons restent visibles en bas, quel que soit le défilement;
 *   · le bouton ouvre la zone d'écriture, et c'est « Valider » qui envoie —
 *     visible dès que la personne a commencé à taper.
 *
 * ⚠️ CE FICHIER LIT LA SOURCE, comme `planDraftQuestion` et `planDraftEnergy`:
 * cette suite ne monte pas ce composant, et ce qui se tient ici est une
 * STRUCTURE (quel geste rend quoi, et où) que seul le texte expose.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { en } from "../../i18n/en";
import { fr } from "../../i18n/fr";

const RAW = readFileSync(new URL("./PlanDraftDialog.tsx", import.meta.url), "utf8");
const SRC = RAW
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

describe("la barre d'ajustement du brouillon", () => {
  it("le geste de gauche OUVRE, et un second ENVOIE", () => {
    // ⛔ DEUX LIBELLÉS POUR DEUX GESTES. Avant ce lot, un seul bouton portait
    // les deux rôles — il s'appelait « Refaire avec ça » et envoyait un champ
    // déjà ouvert. Un bouton qui ouvre et un bouton qui envoie ne peuvent pas
    // porter le même mot.
    expect(SRC).toContain("onClick={() => setNoteOpen(true)}");
    // ⟳ 2026-09-21 — LA MÊME CLÉ AUX DEUX TEMPS. « Valider » (`note_send`) a
    // été retirée: posée à côté de « Remplacer mon plan par celui-ci », elle
    // faisait deux mots de validation pour deux effets différents. Les deux
    // boutons ne sont jamais à l'écran en même temps.
    // ⟳ 2026-09-21 — SANS LES ACCOLADES: le bouton d'ENVOI ne rend plus la clé
    // nue, il rend `adjusting ? <ComposingLabel/> : t(...)`. C'est le lot qui
    // fait tourner LE BON bouton pendant les deux minutes de recomposition.
    // ⟳ 2026-09-24 — TROIS: le pied des plats barrés (« Remplacer ») porte le
    // même geste, « Ajuster le plan », qui remplace alors les plats barrés.
    // Les trois pieds sont exclusifs: jamais deux à l'écran en même temps.
    expect(SRC.split('t("plan.draft.remix")').length - 1).toBe(3);
    expect(SRC, "le bouton qui recompose ne dit pas qu'il travaille")
      .toContain("adjusting\n                ? <ComposingLabel progress={progress} />");
    expect(SRC).not.toContain("plan.draft.note_send");
    for (const dict of [en, fr] as const) {
      expect(dict).not.toHaveProperty("plan.draft.note_send");
    }
    expect(fr["plan.draft.remix"]).toBe("Ajuster le plan");
    expect(en["plan.draft.remix"]).toBe("Adjust the plan");
  });

  it("⛔ LE CHAMP VIT DANS LE PIED, ET NE S'OUVRE QUE SUR DEMANDE", () => {
    // ⟳ 2026-09-21 — IL ÉTAIT TOUT EN BAS DU CORPS, derrière une semaine de
    // plats: « la partie commentaire qui s'ouvre quand on clique sur ajuster,
    // c'est dans l'élément fixé ». Il est maintenant dans `footerActions`,
    // que `Modal` rend hors du conteneur qui défile.
    expect(SRC).toContain("React.useState(false)");
    const foot = SRC.indexOf("const footerActions = (");
    const ret = SRC.indexOf("return (\n    <Modal");
    const field = SRC.indexOf('id="plan-draft-note"');
    expect(foot, "le pied a disparu").toBeGreaterThan(0);
    expect(field, "le champ a disparu").toBeGreaterThan(0);
    expect(field, "le champ est retombé dans le corps")
      .toBeGreaterThan(foot);
    expect(field, "le champ est sorti du pied").toBeLessThan(ret);
    // ⛔ ET IL EST DERRIÈRE `noteOpen`: rendu toujours, il ferait un pied de
    // trois lignes à qui vient seulement adopter.
    expect(SRC.slice(foot, ret)).toContain("noteOpen\n      ? (");
  });

  it("« Valider » passe en primaire DÈS LA PREMIÈRE LETTRE", () => {
    // « bien visible dès que la personne a commencé à taper »: c'est la même
    // condition que celle qui l'arme, et pas un autre seuil — deux conditions
    // écrites séparément finiraient par montrer un bouton primaire désarmé.
    expect(SRC).toContain('variant={hasNote(note) ? "primary" : "secondary"}');
  });

  it("⛔ LA BARRE EST DANS LE **PIED** DE LA FENÊTRE, PAS DANS SON CORPS", () => {
    // ⟳ Premier jet: `sticky bottom-0` au bas du corps. Il ne collait à rien —
    // un élément collant ne sort jamais de son parent, et ce parent-là commence
    // APRÈS toute la semaine de plats. Mesuré sur capture: « je les vois pas
    // les boutons en bas, il faut que je scrolle tout en bas ».
    //
    // ⛔ C'EST L'ABSENCE DE `sticky` QUI EST TENUE ICI, autant que la présence
    // du pied: réessayer le collant dans le corps rendrait exactement le même
    // écran qu'avant le lot, et un test qui ne dirait que « il y a un pied »
    // resterait vert avec les deux.
    expect(SRC).toContain("footer={footerActions}");
    expect(SRC).toContain("const footerActions = (");
    expect(SRC).not.toContain("sticky bottom-0");
    expect(SRC).not.toContain('className="fixed bottom-0');
  });

  it("⛔ LE PIED DE `Modal` EST LE FRÈRE DU CONTENEUR QUI DÉFILE", () => {
    // La propriété vit dans `Modal`, pas ici: rendu DANS `overflow-y-auto`, le
    // pied défilerait avec le plan et ce lot n'aurait rien changé.
    const modal = readFileSync(
      new URL("../ui/Modal.tsx", import.meta.url),
      "utf8",
    );
    const body = modal.indexOf('className="min-h-0 flex-1 overflow-y-auto p-4"');
    const foot = modal.indexOf("{footer");
    expect(body, "le corps qui défile a changé de forme").toBeGreaterThan(0);
    expect(foot, "`Modal` ne rend pas de pied").toBeGreaterThan(body);
    // ⛔ `shrink-0`: dans une colonne flex, un pied sans lui se fait comprimer
    // par le corps (`flex-1`) au lieu de le borner — les boutons s'écrasent.
    expect(modal.slice(foot, foot + 400)).toContain("shrink-0");
  });

  it("⛔ UN REFUS D'ADOPTION RESTE VISIBLE, ZONE FERMÉE", () => {
    // `at: "body"` est posé par DEUX gestes: la note, et « Adopter ce plan »
    // du bas. Laissé sous `noteOpen`, le refus d'adoption serait invisible
    // dans le cas nominal — un bouton dont le refus ne se voit pas est un
    // bouton mort.
    // ⟳ 2026-09-21 — LE BLOC REPLIABLE N'EXISTE PLUS (le champ est monté dans
    // le pied). Ce qui tient la propriété est maintenant la SENTINELLE du bloc
    // de réponse: elle ne connaît pas `noteOpen`, donc un refus d'adoption se
    // rend champ fermé.
    expect(SRC).toContain("const bodyNotice =");
    const notice = SRC.slice(SRC.indexOf("const bodyNotice ="));
    expect(
      notice.slice(0, notice.indexOf(";")),
      "le bloc de réponse s'est lié à l'ouverture du champ: une réponse "
        + "disparaîtrait avec la question, et un refus d'adoption avec elle",
    ).not.toContain("noteOpen");
    expect(notice.slice(0, notice.indexOf(";"))).toContain('failure?.at === "body"');
  });

  it("⛔ AJUSTER À GAUCHE, ADOPTER À DROITE — LE MÊME SENS QUE L'ENTONNOIR", () => {
    // ⟳ L'ordre a été inversé le 2026-09-20 sur demande, puis REMIS le
    // 2026-09-21 par la règle qui le tranche: « pourquoi c'est à gauche et pas
    // à droite ? dans l'onboarding le bouton de validation est à droite ».
    // C'est exact — `SetupPage` rend `setup.next` dans une barre
    // `justify-end`, et « Retour » est à gauche depuis le 2026-08-19.
    //
    // ⛔ CE QUI EST MESURÉ N'EST PAS UN BORD, C'EST UN ACCORD. Le second
    // `expect` lit `SetupPage`: le jour où l'entonnoir met son avance à
    // gauche, ce cas rougit ici — et c'est ce qu'on veut, parce que le défaut
    // serait alors le DÉSACCORD, pas le bord choisi.
    // ⟳ 2026-09-21 — MESURÉ SUR L'ÉTAT FERMÉ, qui est le seul où les deux
    // gestes partagent une ligne. Ouvert, le champ prend la première et
    // l'adoption garde la sienne en dessous — « pas en bas à côté de valider
    // le plan, ça prête à confusion ».
    const bar = SRC.slice(
      SRC.indexOf("setNoteOpen(true)") - 400,
      SRC.indexOf("return (\n    <Modal"),
    );
    expect(bar).toContain("justify-between");
    const adopt = bar.indexOf('runAdopt("body")');
    const adjust = bar.indexOf("setNoteOpen(true)");
    expect(adopt, "« Adopter » a quitté le pied").toBeGreaterThan(0);
    expect(adjust, "« Ajuster » a quitté le pied").toBeGreaterThan(0);
    expect(adjust, "« Adopter » est repassé à gauche").toBeLessThan(adopt);

    const setup = readFileSync(
      new URL("../../pages/SetupPage.tsx", import.meta.url),
      "utf8",
    );
    const next = setup.indexOf('{t("setup.next")}');
    expect(next, "l'avance de l'entonnoir a changé de nom").toBeGreaterThan(0);
    expect(
      setup.lastIndexOf("justify-end", next),
      "l'entonnoir ne pousse plus son avance à droite: les deux écrans ne "
        + "disent plus la même chose, et c'est LÀ qu'il faut trancher",
    ).toBeGreaterThan(setup.lastIndexOf("justify-between", next));
  });

  it("⛔ LE TITRE ET SON EXPLICATION N'EXISTENT PLUS, DANS LES DEUX LANGUES", () => {
    for (const dict of [en, fr] as const) {
      expect(dict).not.toHaveProperty("plan.draft.note_label");
      expect(dict).not.toHaveProperty("plan.draft.note_hint");
    }
    expect(SRC).not.toContain("plan.draft.note_label");
    expect(SRC).not.toContain("plan.draft.note_hint");
  });
});
