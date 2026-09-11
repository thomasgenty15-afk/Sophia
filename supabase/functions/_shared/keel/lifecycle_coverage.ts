import { isFrenchLocale } from "./locale.ts";
import { daysBetween } from "./local_date.ts";
import {
  formatLocalDay,
  lifecycleEmailCta,
  lifecycleEmailShell,
  type RenderedLifecycleEmail,
} from "./lifecycle_email.ts";

// FF-063 LOT 4 — LA FIN DE COUVERTURE. LE CURSEUR DE TOUTE LA SÉQUENCE.
//
// ── LE DÉFAUT QUE CE MODULE EXISTE POUR NE PAS COMMETTRE ─────────────────
// Vérifié le 2026-09-09: il n'existe AUCUNE colonne « dernière visite » dans
// ce dépôt. Ouvrir l'app pour LIRE son plan — le geste le plus fréquent du
// produit — ne laisse aucune trace. Une séquence de relance bâtie sur le
// silence enverrait donc « on ne te voit plus » au jour 3 à quelqu'un qui a
// composé sept jours et qui cuisine tous les soirs. C'est-à-dire au
// comportement NOMINAL, et à la personne la plus fidèle.
//
// Ce qu'on mesure à la place est la COUVERTURE: `student_generated_meals`
// porte `ends_on`, une colonne GÉNÉRÉE (`starts_on + duration_days - 1`,
// migration 20260807090000). Tant qu'un plan couvre aujourd'hui, on se tait.
// Le jour où la couverture s'arrête, on ne demande pas « où es-tu passé » —
// on dit « il n'y a plus rien de prévu pour demain », ce qui est un service.
//
// ── DEUX MOMENTS, ET PAS UN DE PLUS ──────────────────────────────────────
//   · J−1  la veille du dernier jour couvert. C'est le seul e-mail de la
//          séquence qui arrive AVANT le problème.
//   · J+3  trois jours après. Pas J+1: quelqu'un qui recompose le lendemain
//          n'a pas décroché, il a pris un jour.
//
// ⛔ PAS DE TROISIÈME PALIER ICI. Au-delà, ce n'est plus une fin de plan,
// c'est un décrochage — et c'est `long_lapse_d14` qui le porte, avec un autre
// ton et une autre question.

/** Les deux moments de la fin de couverture. */
export type CoverageSegment = "coverage_ends_tomorrow" | "coverage_lapsed_d3";

/**
 * Ce que la décision a besoin de savoir. Chargé par le job, jamais lu ici.
 */
export interface CoverageFacts {
  /**
   * Le dernier jour couvert par un plan VIVANT (`retired_at is null`), ou
   * `null` si la personne n'a jamais composé.
   *
   * `null` ne déclenche rien: quelqu'un qui n'a jamais composé relève de
   * l'activation (`funnel_unfinished_*`, `first_plan_no_trace`), pas d'une fin
   * de couverture. Confondre les deux enverrait « ton plan se termine » à
   * quelqu'un qui n'en a jamais eu.
   */
  lastCoveredDay: string | null;
  /**
   * Un plan commence-t-il APRÈS aujourd'hui ?
   *
   * ⚠️ CETTE GARDE N'EST PAS REDONDANTE avec `lastCoveredDay`. Un plan d'UN
   * JOUR qui commence demain a `ends_on` = demain: il ferait donc valoir
   * `lastCoveredDay = demain` — et sans cette ligne on écrirait « il n'y a
   * rien de prévu après demain » à quelqu'un qui vient précisément de prévoir
   * demain.
   */
  hasFuturePlan: boolean;
}

/**
 * Quel moment de la fin de couverture, s'il y en a un ?
 *
 * `todayLocal` est la journée de la PERSONNE (`YYYY-MM-DD`), pas celle du
 * serveur: un job en UTC dirait « demain » à quelqu'un pour qui c'est déjà
 * après-demain.
 */
export function coverageSegmentFor(
  facts: CoverageFacts,
  todayLocal: string,
): CoverageSegment | null {
  if (!facts.lastCoveredDay) return null;
  if (facts.hasFuturePlan) return null;

  // Positif = la couverture est dans le futur.
  const delta = daysBetween(todayLocal, facts.lastCoveredDay);
  if (delta === 1) return "coverage_ends_tomorrow";
  if (delta === -3) return "coverage_lapsed_d3";
  return null;
}

// ---------------------------------------------------------------------------
// LA COPIE — deux packs entiers, jamais des fragments interpolés
// ---------------------------------------------------------------------------

export type { RenderedLifecycleEmail };

export interface CoverageEmailArgs {
  firstName: string | null;
  /** Le dernier jour couvert, `YYYY-MM-DD`. */
  lastCoveredDay: string;
  /** L'URL absolue de `/app/plan`. */
  planUrl: string;
  /** L'URL absolue de désinscription, jeton et `?lang=` compris. */
  unsubscribeUrl: string;
  locale: string;
}


/**
 * ⚠️ CE QUE CES DEUX PACKS NE DISENT PAS (docs/keel/LEGAL.md §6.1 et §6.2):
 * aucun poids chiffré, aucune durée associée à un poids, aucune garantie,
 * aucun avant/après. `lifecycle_copy_guard.ts` le vérifie à chaque run.
 *
 * Et ce qu'ils ne disent pas non plus, pour une raison produit celle-là:
 * jamais « Sophia prépare ton plan ». Aucune copie de ce dépôt ne doit faire
 * ATTENDRE — c'est la personne qui compose, l'e-mail ne fait que rouvrir la
 * porte.
 */
function endsTomorrowFrench(args: CoverageEmailArgs): RenderedLifecycleEmail {
  const name = args.firstName?.trim() || null;
  const day = formatLocalDay(args.lastCoveredDay, args.locale);
  return {
    subject: "Ton plan se termine demain",
    html: lifecycleEmailShell(
      [
        `        <p>${name ? `Hello ${name},` : "Hello,"}</p>`,
        "",
        `        <p>Ton plan couvre jusqu'à demain, ${day}. Après ça, il n'y a`,
        "        rien de prévu.</p>",
        "",
        "        <p>Une session de composition, et tu repars pour le nombre de",
        "        jours que tu veux — avec les courses et les cuissons rangées",
        "        au bon moment.</p>",
        "",
        lifecycleEmailCta(args.planUrl, "Composer la suite"),
        "",
        "        <p><strong>Sophia</strong></p>",
      ].join("\n"),
      { unsubscribeHref: args.unsubscribeUrl, locale: args.locale },
    ),
  };
}

function endsTomorrowEnglish(args: CoverageEmailArgs): RenderedLifecycleEmail {
  const name = args.firstName?.trim() || null;
  const day = formatLocalDay(args.lastCoveredDay, args.locale);
  return {
    subject: "Your plan ends tomorrow",
    html: lifecycleEmailShell(
      [
        `        <p>${name ? `Hello ${name},` : "Hello,"}</p>`,
        "",
        `        <p>Your plan runs to tomorrow, ${day}. After that, nothing is`,
        "        planned.</p>",
        "",
        "        <p>One round of composing, and you are set for as many days as",
        "        you want — with the shopping and the cooking placed where they",
        "        belong.</p>",
        "",
        lifecycleEmailCta(args.planUrl, "Build the next one"),
        "",
        "        <p><strong>Sophia</strong></p>",
      ].join("\n"),
      { unsubscribeHref: args.unsubscribeUrl, locale: args.locale },
    ),
  };
}

/**
 * J+3. Le ton change: on ne rend pas service, on rouvre une porte — et on pose
 * la question qui sert même si la personne ne revient pas.
 */
function lapsedFrench(args: CoverageEmailArgs): RenderedLifecycleEmail {
  const name = args.firstName?.trim() || null;
  const day = formatLocalDay(args.lastCoveredDay, args.locale);
  return {
    subject: "Trois jours sans rien de prévu",
    html: lifecycleEmailShell(
      [
        `        <p>${name ? `Hello ${name},` : "Hello,"}</p>`,
        "",
        `        <p>Ton dernier plan s'est terminé ${day}, et rien n'a pris la`,
        "        suite depuis.</p>",
        "",
        "        <p>Repartir prend une session de composition. Et si quelque",
        "        chose n'allait pas dans le dernier plan — trop long, pas à ton",
        "        goût, pas au bon moment — réponds à ce message et dis-le moi.",
        "        Je prends.</p>",
        "",
        lifecycleEmailCta(args.planUrl, "Composer un plan"),
        "",
        "        <p><strong>Sophia</strong></p>",
      ].join("\n"),
      { unsubscribeHref: args.unsubscribeUrl, locale: args.locale },
    ),
  };
}

function lapsedEnglish(args: CoverageEmailArgs): RenderedLifecycleEmail {
  const name = args.firstName?.trim() || null;
  const day = formatLocalDay(args.lastCoveredDay, args.locale);
  return {
    subject: "Three days with nothing planned",
    html: lifecycleEmailShell(
      [
        `        <p>${name ? `Hello ${name},` : "Hello,"}</p>`,
        "",
        `        <p>Your last plan ended on ${day}, and nothing has followed it`,
        "        since.</p>",
        "",
        "        <p>Picking it back up takes one round of composing. And if",
        "        something was off in that last plan — too long, not to your",
        "        taste, at the wrong time — reply to this message and tell me.",
        "        I'll take it.</p>",
        "",
        lifecycleEmailCta(args.planUrl, "Build a plan"),
        "",
        "        <p><strong>Sophia</strong></p>",
      ].join("\n"),
      { unsubscribeHref: args.unsubscribeUrl, locale: args.locale },
    ),
  };
}

/**
 * `isFrenchLocale` est LE prédicat unique du gel. Une langue non livrée est
 * déjà ramenée à l'anglais en amont, donc « pas français » veut bien dire
 * « anglais » ici.
 */
export function renderCoverageEmail(
  segment: CoverageSegment,
  args: CoverageEmailArgs,
): RenderedLifecycleEmail {
  const fr = isFrenchLocale(args.locale);
  if (segment === "coverage_ends_tomorrow") {
    return fr ? endsTomorrowFrench(args) : endsTomorrowEnglish(args);
  }
  return fr ? lapsedFrench(args) : lapsedEnglish(args);
}
