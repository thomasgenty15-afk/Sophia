import { supabase } from "../../lib/supabase";
import { readInvokeError } from "./keelClient";
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

// ---------------------------------------------------------------------------
// LES DEUX ÉCRITURES — et pourquoi leur absence coûtait plus qu'un écran vide
// ---------------------------------------------------------------------------
//
// `generate-week-plan-v1` était DÉPLOYÉE, testée, listée dans le garde-fou de
// couverture — et sans un seul appelant. Rien, nulle part, n'écrivait non plus
// `status='adopted'`. Ce fichier ne portait que `loadWeekPlan`: il lisait une
// ligne que personne ne pouvait produire.
//
// CE QUE ÇA CASSAIT EN AVAL, ET QUI NE SE VOYAIT PAS:
// `keel-daily-pulse-v1` n'envoie le tap du soir qu'à un élève qui a SOIT un
// `plan_versions` publié (le chemin 1:1, qu'aucun coach n'emprunte en 1:N),
// SOIT un `student_week_plans` en `'adopted'`. Les deux étant impossibles,
// **le tap du soir n'a jamais pu partir pour un élève 1:N** — donc pas de
// `student_daily_checkins`, donc « comment la semaine a été vécue » vide sur la
// page du lundi, c'est-à-dire sur l'artefact que le coach paie pour lire.
//
// Une seule chaîne, et elle était coupée à la source:
//   générer → adopter → tap du soir → bilan hebdo → page du lundi → le coach reste
// ---------------------------------------------------------------------------

/**
 * Demande un BROUILLON de semaine au moteur.
 *
 * GÉNÉRER N'EST PAS ADOPTER, et c'est tout le modèle: la fonction écrit
 * toujours `status='draft'`. L'élève lit, puis adopte s'il s'y reconnaît. Un
 * plan appliqué d'office serait le plan de la machine porté par l'élève.
 *
 * Aucun `user_id` n'est envoyé: le JWT décide de qui il s'agit, et le moteur
 * n'en accepterait pas.
 *
 * `replaceAdopted` — LE SERVEUR REFUSE SEUL. `generate-week-plan-v1` rend
 * `plan_already_adopted` (409) tant qu'on ne le lui passe pas: régénérer
 * remplace les lignes ET fait retomber la semaine en brouillon, ce qui coupe le
 * tap du soir et le point hebdomadaire (les deux filtrent sur `'adopted'`). La
 * confirmation d'écran est la politesse; ce refus-là est la garantie.
 *
 * Les motifs métier remontent NOMMÉS (`goal_required`,
 * `coach_has_no_doctrine`, `coach_doctrine_excludes_goal`,
 * `plan_already_adopted`) — les traduire en « une erreur est survenue » ferait
 * perdre la seule information exploitable par l'écran.
 */
export async function generateWeekPlan(input?: {
  localDate?: string;
  context?: string;
  replaceAdopted?: boolean;
}): Promise<WeekPlanRow | null> {
  const { data, error } = await supabase.functions.invoke("generate-week-plan-v1", {
    body: {
      local_date: input?.localDate ?? currentMonday(),
      context: input?.context ?? "",
      replace_adopted: input?.replaceAdopted === true,
    },
  });
  if (error) {
    const detail = await readInvokeError(error);
    throw new Error(detail || `[keel/weekPlan] ${error.message}`);
  }
  const payload = (data ?? {}) as Record<string, unknown>;
  // Le moteur ne rend que `id, week_start, status`: pas les items. On ne
  // fabrique donc pas une `WeekPlanRow` à moitié — l'appelant relit.
  const plan = payload.plan as { week_start?: string } | null | undefined;
  if (!plan?.week_start) return null;
  return await loadWeekPlan(String(plan.week_start));
}

/**
 * L'ADOPTION — l'élève dit « oui, c'est ma semaine ».
 *
 * Écriture directe, pas de fonction edge: `student_week_plans_owner_all` borne
 * déjà l'écriture à ses propres lignes, et c'est exactement la façon dont cet
 * écran enregistre déjà son objectif. Une RPC n'ajouterait ici qu'une porte de
 * plus devant la même serrure.
 *
 * WRITE-THROUGH: on relit la ligne écrite et on la rend. Rien dans cette app
 * n'annonce un effet qu'elle n'a pas relu — c'est la classe de défaut
 * « committé fantôme » que ce dépôt a payée plusieurs fois.
 *
 * `adopted_at` est posé ICI et pas laissé à un défaut de colonne: une semaine
 * adoptée sans date d'adoption ne peut être ni datée ni auditée, et le point
 * hebdomadaire s'en sert pour savoir de quand date l'engagement.
 */
export async function adoptWeekPlan(planId: string): Promise<WeekPlanRow> {
  const result = await supabase
    .from("student_week_plans")
    .update({ status: "adopted", adopted_at: new Date().toISOString() })
    .eq("id", planId)
    .select(COLUMNS)
    .maybeSingle();
  if (result.error) {
    throw new Error(`[keel/weekPlan] adopt failed: ${result.error.message}`);
  }
  if (!result.data) {
    // Zéro ligne sous une RLS `for all` veut dire « ce n'est pas la tienne ».
    // Le dire, plutôt que de rendre un succès muet sur une écriture qui n'a
    // rien touché.
    throw new Error("[keel/weekPlan] adopt touched no row");
  }
  return result.data as unknown as WeekPlanRow;
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
