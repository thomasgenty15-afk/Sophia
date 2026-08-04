/**
 * KEEL — CE QUE LE CORPS DE L'ÉLÈVE CHANGE DANS SA SEMAINE.
 *
 * ── LE TEST D'EXISTENCE D'UNE ENTRÉE ───────────────────────────────────────
 * « Est-ce que cette information change ce que l'élève trouvera dans son
 * assiette cette semaine ? » Si non, on ne la demande pas, et surtout on ne la
 * passe pas au modèle: une entrée qui n'altère aucune branche est DÉCORATIVE,
 * et elle est pire que son absence — elle fait croire que le produit tient
 * compte de quelque chose dont il ne tient pas compte.
 *
 * Ce module est donc l'endroit où chaque entrée du corps doit MÉRITER d'être
 * passée. Ce qu'elles changent, exactement:
 *
 *   ┌─────────────────┬────────────────────────────────────────────────────┐
 *   │ ENTRÉE          │ CE QU'ELLE ALTÈRE                                  │
 *   ├─────────────────┼────────────────────────────────────────────────────┤
 *   │ objectif        │ `maxNutrition` ET `emphasis` (déjà: `focusFor`)    │
 *   │ bande d'âge     │ `emphasis` — une clause nommée par bande           │
 *   │ tendance poids  │ `emphasis` + `maxNutrition` −1 si ça marche déjà   │
 *   │ tendance taille │ idem, et c'est elle qui porte la recomposition     │
 *   └─────────────────┴────────────────────────────────────────────────────┘
 *
 * ── CE QU'AUCUNE DE CES ENTRÉES NE FAIT, JAMAIS ────────────────────────────
 * Dériver un besoin énergétique, une cible de poids, ou une catégorie d'IMC.
 * Interdit par le §3.3 du chantier, et le filtre `NUMERIC_TARGET_PATTERNS` de
 * `week_plan_generation.ts` le rattrape en sortie si le prompt dérivait. Les
 * mesures informent LE CHOIX ET LA MISE EN AVANT des lignes, rien d'autre.
 *
 * Et elles n'introduisent pas de contenu nutrition: la seule méthode qui existe
 * ici est la doctrine du coach. L'âge et les mesures changent QUELLES
 * convictions du coach remontent et COMBIEN de lignes on en tire — ils
 * n'ajoutent pas une conviction que le coach n'a pas.
 *
 * ── LA CONDITION DE DÉSARMEMENT ────────────────────────────────────────────
 * Corps entièrement inconnu (pas d'âge, pas de mesure) => la sortie est
 * IDENTIQUE, au caractère près, à ce que `focusFor(goal)` rendait avant ce
 * chantier. C'est le cas de tous les élèves existants, et c'est testé.
 *
 * PURE MODULE : no I/O, no clock.
 */

import { type AgeBand } from "./student_age.ts";
// TYPE-ONLY, et c'est structurel: `week_plan_generation.ts` importe la VALEUR
// `weekEmphasis` d'ici. Un import de valeur en retour ferait un cycle. Un
// `import type` est effacé à la compilation, donc la dépendance runtime reste à
// sens unique: week_plan_generation -> student_body, jamais l'inverse.
import type { StudentGoal } from "./week_plan_generation.ts";

/**
 * Une mesure du corps, avec SA DATE.
 *
 * La date n'est pas décorative: « 78 kg » ne dit rien, « 78 kg il y a trois
 * semaines » dit quelque chose. Une mesure sans date affichée invite l'élève à
 * la croire d'aujourd'hui.
 */
export interface DatedMeasure {
  /** Le lundi de la semaine du bilan qui l'a portée. */
  weekStart: string;
  value: number;
}

export type MeasureTrend = "falling" | "stable" | "rising" | "unknown";

/**
 * De combien une mesure doit bouger pour que ce soit autre chose que du bruit.
 *
 * Un poids varie d'un kilo dans la journée (hydratation, repas, balance). Un
 * seuil trop bas transformerait ce bruit en « tendance » et ferait changer la
 * semaine d'un élève qui n'a rien changé — la pire façon de perdre sa
 * confiance dans les mesures qu'on lui demande.
 */
export const WEIGHT_NOISE_KG = 1.0;
export const WAIST_NOISE_CM = 2.0;

/**
 * La tendance d'une série, du premier au dernier point.
 *
 * Premier-vs-dernier plutôt qu'une régression: sur trois à huit points
 * hebdomadaires, une régression donne l'illusion d'une précision que la mesure
 * n'a pas (une balance de salle de bain, un dimanche soir, habillé ou non).
 *
 * UNE SEULE MESURE N'EST PAS UNE TENDANCE. `unknown`, jamais `stable`: dire
 * « stable » d'un point unique est une affirmation qu'on n'a pas les moyens de
 * faire, et elle ferait baisser le nombre de lignes d'un élève dont on ignore
 * tout du mouvement.
 */
export function trendOf(
  measures: readonly DatedMeasure[],
  noiseThreshold: number,
): MeasureTrend {
  if (measures.length < 2) return "unknown";
  const first = measures[0].value;
  const last = measures[measures.length - 1].value;
  const delta = last - first;
  if (Math.abs(delta) < noiseThreshold) return "stable";
  return delta < 0 ? "falling" : "rising";
}

export interface BodyInputs {
  ageBand: AgeBand | null;
  weightTrend: MeasureTrend;
  waistTrend: MeasureTrend;
}

/** Le corps dont on ne sait rien. Le cas de tous les élèves d'avant ce chantier. */
export const UNKNOWN_BODY: BodyInputs = {
  ageBand: null,
  weightTrend: "unknown",
  waistTrend: "unknown",
};

/**
 * Ce que la bande d'âge ajoute à l'accent de la semaine.
 *
 * Chaque bande a sa clause NOMMÉE (R6): une bande sans clause serait un token
 * qui ne change rien. Les clauses restent des consignes de SÉLECTION parmi les
 * convictions du coach — jamais un apport nutritionnel que le coach n'a pas
 * enseigné, ce qui serait Sophia inventant du contenu.
 */
function ageClause(band: AgeBand | null): string | null {
  switch (band) {
    case null:
      return null;
    case "18_29":
      return "this student is in their twenties: prefer the coach's simplest, " +
        "lowest-effort convictions — irregular schedules and eating out are the " +
        "usual obstacle at this age, not motivation";
    case "30_44":
      return "this student is in their thirties or early forties: prefer the " +
        "coach's convictions that survive a working week with little cooking time";
    case "45_59":
      return "this student is between 45 and 59: bring forward the coach's " +
        "convictions about protein regularity and meal structure over anything " +
        "that depends on precise timing around training";
    case "60_plus":
      return "this student is 60 or older: bring forward the coach's " +
        "convictions about protein regularity, and prefer lines that ADD food " +
        "rather than remove it";
  }
}

/**
 * Ce que les tendances ajoutent — et le seul endroit où elles touchent au
 * NOMBRE de lignes.
 *
 * « Ne répare pas ce qui marche »: quand la direction est déjà mesurablement
 * en train de se produire, on RETIRE une ligne au lieu d'en ajouter. Un élève
 * chez qui ça marche n'a pas besoin d'une semaine plus lourde; il a besoin
 * qu'on ne casse pas ce qu'il fait. C'est la seule inférence honnête qu'on
 * puisse tirer de deux points sur une balance, et elle va dans le sens de
 * l'allègement — donc son faux positif est bénin.
 *
 * L'inverse n'est PAS fait: une tendance qui ne va pas dans le sens de
 * l'objectif n'AJOUTE pas de ligne. Ce serait punir l'élève d'un résultat, dans
 * un produit qui a supprimé les scores et les séries exprès.
 */
function directionIsWorking(goal: StudentGoal, body: BodyInputs): boolean {
  switch (goal) {
    case "fat_loss":
      // Le tour de taille suffit: perdre du tour de taille à poids constant est
      // exactement ce qu'on cherche, et un poids seul le manquerait.
      return body.weightTrend === "falling" || body.waistTrend === "falling";
    case "recomposition":
      // La signature de la recomposition: la taille descend pendant que le
      // poids ne descend pas. C'est la mesure qui porte cet objectif — sans
      // tour de taille, on ne peut pas le dire, et on ne le dit pas.
      return body.waistTrend === "falling" &&
        (body.weightTrend === "stable" || body.weightTrend === "rising");
    case "health":
    case "maintenance":
      return body.weightTrend === "stable";
    case "performance":
      // Aucune tendance de poids ou de taille ne dit qu'une performance
      // progresse. On ne prétend pas le contraire.
      return false;
  }
}

function trendClause(goal: StudentGoal, body: BodyInputs): string | null {
  const parts: string[] = [];
  if (body.weightTrend !== "unknown") {
    parts.push(`their weight over the last weeks is ${body.weightTrend}`);
  }
  if (body.waistTrend !== "unknown") {
    parts.push(`their waist is ${body.waistTrend}`);
  }
  if (parts.length === 0) return null;

  const observation = parts.join(" and ");
  const direction = directionIsWorking(goal, body)
    ? `${observation} — which is what this goal is asking for. Do NOT add load. ` +
      `Keep the week light and close to what they are already doing; the fewest ` +
      `lines that hold what works is the right answer.`
    : `${observation}. Use this to choose WHICH of the coach's convictions to ` +
      `bring forward.`;

  // La règle du non-verdict est accrochée aux DEUX branches, pas à une seule.
  // Ce dépôt a déjà payé « la garde testée dans une seule langue » et « la
  // ceinture armée sur un seul chemin »: une interdiction qui ne vaut que dans
  // la branche « ça ne marche pas » est une interdiction absente de l'autre,
  // et c'est justement dans la branche « ça marche » qu'un modèle a envie de
  // féliciter l'élève avec son chiffre.
  return `${direction} Never turn a measurement into a number, a target or a ` +
    `judgement, and never quote these measurements back to the student.`;
}

export interface WeekEmphasis {
  maxNutrition: number;
  emphasis: string;
  /** Le détail de ce qui a bougé, pour le journal et pour les tests. */
  applied: {
    ageBand: AgeBand | null;
    trendsKnown: boolean;
    directionWorking: boolean;
    /** Le plafond avant l'effet des mesures. */
    baseMaxNutrition: number;
  };
}

/** Jamais moins que ça: une semaine à une ligne n'est plus une semaine. */
export const MIN_NUTRITION_LINES = 2;

/**
 * L'accent et le plafond de la semaine, objectif ET corps compris.
 *
 * Enveloppe la branche par objectif plutôt que de la remplacer: `focusFor`
 * reste inchangée et testée là où elle est. Ce module n'ajoute que ce que le
 * CORPS change.
 *
 * `base` est passé par l'appelant (c'est `focusFor(goal)`) plutôt qu'importé:
 * voir la note sur le cycle en tête de fichier.
 */
export function weekEmphasis(
  goal: StudentGoal,
  body: BodyInputs,
  base: { maxNutrition: number; emphasis: string },
): WeekEmphasis {
  const clauses = [base.emphasis, ageClause(body.ageBand), trendClause(goal, body)]
    .filter((c): c is string => Boolean(c));

  const working = directionIsWorking(goal, body);
  const maxNutrition = working
    ? Math.max(MIN_NUTRITION_LINES, base.maxNutrition - 1)
    : base.maxNutrition;

  return {
    maxNutrition,
    emphasis: clauses.join("; "),
    applied: {
      ageBand: body.ageBand,
      trendsKnown: body.weightTrend !== "unknown" || body.waistTrend !== "unknown",
      directionWorking: working,
      baseMaxNutrition: base.maxNutrition,
    },
  };
}
