import { isFrenchLocale } from "./locale.ts";
import { daysBetween } from "./local_date.ts";
import {
  formatLocalDay,
  lifecycleEmailCta,
  lifecycleEmailShell,
  type RenderedLifecycleEmail,
} from "./lifecycle_email.ts";

// FF-063 LOT 8 — LA FIN D'ESSAI, ET SES DEUX HORLOGES.
//
// ── LE PIÈGE, ÉCRIT AVANT LE CODE ───────────────────────────────────────
// « L'essai de cette personne se termine le X » n'a pas une source, il en a
// deux, et elles ne disent pas la même chose:
//
//   · un MEMBRE de foyer est couvert par `households.free_until`;
//   · un compte SANS foyer, et le MAÎTRE d'un foyer, tombent sur
//     `profiles.trial_end` — parce que `recompute_profile_access_tier` exclut
//     explicitement `role = 'owner'` de `household_member` (20260811050000).
//
// Les deux dates coexistent sur la même personne. Lire la mauvaise, c'est
// annoncer une fin qui n'arrive pas — ou pire, ne rien annoncer avant un mur.
//
// ⚠️ ET `free_until IS NULL` VEUT DIRE COUVERT. Les foyers nés avant le
// 2026-08-11 — avant que le défaut existe — sont gratuits sans limite. Une
// lecture qui prendrait `null` pour « fini » leur écrirait « ton essai se
// termine demain » à tous, le même jour.
//
// ── CE QUE CE MODULE NE RÈGLE PAS ───────────────────────────────────────
// 🔴 `20260901200000_the_trial_is_a_week.sql:34-38`: « Le tunnel de paiement du
// foyer rend 500 faute de prix Stripe, et un foyer gelé n'a aucun chemin de
// dégel. » Envoyer « ton essai se termine demain » vers un tunnel qui rend 500
// est PIRE que ne rien envoyer: on crée la demande et on ferme la porte.
// Ce lot est écrit, testé, et il ne doit pas être armé avant que quelqu'un ait
// vérifié qu'un paiement passe. C'est un blocage produit, pas un défaut de code.

/** Les trois moments de la fin d'essai. */
export type TrialSegment =
  | "trial_ends_tomorrow"
  | "trial_ended_d1"
  | "trial_ended_d4";

export interface TrialFacts {
  /**
   * Le verdict de `keel_household_is_covered`, ou `null` hors foyer.
   *
   * ⛔ ON NE REÇOIT PAS `free_until`, ET C'EST UNE RÈGLE DE DÉPÔT.
   * `household_freeze_test.ts:334` refuse tout lecteur TypeScript de cette
   * colonne hors du chemin de facturation, et son motif tient: « ce foyer
   * est-il couvert » a UNE définition, en SQL. Un second lecteur diverge au
   * premier ajustement, et plus personne ne sait lequel ment.
   */
  householdCovered: boolean | null;
  /**
   * Le dernier jour d'essai, DÉJÀ résolu dans le calendrier de la personne par
   * `keel_lifecycle_facts`. `null` = rien à annoncer.
   */
  trialLastDay: string | null;
  /** Un abonnement actif ou en période d'essai payante. */
  hasPaidSubscription: boolean;
}

/**
 * Quel moment de la fin d'essai, s'il y en a un ?
 *
 * J−1, J+1, J+4 — TROIS étapes et pas quatre. Le plafond de cadence est de
 * quatre e-mails sur trente jours glissants, tous segments confondus, et une
 * fin de couverture peut tomber dans la même fenêtre. La quatrième étape de
 * l'ancienne séquence (`trial_ended_j_plus_5`) était de toute façon celle qui
 * ne demandait plus rien.
 */
export function trialSegmentFor(
  facts: TrialFacts,
  todayLocal: string,
): TrialSegment | null {
  // Quelqu'un qui paie n'a pas de fin d'essai à apprendre. Relu à chaque
  // candidat, jamais en cache: c'est le pire e-mail de la séquence à envoyer
  // par erreur.
  if (facts.hasPaidSubscription) return null;

  const lastDay = facts.trialLastDay;
  // `null` couvre trois situations qui appellent le même silence: aucun essai
  // posé, foyer couvert sans limite (`free_until IS NULL`, ce qui veut dire
  // COUVERT et jamais expiré), ou date illisible. SQL les a déjà fondues.
  if (!lastDay) return null;

  let delta: number;
  try {
    delta = daysBetween(todayLocal, lastDay);
  } catch {
    return null;
  }
  if (delta === 1) return "trial_ends_tomorrow";
  if (delta === -1) return "trial_ended_d1";
  if (delta === -4) return "trial_ended_d4";
  return null;
}

// ---------------------------------------------------------------------------
// LA COPIE
// ---------------------------------------------------------------------------

export interface TrialEmailArgs {
  firstName: string | null;
  /** Le dernier jour couvert, `YYYY-MM-DD`. */
  lastDay: string;
  /** L'URL absolue de la page d'abonnement. */
  upgradeUrl: string;
  unsubscribeUrl: string;
  locale: string;
}

/**
 * ⚠️ CE QUE CES PACKS NE DISENT PAS (docs/keel/LEGAL.md §6.1 et §6.2): aucun
 * poids chiffré, aucune durée associée à un poids, aucune garantie. Et rien
 * qui fasse peur: la fin d'un essai est un fait de facturation, pas une menace.
 */
function endsTomorrowFrench(args: TrialEmailArgs): RenderedLifecycleEmail {
  const name = args.firstName?.trim() || null;
  return {
    subject: "Ton essai se termine demain",
    html: lifecycleEmailShell(
      [
        `        <p>${name ? `Hello ${name},` : "Hello,"}</p>`,
        "",
        `        <p>Ton essai couvre jusqu'à demain, ${
          formatLocalDay(args.lastDay, args.locale)
        }.</p>`,
        "",
        "        <p>Après ça, je ne compose plus de plan sur ton compte. Ce que",
        "        tu as déjà — tes plans, tes réponses, ton objectif — reste là,",
        "        et te retrouve intact si tu reprends plus tard.</p>",
        "",
        lifecycleEmailCta(args.upgradeUrl, "Continuer avec Sophia"),
        "",
        "        <p><strong>Sophia</strong></p>",
      ].join("\n"),
      { unsubscribeHref: args.unsubscribeUrl, locale: args.locale },
    ),
  };
}

function endsTomorrowEnglish(args: TrialEmailArgs): RenderedLifecycleEmail {
  const name = args.firstName?.trim() || null;
  return {
    subject: "Your trial ends tomorrow",
    html: lifecycleEmailShell(
      [
        `        <p>${name ? `Hello ${name},` : "Hello,"}</p>`,
        "",
        `        <p>Your trial runs to tomorrow, ${
          formatLocalDay(args.lastDay, args.locale)
        }.</p>`,
        "",
        "        <p>After that I stop building plans on your account. What you",
        "        already have — your plans, your answers, your goal — stays put,",
        "        and is waiting intact if you pick it up later.</p>",
        "",
        lifecycleEmailCta(args.upgradeUrl, "Continue with Sophia"),
        "",
        "        <p><strong>Sophia</strong></p>",
      ].join("\n"),
      { unsubscribeHref: args.unsubscribeUrl, locale: args.locale },
    ),
  };
}

function endedD1French(args: TrialEmailArgs): RenderedLifecycleEmail {
  const name = args.firstName?.trim() || null;
  return {
    subject: "Je me suis mise en pause hier",
    html: lifecycleEmailShell(
      [
        `        <p>${name ? `Hello ${name},` : "Hello,"}</p>`,
        "",
        "        <p>Ton essai s'est terminé hier, donc je ne compose plus rien",
        "        sur ton compte. Tout le reste est intact.</p>",
        "",
        "        <p>Si tu veux reprendre, c'est immédiat et tu retrouves tes",
        "        réponses.</p>",
        "",
        lifecycleEmailCta(args.upgradeUrl, "Reprendre"),
        "",
        "        <p><strong>Sophia</strong></p>",
      ].join("\n"),
      { unsubscribeHref: args.unsubscribeUrl, locale: args.locale },
    ),
  };
}

function endedD1English(args: TrialEmailArgs): RenderedLifecycleEmail {
  const name = args.firstName?.trim() || null;
  return {
    subject: "I went quiet yesterday",
    html: lifecycleEmailShell(
      [
        `        <p>${name ? `Hello ${name},` : "Hello,"}</p>`,
        "",
        "        <p>Your trial ended yesterday, so I am not building anything on",
        "        your account any more. Everything else is untouched.</p>",
        "",
        "        <p>If you want to pick it up, it is immediate and your answers",
        "        are still there.</p>",
        "",
        lifecycleEmailCta(args.upgradeUrl, "Pick it up"),
        "",
        "        <p><strong>Sophia</strong></p>",
      ].join("\n"),
      { unsubscribeHref: args.unsubscribeUrl, locale: args.locale },
    ),
  };
}

/**
 * J+4. La DERNIÈRE de la séquence d'essai, et elle ne vend rien.
 *
 * À quatre jours, quelqu'un qui n'a pas repris a décidé. Ce qui reste utile est
 * de savoir pourquoi — et c'est une question, donc aucun bouton.
 */
function endedD4French(args: TrialEmailArgs): RenderedLifecycleEmail {
  const name = args.firstName?.trim() || null;
  return {
    subject: "Qu'est-ce qui t'a manqué ?",
    html: lifecycleEmailShell(
      [
        `        <p>${name ? `Hello ${name},` : "Hello,"}</p>`,
        "",
        "        <p>Tu as essayé Sophia et tu n'as pas continué. C'est une",
        "        réponse, et je la prends.</p>",
        "",
        "        <p><strong>Qu'est-ce qui t'a manqué ?</strong> Trop tôt, pas",
        "        assez utile au quotidien, pas le bon produit, le prix ?</p>",
        "",
        "        <p>Une phrase en réponse à ce message, même brutale. Et merci",
        "        d'avoir essayé — c'est la dernière fois que je t'écris.</p>",
        "",
        "        <p><strong>Sophia</strong></p>",
      ].join("\n"),
      { unsubscribeHref: args.unsubscribeUrl, locale: args.locale },
    ),
  };
}

function endedD4English(args: TrialEmailArgs): RenderedLifecycleEmail {
  const name = args.firstName?.trim() || null;
  return {
    subject: "What was missing?",
    html: lifecycleEmailShell(
      [
        `        <p>${name ? `Hello ${name},` : "Hello,"}</p>`,
        "",
        "        <p>You tried Sophia and did not continue. That is an answer, and",
        "        I'll take it.</p>",
        "",
        "        <p><strong>What was missing?</strong> Too early, not useful",
        "        enough day to day, not the right product, the price?</p>",
        "",
        "        <p>One sentence in reply, however blunt. And thank you for",
        "        trying — this is the last time I write to you.</p>",
        "",
        "        <p><strong>Sophia</strong></p>",
      ].join("\n"),
      { unsubscribeHref: args.unsubscribeUrl, locale: args.locale },
    ),
  };
}

export function renderTrialEmail(
  segment: TrialSegment,
  args: TrialEmailArgs,
): RenderedLifecycleEmail {
  const fr = isFrenchLocale(args.locale);
  if (segment === "trial_ends_tomorrow") {
    return fr ? endsTomorrowFrench(args) : endsTomorrowEnglish(args);
  }
  if (segment === "trial_ended_d1") {
    return fr ? endedD1French(args) : endedD1English(args);
  }
  return fr ? endedD4French(args) : endedD4English(args);
}
