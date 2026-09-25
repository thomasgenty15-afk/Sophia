// KEEL — LA QUESTION OUVERTE, ET LES QUESTIONS QU'ON LAISSE PARTIR.
//
// ── DEUX RÈGLES D'ÉCRAN, SORTIES DU RENDU POUR ÊTRE ÉPROUVÉES ────────────────
// ⟳ 2026-09-25 — décision du propriétaire:
//
//   ① LES RÉPONSES QUITTENT LA BULLE. Les boutons de la question en cours
//      vivent dans un encadré au-dessus du champ de saisie (`ChatAnswerTray`),
//      et l'encadré n'existe que tant que la question attend une réponse.
//      Répondre le fait disparaître: une question déjà répondue n'a plus rien
//      à proposer.
//   ② UNE QUESTION QUE SOPHIA A POSÉE D'ELLE-MÊME, SANS RÉPONSE, S'EFFACE DU FIL
//      dès que la question suivante arrive. Sans ça, quelqu'un qui ne répond
//      pas pendant dix jours retrouve trente questions orphelines empilées.
//
// ⚠️ LE MÊME CRITÈRE DE « QUESTION » QUE LE SERVEUR: `armsQuestion`, miroir de
// `_shared/chat/disarmed_tap.ts`. Une bulle dont le seul bouton navigue
// (« Voir ») ne pose rien: elle ne ferme pas la question précédente et ne
// s'efface jamais.
//
// ⚠️ « RÉPONDU » = UN MESSAGE DE LA PERSONNE APRÈS LA QUESTION. Un tap est
// enregistré comme un message de la personne (`kind: "button"`, libellé du
// bouton), une phrase tapée aussi. On ne cherche pas à savoir si la phrase
// répondait À la question: la personne a parlé, le fil garde la question qui
// précédait.
//
// ⛔ ② NE TOUCHE QU'AUX MESSAGES PROACTIFS. Une question de Sophia qui répond
// à quelque chose que la personne a écrit suit forcément un message de la
// personne: l'effacer laisserait ce message sans sa réponse.
//
// ⛔ RIEN N'EST SUPPRIMÉ EN BASE. C'est un filtre d'affichage: les gardes de
// cadence (`slotsAskedToday`, `dayMealsAskedOn`) relisent ces lignes pour ne
// pas reposer une question du jour.

import { armsQuestion } from "../api/memoryView";

export interface ThreadMessage {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly proactive?: boolean;
  readonly buttons: ReadonlyArray<{ readonly payload?: unknown }>;
}

function isQuestion(m: ThreadMessage): boolean {
  return m.role === "assistant" && armsQuestion(m.buttons);
}

/**
 * ① LA QUESTION QUI ATTEND UNE RÉPONSE — la dernière question du fil, si
 * aucun message de la personne ne la suit. `null` sinon.
 */
export function openQuestionId(
  messages: readonly ThreadMessage[],
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "user") return null;
    if (isQuestion(m)) return m.id;
  }
  return null;
}

/**
 * ② LES QUESTIONS PROACTIVES LAISSÉES SANS RÉPONSE, QU'UNE QUESTION PLUS
 * RÉCENTE A REMPLACÉES. Ce sont les bulles que le fil n'affiche plus.
 *
 * La dernière question n'y est jamais: elle attend encore.
 */
export function unansweredSupersededIds(
  messages: readonly ThreadMessage[],
): Set<string> {
  const hidden = new Set<string>();
  // Le parcours va du plus récent au plus ancien: `laterQuestion` dit qu'une
  // question est arrivée après, `userSince` qu'un message de la personne a
  // suivi la question qu'on regarde (et précédé la suivante).
  let laterQuestion = false;
  let userSince = false;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "user") {
      userSince = true;
      continue;
    }
    if (!isQuestion(m)) continue;
    if (laterQuestion && !userSince && m.proactive === true) hidden.add(m.id);
    laterQuestion = true;
    userSince = false;
  }
  return hidden;
}
