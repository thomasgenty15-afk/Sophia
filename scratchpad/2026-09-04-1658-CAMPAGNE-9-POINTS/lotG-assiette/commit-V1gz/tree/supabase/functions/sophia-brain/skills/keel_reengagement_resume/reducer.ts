/**
 * LE REDUCER — pur. Aucune I/O, aucune horloge, aucun modèle.
 *
 * Il reçoit l'état persisté et les faits du tour, et rend une décision. C'est
 * la moitié testable du flow : `reducer_test.ts` l'exerce hors réseau, ce que
 * le patron `safety_crisis` a établi comme forme canonique.
 */

import {
  type KeelReengagementResumeDecision,
  type KeelReengagementResumeState,
  KEEL_REENGAGEMENT_RESUME_MAX_TURNS,
  normalizeKeelReengagementResumeState,
} from "./contract.ts";

export type KeelReengagementResumeReducerInput = {
  /** L'état lu dans `temp_memory`, tel quel — le reducer le normalise. */
  persistedState: unknown;
  /** Le message de l'élève, brut. Le reducer regarde s'il est VIDE, rien d'autre. */
  userMessage: string;
  /**
   * La bande safety effective du tour.
   *
   * `medium` et au-dessus rendent la main : ce flow ne parle jamais par-dessus
   * une détresse. La cascade de `routers.ts` le place déjà sous les branches
   * safety, mais un reducer qui ne porte pas lui-même sa condition de sortie
   * est un reducer qui dépend d'un ordre de branches qu'il ne contrôle pas.
   */
  safetyBand: string;
};

const SAFETY_PREEMPTS = new Set(["medium", "high", "critical"]);

export function reduceKeelReengagementResume(
  input: KeelReengagementResumeReducerInput,
): KeelReengagementResumeDecision {
  const state = normalizeKeelReengagementResumeState(input.persistedState);
  if (!state) return { kind: "hand_back", reason: "unreadable_state" };

  // Safety d'abord, et sans condition. Voir le commentaire du champ.
  if (SAFETY_PREEMPTS.has(String(input.safetyBand ?? "").trim())) {
    return { kind: "hand_back", reason: "safety" };
  }

  // Un tour sans texte (média seul, bouton déterministe) n'a rien à cadrer, et
  // le cadrer produirait une relance qui ne répond à rien.
  if (!String(input.userMessage ?? "").trim()) {
    return { kind: "hand_back", reason: "empty_message" };
  }

  const nextTurns = state.turns_in_flow + 1;
  if (nextTurns > KEEL_REENGAGEMENT_RESUME_MAX_TURNS) {
    return { kind: "hand_back", reason: "max_turns" };
  }

  return {
    kind: "frame",
    next: {
      ...state,
      // Le flow a possédé son tour: le carve-out de fraîcheur n'a plus lieu
      // d'être. En régime nominal le runtime purge l'état juste après, donc
      // personne ne relira ce champ — il reste juste pour que l'état résiduel
      // d'une purge ratée expire comme n'importe quel autre.
      awaiting_first_reply: false,
      turns_in_flow: nextTurns,
      stage: "welcome_back",
    },
  };
}
