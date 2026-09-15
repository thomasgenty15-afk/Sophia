/**
 * FF-018 §11 — LE CRÉNEAU D'UNE PHOTO QUI N'EN DÉCLARE PAS. PUR.
 *
 * ── LA QUESTION QUE CE MODULE FERME, ET ELLE ÉTAIT OUVERTE ─────────────────
 * FF-018 §11 la posait mot pour mot: « une photo envoyée APRÈS COUP doit dire à
 * quel repas elle se rattache. Le rattachement n'est pas décidé. » Elle est
 * décidée le 2026-09-01: le DERNIER CRÉNEAU ÉCOULÉ du jour local, annoncé dans
 * l'accusé, avec la porte de correction dans la même phrase.
 *
 * ── CE QUE ÇA RENVERSE, ET POURQUOI C'EST LÉGITIME MAINTENANT ──────────────
 * `TodayPage` porte cette phrase, et elle avait raison quand elle a été écrite:
 *
 *     « A slot is never guessed from the wall clock: "19:00 means dinner" is
 *       an inference the schema refuses. »
 *
 * Ce qui a changé n'est pas l'horloge, c'est la DOCTRINE DE L'AVEU. §3.3bis
 * (« hypothèse annoncée + porte de correction ») a depuis autorisé la coche
 * automatique par photo, qui est une déduction bien plus lourde: elle écrit un
 * fait de consommation. Le refus d'hier visait une déduction SILENCIEUSE — et
 * il reste entier: rien ici n'a le droit d'écrire un créneau sans le dire.
 *
 * D'où la forme du retour: un slot ET le fait qu'il est inféré. L'appelant ne
 * peut pas écrire l'un sans avoir l'autre sous la main, ce qui est la seule
 * façon de garantir qu'un créneau deviné ne se déguise jamais en créneau
 * déclaré — ni pour l'élève, ni pour l'évaluateur, ni pour le coach.
 *
 * ── L'HEURE DÉCLARÉE L'EMPORTE TOUJOURS SUR LE REPLI ───────────────────────
 * Quelqu'un qui a dit dîner à 22 h n'a pas « raté » son dîner à 21 h 30.
 * `SLOT_PASSED_HOUR` n'est qu'un repli, et `rhythmClockFrom` est la source
 * quand elle existe — c'est déjà l'arbitrage écrit dans `plan_hours.ts`, on ne
 * le rejoue pas ici, on le réutilise.
 *
 * ── LES TROIS MOMENTS SANS HEURE NE SONT JAMAIS INFÉRÉS ────────────────────
 * `snack_am`, `snack_pm` et `before_bed` valent `null` dans `SLOT_PASSED_HOUR`:
 * ce dépôt n'a pas d'heure de référence pour eux, et en inventer une ferait
 * tomber une photo sur une valeur que personne n'a choisie. Une photo à 16 h
 * est donc rangée au DÉJEUNER (le dernier créneau réellement écoulé), jamais à
 * un « goûter » que rien ne date.
 *
 * PURE MODULE: ni base, ni horloge, ni aléatoire. L'heure entre en paramètre.
 */

import { rhythmClockFrom, SLOT_PASSED_HOUR } from "./plan_hours.ts";
import type { SlotKey } from "./tokens.ts";

/**
 * L'ordre de la journée, du plus tôt au plus tard.
 *
 * Il ne porte QUE les moments datables. `on_waking`, `pre_workout`,
 * `post_workout`, `any_meal` et `any_time` existent dans `SLOT_VOCABULARY` et
 * ne sont pas ici: aucun n'a d'heure, et `any_*` n'est pas un moment mais une
 * absence de contrainte. Les inférer serait remplir une case avec un jeton qui
 * ne veut rien dire à cette place.
 */
const DATABLE_SLOTS = ["breakfast", "lunch", "dinner"] as const;

export type InferredSlot = {
  /** Le créneau retenu. */
  slot: SlotKey;
  /**
   * TOUJOURS `true` — le champ existe pour que l'appelant ne PUISSE PAS écrire
   * le slot sans porter la marque. Un booléen constant dans un type est un
   * rappel au compilateur; c'est délibéré, et c'est le même motif que
   * `tickedDish` dans `renderMealPhotoAck`.
   */
  inferred: true;
};

/**
 * Le dernier créneau écoulé à `localHour`, ou `null` avant le premier.
 *
 * @param localHour heure pleine locale de l'élève, `0`..`23`.
 * @param eatingRhythm `practical_constraints.eating_rhythm` tel qu'il est en
 *   base, ou `null`. REQUIS — l'omettre ferait retomber tout le monde sur le
 *   repli alors que la personne a peut-être déclaré ses heures, et ce dépôt
 *   appelle ça une garde désarmée.
 *
 * `null` est une RÉPONSE, pas un échec: une photo à 7 h du matin n'a aucun
 * créneau écoulé derrière elle, et lui en coller un serait exactement la
 * déduction silencieuse que ce module refuse. La ligne garde alors
 * `slot_key: null`, comme avant.
 */
export function inferSlotFromLocalHour(
  localHour: number,
  eatingRhythm: unknown,
): InferredSlot | null {
  if (!Number.isInteger(localHour) || localHour < 0 || localHour > 23) {
    return null;
  }
  const declared = new Map(
    rhythmClockFrom(eatingRhythm).map((r) => [r.slot, r.hour] as const),
  );

  let best: SlotKey | null = null;
  let bestHour = -1;
  for (const slot of DATABLE_SLOTS) {
    // L'heure déclarée d'abord, le repli ensuite. `undefined` (le slot n'est
    // pas dans le rythme) et `null` (il y est sans heure) mènent au même repli.
    const declaredHour = declared.get(slot);
    const hour = declaredHour ?? SLOT_PASSED_HOUR[slot];
    if (hour === null || hour === undefined) continue;
    // `>=`: à 14 h pile, le déjeuner EST passé. La coupure est la fin du
    // créneau, pas son début (voir `SLOT_PASSED_HOUR`).
    if (localHour >= hour && hour > bestHour) {
      best = slot;
      bestHour = hour;
    }
  }
  return best === null ? null : { slot: best, inferred: true };
}

/**
 * La clé qui porte la marque sur la ligne de fait.
 *
 * Dans `recognized`, à côté de `student_commitment_id`, et pour la même raison:
 * `recognized` est le seul jsonb de `protocol_events` qui dit D'OÙ vient ce que
 * la ligne affirme. Une colonne dédiée demanderait une migration pour un
 * booléen que seuls l'accusé et le coach lisent.
 *
 * ⚠️ `analyze-meal-photo-v1` RÉÉCRIT `recognized` à chaque analyse. La marque
 * doit donc être recopiée à travers, exactement comme `student_commitment_id`
 * — sinon un `force: true` la perd et le créneau deviné devient un créneau
 * déclaré, en silence.
 */
export const SLOT_INFERRED_KEY = "slot_inferred";

/** La marque, relue depuis `recognized`. Faux par défaut: on n'infère rien. */
export function slotWasInferred(recognized: unknown): boolean {
  if (!recognized || typeof recognized !== "object") return false;
  return (recognized as Record<string, unknown>)[SLOT_INFERRED_KEY] === true;
}
