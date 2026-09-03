import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * LOT D — TROIS CHAMPS COLLECTÉS, ET CE QUI LES LIT VRAIMENT.
 *
 * ── CE QUE CE FICHIER FERME ───────────────────────────────────────────────
 * « Un champ collecté sans lecteur ressemble exactement à un champ ignoré » est
 * la cicatrice centrale de ce dépôt. Le 2026-08-19, elle a produit son
 * SYMÉTRIQUE: trois champs ont été rangés parmi les champs sans lecteur, et
 * pour les trois c'était faux — ils en ont, simplement pas là où on regardait.
 * Deux d'entre eux portent en plus une exclusion ÉCRITE, datée et motivée, du
 * prompt de composition.
 *
 * Une décision écrite dans un commentaire est une décision qu'on redécouvre par
 * un incident. Ce fichier l'arme, dans les DEUX SENS:
 *
 *   ① le lecteur qui EXISTE disparaît       → rouge (la prémisse a changé)
 *   ② le lecteur INTERDIT apparaît           → rouge (la décision est renversée)
 *
 * ⛔ CE N'EST PAS UNE INTERDICTION DÉFINITIVE. Renverser l'une de ces deux
 * exclusions est une décision PRODUIT, qui passe par les portes nommées dans
 * `meal_body.ts` (FF-030 R7) et dans
 * `20260818180000_a_session_is_a_fact_not_an_energy.sql`. Ce test demande
 * qu'elle soit PRISE, pas qu'elle soit impossible.
 */

const ROOT = resolve(__dirname, "../../../..");

/** ⚠️ COMMENTAIRES RETIRÉS — ce dépôt nomme ces champs des dizaines de fois en prose. */
function code(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => {
      const at = line.indexOf("//");
      if (at < 0) return line;
      if (at > 0 && line[at - 1] === ":") return line;
      return line.slice(0, at);
    })
    .join("\n");
}

/** Les fonctions edge qui parlent à un modèle pour composer un plan. */
function generatorEntrypoints(): string[] {
  const dir = resolve(ROOT, "supabase/functions");
  return readdirSync(dir)
    .filter((name) => name.startsWith("generate-"))
    .map((name) => `supabase/functions/${name}/index.ts`)
    .filter((rel) => existsSync(resolve(ROOT, rel)));
}

describe("le rythme — il a des lecteurs, et aucun n'est une consigne", () => {
  /**
   * ① LA PRÉMISSE. « `target_pace_kg_per_week` n'a aucun lecteur » est faux
   * depuis le 2026-08-18: il décide des GRAMMES d'une assiette de foyer, et il
   * porte le rythme exécuté du conseil du midi.
   */
  it("le dimensionnement du foyer et le conseil d'énergie le lisent", () => {
    // ⚠️ UN COMPTE DE `.select(...)`, PAS UNE PRÉSENCE — ET C'EST UNE MUTATION
    // QUI L'A DIT. Un `toContain("target_pace_kg_per_week")` restait VERT quand
    // on retirait la colonne d'UNE des deux requêtes: le jeton survivait dans
    // l'autre, et la moitié perdue ne disait rien. Le foyer a DEUX sources et
    // une précédence — la ligne de roster (`household_members`) puis le
    // « about you » d'une bouche qui a un compte (`student_goals`) —, donc deux
    // lectures, et perdre l'une rend un rythme silencieusement ignoré pour la
    // moitié des bouches.
    const selectsPace = (rel: string) =>
      (code(rel).match(/\.select\("[^"]*target_pace_kg_per_week[^"]*"\)/g) ?? []).length;
    // ⚠️ UN PLANCHER, PAS UNE ÉGALITÉ. Un lot voisin travaille sur ce fichier
    // au moment où celui-ci est écrit; une troisième source de rythme est un
    // ÉLARGISSEMENT, pas une régression, et une garde qui rougirait dessus
    // ferait du bruit qu'on apprendrait à ignorer. Retirer une source, elle,
    // tombe sous le plancher.
    expect(
      selectsPace("supabase/functions/generate-household-meal-v1/index.ts"),
      "le foyer ne dimensionne plus sur le rythme, ou n'en lit plus qu'une source",
    ).toBeGreaterThanOrEqual(2);
    // ⟳ 2026-09-01 — LA LECTURE A CHANGÉ DE FICHIER, PAS D'EXISTENCE.
    //
    // `meal-energy-v1` lisait `profiles` + la doctrine + `student_goals` pour
    // assembler les quatre portes de l'énergie. CALORIE_REVERSAL §6 donne un
    // chiffre au chemin PHOTO, qui a besoin de la MÊME porte: l'assemblage est
    // descendu dans `_shared/keel/energy_gate_io.ts`, et `meal-energy-v1`
    // consomme `goalsRow` au lieu de le relire.
    //
    // ⚠️ ON CHERCHE DONC DANS LES DEUX, ET C'EST UNE SOMME. Épingler le seul
    // `index.ts` rendrait cette garde rouge sur un déplacement correct — donc
    // désarmée à la première session pressée. Épingler le seul assembleur
    // laisserait passer le jour où `meal-energy-v1` relirait la table pour son
    // compte, ce qui est exactement la double lecture qu'on vient de retirer.
    expect(
      selectsPace("supabase/functions/meal-energy-v1/index.ts") +
        selectsPace("supabase/functions/_shared/keel/energy_gate_io.ts"),
      "le conseil d'énergie ne lit plus le rythme — ni dans sa fonction edge, " +
        "ni dans l'assembleur des quatre portes",
    ).toBeGreaterThanOrEqual(1);
  });

  /**
   * ② ⛔ ET IL N'ENTRE PAS DANS LA CONSIGNE. « 0,5 kg par semaine » est un taux
   * de déficit — la phrase d'un tracker —, et sur un mineur ce serait un défaut
   * bloquant. Le curseur agit déjà en grammes: le redire au modèle compterait
   * deux fois le même cran.
   */
  it("aucun tronc de prompt ne nomme le rythme", () => {
    for (
      const rel of [
        "supabase/functions/_shared/keel/meal_generation.ts",
        "supabase/functions/_shared/keel/meal_body.ts",
        "supabase/functions/_shared/keel/household_meal_generation.ts",
      ]
    ) {
      expect(code(rel), `${rel} fait entrer le rythme dans la consigne`)
        .not.toContain("target_pace_kg_per_week");
    }
  });
});

describe("le poids visé — exclu de la consigne par écrit (FF-030 R7)", () => {
  /**
   * ⛔ « Le nombre visé ne change pas ce qu'on met dans l'assiette, et un modèle
   * qui lit "vise 72, en pèse 98" raisonne en écart, en déficit et en délai. »
   * La DIRECTION passe, elle, par `goal` et `focus_axis`.
   */
  it("le contexte de corps d'une consigne ne le porte pas", () => {
    const body = code("supabase/functions/_shared/keel/meal_body.ts");
    expect(body, "un poids visé est entré dans `MealBodyContext`")
      .not.toContain("targetWeightKg");
    expect(body).not.toContain("target_weight_kg");
  });

  it("aucune lane de génération ne le charge", () => {
    for (const rel of generatorEntrypoints()) {
      expect(code(rel), `${rel} charge le poids visé`)
        .not.toContain("target_weight_kg");
    }
  });
});

describe("les séances d'activité — un fait, jamais une énergie", () => {
  /**
   * ① LE LECTEUR VIVANT est l'écran `/app/progress`, décision du propriétaire
   * du 2026-08-18: une séance est le même genre d'objet qu'une pesée datée.
   */
  it("`/app/progress` monte bien la carte des séances", () => {
    // ⚠️ UNE FRONTIÈRE DE MOT, PAS UN PRÉFIXE — MUTATION. `toContain` restait
    // vert sur `<ActivitySessionsCardX`, c'est-à-dire sur un composant qui
    // n'existe pas: la garde validait la chaîne, pas le montage.
    expect(
      code("frontend/src/keel/pages/StudentProgressPage.tsx"),
      "la seule surface vivante des séances a disparu",
    ).toMatch(/<ActivitySessionsCard[\s/>]/);
    expect(code("frontend/src/keel/api/activitySessions.ts"))
      .toContain("student_activity_sessions");
  });

  /**
   * ② ⛔ « Aucun générateur ne lit cette table, et c'est une propriété à
   * maintenir, pas un état transitoire » — migration
   * `20260818180000_a_session_is_a_fact_not_an_energy.sql`, avec ses nombres:
   * le déficit visé est de 400-500 kcal/jour, l'erreur d'une dépense d'exercice
   * déclarée est de ±30-50 %. La soustraire AUGMENTE l'incertitude du jour.
   *
   * ⚠️ ET LA PROPRIÉTÉ N'ÉTAIT TENUE PAR AUCUN TEST jusqu'ici: elle vivait dans
   * un commentaire de migration, c'est-à-dire dans le seul endroit qu'un `grep`
   * de code ne regarde pas.
   */
  it("aucune lane de génération ne lit la table", () => {
    for (const rel of generatorEntrypoints()) {
      expect(code(rel), `${rel} lit les séances`)
        .not.toContain("student_activity_sessions");
    }
  });

  it("aucun tronc de prompt ne nomme la table", () => {
    for (
      const rel of [
        "supabase/functions/_shared/keel/meal_generation.ts",
        "supabase/functions/_shared/keel/meal_body.ts",
        "supabase/functions/_shared/keel/household_meal_generation.ts",
      ]
    ) {
      expect(code(rel), `${rel} fait entrer les séances dans la consigne`)
        .not.toContain("student_activity_sessions");
    }
  });
});
