/**
 * FF-054 §3.2 — LES LECTURES ET LES ÉCRITURES DU RETOUR DANS LA CONVERSATION.
 *
 * Le pur vit dans `plan_feedback_chat.ts`; ici il n'y a que de la base.
 *
 * ══ POURQUOI CE MODULE N'APPELLE PAS `keel_plan_feedback_submit` ═══════════
 *
 * La RPC de l'écran est `security definer` et gatée sur `auth.uid()`. Le chemin
 * déterministe du chat tourne en `service_role`, où **`auth.uid()` est NULL** —
 * cicatrice `auth-uid-null-under-service-role`: « toute RPC gatée dessus est
 * morte ». L'appeler d'ici rendrait `not_authenticated` à chaque tap, en
 * silence pour l'élève.
 *
 * Et elle est `on conflict (meal_id) do nothing`: elle écrit TOUT d'un coup,
 * une seule fois. Le chat, lui, remplit la ligne tap après tap.
 *
 * ⚠️ CE QUE ÇA IMPOSE, ET CE FICHIER LE FAIT PARTOUT: `.eq("user_id", …)` sur
 * chaque écriture. Le `service_role` traverse RLS — « RLS ne remplace pas un
 * `.eq(user_id)` » est une cicatrice de ce dépôt, payée par la ligne d'un élève
 * rendue à quelqu'un d'autre. La propriété du plan est vérifiée AVANT la
 * première écriture, exactement comme la RPC le fait.
 *
 * ══ LA LIGNE EST L'ÉTAT ═══════════════════════════════════════════════════
 * `unique (meal_id)`: une ligne par plan. Le premier tap l'insère, les suivants
 * la mettent à jour. Il n'y a donc AUCUN état conversationnel à invalider — ce
 * que ce dépôt paie en boucle quand il en crée un.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import {
  type FeedbackQuestion,
  questionsFor,
} from "./plan_feedback.ts";
import type { StudentGoal } from "./week_plan_generation.ts";
import {
  foodTermsOf,
  EMPTY_FEEDBACK_ROW,
  type FeedbackLanguage,
  type FeedbackRowState,
} from "./plan_feedback_chat.ts";
import { planEndsOn, planWindowState } from "./meal_plan_window.ts";
import { localDateInZone } from "./local_date.ts";
import { evaluateRestrictionForStudent } from "./restriction_runtime.ts";
import { deliverChatMessage } from "../chat/delivery.ts";
import { nextPromptFor } from "../chat/plan_feedback_tap.ts";
import { isFrenchLocale, resolveArtifactLocale } from "./locale.ts";

/** La table. Une constante pour que les tests et la QA citent la même chaîne. */
export const FEEDBACK_TABLE = "meal_plan_feedback";

export interface ChatFeedbackContext {
  mealId: string;
  contentLocale: string;
  language: FeedbackLanguage;
  /** Les ALIMENTS du plan — lot B, la liste fermée des deux questions de plat. */
  foodTerms: string[];
  row: FeedbackRowState;
  questions: FeedbackQuestion[];
  /** Le nombre de bouches à table, le compte lui-même compris. */
  mouths: number;
  members: { memberId: string; firstName: string }[];
}

function str(v: unknown): string {
  return String(v ?? "").trim();
}

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => str(x)).filter((x) => x !== "");
}

/**
 * La ligne de retour d'un plan, projetée sur l'état que le pur consomme.
 *
 * ⚠️ `answered` PORTE L'ÉTAT, LES COLONNES PORTENT LE CONTENU. Les deux
 * colonnes de plats sont `not null default '[]'`: la base ne peut pas dire
 * « pas encore demandé », et sans le marqueur (migration `20260901160000`) le
 * questionnaire sauterait ses deux questions de plats dès le deuxième tap. Le
 * motif complet est dans la migration.
 */
/**
 * LES ALIMENTS D'UNE COLONNE, tels qu'ils sont stockés — lot B.
 *
 * ⚠️ UNE ENTRÉE ILLISIBLE TOMBE SEULE. Le chat n'écrit qu'un aliment par
 * question, mais l'écran peut en écrire plusieurs, et une charge trafiquée
 * n'importe quoi. `subject: null` est LU comme tel: il dit « nommé, sujet pas
 * encore demandé », qui est l'état où la relance est due.
 */
function foodArray(v: unknown): { food: string; subject: string | null }[] {
  if (!Array.isArray(v)) return [];
  const out: { food: string; subject: string | null }[] = [];
  for (const entry of v) {
    const row = (entry ?? {}) as Record<string, unknown>;
    const food = String(row.food ?? "").trim();
    if (!food) continue;
    const subject = String(row.subject ?? "").trim();
    out.push({ food, subject: subject || null });
  }
  return out;
}

function readFeedbackRow(raw: Record<string, unknown> | null): FeedbackRowState {
  if (!raw) return EMPTY_FEEDBACK_ROW;
  return {
    cooked: str(raw.cooked) || null,
    portions: str(raw.portions) || null,
    portionsSubject: str(raw.portions_subject) || null,
    neverAgain: strArray(raw.never_again),
    makeAgain: strArray(raw.make_again),
    neverAgainFoods: foodArray(raw.never_again_foods),
    makeAgainFoods: foodArray(raw.make_again_foods),
    // ── LOT B ────────────────────────────────────────────────────────────
    difficulty: str(raw.difficulty) || null,
    speed: str(raw.speed) || null,
    variety: str(raw.variety) || null,
    anythingElse: str(raw.anything_else) || null,
    axisQuestion: str(raw.axis_question) || null,
    axisAnswer: str(raw.axis_answer) || null,
    answered: strArray(raw.answered),
    dismissedAt: str(raw.dismissed_at) || null,
  };
}

/**
 * Le contexte du retour dû, ou `null` quand il n'y a rien à demander.
 *
 * `null` dans tous ces cas, et aucun n'est une erreur:
 *   · aucun plan écoulé;
 *   · le plan écoulé a déjà sa ligne complète, ou un refus;
 *   · une lecture en panne — on préfère ne rien demander que demander mal.
 *
 * @param restrictionFlag le plancher TCA. REQUIS: il change la LISTE des
 *   questions (`questionsFor`), et un défaut silencieux poserait à quelqu'un
 *   sous plancher les questions qu'on lui retire.
 */
export async function loadChatFeedbackContext(
  admin: SupabaseClient,
  args: { userId: string; localDate: string; restrictionFlag: boolean },
): Promise<ChatFeedbackContext | null> {
  try {
    // ── LE PLAN ÉCOULÉ LE PLUS RÉCENT ───────────────────────────────────
    // Même sélection que l'écran (`planWindowState`), et le même refus des
    // plans retirés. 30 lignes suffisent: on ne remonte jamais plus loin que
    // le dernier, et une fenêtre dure au plus 7 jours.
    const plans = await admin
      .from("student_generated_meals")
      // ⚠️ `preparations` DEPUIS LE LOT B: les deux questions de plat proposent
      // des ALIMENTS, et en cuisine par lots la protéine vit dans la
      // préparation, pas dans le plat.
      .select(
        "id, starts_on, duration_days, retired_at, content_locale, dishes, preparations",
      )
      .eq("user_id", args.userId)
      .order("starts_on", { ascending: false })
      .limit(30);
    if (plans.error) throw plans.error;

    const rows = (plans.data ?? []) as Array<Record<string, unknown>>;
    // ⟳ 2026-09-02 — LE DERNIER JOUR COMPTE, PAS SEULEMENT LE LENDEMAIN.
    //
    // C'était `planWindowState(...) === "elapsed"`, c'est-à-dire STRICTEMENT
    // après la fin de la fenêtre: le questionnaire ne pouvait donc partir que
    // le LENDEMAIN de la clôture, et il partait dans le message du soir
    // (20h-22h), en remplacement du bilan.
    //
    // FF-062 le corrige: il part **à la fermeture**, le dernier jour, à 22h30 —
    // après le bilan du jour, qui a encore quelque chose à demander sur ce
    // jour-là. `today >= endsOn` couvre les deux: le dernier jour, et le
    // lendemain si le tick de 22h a été manqué. Un rattrapage plutôt qu'une
    // perte, et sans seconde règle à tenir.
    const closed = rows
      .filter((r) => !str(r.retired_at))
      .filter((r) => {
        const startsOn = str(r.starts_on);
        const durationDays = Number(r.duration_days) || 1;
        const state = planWindowState({ startsOn, durationDays }, args.localDate);
        if (state === "elapsed") return true;
        // Le dernier jour est encore `in_window`: on le nomme explicitement
        // plutôt que d'élargir `planWindowState`, dont six autres lecteurs
        // dépendent — élargir un vocabulaire d'état pour un seul appelant est
        // la façon la plus discrète de changer six comportements.
        return state === "in_window" &&
          args.localDate === planEndsOn(startsOn, durationDays);
      });
    const last = closed[0];
    if (!last) return null;

    const mealId = str(last.id);
    if (!mealId) return null;

    // ── LA LIGNE DE RETOUR ──────────────────────────────────────────────
    const feedback = await admin
      .from(FEEDBACK_TABLE)
      .select(
        "cooked, portions, portions_subject, never_again, make_again, " +
          "axis_question, axis_answer, answered, dismissed_at",
      )
      .eq("user_id", args.userId)
      .eq("meal_id", mealId)
      .maybeSingle();
    if (feedback.error) throw feedback.error;
    const row = readFeedbackRow(
      (feedback.data ?? null) as Record<string, unknown> | null,
    );
    // Un refus est une RÉPONSE: on ne repropose jamais.
    if (row.dismissedAt) return null;

    // ── L'OBJECTIF, QUI DÉCIDE DE LA QUATRIÈME QUESTION ─────────────────
    const goals = await admin
      .from("student_goals")
      .select("goal")
      .eq("user_id", args.userId)
      .maybeSingle();
    if (goals.error) throw goals.error;
    const goal = (str((goals.data as { goal?: unknown } | null)?.goal) ||
      null) as StudentGoal | null;

    // ── LES BOUCHES ─────────────────────────────────────────────────────
    // Best-effort: sans elles, `portionSubjectIsAsked` rendra faux et la
    // relance ne se posera pas. On perd une précision, jamais le questionnaire.
    let members: { memberId: string; firstName: string }[] = [];
    try {
      const roster = await admin.rpc("keel_household_roster_for", {
        p_user: args.userId,
      });
      if (!roster.error && Array.isArray(roster.data)) {
        members = (roster.data as Array<Record<string, unknown>>)
          .map((m) => ({
            memberId: str(m.member_id),
            firstName: str(m.first_name),
          }))
          .filter((m) => m.memberId !== "");
      }
    } catch (error) {
      console.warn(JSON.stringify({
        tag: "keel.plan_feedback_chat.roster_unreadable",
        user_id: args.userId,
        error: error instanceof Error ? error.message : String(error),
        effect: "la relance « pour qui ? » ne sera pas posee",
      }));
    }

    const contentLocale = resolveArtifactLocale({
      studentProfile: str(last.content_locale) || null,
      tenantDefault: null,
    });

    return {
      mealId,
      contentLocale,
      language: isFrenchLocale(contentLocale) ? "fr" : "en",
      foodTerms: foodTermsOf(last.dishes, last.preparations),
      row,
      // ⚠️ PLUS D'OBJECTIF — lot B: les questions ne dépendent plus de la
      // dynamique.
      //
      // ⛔ ET `anything_else` NE PASSE PAS PAR LE CHAT. Le flux du chat est à
      // BOUTONS (FF-054 §3.2): un champ libre y demanderait à la personne de
      // taper un message ordinaire, que le chemin déterministe ne capte pas —
      // elle croirait avoir répondu, et rien ne serait écrit. Le renversement
      // du 2026-09-03 est donc borné à l'ÉCRAN, et la règle « aucun champ
      // libre » de §3.2 reste ENTIÈRE ici.
      //
      // ⚠️ DEUX GARDES POUR UNE RÈGLE, ET C'EST VOULU: `renderFeedbackQuestion`
      // rend déjà `null` pour elle (aucune option). Ce filtre-ci évite qu'un
      // pas « question » soit rendu puis abandonné en silence — ce qui
      // ressemblerait à un questionnaire qui s'arrête tout seul.
      questions: questionsFor(args.restrictionFlag).filter(
        (q) => q !== "anything_else",
      ),
      // Un solo n'a AUCUNE ligne `household_members`: `mouths` vaut alors 1 —
      // lui-même — et la relance ne se pose pas, ce qui est correct.
      mouths: Math.max(1, members.length),
      members,
    };
  } catch (error) {
    console.warn(JSON.stringify({
      tag: "keel.plan_feedback_chat.context_unreadable",
      user_id: args.userId,
      error: error instanceof Error ? error.message : String(error),
      effect: "aucun retour de fin de plan demande ce soir",
    }));
    return null;
  }
}

/**
 * Ce qu'un tap écrit — la valeur ET son jeton de marquage.
 *
 * ⚠️ LES DEUX VONT ENSEMBLE, TOUJOURS. Une valeur écrite sans son jeton fait
 * reposer la question; un jeton écrit sans valeur fait sauter une question
 * jamais répondue. Les apparier dans le TYPE est ce qui rend l'oubli
 * impossible plutôt qu'improbable.
 *
 * `portions_subject` et `dismissed_at` ne marquent RIEN: le premier est une
 * relance (son état est la colonne elle-même, qui est nullable), le second
 * ferme le questionnaire entier.
 */
export type FeedbackPatch =
  | { value: { cooked: string }; marks: "cooked" }
  | { value: { portions: string }; marks: "portions" }
  | { value: { portions_subject: string }; marks: null }
  | { value: { never_again_foods: unknown[] }; marks: "never_again" }
  | { value: { make_again_foods: unknown[] }; marks: "make_again" }
  // ── LOT B · LES TROIS ÉCHELLES ET LE CHAMP LIBRE ───────────────────────
  | { value: { difficulty: string }; marks: "difficulty" }
  | { value: { speed: string }; marks: "speed" }
  | { value: { variety: string }; marks: "enough_variety" }
  | { value: { anything_else: string }; marks: "anything_else" }
  /**
   * ⚠️ HÉRITÉ, ET IL RESTE ÉCRIVABLE POUR UNE SEULE RAISON: une ligne en cours
   * de questionnaire, commencée avant le lot B, peut encore recevoir sa
   * réponse d'axe. Aucun chemin vivant ne la produit — `FEEDBACK_QUESTIONS` ne
   * contient plus ces jetons — et le retirer ferait tomber ces lignes-là au
   * milieu de leur questionnaire.
   */
  | { value: { axis_question: string; axis_answer: string }; marks: string }
  | { value: { dismissed_at: string }; marks: null };

/**
 * Écrit un tap sur la ligne du plan, en la créant au besoin.
 *
 * Rend `true` quand la base porte la valeur APRÈS l'appel — pas quand la
 * requête est partie. Un accusé sans effet committé est le défaut le plus cher
 * de ce dépôt, et cette fonction est le seul endroit qui peut l'éviter ici.
 *
 * ⚠️ LA PROPRIÉTÉ DU PLAN EST VÉRIFIÉE PAR LE `.eq("user_id")` DE L'INSERT ET
 * DE L'UPDATE, jamais par une lecture préalable: entre la lecture et
 * l'écriture, il y a une fenêtre. `user_id` étant colonne de la table et le
 * plan étant chargé par `.eq("user_id")` en amont, une charge forgée qui
 * nommerait le plan de quelqu'un d'autre insérerait une ligne au nom du
 * TAPEUR — que la contrainte `unique (meal_id)` refuserait si l'autre a déjà
 * répondu, et qui de toute façon ne rend aucune donnée d'autrui.
 */
export async function writeFeedbackTap(
  admin: SupabaseClient,
  args: {
    userId: string;
    mealId: string;
    contentLocale: string;
    patch: FeedbackPatch;
    /**
     * Les jetons DÉJÀ marqués sur la ligne. Requis: `answered` est un tableau
     * jsonb, pas un ensemble — on le recompose ici plutôt que de demander à
     * PostgREST une concaténation qu'il ne sait pas faire sans RPC.
     *
     * La course (deux taps simultanés) est acceptée et nommée: le dernier
     * gagne, et il porte au moins son propre jeton. Le pire cas est une
     * question reposée, jamais une réponse perdue.
     */
    alreadyAnswered: readonly string[];
  },
): Promise<boolean> {
  const patch: Record<string, unknown> = { ...args.patch.value };
  if (args.patch.marks) {
    const marks = new Set([...args.alreadyAnswered, args.patch.marks]);
    patch.answered = [...marks];
  }
  try {
    const updated = await admin
      .from(FEEDBACK_TABLE)
      .update(patch)
      .eq("user_id", args.userId)
      .eq("meal_id", args.mealId)
      .select("id");
    if (updated.error) throw updated.error;
    // ⚠️ UN UPDATE DE ZÉRO LIGNE EST UN 204 MUET. Il faut le distinguer d'un
    // succès — c'est la cicatrice `rls-is-not-a-substitute-for-eq-user-id`.
    if ((updated.data ?? []).length > 0) return true;

    const inserted = await admin
      .from(FEEDBACK_TABLE)
      .insert({
        user_id: args.userId,
        meal_id: args.mealId,
        content_locale: args.contentLocale,
        ...patch,
      })
      .select("id");
    if (!inserted.error) return (inserted.data ?? []).length > 0;

    // 23505 = la ligne vient d'apparaître (l'écran, un double tap). On rejoue
    // l'update: la réponse de la personne ne doit pas être perdue pour une
    // course qu'elle n'a pas provoquée.
    if (str((inserted.error as { code?: string }).code) === "23505") {
      const retry = await admin
        .from(FEEDBACK_TABLE)
        .update(patch)
        .eq("user_id", args.userId)
        .eq("meal_id", args.mealId)
        .select("id");
      if (retry.error) throw retry.error;
      return (retry.data ?? []).length > 0;
    }
    throw inserted.error;
  } catch (error) {
    console.warn(JSON.stringify({
      tag: "keel.plan_feedback_chat.write_failed",
      user_id: args.userId,
      meal_id: args.mealId,
      keys: Object.keys(patch),
      error: error instanceof Error ? error.message : String(error),
    }));
    return false;
  }
}

// ---------------------------------------------------------------------------
// L'ÉMETTEUR — 22h, le dernier jour de la fenêtre
// ---------------------------------------------------------------------------

/**
 * FF-054 §3.2 / FF-062 — LE RETOUR DE FIN DE PLAN, À LA FERMETURE.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ DÉPLACÉ LE 2026-09-02, ET LE DÉPLACEMENT EST LA CORRECTION
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Il vivait dans `keel-daily-pulse-v1` et PRENAIT LA PLACE du message du soir
 * (20h-22h), le lendemain de la clôture. Deux choses n'allaient pas:
 *
 *   · il n'est pas quotidien, et l'accrocher au message quotidien lui faisait
 *     hériter d'une fenêtre et d'une garde qui ne sont pas les siennes;
 *   · il COÛTAIT le bilan du jour. Le dernier jour d'un plan porte encore des
 *     courses, une cuisson et des repas à déclarer — les remplacer par un
 *     questionnaire perd les trois faits pour en gagner un.
 *
 * 22h et pas minuit: *« quand la fenêtre s'achève »* est une borne de
 * calendrier, pas une heure où l'on pose une question. 22h est APRÈS le bilan
 * du jour (20h-22h), donc les deux ne se disputent plus la soirée.
 *
 * ⚠️ « 22h30 » DANS LA FICHE, « L'HEURE 22 » DANS LE CODE, et l'écart est réel.
 * Le cron tombe à la minute :30 UTC; sur un fuseau à décalage entier c'est bien
 * 22h30 locales, mais l'Inde (+5:30) le voit à 22h00 et le Népal (+5:45) à
 * 22h15. Prétendre à la minute demanderait de porter l'offset du fuseau dans la
 * décision, pour un gain nul: ce qui compte est « après le bilan, avant
 * minuit », et l'heure 22 le tient partout.
 */
export const PLAN_FEEDBACK_HOUR = 22;

export interface PlanFeedbackStepOutcome {
  /** Le pas a-t-il été ATTEINT ? Distinct de « a-t-il envoyé ». */
  examined: boolean;
  sent: boolean;
  reason: string;
}

export async function runPlanFeedbackStep(
  admin: SupabaseClient,
  args: {
    userId: string;
    timezone: string | null;
    muted: boolean;
    now: Date;
    dryRun?: boolean;
    requestId?: string;
  },
): Promise<PlanFeedbackStepOutcome> {
  const zone = String(args.timezone ?? "").trim();
  if (!zone) return { examined: false, sent: false, reason: "no_timezone" };

  const localHour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hour: "numeric",
      hour12: false,
    }).format(args.now),
  );
  // LA FENÊTRE D'ABORD, PARCE QU'ELLE EST GRATUITE: vingt-trois heures sur
  // vingt-quatre sortent ici, sans lire un plan ni un plancher.
  if (!Number.isFinite(localHour) || localHour !== PLAN_FEEDBACK_HOUR) {
    return { examined: false, sent: false, reason: "outside_window" };
  }
  if (args.muted) return { examined: true, sent: false, reason: "muted" };

  const localDate = localDateInZone(zone, args.now);

  // Le plancher, comme partout: une lecture en panne vaut plancher LEVÉ. Il ne
  // ferme pas le questionnaire — il en change la LISTE de questions
  // (`questionsFor`) — donc se tromper ici coûte une question, jamais la garde.
  let restrictionFlag = true;
  try {
    const floor = await evaluateRestrictionForStudent(admin as never, {
      userId: args.userId,
      asOfLocalDate: localDate,
    });
    restrictionFlag = floor.restriction_flag === true;
  } catch (error) {
    console.warn(JSON.stringify({
      tag: "keel.plan_feedback.restriction_unreadable",
      user_id: args.userId,
      error: error instanceof Error ? error.message : String(error),
      effect: "fail-closed: liste de questions reduite",
    }));
  }

  const context = await loadChatFeedbackContext(admin, {
    userId: args.userId,
    localDate,
    restrictionFlag,
  });
  const prompt = context ? nextPromptFor(context) : null;
  if (!prompt) return { examined: true, sent: false, reason: "nothing_to_ask" };
  if (args.dryRun) return { examined: true, sent: false, reason: "dry_run" };

  const delivered = await deliverChatMessage(admin, {
    userId: args.userId,
    content: prompt.body,
    // ⛔ SON PROPRE PURPOSE, ENFIN. Il sortait sous `keel_daily_pulse` pour
    // hériter de sa garantie de livraison; il a maintenant le sien, et il est
    // dans `GUARANTEED_PURPOSES` à son nom. Emprunter le purpose d'un autre
    // canal rendait « combien de retours de fin de plan sont partis ? »
    // indénombrable — la question que §10 pose.
    purpose: PLAN_FEEDBACK_PURPOSE,
    buttons: prompt.buttons.map((b) => ({ payload: b.id, label: b.title })),
    requestId: args.requestId,
    now: args.now,
  });
  if (!delivered.delivered) {
    return { examined: true, sent: false, reason: `delivery:${delivered.reason}` };
  }
  console.info(JSON.stringify({
    tag: "keel.plan_feedback.opened",
    user_id: args.userId,
    local_date: localDate,
    meal_id: context?.mealId ?? null,
    language: context?.language ?? null,
    interactive_count: prompt.buttons.length,
  }));
  return { examined: true, sent: true, reason: "sent" };
}

/** Le `purpose` de la bulle du questionnaire de fin de plan. */
export const PLAN_FEEDBACK_PURPOSE = "keel_plan_feedback";
