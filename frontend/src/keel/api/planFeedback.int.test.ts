import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  FEEDBACK_QUESTIONS,
  newEnvyIsAsked,
  // LOT 4C — l'échelle des portions et ses libellés, tous deux dans le module
  // partagé et jamais dans `en.ts`/`fr.ts`.
  OPTION_LABELS,
  portionSubjectIsAsked,
  QUESTION_LABELS,
  QUESTION_OPTIONS,
  QUESTION_READERS,
  questionsFor,
} from "../../../../supabase/functions/_shared/keel/plan_feedback.ts";

/**
 * LOT D — L'ÉCRAN DE FIN DE PLAN, ET CE QUI L'EMPÊCHE DE REDEVENIR LE POINT DU
 * DIMANCHE.
 *
 * ── LE PRÉCÉDENT QUI GOUVERNE CE FICHIER ──────────────────────────────────
 * Le point du dimanche (six axes) a été SUPPRIMÉ. Pas parce qu'il était mal
 * fait: parce qu'il collectait pour un lecteur qui n'existait pas —
 * `coach_synthesis_io.ts` n'a jamais lu `biofeedback` (`git log -S`: zéro
 * commit). D'où la règle, et elle est vérifiable:
 *
 *     CHAQUE QUESTION NOMME SON LECTEUR.
 *
 * Ce fichier tient la moitié ÉCRAN de cette règle: le module a beau nommer ses
 * lecteurs, un écran qui collecte une réponse et ne l'envoie nulle part
 * reconstruit le même défaut, avec le même mécanisme.
 */

const ROOT = resolve(__dirname, "../../../..");

/** ⚠️ COMMENTAIRES RETIRÉS — cicatrice `caller-audit-must-strip-comments`. */
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
 * ⛔ LE TEST QUI FAIT TOUT LE FICHIER — L'ASSERTION, **PURE**.
 *
 * Une question posée dont la réponse n'arrive pas en base est très exactement
 * le point du dimanche, rejoué. Depuis le lot 2A la charge fait un pas de plus
 * — l'écran envoie à une fonction edge, qui appelle la RPC — et la chaîne doit
 * donc être tenue AUX DEUX MAILLONS.
 *
 * ⚠️ ELLE EST PURE POUR ÊTRE JOUÉE DEUX FOIS: une fois sur les vrais fichiers,
 * une fois sur des copies EN MÉMOIRE dont une réponse a été retirée. Sans la
 * seconde moitié, ce test reste vert le jour où la chaîne cherchée ne
 * correspond plus à rien — et il ressemble alors trait pour trait à une chaîne
 * qui tient.
 */
function answerGapsIn(api: string, edge: string): string[] {
  const gaps: string[] = [];
  // L'écran → la fonction edge.
  for (
    const field of [
      "cooked: answers.cooked",
      "portions: answers.portions",
      "portions_subject: answers.portionsSubject",
      "never_again: answers.neverAgain",
      "make_again: answers.makeAgain",
      "axis_question: answers.axisQuestion",
      "axis_answer: answers.axisAnswer",
    ]
  ) {
    if (!api.includes(field)) gaps.push(`l'écran n'envoie plus ${field}`);
  }
  // La fonction edge → la RPC, c'est-à-dire la colonne.
  for (
    const param of [
      "p_cooked: answers.cooked",
      "p_portions: answers.portions",
      "p_portions_subject: answers.portionsSubject",
      "p_never_again: answers.neverAgain",
      "p_make_again: answers.makeAgain",
      "p_axis_question: answers.axisQuestion",
      "p_axis_answer: answers.axisAnswer",
    ]
  ) {
    if (!edge.includes(param)) gaps.push(`la porte n'écrit plus ${param}`);
  }
  return gaps;
}

const API_FILE = "frontend/src/keel/api/planFeedback.ts";
const EDGE_FILE = "supabase/functions/keel-plan-feedback-v1/index.ts";

describe("chaque réponse collectée à l'écran atteint une colonne", () => {
  it("les sept réponses partent de l'écran jusqu'à la RPC", () => {
    expect(answerGapsIn(code(API_FILE), code(EDGE_FILE))).toEqual([]);
  });

  it("…et l'assertion ROUGIT quand une réponse cesse de partir", () => {
    // LA MOITIÉ QU'ON OUBLIE. Elle distingue « la chaîne tient » de « ma
    // recherche de chaîne ne correspond plus à rien ».
    const api = code(API_FILE);
    const edge = code(EDGE_FILE);
    for (
      const [from, to] of [
        ["portions_subject: answers.portionsSubject", "portions_subject: null"],
        ["cooked: answers.cooked", "cooked: null"],
      ] as [string, string][]
    ) {
      expect(api, `la mutation ne s'applique plus: ${from}`).toContain(from);
      expect(answerGapsIn(api.split(from).join(to), edge).length).toBeGreaterThan(0);
    }
    for (
      const [from, to] of [
        ["p_portions_subject: answers.portionsSubject", "p_portions_subject: null"],
        ["p_never_again: answers.neverAgain", "p_never_again: []"],
      ] as [string, string][]
    ) {
      expect(edge, `la mutation ne s'applique plus: ${from}`).toContain(from);
      expect(answerGapsIn(api, edge.split(from).join(to)).length).toBeGreaterThan(0);
    }
  });

  /**
   * ⚠️ LA PORTE N'A PAS CHANGÉ DE MAIN. La fonction edge APPELLE la RPC avec le
   * jeton de la personne; elle ne devient pas un second écrivain de la table.
   * `auth.uid()` est NULL sous `service_role` — la vérification de propriété du
   * plan y serait morte, et MUETTE.
   */
  it("la porte reste la RPC, appelée avec le jeton de la personne", () => {
    const edge = code(EDGE_FILE);
    expect(edge, "la RPC n'est plus la porte").toContain(
      'userClient.rpc("keel_plan_feedback_submit"',
    );
    expect(edge, "la table est écrite en direct: un second écrivain est apparu")
      .not.toMatch(/from\(\s*"meal_plan_feedback"\s*\)/);
  });

  it("chaque colonne écrite par la RPC a son lecteur écrit dans la migration", () => {
    const sql = readFileSync(
      resolve(
        ROOT,
        "supabase/migrations/20260815100000_plan_feedback_make_again_and_writer.sql",
      ),
      "utf8",
    );
    // La colonne neuve, et SON lecteur nommé — la règle de la table.
    expect(sql).toContain("add column if not exists make_again");
    expect(sql).toContain("LECTEUR: practical_constraints.food_preferences");
  });

  it("le module nomme un lecteur pour CHAQUE question, écran compris", () => {
    for (const q of FEEDBACK_QUESTIONS) {
      expect(QUESTION_READERS[q]?.trim().length ?? 0, q).toBeGreaterThan(20);
    }
  });
});

describe("⛔ fermer est une réponse, et elle s'écrit", () => {
  /**
   * Sans ça, le questionnaire revient à chaque ouverture de l'app: un « non
   * merci » transformé en harcèlement. C'est la ligne la moins spectaculaire du
   * lot et celle dont l'absence se paierait le plus vite.
   */
  it("le dialogue exige un `onDismiss`, et il n'est pas optionnel", () => {
    const view = code(
      "frontend/src/keel/components/plan/PlanFeedbackDialog.tsx",
    );
    expect(view, "la garde est devenue optionnelle").toMatch(
      /^\s*onDismiss: \(\) => Promise<void>;/m,
    );
    expect(view, "fermer ne passe plus par le refus").toContain(
      "onClose={() => void props.onDismiss()}",
    );
  });

  it("le montage écrit vraiment le refus", () => {
    const page = code("frontend/src/keel/pages/StudentWeekPlanPage.tsx");
    expect(page, "le refus n'est plus écrit").toContain("dismissPlanFeedback(");
    // ET IL EST RELU: un plan déjà répondu OU refusé ne se repropose pas.
    const api = code("frontend/src/keel/api/planFeedback.ts");
    expect(api).toContain("if (await planFeedbackAnswered(last.id)) return null;");
  });
});

describe("⛔ le plancher TCA n'est pas recalculé à l'écran", () => {
  /**
   * `questionsFor` retire `portions` et `hunger_between_meals`, ET rend la
   * sortie INDISCERNABLE de celle d'une dynamique inconnue — sinon le
   * questionnaire devient lui-même un oracle: « on ne m'a pas demandé les
   * portions, donc je suis marqué ». Un second calcul à l'écran serait la
   * première chose à diverger.
   */
  it("l'écran reçoit la liste, il ne la calcule pas", () => {
    const view = code(
      "frontend/src/keel/components/plan/PlanFeedbackDialog.tsx",
    );
    expect(view, "l'écran a appris ce qu'est un plancher TCA").not.toContain(
      "restriction",
    );
    expect(view, "la liste est devenue optionnelle").toMatch(
      /^\s*questions: readonly FeedbackQuestion\[\];/m,
    );
    const page = code("frontend/src/keel/pages/StudentWeekPlanPage.tsx");
    expect(page, "le montage ne passe plus la liste du module").toContain(
      "questions={questionsFor(",
    );
  });

  it("la règle mord toujours, et elle est indiscernable", () => {
    const flagged = questionsFor("fat_loss", true);
    expect(flagged).not.toContain("portions");
    expect(flagged).not.toContain("hunger_between_meals");
    expect(JSON.stringify(flagged)).toBe(JSON.stringify(questionsFor(null, true)));
    // ET LES DEUX POLARITÉS SURVIVENT: elles portent sur un PLAT, jamais sur
    // l'appétit ni sur la quantité.
    expect(flagged).toContain("never_again");
    expect(flagged).toContain("make_again");
  });
});

describe("⛔ les envies n'ouvrent aucun second canal", () => {
  /**
   * « Une envie du foyer » a déjà sa maison: `household_envy_submissions`,
   * écrite par `keel_household_submit_envy`, lue par `buildEnvyBlock`. Une
   * colonne `new_envy` aurait été un SECOND écrivain pour la même intention, et
   * c'est celui qu'on regarde le moins qui décide.
   */
  it("aucune colonne d'envie n'est ajoutée à `meal_plan_feedback`", () => {
    const sql = readFileSync(
      resolve(
        ROOT,
        "supabase/migrations/20260815100000_plan_feedback_make_again_and_writer.sql",
      ),
      "utf8",
    );
    expect(sql).not.toMatch(/add column if not exists (new_)?envy/);
  });

  it("l'envie part par l'écrivain existant, et vise la semaine SUIVANTE", () => {
    const page = code("frontend/src/keel/pages/StudentWeekPlanPage.tsx");
    expect(page, "un second écrivain d'envies est apparu").toContain(
      "submitEnvy(",
    );
    // ⚠️ LA SEMAINE PROCHAINE, JAMAIS CELLE QUI S'ACHÈVE. Le générateur ne lit
    // que la ligne de la fenêtre qu'il compose: l'écrire sur la semaine écoulée
    // serait l'écrire dans le passé — recueillie, rangée, jamais servie.
    expect(page).toContain('weekStartFor(addDays(browserLocalDate(), 7), "mon")');
  });

  it("la question n'est posée qu'à qui peut l'écrire", () => {
    // Le seul écrivain de la ligne est le maître (`not_owner` pour les autres).
    expect(newEnvyIsAsked({ isHouseholdOwner: true })).toBe(true);
    expect(newEnvyIsAsked({ isHouseholdOwner: false })).toBe(false);
    const page = code("frontend/src/keel/pages/StudentWeekPlanPage.tsx");
    expect(page).toContain("askEnvy={newEnvyIsAsked({ isHouseholdOwner: isOwner })}");
  });
});

describe("⛔ LOT 4C — l'échelle des portions porte CINQ crans, et l'écran les rend tous", () => {
  /**
   * ⚠️ CE QUE CE BLOC GARDE. Le questionnaire est le SEUL producteur de
   * `portion.adjust`, et un nouvel ajustement REMPLACE le précédent (jamais de
   * somme): avec un seul cran par sens, quelqu'un dont les parts étaient
   * énormément trop grosses restait bloqué à −5 % pour toujours.
   *
   * Le second cran ne vaut que s'il est CLIQUABLE. Un module à cinq options
   * derrière un écran qui n'en rend que trois est exactement le lot débranché
   * qui ressemble à un lot qui marche.
   */
  it("les cinq options sont dans le module, dans l'ordre de l'échelle", () => {
    expect(QUESTION_OPTIONS.portions).toEqual([
      "way_too_much",
      "too_much",
      "right",
      "not_enough",
      "way_not_enough",
    ]);
    // ⛔ LES LIBELLÉS VIVENT DANS LE MODULE, PAS DANS `en.ts`/`fr.ts` — et les
    // deux langues, parce que `profiles.locale` vaut `fr-FR` par défaut.
    // Littéraux en dur: une boucle « chaque option a un libellé » resterait
    // verte sur un libellé qui a changé de sens.
    expect(OPTION_LABELS.way_too_much).toEqual({
      en: "Really too much",
      fr: "Vraiment trop",
    });
    expect(OPTION_LABELS.too_much).toEqual({
      en: "A bit too much",
      fr: "Un peu trop",
    });
    expect(OPTION_LABELS.right).toEqual({
      en: "About right",
      fr: "Ce qu'il fallait",
    });
    expect(OPTION_LABELS.not_enough).toEqual({
      en: "A bit short",
      fr: "Un peu juste",
    });
    expect(OPTION_LABELS.way_not_enough).toEqual({
      en: "Really not enough",
      fr: "Vraiment pas assez",
    });
  });

  it("l'écran BOUCLE sur la liste du module — il n'écrit aucun bouton à la main", () => {
    const view = code(
      "frontend/src/keel/components/plan/PlanFeedbackDialog.tsx",
    );
    expect(view, "l'écran n'énumère plus les options du module").toContain(
      "QUESTION_OPTIONS[q].map((opt)",
    );
    expect(view, "l'écran ne lit plus le libellé du module").toContain(
      "OPTION_LABELS[opt]?.en",
    );
    // ⛔ AUCUN JETON DE PORTION ÉCRIT EN DUR DANS L'ÉCRAN: le premier qui y
    // entre fait une seconde liste, et c'est celle-là — la seule que la
    // personne voit — qui garderait trois crans.
    for (const token of ["too_much", "not_enough", "way_too_much", "right"]) {
      expect(view, `« ${token} » est écrit en dur dans l'écran`).not.toContain(
        `"${token}"`,
      );
    }
    // ⚠️ ET LES CINQ BOUTONS TIENNENT À 320 px: `flex-wrap` était déjà là, et
    // le retirer ferait sortir le cinquième de l'écran — un bouton hors écran
    // est un bouton absent.
    expect(view, "la rangée d'options ne passe plus à la ligne").toContain(
      "mt-2 flex flex-wrap gap-2",
    );
  });
});

describe("⛔ « pour qui ? » — la moitié qui rend la mesure attribuable", () => {
  /**
   * `portions` est la seule vérité terrain que le moteur n'a pas, et dans un
   * foyer de quatre « trop grosses » ne désigne personne. C'est la raison
   * ÉCRITE pour laquelle le questionnaire est le seul producteur de
   * `portion.adjust`.
   */
  it("la question se pose sur les QUATRE réponses non neutres, et qu'à plusieurs bouches", () => {
    // ⚠️ LES QUATRE, ET PAS SEULEMENT LES DEUX ANCIENNES. `portionSubjectIsAsked`
    // demande à `effectOf` s'il y a un ajustement; une seconde lecture de
    // `portions` à l'écran (« too_much ou not_enough ») aurait laissé les deux
    // crans NEUFS baisser l'assiette de TOUTE la table sans demander pour qui.
    expect(portionSubjectIsAsked({ portions: "way_too_much", mouths: 4 })).toBe(true);
    expect(portionSubjectIsAsked({ portions: "too_much", mouths: 4 })).toBe(true);
    expect(portionSubjectIsAsked({ portions: "not_enough", mouths: 2 })).toBe(true);
    expect(portionSubjectIsAsked({ portions: "way_not_enough", mouths: 2 })).toBe(true);
    // Neutre: rien à attribuer, puisqu'il n'y a pas d'ajustement.
    expect(portionSubjectIsAsked({ portions: "right", mouths: 4 })).toBe(false);
    expect(portionSubjectIsAsked({ portions: null, mouths: 4 })).toBe(false);
  });

  it("⚠️ LE SOLO N'A PAS DE FOYER: on ne lui pose pas un choix à une issue", () => {
    // Un compte seul n'a AUCUNE ligne `household_members`, donc aucun
    // `member_id` à nommer: la seule valeur possible est « tout le monde à
    // table », c'est-à-dire lui. La question ne se pose pas, et l'ajustement
    // lui est quand même attribué.
    expect(portionSubjectIsAsked({ portions: "too_much", mouths: 1 })).toBe(false);
    expect(portionSubjectIsAsked({ portions: "too_much", mouths: 0 })).toBe(false);
  });

  it("l'écran reçoit les bouches, il ne les cherche pas — et la règle vient du module", () => {
    const view = code("frontend/src/keel/components/plan/PlanFeedbackDialog.tsx");
    expect(view, "la liste des bouches est devenue optionnelle").toMatch(
      /^\s*mouths: readonly PlanFeedbackMouth\[\];/m,
    );
    expect(view, "l'écran recalcule quand poser la question").toContain(
      "portionSubjectIsAsked({",
    );
    // ⛔ LA CLÉ EST L'IDENTIFIANT, JAMAIS LE PRÉNOM. « laitue » ≠ « lait ».
    expect(view).toContain("`member:${mouth.memberId}`");
    // ⚠️ ET LE SUJET NE SURVIT PAS À LA REPRISE DE LA MESURE. Cocher « trop »,
    // nommer une bouche, puis revenir sur « ce qu'il fallait » enverrait un
    // sujet sans mesure — que la base REFUSE, et tout le retour serait perdu
    // pour un bouton repris.
    expect(view, "un sujet périmé peut repartir avec une réponse neutre").toContain(
      "portionsSubject: asksPortionSubject ? portionsSubject : null,",
    );
    const page = code("frontend/src/keel/pages/StudentWeekPlanPage.tsx");
    expect(page, "le montage ne passe plus les bouches").toContain("mouths={(household?.members");
  });
});

describe("⛔ ce qui est répondu est LU — le défaut que ce lot ferme", () => {
  /**
   * La table, l'écran et la RPC existaient depuis le 2026-08-11, et
   * `meal_plan_feedback` n'apparaissait dans `supabase/functions/` que dans un
   * COMMENTAIRE: sept réponses collectées à chaque fin de plan, rangées, et
   * jamais servies. C'est le point du dimanche, avec le même mécanisme.
   */
  it("la fonction edge extrait ET écrit, avec le jeton de la matrice", () => {
    const edge = code(EDGE_FILE);
    expect(edge, "l'extraction n'est plus appelée").toContain(
      "retainedItemsFromPlanFeedback(",
    );
    expect(edge, "le port d'écriture n'est plus appelé").toContain(
      "persistRetainedItemsFor(",
    );
    // ⛔ `producer` EST LE JETON DE LA MATRICE, jamais `written` — qui rendrait
    // `canProduce` vrai pour les huit familles, et afficherait « tu l'as
    // écrit » sur une ligne que personne n'a tapée.
    expect(edge).toContain("producer: QUESTIONNAIRE_PRODUCER");
    expect(edge, "un producteur `written` est apparu").not.toContain('producer: "written"');
  });
});

describe("⛔ on évalue le plan, jamais la personne", () => {
  it("aucun libellé de question ne demande ce qui a été mangé ou tenu", () => {
    const forbidden = [
      "did you eat",
      "what did you eat",
      "as-tu mangé",
      "qu'as-tu mangé",
      "stuck to",
      "as-tu tenu",
      "respecté",
      "adhérence",
    ];
    for (const q of FEEDBACK_QUESTIONS) {
      const both = `${QUESTION_LABELS[q].en} ${QUESTION_LABELS[q].fr}`
        .toLowerCase();
      for (const bad of forbidden) {
        expect(both.includes(bad), `${q}: « ${bad} »`).toBe(false);
      }
    }
  });

  it("le chrome de l'écran ne porte ni score, ni série, ni adhérence", () => {
    const view = code(
      "frontend/src/keel/components/plan/PlanFeedbackDialog.tsx",
    );
    for (const bad of ["streak", "score", "adherence", "compliance"]) {
      expect(view, `« ${bad} » est entré dans l'écran`).not.toContain(bad);
    }
  });
});
