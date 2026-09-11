import { isFrenchLocale } from "./locale.ts";
import {
  lifecycleEmailShell,
  type RenderedLifecycleEmail,
} from "./lifecycle_email.ts";

// FF-063 LOT 7 — LE DÉSABONNEMENT. DEUX MOMENTS, ET ON LES CONFOND TOUJOURS.
//
// ── CE QUI EXISTE AUJOURD'HUI: RIEN ─────────────────────────────────────
// Vérifié le 2026-09-09. `stripe-webhook/index.ts` copie `status` et
// `cancel_at_period_end` BRUTS dans son upsert (l.365-379), sans aucune
// branche; et `decideSubscriptionNotification`
// (`_shared/subscription-notification.ts:44-55`) rend `null` sur toute
// annulation — elle ne sait parler que d'activation et de changement de
// palier. Personne n'apprend donc jamais qu'un abonnement s'arrête, ni au
// moment de la décision, ni au moment de l'effet.
//
// ── LES DEUX MOMENTS, ET POURQUOI ILS NE SE RESSEMBLENT PAS ────────────
//   · L'INTENTION — `cancel_at_period_end` passe de `false` à `true`. La
//     personne vient de décider. Stripe envoie ça sur un
//     `customer.subscription.updated`, souvent plusieurs semaines avant l'effet.
//   · L'EFFET — `status` devient `canceled`. L'accès s'arrête.
//
// ⛔ À L'INTENTION, ON NE RETIENT PAS. C'est l'arbitrage le plus important de
// ce module, et il va contre l'instinct: un e-mail de rétention envoyé dans la
// minute où quelqu'un clique « annuler » est celui qui fait le plus de mal —
// il transforme une décision en négociation, et il apprend qu'annuler déclenche
// du harcèlement. On pose UNE question, sans bouton, et on s'arrête.
//
// ⛔ ON NE DIT PAS NON PLUS « on est triste de te voir partir ». Ça déplace le
// sujet sur nous au moment précis où on demande un service à quelqu'un qui
// part. « Qu'est-ce qui n'a pas marché ? » obtient plus de réponses.

export type CancelSegment = "cancel_intent" | "cancel_effective";

/** L'état d'un abonnement, réduit à ce dont la décision a besoin. */
export interface SubscriptionState {
  status: string | null;
  cancelAtPeriodEnd: boolean;
}

/**
 * Quelle transition, s'il y en a une ?
 *
 * `prev` vaut `null` quand aucune ligne n'existait — un abonnement qui NAÎT
 * annulé n'est pas une annulation, c'est un état initial bizarre dont personne
 * n'a besoin d'être averti.
 *
 * L'EFFET passe devant l'INTENTION quand les deux basculent sur le même
 * événement: on n'annonce pas « tu as décidé d'arrêter » à quelqu'un dont
 * l'accès vient de se couper.
 */
export function cancelSegmentFor(
  prev: SubscriptionState | null,
  next: SubscriptionState,
): CancelSegment | null {
  if (!prev) return null;

  const wasCanceled = String(prev.status ?? "").toLowerCase() === "canceled";
  const isCanceled = String(next.status ?? "").toLowerCase() === "canceled";
  if (!wasCanceled && isCanceled) return "cancel_effective";

  // Une fois annulé, on ne repart pas dans l'intention: le drapeau peut encore
  // bouger sur un abonnement mort, et ce serait un second e-mail pour rien.
  if (isCanceled) return null;

  if (!prev.cancelAtPeriodEnd && next.cancelAtPeriodEnd) return "cancel_intent";

  return null;
}

// ---------------------------------------------------------------------------
// LA COPIE
// ---------------------------------------------------------------------------

export interface CancelEmailArgs {
  firstName: string | null;
  unsubscribeUrl: string;
  locale: string;
}

/** L'intention. UNE question, aucun bouton, aucune tentative de retenir. */
function intentFrench(args: CancelEmailArgs): RenderedLifecycleEmail {
  const name = args.firstName?.trim() || null;
  return {
    subject: "Qu'est-ce qui n'a pas marché ?",
    html: lifecycleEmailShell(
      [
        `        <p>${name ? `Hello ${name},` : "Hello,"}</p>`,
        "",
        "        <p>Tu as arrêté ton abonnement. C'est noté, et rien ne change",
        "        avant la fin de ta période en cours.</p>",
        "",
        "        <p>Je ne vais pas essayer de te faire revenir. Mais si tu as",
        "        trente secondes : <strong>qu'est-ce qui n'a pas marché ?</strong></p>",
        "",
        "        <p>Réponds à ce message en une phrase, même brutale. C'est le",
        "        retour le plus utile que je puisse recevoir.</p>",
        "",
        "        <p><strong>Sophia</strong></p>",
      ].join("\n"),
      { unsubscribeHref: args.unsubscribeUrl, locale: args.locale },
    ),
  };
}

function intentEnglish(args: CancelEmailArgs): RenderedLifecycleEmail {
  const name = args.firstName?.trim() || null;
  return {
    subject: "What did not work?",
    html: lifecycleEmailShell(
      [
        `        <p>${name ? `Hello ${name},` : "Hello,"}</p>`,
        "",
        "        <p>You cancelled your subscription. That is recorded, and",
        "        nothing changes before the end of your current period.</p>",
        "",
        "        <p>I am not going to try to win you back. But if you have",
        "        thirty seconds: <strong>what did not work?</strong></p>",
        "",
        "        <p>Reply to this message in one sentence, however blunt. It is",
        "        the most useful feedback I can get.</p>",
        "",
        "        <p><strong>Sophia</strong></p>",
      ].join("\n"),
      { unsubscribeHref: args.unsubscribeUrl, locale: args.locale },
    ),
  };
}

/**
 * L'effet. TRANSACTIONNEL: ce qui s'arrête, ce qui reste, et où sont les
 * données. Rien à vendre — la personne vient de partir, et un argument ici
 * se lit comme une relance déguisée en reçu.
 */
function effectiveFrench(args: CancelEmailArgs): RenderedLifecycleEmail {
  const name = args.firstName?.trim() || null;
  return {
    subject: "Ton abonnement s'est arrêté",
    html: lifecycleEmailShell(
      [
        `        <p>${name ? `Hello ${name},` : "Hello,"}</p>`,
        "",
        "        <p>Ton abonnement est arrivé à son terme. À partir de",
        "        maintenant, je ne compose plus de plan sur ton compte.</p>",
        "",
        "        <p><strong>Ce que tu as reste à toi.</strong> Tes plans, tes",
        "        réponses, ton objectif et ton foyer sont là, intacts. Tu peux",
        "        les exporter ou les supprimer depuis ton compte, quand tu",
        "        veux — et si tu reprends un jour, tout est encore en place.</p>",
        "",
        "        <p><strong>Sophia</strong></p>",
      ].join("\n"),
      { unsubscribeHref: args.unsubscribeUrl, locale: args.locale },
    ),
  };
}

function effectiveEnglish(args: CancelEmailArgs): RenderedLifecycleEmail {
  const name = args.firstName?.trim() || null;
  return {
    subject: "Your subscription has ended",
    html: lifecycleEmailShell(
      [
        `        <p>${name ? `Hello ${name},` : "Hello,"}</p>`,
        "",
        "        <p>Your subscription has run its course. From now on I am not",
        "        building plans on your account.</p>",
        "",
        "        <p><strong>What you have stays yours.</strong> Your plans, your",
        "        answers, your goal and your household are there, untouched. You",
        "        can export or delete them from your account whenever you want —",
        "        and if you pick it up one day, it is all still in place.</p>",
        "",
        "        <p><strong>Sophia</strong></p>",
      ].join("\n"),
      { unsubscribeHref: args.unsubscribeUrl, locale: args.locale },
    ),
  };
}

export function renderCancelEmail(
  segment: CancelSegment,
  args: CancelEmailArgs,
): RenderedLifecycleEmail {
  const fr = isFrenchLocale(args.locale);
  if (segment === "cancel_intent") {
    return fr ? intentFrench(args) : intentEnglish(args);
  }
  return fr ? effectiveFrench(args) : effectiveEnglish(args);
}
