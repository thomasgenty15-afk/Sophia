/**
 * FF-061 — LA SUITE DE LA CHAÎNE, APRÈS UNE RÉPONSE.
 *
 * Le module pur voisin (`day_review.ts`) dit QUELLE étape suit. Celui-ci relit
 * l'état, l'interroge, et rend l'étape suivante prête à être collée sous
 * l'accusé.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * L'ÉTAT EST RELU APRÈS L'ÉCRITURE, ET C'EST TOUT LE POINT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Répondre « pas encore » aux courses invalide la cuisson que la vague sert,
 * donc les plats qui en descendent. Si la suite se calculait sur l'état
 * d'AVANT, elle proposerait l'étape ② d'une cuisson qui vient de tomber, puis
 * l'étape ③ de plats qui n'existent plus. Ce module ne prend donc AUCUN état en
 * paramètre: il relit, par le même chargeur que le message du soir.
 *
 * ⚠️ LE COÛT EST UNE RELECTURE PAR TAP, ET IL EST ASSUMÉ. L'alternative —
 * passer le `pending` calculé au moment de l'envoi — serait un état porté par
 * la charge du bouton, c'est-à-dire un état que le client peut réécrire ET qui
 * périme dès que la personne répond depuis un autre onglet.
 *
 * ⛔ CE MODULE NE PARLE JAMAIS EN PREMIER. Il ne rend que ce qui se colle sous
 * un accusé de tap (`isReply: true`). R1: un seul message par jour; ② et ③ sont
 * des réponses, jamais des notifications.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { buildSessionQuestion } from "./accident.ts";
import {
  type DayReviewPending,
  type DayReviewStep,
  stepAfter,
} from "./day_review.ts";
import {
  buildEveningStrip,
  buildShoppingStep,
  type StripLanguage,
} from "./evening_strip.ts";
import {
  loadEveningStripContext,
  respondsForHousehold,
} from "./evening_strip_io.ts";

export interface DayReviewNext {
  step: DayReviewStep;
  line: string;
  buttons: Array<{ id: string; title: string }>;
}

/**
 * L'étape qui suit celle qu'on vient de répondre, rendue — ou `null`.
 *
 * `null` dans quatre cas, et aucun n'est une panne:
 *   · la chaîne est finie (plus rien à demander);
 *   · le plancher de restriction est levé (R12: aucun bilan);
 *   · le renderer a refusé son propre texte (ceinture de R2, fail-closed du
 *     côté du silence);
 *   · le plan n'est plus lisible — l'accusé du tap part seul, et c'est déjà ce
 *     que ce chemin faisait avant la chaîne.
 *
 * ⚠️ NE JETTE JAMAIS. La personne vient de répondre: son fait est écrit, et une
 * panne de suite ne doit pas transformer un tap réussi en erreur. Le pire cas
 * est un accusé sans suite, c'est-à-dire le produit d'avant cette fiche.
 */
export async function nextDayReviewStep(
  admin: SupabaseClient,
  args: {
    userId: string;
    answered: DayReviewStep;
    localDate: string;
    language: StripLanguage;
    /** R12 — REQUIS. Un paramètre de garde optionnel est une garde désarmée. */
    restrictionFlag: boolean;
  },
): Promise<DayReviewNext | null> {
  if (args.restrictionFlag) return null;
  try {
    const ctx = await loadEveningStripContext(admin, {
      userId: args.userId,
      localDate: args.localDate,
    });
    if (!ctx.mealId) return null;
    const masterOnly = await respondsForHousehold(admin, args.userId);

    const pending: DayReviewPending = {
      shopping: Boolean(ctx.shopping) && ctx.shoppingAnswered === null &&
        masterOnly,
      cooking: ctx.cookOn !== null && masterOnly,
      meals: ctx.dishes.length > 0,
    };
    const next = stepAfter(args.answered, pending);
    if (!next) return null;

    if (next === "shopping" && ctx.shopping) {
      const built = buildShoppingStep({
        mealId: ctx.mealId,
        buyOn: ctx.shopping.buyOn,
        language: args.language,
        masterOnly,
        restrictionFlag: args.restrictionFlag,
      });
      return built ? { step: next, ...built } : null;
    }
    if (next === "cooking" && ctx.cookOn) {
      const q = buildSessionQuestion({
        mealId: ctx.mealId,
        cookOn: ctx.cookOn,
        language: args.language,
        restrictionFlag: args.restrictionFlag,
      });
      return q ? { step: next, line: q.body, buttons: q.buttons } : null;
    }
    if (next === "meals") {
      const strip = buildEveningStrip({
        mealId: ctx.mealId,
        dishes: ctx.dishes,
        language: args.language,
        // ⛔ `null`: la ligne de courses est l'étape ①, qui a son propre tour.
        // La rendre ici la ferait réapparaître APRÈS avoir été répondue.
        shopping: null,
        masterOnly,
        restrictionFlag: args.restrictionFlag,
      });
      return strip
        ? { step: next, line: strip.line, buttons: strip.buttons }
        : null;
    }
    return null;
  } catch (error) {
    console.warn(JSON.stringify({
      tag: "keel.day_review.next_step_unreadable",
      user_id: args.userId,
      answered: args.answered,
      error: error instanceof Error ? error.message : [
        (error as { code?: string })?.code,
        (error as { message?: string })?.message,
        (error as { details?: string })?.details,
        (error as { hint?: string })?.hint,
      ].filter(Boolean).join(" — ") || String(error),
      effect: "l'accuse du tap part seul, sans la suite",
    }));
    return null;
  }
}

/**
 * Coller la suite sous un accusé.
 *
 * ⚠️ DEUX BLOCS DANS UNE SEULE BULLE, PAS DEUX MESSAGES. Un second message
 * serait une seconde notification, et R1 n'en autorise qu'une par jour. C'est
 * la même composition que `renderPulseMessage`: le fait, puis ce qu'on offre,
 * séparés d'une ligne vide.
 */
export function appendNextStep(
  ack: { body: string; buttons: Array<{ payload: string; label: string }> },
  next: DayReviewNext | null,
): { body: string; buttons: Array<{ payload: string; label: string }> } {
  if (!next) return ack;
  return {
    body: [ack.body.trim(), next.line.trim()].filter(Boolean).join("\n\n"),
    // ⚠️ LA CONVERSION `{id,title}` → `{payload,label}` VIT ICI, UNE FOIS. Les
    // renderers parlent la forme des boutons (`id`/`title`), la livraison parle
    // la sienne (`payload`/`label`), et les deux appelants de ce module la
    // faisaient chacun de leur côté. Une conversion recopiée est une conversion
    // qu'un appelant finit par oublier — et un bouton sans `payload` est un
    // bouton muet, pas une erreur.
    buttons: [
      ...ack.buttons,
      ...next.buttons.map((b) => ({ payload: b.id, label: b.title })),
    ],
  };
}
