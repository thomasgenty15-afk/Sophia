/**
 * LE RETOUR DE FIN DE PLAN — LOT D, la moitié qui manquait.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LE MODULE ÉTAIT FAIT, IL N'AVAIT NI SURFACE NI ÉCRIVAIN.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `_shared/keel/plan_feedback.ts` porte les questions, leurs options fermées,
 * leurs libellés dans les deux langues, la règle du plancher TCA et l'effet de
 * chaque réponse — depuis le 2026-08-11. La table `meal_plan_feedback` porte
 * les colonnes, chacune avec SON LECTEUR nommé en commentaire. Zéro clé i18n,
 * zéro écran, zéro `insert`: le seul chemin qui l'atteignait était un détecteur
 * de chat.
 *
 * ── LA RÈGLE QUI GOUVERNE TOUT ────────────────────────────────────────────
 *     CHAQUE QUESTION NOMME SON LECTEUR.
 * Elle existe parce que le point du dimanche collectait six axes pour un
 * lecteur qui n'a jamais existé, et a été supprimé pour ça. Une question dont
 * on ne peut pas écrire le lecteur ne se pose pas.
 *
 * ── ON ÉVALUE LE PLAN, JAMAIS LA PERSONNE ─────────────────────────────────
 * Aucune question ne porte sur ce qui a été mangé, ni sur ce qui a été fait.
 *
 * ⛔ AUCUNE GARDE N'EST RECOPIÉE ICI. Quelles questions poser, ce que `none`
 * veut dire, ce qu'une réponse change: tout est dans le module serveur, importé
 * tel quel. Une garde en double est « la cicatrice la plus chère de ce dépôt ».
 *
 * ⛔ AUCUN IMPORT D'i18n — règle de `frontend/src/keel/api/`.
 */

import { supabase } from "../../lib/supabase";
import { readEdgeRefusal } from "./edgeErrors";
import { selectMealPlans } from "./mealWindow";

/**
 * ⚠️ LE MODULE SERVEUR EST IMPORTÉ, PAS RECOPIÉ. Patron de
 * `api/servingDivergence.ts` et de `api/householdReference.int.test.ts`, en
 * production depuis le 2026-08-10. `plan_feedback.ts` est PUR (aucun I/O,
 * aucune horloge, aucun spécificateur `jsr:`/`npm:`/`https:`, un seul import de
 * TYPE), donc il se monte des deux côtés.
 *
 * Une seconde table de questions écrite ici divergerait au premier ajout, et
 * c'est celle qu'on regarde le moins qui garderait l'ancienne liste.
 */
export {
  type FeedbackQuestion,
  feedbackIsDue,
  newEnvyIsAsked,
  OPTION_LABELS,
  PORTION_SUBJECT_LABEL,
  portionSubjectIsAsked,
  QUESTION_LABELS,
  QUESTION_OPTIONS,
  questionsFor,
} from "../../../../supabase/functions/_shared/keel/plan_feedback.ts";

/** Ce qui part en base. `null` = la question n'a pas été posée, ou pas répondue. */
export interface PlanFeedbackAnswers {
  cooked: string | null;
  portions: string | null;
  /**
   * ⚠️ POUR QUI vaut la réponse de portion. `household` ou `member:<uuid>`.
   *
   * `null` = la question n'a pas été posée: réponse neutre, ou une seule
   * bouche (un solo n'a pas de foyer, donc pas de `member_id` à nommer — voir
   * `portionSubjectIsAsked`). Le serveur lit alors « tout le monde à table »,
   * qui est le défaut de l'axe 3.
   *
   * ⛔ JAMAIS UN PRÉNOM: « Poulet pour Zoé » ne se résout pas par un prénom.
   */
  portionsSubject: string | null;
  /** Des TITRES de plats, tels qu'ils sont dans le plan. `[]` = aucun. */
  neverAgain: string[];
  /** L'inverse. `[]` = aucun, et c'est une réponse. */
  makeAgain: string[];
  /**
   * Le jeton de la 4e question ET sa réponse, ensemble.
   *
   * ⚠️ LES DEUX, JAMAIS LA SEULE RÉPONSE: `no` veut dire « pas eu faim » pour
   * `hunger_between_meals` et « pas fini » pour `could_finish`. Le lecteur ne
   * peut pas désambiguïser sans la question, et c'est écrit noir sur blanc dans
   * le commentaire de la colonne `axis_question`.
   */
  axisQuestion: string | null;
  axisAnswer: string | null;
}

export interface PlanFeedbackResult {
  ok: boolean;
  reason: string | null;
}

function asResult(raw: unknown): PlanFeedbackResult {
  const row = (raw ?? {}) as Record<string, unknown>;
  return {
    ok: row.ok === true,
    reason: typeof row.reason === "string" ? row.reason : null,
  };
}

/**
 * POSER LE RETOUR. La RPC vérifie que le plan est bien le sien.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠️ L'APPEL PASSE PAR UNE FONCTION EDGE DEPUIS LE LOT 2A, ET VOICI POURQUOI
 * ══════════════════════════════════════════════════════════════════════════
 * `keel_plan_feedback_submit` reste **la seule porte d'écriture** de la table,
 * et elle vérifie toujours la propriété du plan par `auth.uid()`: la fonction
 * edge l'appelle AVEC LE JETON DE LA PERSONNE, elle ne la contourne pas.
 *
 * Ce qu'elle ajoute est la moitié qui manquait: **l'extraction**. Les sept
 * réponses avaient une table, un écran et une RPC — et zéro lecteur backend.
 * Elles sont maintenant traduites en mémoire structurée (`portion.adjust`,
 * `food.exclude`, `food.prefer`, `logistics.set`) dans le MÊME geste, en
 * `service_role`, ce qu'un navigateur ne peut pas faire.
 *
 * ⚠️ ET SURTOUT: « POUR QUI ? » ENTRE DANS LE MÊME APPEL. La table porte
 * `unique (meal_id)` et la RPC est `on conflict do nothing` — une seule fois
 * par fenêtre, et c'est une règle produit. Une réponse posée par un second
 * appel serait donc soit avalée par le conflit, soit portée par un second
 * écrivain pour une seule intention: « le défaut n°1 de ce dépôt », écrit par
 * la table elle-même.
 *
 * ⚠️ `revoke all … from authenticated` SUR LA TABLE, ET ÇA DOIT LE RESTER: les
 * défauts Supabase donnent TOUT sur une table neuve, TRUNCATE compris, et
 * TRUNCATE échappe à RLS.
 *
 * ⚠️ `already_answered` N'EST PAS UNE PANNE. « Une seule fois par fenêtre » est
 * une contrainte de BASE, pas un `if` applicatif — deux surfaces peuvent
 * proposer ce questionnaire. La fonction rend `200 {ok:false, reason}` pour
 * tous les refus MÉTIER, précisément parce que `functions.invoke` ne rend pas
 * le corps d'une réponse non-2xx: un refus nommé y arriverait comme une panne
 * de bibliothèque.
 *
 * @param today LE JOUR DE LA PERSONNE (`browserLocalDate()`), passé par
 *   l'appelant et jamais lu ici. C'est le `at` de ce qui sera retenu — « je
 *   l'ai retenu de mardi » —, et l'horloge du serveur est en UTC: un mardi soir
 *   à Paris y ressort mercredi. Ce module ne lit aucune horloge, comme les
 *   modules serveurs dont il dépend.
 */
export async function submitPlanFeedback(
  mealId: string,
  answers: PlanFeedbackAnswers,
  today: string,
): Promise<PlanFeedbackResult> {
  const { data, error } = await supabase.functions.invoke("keel-plan-feedback-v1", {
    body: {
      meal_id: mealId,
      cooked: answers.cooked,
      portions: answers.portions,
      portions_subject: answers.portionsSubject,
      never_again: answers.neverAgain,
      make_again: answers.makeAgain,
      axis_question: answers.axisQuestion,
      axis_answer: answers.axisAnswer,
      today,
    },
  });
  if (error) {
    // Le motif NOMMÉ quand il y en a un (`Unauthorized`, une session périmée),
    // le message de la bibliothèque sinon. On n'invente pas de jeton.
    const refusal = await readEdgeRefusal(error);
    throw new Error(refusal?.token ?? (error as Error).message);
  }
  return asResult(data);
}

/**
 * ⛔ UN REFUS EST UNE RÉPONSE, ET IL SE STOCKE.
 *
 * Sans cet appel, l'élève qui ferme le questionnaire se le voit reproposer à
 * chaque ouverture de l'app: on transformerait un « non merci » en
 * harcèlement. C'est la fonction la moins spectaculaire de ce module et celle
 * dont l'absence se paierait le plus vite.
 */
export async function dismissPlanFeedback(
  mealId: string,
): Promise<PlanFeedbackResult> {
  const { data, error } = await supabase.rpc("keel_plan_feedback_dismiss", {
    p_meal_id: mealId,
  });
  if (error) throw new Error(error.message);
  return asResult(data);
}

/**
 * CE PLAN A-T-IL DÉJÀ SON RETOUR ? Réponse OU refus — les deux comptent.
 *
 * ⚠️ `select` EST LE SEUL DROIT QUE `authenticated` A SUR CETTE TABLE, et la
 * policy le borne à ses propres lignes. Un `count` suffit: on ne rend jamais le
 * contenu d'un retour à l'écran, on rend le FAIT qu'il existe.
 */
export async function planFeedbackAnswered(mealId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("meal_plan_feedback")
    .select("id")
    .eq("meal_id", mealId)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE PLAN QUI ATTEND SON RETOUR, ou `null`.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ « ÉCOULÉ » VIENT DE `selectMealPlans`, PAS D'UNE COMPARAISON ÉCRITE ICI.
 * C'est la même fonction qui décide, sur cette page, quel plan est COURANT —
 * deux définitions de « écoulé » finiraient par se contredire, et on
 * interrogerait quelqu'un sur la semaine qu'il est en train de cuisiner.
 *
 * ⚠️ ET `retired_at` EST DÉJÀ ÉCARTÉ PAR ELLE: on n'interroge pas un plan
 * remplacé. `feedbackIsDue` porte la même règle et reste la source du verdict;
 * ce lecteur-ci lui donne ses trois faits.
 *
 * ⚠️ LE PLUS RÉCENT DES ÉCOULÉS, ET UN SEUL. Empiler les questionnaires de
 * trois semaines passées ferait un arriéré, c'est-à-dire une dette — et un
 * produit qui ouvre sur une dette n'est pas ouvert deux fois.
 */
export interface PlanAwaitingFeedback {
  mealId: string;
  /** Les titres des plats, dédoublonnés, dans l'ordre du plan. */
  dishTitles: string[];
}

export async function loadPlanAwaitingFeedback(
  userId: string,
  today: string,
): Promise<PlanAwaitingFeedback | null> {
  const { data, error } = await supabase
    .from("student_generated_meals")
    .select("id, starts_on, duration_days, retired_at, created_at, dishes")
    // ⚠️ `.eq("user_id")` EXPLICITE, ET RLS N'EN DISPENSE PAS. La policy
    // `student_generated_meals_household_read` rend TOUTE ligne portant le
    // foyer, y compris le plan personnel d'un autre secondaire. Ce dépôt a déjà
    // rendu la ligne d'un élève à son coach faute d'un `.eq(user_id)`.
    .eq("user_id", userId)
    .order("starts_on", { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);

  const rows = (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.id ?? ""),
      startsOn: String(row.starts_on ?? ""),
      durationDays: Number(row.duration_days) || 1,
      retiredAt: (row.retired_at ?? null) as string | null,
      createdAt: (row.created_at ?? null) as string | null,
      dishes: row.dishes,
    };
  }).filter((r) => r.id && r.startsOn);

  const elapsed = selectMealPlans(rows, today).elapsed;
  const last = elapsed[0];
  if (!last) return null;

  // ── LE FAIT QUI FERME LA BOUCLE: un refus est une réponse ──────────────
  // Sans cette lecture, fermer le questionnaire le ferait revenir à chaque
  // ouverture de l'app — un « non merci » transformé en harcèlement.
  if (await planFeedbackAnswered(last.id)) return null;

  // LES TITRES, DÉDOUBLONNÉS. Un plat en lot est étendu sur chacun des jours
  // qu'il couvre par le moteur: sans le dédoublonnage, la liste porterait
  // « Chicken and rice » quatre fois et la personne marquerait quatre lignes
  // pour une seule intention.
  const seen = new Set<string>();
  const dishTitles: string[] = [];
  for (const entry of (Array.isArray(last.dishes) ? last.dishes : [])) {
    const title = String(((entry ?? {}) as Record<string, unknown>).title ?? "")
      .trim();
    if (!title || seen.has(title)) continue;
    seen.add(title);
    dishTitles.push(title);
  }

  return { mealId: last.id, dishTitles };
}
