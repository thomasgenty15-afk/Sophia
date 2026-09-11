/**
 * LE RAPPEL DE LA VEILLE — « ce soir, sors la dinde du congélateur ». Module PUR.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LE DÉFAUT QU'IL FERME, RAPPORTÉ SUR UN PLAN RÉEL LE 2026-09-08
 * ══════════════════════════════════════════════════════════════════════════
 * Profil « une course », congélateur déclaré: le moteur date la dinde hachée
 * du mercredi et la marque « à congeler à l'achat » (lot C). La session qui la
 * cuisine tombe le dimanche. Entre les deux, RIEN ne rappelait le geste qui
 * rend ce plan exécutable — sortir la dinde le samedi soir. Un badge dans une
 * carte repliée ne le fait pas; une phrase dans le chat, la veille, le fait.
 *
 * ── CE QUE C'EST, ET CE QUE CE N'EST PAS ──────────────────────────────────
 * Un message SANS question: il n'arme rien, il ne demande rien. Il compte
 * comme non sollicité (FF-062 §6 R1), donc il est plafonné — et il cède la
 * place aux bilans garantis: un soir où le plafond est pris, il ne part pas,
 * et l'appelant le compte en `blocked`. La carte de session et la liste de
 * courses portent la même phrase; le chat n'est que la troisième surface.
 *
 * ── UNE SEULE FOIS PAR (PLAN, JOUR DE CUISINE) ────────────────────────────
 * La seconde horloge est dans `chat_messages.metadata` (`for_date`), comme
 * pour la pesée: on relit ce qu'on a envoyé, on ne stocke pas un état.
 *
 * PURE: no I/O, no clock, no randomness.
 */

import { daysBetween } from "./local_date.ts";
import { type LocalePackKey, localePackKey } from "./locale.ts";

export const THAW_REMINDER_PURPOSE = "keel_thaw_reminder";

/**
 * LA FENÊTRE: 18h-20h locales, la VEILLE de la session.
 *
 * ⚠️ APRÈS la pesée (17h-19h, C2) et AVANT le bilan du jour (20h-22h, C3):
 * l'heure 18 chevauche C2 et c'est assumé par FF-062 (« si elles se
 * recouvrent, les deux partent »); la politique de livraison arbitre, ce
 * module ne le fait pas.
 */
export const THAW_WINDOW_START_HOUR = 18;
export const THAW_WINDOW_END_HOUR = 20;

/**
 * ⛔ « LA VEILLE » SE COMPTE SUR L'HORLOGE DU MUR, PAS SUR CELLE DE L'APPELANT.
 *
 * ── LE DÉFAUT QU'ELLE FERME, MESURÉ SUR poul LE 2026-09-09 ────────────────
 * `keel-proactive-v1` accepte une horloge dans le corps de sa requête, et
 * `deliverChatMessage` recopie cette horloge dans `chat_messages.created_at`.
 * Un tir qui avance l'horloge au samedi pour éprouver le canal a donc écrit,
 * un MERCREDI, un message daté du samedi et disant « demain, c'est ta session
 * de cuisine ». Le tri du fil est `created_at` décroissant sans borne haute
 * (`frontend/src/keel/api/chat.ts`): la bulle est passée en tête du fil
 * immédiatement. La personne a lu « ce soir, sors le saumon » CINQ jours avant
 * la cuisson du dimanche — et un saumon sorti le mercredi est perdu.
 *
 * ── CE QUE LA GARDE SÉPARE ────────────────────────────────────────────────
 * La DÉCISION peut s'éprouver à n'importe quelle date: c'est à ça que sert un
 * `dry_run`, et le banc en a besoin. L'ÉCRITURE, elle, est datée dans une vraie
 * conversation lue par une vraie personne: elle exige que le jour de cuisson
 * soit à UN jour de la date réelle. Ni cinq, ni zéro.
 *
 * ⚠️ ELLE MORD DANS LES DEUX SENS. Une horloge en retard écrirait un rappel
 * pour une session déjà cuisinée — aussi faux, et plus difficile à voir.
 *
 * En production la garde ne coûte rien et ne bloque rien: le cron poste
 * `body := '{}'`, l'horloge de la décision EST l'horloge du mur.
 */
export const THAW_EVE_DAYS = 1;

/** Le motif de refus d'ÉCRITURE, compté en `blocked` — jamais en `skipped`. */
export const THAW_NOT_THE_EVE = "not_the_eve";

/**
 * Le jour de cuisson est-il exactement demain, sur la date passée ? Fail-closed:
 * une date illisible refuse l'écriture plutôt que de la laisser passer.
 */
export function isEveOfCookDay(args: {
  /** La date locale RÉELLE, `YYYY-MM-DD`. */
  realLocalDate: string;
  /** Le jour de cuisson visé par le rappel, `YYYY-MM-DD`. */
  cookDate: string;
}): boolean {
  try {
    return daysBetween(args.realLocalDate, args.cookDate) === THAW_EVE_DAYS;
  } catch {
    return false;
  }
}

export const THAW_SKIPS = [
  "outside_window",
  "muted",
  "no_plan",
  "no_session_tomorrow",
  "nothing_frozen",
  "already_sent",
] as const;
export type ThawSkip = (typeof THAW_SKIPS)[number];

export interface ThawItem {
  term: string;
  quantity: string | null;
}

export type ThawVerdict =
  | { ask: true; items: ThawItem[]; cookDay: string }
  | { ask: false; reason: ThawSkip };

/**
 * FAUT-IL RAPPELER CE SOIR ? — l'ordre des refus est celui du coût: la fenêtre
 * d'abord (gratuite), puis ce qu'on a lu.
 */
export function decideThawReminder(args: {
  localHour: number;
  muted: boolean;
  /** `null` = aucun plan ne couvre demain. */
  plan: {
    /** Les sessions de DEMAIN, déjà filtrées par l'appelant. */
    sessionsTomorrow: readonly { preparationIds: readonly string[] }[];
    /** Ce que ces sessions sortent du congélateur — lu par l'appelant. */
    frozen: readonly ThawItem[];
    cookDay: string;
  } | null;
  /** Le rappel est-il déjà parti pour ce jour de cuisine ? */
  alreadySent: boolean;
}): ThawVerdict {
  if (
    !Number.isFinite(args.localHour) ||
    args.localHour < THAW_WINDOW_START_HOUR ||
    args.localHour >= THAW_WINDOW_END_HOUR
  ) {
    return { ask: false, reason: "outside_window" };
  }
  if (args.muted) return { ask: false, reason: "muted" };
  if (args.plan === null) return { ask: false, reason: "no_plan" };
  if (args.plan.sessionsTomorrow.length === 0) {
    return { ask: false, reason: "no_session_tomorrow" };
  }
  if (args.plan.frozen.length === 0) return { ask: false, reason: "nothing_frozen" };
  if (args.alreadySent) return { ask: false, reason: "already_sent" };
  return { ask: true, items: [...args.plan.frozen], cookDay: args.plan.cookDay };
}

const THAW_COPY: Record<LocalePackKey, {
  body: (items: string) => string;
}> = {
  fr: {
    body: (items) =>
      `Demain, c'est ta session de cuisine. Ce soir, sors du congélateur : ` +
      `${items}. Ça décongèle au frigo pendant la nuit.`,
  },
  en: {
    body: (items) =>
      `Tomorrow is your cooking session. Tonight, take out of the freezer: ` +
      `${items}. It thaws in the fridge overnight.`,
  },
};

/** « dinde hachée (450 g), poisson (300 g) » — la quantité entre parenthèses. */
export function renderThawItems(items: readonly ThawItem[]): string {
  return items
    .map((i) => (i.quantity ? `${i.term} (${i.quantity})` : i.term))
    .join(", ");
}

export function renderThawReminder(args: {
  locale: string;
  items: readonly ThawItem[];
}): string {
  const copy = THAW_COPY[localePackKey(String(args.locale ?? ""))];
  return copy.body(renderThawItems(args.items));
}

/** Les paquets, exportés pour que le harnais de parité les lise. */
export const THAW_COPY_PACKS = Object.freeze(THAW_COPY);
