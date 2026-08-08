/**
 * FF-029 — L'ADHÉRENCE AUX PRATIQUES, DÉRIVÉE À LA LECTURE.
 *
 * ── LA RÈGLE QUI GOUVERNE CE FICHIER, ET ELLE EST NÉGATIVE ─────────────────
 * R6 de FF-029: « l'adhérence est CONSOMMÉE, jamais affichée en score ». Ce
 * module ne stocke rien, ne rend aucun pourcentage, et n'a aucun consommateur
 * de rendu. Il ne produit qu'une décision: cette pratique-là a-t-elle cessé de
 * porter pour cette personne-là.
 *
 * §5 de la fiche l'écrit comme une contrainte de conception — « l'adhérence
 * fenêtrée: DÉRIVÉE à la lecture pour FF-028, jamais un score stocké ». Une
 * colonne `adherence` sur une table serait la première marche du glissement que
 * le plancher TCA existe pour empêcher: `adherence_score` et `streak_display`
 * sont, littéralement, deux des quatre surfaces que
 * `PRACTICE_BLOCKING_SURFACES` refuse à une pratique. Les produire nous-mêmes
 * en coulisse serait la même chose sans le nom.
 *
 * ── CE QU'ON APPELLE « IGNORER », ET CE QU'ON N'APPELLE PAS AINSI ──────────
 * On ne mesure QUE les soirs où une QUESTION de pratique est partie. Un rappel
 * n'attend aucune réponse: compter son silence serait fabriquer un manquement à
 * partir d'un message qui ne demandait rien — la classe de défaut exacte de
 * `auto-tick-writes-undeniable-false-facts`, un fait faux et indémentable.
 *
 * Et « ignorer » ne veut jamais dire « ne l'a pas faite ». On ne sait pas si la
 * personne a bu son eau; on sait qu'elle n'a pas répondu. Les deux ne se
 * confondent nulle part dans ce fichier, et R5 est explicite: le silence est une
 * réponse, pas un manquement.
 *
 * ── CE QUE LA DÉCISION DÉCLENCHE (R7) ──────────────────────────────────────
 * « Une pratique ignorée durablement se REMPLACE, ne se répète pas. » Deux
 * étages, et le second existe parce que le premier ne couvre pas tout:
 *
 *   1. il reste au moins une autre pratique servable  ⇒ la rotation passe à
 *      côté de l'ignorée. C'est le remplacement, et il ne coûte pas un mot.
 *   2. TOUTES sont ignorées                           ⇒ on ne se tait pas et on
 *      ne tourne pas à vide: la pratique passe en RAPPEL. Plus aucune question,
 *      la voix du coach survit. Se taire complètement retirerait à l'élève la
 *      seule chose que le message du soir lui DONNE, en punition d'un silence
 *      que R5 déclare légitime.
 *
 * PURE MODULE: no I/O, no clock, no randomness. La fenêtre est bornée par
 * l'appelant, qui seul connaît le jour local de l'élève.
 */

import type { DailyPractice } from "./daily_practices.ts";
import { practiceKey } from "./daily_practices.ts";

/**
 * LA FENÊTRE, EN JOURS LOCAUX.
 *
 * Vingt et un, parce que le critère d'acceptation de FF-029 §8 dit « une
 * pratique ignorée TROIS SEMAINES ». Ce n'est pas un réglage: c'est la
 * spécification, recopiée en constante pour qu'elle se pinne par un test au
 * lieu de vivre dans un `-21` au milieu d'une requête.
 */
export const PRACTICE_ADHERENCE_WINDOW_DAYS = 21;

/**
 * COMBIEN DE QUESTIONS SANS RÉPONSE AVANT DE PASSER À AUTRE CHOSE.
 *
 * Trois, et le chiffre est adossé à la cadence plutôt que choisi: la question de
 * pratique ne part que les soirs où le pulse ne demande rien
 * (`PULSE_ASK_INTERVAL_DAYS = 3`, donc deux soirs sur trois), et le jeu maison
 * en compte trois. Une pratique donnée est donc questionnée toutes les quatre à
 * cinq soirées — trois refus tiennent dans la fenêtre de trois semaines, et pas
 * beaucoup moins.
 *
 * Un seul silence ne dit rien: quelqu'un qui lit son message à 23 h et se
 * couche n'a rien ignoré du tout.
 */
export const PRACTICE_IGNORED_ASKS = 3;

/**
 * UN SOIR OÙ UNE QUESTION DE PRATIQUE EST PARTIE.
 *
 * C'est un FAIT relu du ledger, jamais une inférence: la ligne existe parce que
 * le message est parti, et elle porte la pratique qu'il portait.
 */
export interface PracticeAskRecord {
  /** Le jour local de l'élève, `YYYY-MM-DD`. Sert l'ordre, jamais un compte. */
  localDate: string;
  /** `practiceKey(label)` — l'identité de la pratique questionnée. */
  practiceKey: string;
  /** La personne a-t-elle écrit quoi que ce soit après ? Voir l'en-tête. */
  answered: boolean;
}

export interface PracticeAdherence {
  practiceKey: string;
  /** Questions parties dans la fenêtre. */
  asked: number;
  /** Celles qui ont reçu quelque chose. */
  answered: number;
  /**
   * Questions consécutives restées sans réponse, la plus récente d'abord.
   *
   * C'est la série qui décide, pas le taux: quelqu'un qui répondait il y a trois
   * semaines et s'est tu depuis a cessé de porter CETTE pratique, et un taux
   * moyen le noierait.
   */
  ignoredStreak: number;
}

/** `YYYY-MM-DD` croissant, puis rien — l'ordre du ledger n'est pas garanti. */
function byLocalDate(a: PracticeAskRecord, b: PracticeAskRecord): number {
  return a.localDate < b.localDate ? -1 : a.localDate > b.localDate ? 1 : 0;
}

/**
 * L'adhérence par pratique, sur la fenêtre que l'appelant a bornée.
 *
 * Les enregistrements sont triés ICI plutôt qu'exigés triés: une garde qui
 * dépend de l'ordre d'une requête est une garde qui casse le jour où un `order
 * by` disparaît, sans que rien ne le dise.
 */
export function readPracticeAdherence(
  records: readonly PracticeAskRecord[],
): readonly PracticeAdherence[] {
  const byKey = new Map<string, PracticeAskRecord[]>();
  for (const record of records) {
    const key = String(record.practiceKey ?? "").trim();
    if (!key) continue;
    const list = byKey.get(key);
    if (list) list.push(record);
    else byKey.set(key, [record]);
  }

  const out: PracticeAdherence[] = [];
  for (const [key, list] of byKey) {
    list.sort(byLocalDate);
    let answered = 0;
    let ignoredStreak = 0;
    for (const record of list) {
      if (record.answered) {
        answered++;
        // La série repart de zéro à la première réponse: c'est ce qui distingue
        // « a décroché » de « a répondu une fois sur deux ».
        ignoredStreak = 0;
      } else {
        ignoredStreak++;
      }
    }
    out.push({ practiceKey: key, asked: list.length, answered, ignoredStreak });
  }
  return out;
}

/**
 * Les pratiques que cette personne a durablement laissées passer.
 *
 * Rendue en `Set` et pas en liste: l'unique consommateur teste l'appartenance,
 * et une liste inviterait à la compter — c'est-à-dire à en faire un score.
 */
export function durablyIgnoredKeys(
  adherence: readonly PracticeAdherence[],
): ReadonlySet<string> {
  const out = new Set<string>();
  for (const row of adherence) {
    if (row.ignoredStreak >= PRACTICE_IGNORED_ASKS) out.add(row.practiceKey);
  }
  return out;
}

export interface PracticeRotationPool {
  /** Ce dans quoi la rotation du soir a le droit de piocher. */
  practices: readonly DailyPractice[];
  /**
   * Toutes les pratiques servables sont ignorées: il n'y a plus personne à qui
   * passer le relais.
   *
   * L'appelant force alors le RAPPEL. C'est le second étage décrit en tête: on
   * arrête de demander sans arrêter de parler.
   */
  allIgnored: boolean;
}

/**
 * R7 — LA ROTATION PASSE À CÔTÉ DE CE QUI NE PORTE PLUS.
 *
 * ⚠️ ELLE NE REND JAMAIS UNE LISTE VIDE. Retirer la dernière pratique ferait
 * disparaître la voix du coach du message du soir, en punition d'un silence que
 * R5 déclare parfaitement légitime — et sans qu'aucun compte-rendu ne distingue
 * ce cas de « ce coach n'a rien écrit ». `allIgnored` porte l'information à la
 * place, et c'est le MODE qui l'absorbe.
 */
export function rotationPool(
  practices: readonly DailyPractice[],
  ignoredKeys: ReadonlySet<string>,
): PracticeRotationPool {
  if (practices.length === 0) return { practices, allIgnored: false };
  const kept = practices.filter((p) => !ignoredKeys.has(practiceKey(p.label)));
  if (kept.length > 0) return { practices: kept, allIgnored: false };
  return { practices, allIgnored: true };
}
