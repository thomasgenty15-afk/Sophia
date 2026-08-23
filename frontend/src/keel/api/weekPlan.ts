import { supabase } from "../../lib/supabase";
import { type DayToken } from "./types";

/**
 * KEEL — LA SEMAINE QUE L'ÉLÈVE S'EST COMPOSÉE (`student_week_plans`).
 *
 * ⚠️ CE MODULE EST EN LECTURE SEULE DEPUIS LE 2026-08-19, ET C'EST UN RETRAIT
 * DÉCIDÉ, PAS UN OUBLI.
 * ---------------------------------------------------------------------------
 * La lane qui écrivait cette table — la fonction edge `generate-week-plan-v1`,
 * plus `generateWeekPlan` et `adoptWeekPlan` qui vivaient ici — a été retirée.
 * Elle n'avait AUCUN appelant vivant: aucun écran ne pouvait produire une
 * ligne, et rien ne pouvait la faire passer en `'adopted'`. Les 246 lignes en
 * base au moment du retrait étaient des comptes de test, à l'unité près.
 *
 * Ce que le retrait a coûté, écrit ici pour que personne ne le redécouvre: le
 * produit n'a plus d'objet où une consigne NOMME la conviction du coach
 * qu'elle applique, et où la base refuse la ligne qui ne la nomme pas (CHECK
 * `student_week_plans_doctrine_traceable_check`). La lane du repas peut citer
 * une conviction; elle n'y est jamais obligée et rien ne le vérifie.
 *
 * ⚠️ NE PAS « REBRANCHER » CE MODULE EN PASSANT. La table et ses six lecteurs
 * restent en place exprès; y remettre un écrivain est une décision produit, pas
 * un raccord.
 *
 * ---------------------------------------------------------------------------
 * CE QUE CE MODULE NE FAIT PAS
 * ---------------------------------------------------------------------------
 * Aucun score, aucun pourcentage, aucune série, aucun compte de complétion. La
 * semaine de l'élève n'est pas une prescription, donc « l'a-t-il suivie » n'a
 * pas d'objet — l'évaluateur KEEL est débranché sur cet axe (PLAN-NUIT,
 * amendement 3). Ce module lit et découpe; il ne juge pas.
 */

export interface WeekPlanItem {
  kind: "nutrition" | "action";
  label: string;
  rationale: string;
  /** Non nul pour `nutrition` (CHECK en base); toujours nul pour `action`. */
  source_belief_key: string | null;
  /** Le texte EXACT de la conviction du coach dont la ligne dérive. */
  source_belief_claim: string | null;
  action_kind: string | null;
  days: string[];
}

export interface WeekPlanRow {
  id: string;
  week_start: string;
  items: WeekPlanItem[];
  status: "draft" | "adopted" | "archived";
  adopted_at: string | null;
}

const COLUMNS = "id, week_start, items, status, adopted_at";

/**
 * Le lundi de la semaine en cours, en date LOCALE du navigateur.
 *
 * Volontairement la même horloge que celle qui a ÉCRIT la ligne
 * (`/app/plan` calcule sa `week_start` de la même façon). `/app/today` résout
 * normalement le jour dans le fuseau du PLAN — mais ici il n'y a pas de plan
 * publié, donc pas de fuseau à lire, et inventer un fuseau ferait chercher une
 * `week_start` que personne n'a écrite.
 */
export function currentMonday(at: Date = new Date()): string {
  const d = new Date(at.getTime());
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${
    String(d.getDate()).padStart(2, "0")
  }`;
}

/**
 * La semaine de l'élève courant, ou `null` si elle n'existe pas.
 *
 * Aucun filtre sur l'utilisateur: la RLS de `student_week_plans` borne déjà la
 * lecture à ses propres lignes. Refiltrer ici donnerait une seconde définition
 * de « la mienne », et c'est la divergence entre les deux qui produit les
 * fuites.
 *
 * ÉCHOUE FORT. « Tu n'as pas de semaine » et « on n'a pas pu la lire » sont
 * deux phrases différentes; montrer la première pour la seconde inviterait
 * l'élève à en régénérer une par-dessus celle qui existe.
 */
export async function loadWeekPlan(weekStart: string): Promise<WeekPlanRow | null> {
  const result = await supabase
    .from("student_week_plans")
    .select(COLUMNS)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (result.error) {
    throw new Error(`[keel/weekPlan] load failed: ${result.error.message}`);
  }
  return (result.data ?? null) as unknown as WeekPlanRow | null;
}

// ---------------------------------------------------------------------------
// LES DEUX ÉCRITURES ONT ÉTÉ RETIRÉES LE 2026-08-19 — le constat qui l'a décidé
// ---------------------------------------------------------------------------
//
// `generateWeekPlan` (qui appelait `generate-week-plan-v1`) et `adoptWeekPlan`
// (qui posait `status='adopted'`) vivaient ici sans UN SEUL appelant. La lane
// était déployée, testée, listée dans le garde-fou de couverture — et
// inatteignable depuis n'importe quel écran. Trois épreuves concordantes le
// 2026-08-19: 0 vue, 0 cron, 0 policy autre que celle du propriétaire, aucune
// mention en CI ni dans `supabase/config.toml`.
//
// CE QUE ÇA AVAIT DÉJÀ CASSÉ EN AVAL, ET QUI EST DÉSORMAIS RÉPARÉ AILLEURS:
// `keel-daily-pulse-v1` et `keel-weekly-flow-v1` n'envoyaient leur tap qu'à un
// élève ayant SOIT un `plan_versions` publié (le chemin 1:1, qu'aucun coach
// n'emprunte en 1:N), SOIT un `student_week_plans` en `'adopted'` — deux
// conditions impossibles. Le commit 99697610 les a rebranchés sur
// `resolveStudentFollowing`, qui interroge `student_generated_meals` en
// premier. Le rôle de SIGNAL a donc un repreneur; le rôle de PRODUCTEUR d'un
// objet tracé à une conviction n'en a aucun.
// ---------------------------------------------------------------------------

/**
 * Les lignes du jour, séparées de celles qui ne visent aucun jour.
 *
 * `days: []` n'est pas une anomalie: le compilateur produit des lignes sans
 * jour nommé (`parseDays` rend un tableau vide quand le modèle n'en cite
 * aucun), et elles valent pour la semaine entière. Les mélanger avec les
 * lignes du jour ferait lire « je suis en retard » tous les jours à quelqu'un
 * qui ne l'est pas — c'est exactement la raison pour laquelle l'écran du plan
 * publié sépare déjà le grain semaine du grain jour (`splitByGrain`).
 */
export function weekPlanDaySplit(
  items: readonly WeekPlanItem[],
  day: DayToken,
): { today: WeekPlanItem[]; anyDay: WeekPlanItem[] } {
  const today: WeekPlanItem[] = [];
  const anyDay: WeekPlanItem[] = [];
  for (const item of items) {
    if (item.days.length === 0) anyDay.push(item);
    else if (item.days.includes(day)) today.push(item);
  }
  return { today, anyDay };
}
