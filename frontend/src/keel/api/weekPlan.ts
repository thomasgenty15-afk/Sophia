import { supabase } from "../../lib/supabase";
import { type DayToken } from "./types";

/**
 * KEEL — LA SEMAINE QUE L'ÉLÈVE S'EST COMPOSÉE (`student_week_plans`).
 *
 * ---------------------------------------------------------------------------
 * POURQUOI CE MODULE EXISTE
 * ---------------------------------------------------------------------------
 * Cette table n'avait qu'UN lecteur côté app: l'écran qui l'écrit
 * (`/app/plan`). `/app/today` ne lisait que `plan_versions` — le plan publié
 * par un coach — et, par la règle du modèle, aucun coach n'en publie jamais
 * (docs/keel/MODEL.md). Un élève pouvait donc composer et ADOPTER sa semaine,
 * et voir « tu n'as pas encore de plan » tous les jours.
 *
 * La forme de la ligne était en plus déclarée deux fois, dans deux fichiers
 * d'écran. Deux définitions de la même ligne finissent par diverger, et la
 * divergence se paie sur la seule chose qui compte ici: ce qu'on montre à
 * l'élève. Le type vit donc ici, une fois.
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
