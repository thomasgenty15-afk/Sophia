import { isFrenchLocale } from "./locale.ts";
import { daysBetween } from "./local_date.ts";
import {
  lifecycleEmailShell,
  type RenderedLifecycleEmail,
} from "./lifecycle_email.ts";

// FF-063 LOT 6 — LE DÉCROCHAGE LONG. LE DERNIER MOT, ET IL EST UNIQUE.
//
// ── CE QUE CE SEGMENT N'EST PAS ─────────────────────────────────────────
// Ce n'est pas une troisième fin de couverture. `coverage_ends_tomorrow` et
// `coverage_lapsed_d3` parlent d'un PLAN qui s'arrête; ici on parle d'une
// HABITUDE qui s'arrête, chez quelqu'un qui en avait une — trois plans au
// moins. Le ton change avec le fait: on nomme le passé, on demande ce qui a
// changé, et on ne propose rien.
//
// ⛔ AUCUN BOUTON. Quelqu'un qui a composé trois plans sait où est le bouton.
// Le lui remontrer au quatorzième jour de silence, c'est répondre à « qu'est-ce
// qui s'est passé ? » par « reviens ».
//
// ── LA DIFFICULTÉ N'EST PAS LE PRÉDICAT, C'EST L'ÉPISODE ────────────────
// Une personne ne doit recevoir ceci qu'UNE fois par décrochage, et le compteur
// doit se réarmer quand elle revient. La clé retenue est le `ends_on` du
// dernier plan: un nouveau plan donne un nouveau `ends_on`, donc un nouvel
// épisode — sans table ni colonne de plus.
//
// ⚠️ L'AUTRE OPTION A ÉTÉ ÉCARTÉE EN CONNAISSANCE DE CAUSE. Une table
// d'épisodes existe déjà (`reengagement_episodes`) et elle a produit un VERROU
// PERMANENT par élève: l'épisode se fermait quand l'élève répondait, l'élève ne
// répondait pas à un message jamais envoyé, et le job se fabriquait sa propre
// population vide. Une clé dérivée d'un fait ne peut pas se coincer comme ça.
//
// ── APRÈS CE MESSAGE, ON S'ARRÊTE ───────────────────────────────────────
// Aucun quatrième e-mail à quelqu'un qui n'a répondu à aucun des trois. C'est
// une décision produit, pas une limite technique: la relance suivante ne
// s'appelle plus une relance.

/** Le seuil, en jours de silence après la fin de la dernière couverture. */
export const LAPSE_DAYS = 14;

/** Le nombre de plans à partir duquel « une habitude » a existé. */
export const LAPSE_MIN_PLANS = 3;

export interface LapseFacts {
  /** Les plans vivants (`retired_at is null`). */
  livePlanCount: number;
  /** Le dernier jour couvert, ou `null`. */
  lastCoveredDay: string | null;
  /**
   * `profiles.last_seen_at`, ou `null`.
   *
   * ⚠️ `null` NE VEUT PAS DIRE « n'est jamais venu ». La colonne n'existe que
   * depuis le 2026-09-09 (migration 20260910120000): tout compte antérieur la
   * porte vide, et le lire comme une absence enverrait ce message à toute la
   * base d'un coup. `null` veut dire « jamais mesuré », et un fait jamais
   * mesuré ne retient rien — c'est la couverture qui décide alors, seule.
   */
  lastSeenAt: string | null;
}

/**
 * Y a-t-il décrochage ?
 *
 * Rend la CLÉ D'ÉPISODE (le dernier jour couvert) plutôt qu'un booléen: c'est
 * elle que l'appelant écrit dans `metadata.dedup_key`, et la rendre ici évite
 * qu'un second endroit décide de quoi est fait un épisode.
 */
export function lapseEpisodeKey(
  facts: LapseFacts,
  todayLocal: string,
  now: Date,
): string | null {
  if (facts.livePlanCount < LAPSE_MIN_PLANS) return null;
  if (!facts.lastCoveredDay) return null;

  // Négatif = la couverture est finie. Il faut au moins `LAPSE_DAYS` de retard.
  if (daysBetween(todayLocal, facts.lastCoveredDay) > -LAPSE_DAYS) return null;

  // La personne est passée récemment: elle n'a pas décroché, elle n'a pas
  // recomposé. Deux choses différentes, et une seule mérite ce message.
  if (facts.lastSeenAt) {
    const seen = Date.parse(facts.lastSeenAt);
    if (Number.isFinite(seen)) {
      const silentMs = now.getTime() - seen;
      if (silentMs < LAPSE_DAYS * 24 * 3_600_000) return null;
    }
  }

  return facts.lastCoveredDay;
}

// ---------------------------------------------------------------------------
// LA COPIE
// ---------------------------------------------------------------------------

export interface LapseEmailArgs {
  firstName: string | null;
  /** Le nombre de plans composés — on NOMME le passé, on ne l'évoque pas. */
  planCount: number;
  unsubscribeUrl: string;
  locale: string;
}

function french(args: LapseEmailArgs): RenderedLifecycleEmail {
  const name = args.firstName?.trim() || null;
  return {
    subject: "Qu'est-ce qui a changé ?",
    html: lifecycleEmailShell(
      [
        `        <p>${name ? `Hello ${name},` : "Hello,"}</p>`,
        "",
        `        <p>Tu as composé ${args.planCount} plans avec Sophia, puis plus`,
        "        rien depuis deux semaines.</p>",
        "",
        "        <p>Je ne te demande pas de revenir — tu sais où c'est. Je te",
        "        demande <strong>ce qui a changé</strong> : le rythme, l'envie,",
        "        le produit, la vie ?</p>",
        "",
        "        <p>Réponds à ce message, même en trois mots. C'est le retour qui",
        "        m'apprend le plus, et c'est le dernier que je te demande.</p>",
        "",
        "        <p><strong>Sophia</strong></p>",
      ].join("\n"),
      { unsubscribeHref: args.unsubscribeUrl, locale: args.locale },
    ),
  };
}

function english(args: LapseEmailArgs): RenderedLifecycleEmail {
  const name = args.firstName?.trim() || null;
  return {
    subject: "What changed?",
    html: lifecycleEmailShell(
      [
        `        <p>${name ? `Hello ${name},` : "Hello,"}</p>`,
        "",
        `        <p>You built ${args.planCount} plans with Sophia, and then`,
        "        nothing for two weeks.</p>",
        "",
        "        <p>I am not asking you to come back — you know where it is. I am",
        "        asking <strong>what changed</strong>: the rhythm, the appetite,",
        "        the product, life?</p>",
        "",
        "        <p>Reply to this message, even in three words. It is the",
        "        feedback that teaches me the most, and it is the last one I",
        "        will ask you for.</p>",
        "",
        "        <p><strong>Sophia</strong></p>",
      ].join("\n"),
      { unsubscribeHref: args.unsubscribeUrl, locale: args.locale },
    ),
  };
}

export function renderLapseEmail(args: LapseEmailArgs): RenderedLifecycleEmail {
  return isFrenchLocale(args.locale) ? french(args) : english(args);
}
