/**
 * FF-054 §3.2 — LE TRAITEMENT DES TAPS DU RETOUR DE FIN DE PLAN.
 *
 * Un module à part plutôt qu'un bloc de plus dans `deterministic_buttons.ts`,
 * pour la raison déjà écrite par `accident_tap.ts`: ce fichier-là est le
 * ROUTEUR des taps, et lui ajouter une machine à cinq questions le rendrait
 * illisible. Le routeur garde trois lignes — lire, router, rendre.
 *
 * ── CE QUE CE CHEMIN FAIT, ET CE QU'IL S'INTERDIT ─────────────────────────
 * Il ÉCRIT une réponse, il RELIT, et il pose la question suivante ou clôt.
 * Rien de plus:
 *   · aucun appel de modèle — les libellés sont des constantes bilingues
 *     (`QUESTION_LABELS`, `OPTION_LABELS`), et un prompt est une intention là
 *     où une constante est une garantie;
 *   · aucun champ libre — §3.2 l'interdit nommément: il inviterait à raconter
 *     ce qui a été mangé, et on évalue le plan, jamais la personne;
 *   · aucune relance — un « pas maintenant » écrit `dismissed_at` et rien ne
 *     reste ouvert derrière;
 *   · aucun accusé sans effet committé — une écriture qui échoue le dit.
 *
 * ⚠️ LE TAP NE DESCEND JAMAIS AU DISPATCHER. Même motif que `handleStripTap` et
 * `handleAccidentTap`: la lane de réponse ne sait ni ce qui a été écrit ni ce
 * qui a été refusé, et elle produit des accusés fantômes.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import {
  portionSubjectIsAsked,
} from "../keel/plan_feedback.ts";
import {
  type FeedbackLanguage,
  type FeedbackPrompt,
  type FeedbackReply,
  nextFeedbackStep,
  renderFeedbackClosing,
  renderFeedbackDismissed,
  renderFeedbackQuestion,
  renderFoodSubjectQuestion,
  renderPortionSubjectQuestion,
} from "../keel/plan_feedback_chat.ts";
import {
  type ChatFeedbackContext,
  type FeedbackPatch,
  loadChatFeedbackContext,
  writeFeedbackTap,
} from "../keel/plan_feedback_chat_io.ts";

export interface FeedbackTapResult {
  body: string;
  buttons: { payload: string; label: string }[];
  handledAs: string;
}

/**
 * Le tap est arrivé trop tard: le plan n'est plus celui qu'on interrogeait
 * (nouvelle fenêtre écoulée), ou la ligne a été fermée entre-temps par l'écran.
 *
 * On le DIT platement. Un silence laisserait croire que le tap a compté.
 */
function stale(language: FeedbackLanguage): FeedbackTapResult {
  return {
    body: language === "fr"
      ? "Ce retour n'est plus d'actualité — je ne l'ai pas enregistré."
      : "That feedback is no longer current — I have not recorded it.",
    buttons: [],
    handledAs: "keel_plan_feedback_stale",
  };
}

/** L'écriture n'a pas pris. On ne prétend rien, et on ne réessaie pas seul. */
function writeFailed(language: FeedbackLanguage): FeedbackTapResult {
  return {
    body: language === "fr"
      ? "Je n'ai pas réussi à enregistrer ça. Tu peux retaper."
      : "I could not save that. Tap again and I will.",
    buttons: [],
    handledAs: "keel_plan_feedback_write_failed",
  };
}

function asResult(
  prompt: FeedbackPrompt,
  handledAs: string,
): FeedbackTapResult {
  return {
    body: prompt.body,
    buttons: prompt.buttons.map((b) => ({ payload: b.id, label: b.title })),
    handledAs,
  };
}

/**
 * LA SUITE, DÉRIVÉE D'UN CONTEXTE RELU.
 *
 * ⚠️ RELU, jamais recalculé de tête après l'écriture. La règle de ce dépôt est
 * la vérité d'exécution: ce qu'on annonce sort de ce que la base rend. Le coût
 * est de trois lectures par tap, sur un chemin qui en fait au plus cinq dans la
 * vie d'un plan.
 *
 * `null` ⇒ il n'y a plus rien à demander: l'appelant clôt.
 */
export function nextPromptFor(
  context: ChatFeedbackContext,
): FeedbackPrompt | null {
  const step = nextFeedbackStep({
    row: context.row,
    questions: context.questions,
    subjectDue: portionSubjectIsAsked({
      portions: context.row.portions,
      mouths: context.mouths,
    }),
    // ⚠️ LA MÊME CONDITION QUE LA RELANCE DES PORTIONS, ET POUR LA MÊME
    // RAISON: un solo n'a aucune bouche à nommer, et lui poser la question
    // serait un choix à une seule issue.
    foodSubjectDue: context.mouths > 1,
  });
  if (step.step === "done") return null;
  if (step.step === "portions_subject") {
    return renderPortionSubjectQuestion({
      mealId: context.mealId,
      language: context.language,
      members: context.members,
    });
  }
  // ── LOT B · « POUR QUI ? » SUR L'ALIMENT QUI VIENT D'ÊTRE NOMMÉ ────────
  if (step.step === "food_subject") {
    const named = step.question === "never_again"
      ? context.row.neverAgainFoods
      : context.row.makeAgainFoods;
    return renderFoodSubjectQuestion({
      mealId: context.mealId,
      question: step.question,
      language: context.language,
      // ⚠️ L'ALIMENT VIENT DE LA LIGNE RELUE, pas d'un état de conversation:
      // c'est la vérité d'exécution du fichier, et c'est ce qui fait qu'un tap
      // sur un plan repris ailleurs se lit `stale` au lieu de désigner autre
      // chose.
      food: String(named[0]?.food ?? ""),
      members: context.members,
    });
  }
  return renderFeedbackQuestion({
    mealId: context.mealId,
    question: step.question,
    language: context.language,
    foodTerms: context.foodTerms,
    // Le « pas maintenant » n'est offert que sur la PREMIÈRE question (§3.2):
    // une fois qu'on a répondu à une question, la porte de sortie est de ne
    // plus taper, et un bouton de refus à chaque étape ressemblerait à une
    // insistance qui s'excuse.
    offerDismiss: context.row.answered.length === 0,
  });
}

/**
 * Le point d'entrée — un tap de la fiche devient un texte et des boutons.
 *
 * @param restrictionFlag le plancher TCA, résolu par l'appelant. REQUIS: il
 *   change la LISTE des questions, et un défaut silencieux poserait à quelqu'un
 *   sous plancher les questions que `questionsFor` lui retire.
 */
export async function handlePlanFeedbackTap(
  admin: SupabaseClient,
  args: {
    userId: string;
    reply: Exclude<FeedbackReply, { kind: "none" }>;
    localDate: string;
    nowIso: string;
    restrictionFlag: boolean;
    /** La langue de repli, quand le contexte n'est pas chargeable. */
    fallbackLanguage: FeedbackLanguage;
  },
): Promise<FeedbackTapResult> {
  const context = await loadChatFeedbackContext(admin, {
    userId: args.userId,
    localDate: args.localDate,
    restrictionFlag: args.restrictionFlag,
  });
  // Pas de contexte, ou un tap qui nomme un AUTRE plan que celui en cours: le
  // tap est périmé. On ne va pas chercher le plan qu'il nomme — un identifiant
  // qui décide de la ligne à écrire est un identifiant modifiable.
  if (!context || context.mealId !== args.reply.mealId) {
    return stale(args.fallbackLanguage);
  }
  const language = context.language;

  let patch: FeedbackPatch;
  switch (args.reply.kind) {
    case "dismiss":
      patch = {
        value: { dismissed_at: args.nowIso },
        marks: null,
      };
      break;
    case "subject":
      patch = {
        value: { portions_subject: args.reply.subject },
        marks: null,
      };
      break;
    case "dish": {
      const question = args.reply.question;
      if (args.reply.dishIndex === null) {
        // « Aucun » est une RÉPONSE: le tableau vide part avec son jeton, et
        // c'est précisément ce que le marqueur permet de dire.
        patch = question === "never_again"
          ? { value: { never_again_foods: [] }, marks: "never_again" }
          : { value: { make_again_foods: [] }, marks: "make_again" };
        break;
      }
      // ── LOT B · DES ALIMENTS, PLUS DES TITRES ────────────────────────────
      const food = context.foodTerms[args.reply.dishIndex];
      // Un index hors liste veut dire que le plan a changé sous le tap. On ne
      // devine pas quel aliment était visé.
      if (!food) return stale(language);
      // ⛔ LE SUJET N'EST PAS ÉCRIT ICI, ET IL VIENDRA PAR SA PROPRE BULLE.
      // `null` dit « la question ne s'est pas posée »; le pas suivant
      // (`food_subject`) la pose s'il y a plus d'une bouche, et réécrit la
      // ligne avec sa personne. Écrire `household` tout de suite ferait de
      // « on n'a pas encore demandé » une réponse — et retirerait l'aliment à
      // toute la table si la personne ferme le chat entre les deux bulles.
      patch = question === "never_again"
        ? {
          value: { never_again_foods: [{ food, subject: null }] },
          marks: "never_again",
        }
        : {
          value: { make_again_foods: [{ food, subject: null }] },
          marks: "make_again",
        };
      break;
    }
    // ── LOT B · « POUR QUI ? » SUR L'ALIMENT QUI VIENT D'ÊTRE NOMMÉ ────────
    // ⚠️ IL RÉÉCRIT LA LIGNE QU'ON VIENT D'ÉCRIRE, il n'en ajoute pas une: la
    // question porte sur CET aliment-là, et le chat n'en nomme qu'un par
    // question (§3.2, « un seul plat par question de plat »).
    case "food_subject": {
      const question = args.reply.question;
      const stored = question === "never_again"
        ? context.row.neverAgainFoods
        : context.row.makeAgainFoods;
      const food = String(
        ((stored[0] ?? {}) as Record<string, unknown>).food ?? "",
      ).trim();
      // Aucun aliment nommé: la relance n'a pas d'objet. Le plan a changé sous
      // le tap, ou la ligne a été reprise ailleurs.
      if (!food) return stale(language);
      patch = question === "never_again"
        ? {
          value: {
            never_again_foods: [{ food, subject: args.reply.subject }],
          },
          marks: "never_again",
        }
        : {
          value: {
            make_again_foods: [{ food, subject: args.reply.subject }],
          },
          marks: "make_again",
        };
      break;
    }
    case "answer": {
      const { question, value } = args.reply;
      if (question === "cooked") {
        patch = { value: { cooked: value }, marks: "cooked" };
      } else if (question === "portions") {
        patch = { value: { portions: value }, marks: "portions" };
      } else {
        // ⚠️ `never_again` / `make_again` N'ARRIVENT JAMAIS ICI, y compris pour
        // « aucun »: `readFeedbackReply` les rend TOUTES sous `kind: "dish"`,
        // avec `dishIndex: null` pour « aucun ». Une branche ici serait
        // inatteignable — une valeur d'énumération sans branche nommée, que ce
        // dépôt traite comme un défaut. Le test du lecteur pinne cette forme.
        // La question d'axe: son JETON est ce qui s'archive, parce que c'est
        // lui qu'un lecteur doit retrouver dans six mois — « often » seul ne
        // dit pas à quelle question il répond.
        patch = {
          value: { axis_question: question, axis_answer: value },
          marks: question,
        };
      }
      break;
    }
  }

  const written = await writeFeedbackTap(admin, {
    userId: args.userId,
    mealId: context.mealId,
    contentLocale: context.contentLocale,
    patch,
    alreadyAnswered: context.row.answered,
  });
  if (!written) return writeFailed(language);

  if (args.reply.kind === "dismiss") {
    return {
      body: renderFeedbackDismissed(language),
      buttons: [],
      handledAs: "keel_plan_feedback_dismissed",
    };
  }

  // ── LA SUITE, SUR UN CONTEXTE RELU ──────────────────────────────────────
  const after = await loadChatFeedbackContext(admin, {
    userId: args.userId,
    localDate: args.localDate,
    restrictionFlag: args.restrictionFlag,
  });
  const prompt = after ? nextPromptFor(after) : null;
  if (prompt) return asResult(prompt, "keel_plan_feedback_question");

  return {
    body: renderFeedbackClosing(language),
    buttons: [],
    handledAs: "keel_plan_feedback_done",
  };
}
