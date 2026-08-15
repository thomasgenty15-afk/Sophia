import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  FEEDBACK_QUESTIONS,
  newEnvyIsAsked,
  QUESTION_LABELS,
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

describe("chaque réponse collectée à l'écran atteint une colonne", () => {
  /**
   * ⛔ LE TEST QUI FAIT TOUT LE FICHIER. Une question posée dont la réponse
   * n'arrive pas en base est très exactement le point du dimanche, rejoué.
   */
  it("les cinq réponses du dialogue partent toutes dans la RPC", () => {
    const api = code("frontend/src/keel/api/planFeedback.ts");
    for (
      const param of [
        "p_cooked: answers.cooked",
        "p_portions: answers.portions",
        "p_never_again: answers.neverAgain",
        "p_make_again: answers.makeAgain",
        "p_axis_question: answers.axisQuestion",
        "p_axis_answer: answers.axisAnswer",
      ]
    ) {
      expect(api, `${param} ne part plus`).toContain(param);
    }
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
