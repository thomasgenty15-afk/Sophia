/// <reference path="../../../tsserver-shims.d.ts" />

/**
 * Engagement de STYLE de session — mécanisme TRANSVERSE.
 *
 * Il a longtemps vécu dans `router/run.ts` à côté du flow local
 * `feature_opportunity`, qui en était l'un des deux producteurs. Ce n'est PAS
 * un morceau de `feature_opportunity` : l'engagement est réinjecté dans TOUS
 * les composeurs (companion/normal_reply, présence, safety), et son second
 * producteur est le champ RACINE `session_style_commitment_hint` du TurnFrame,
 * émis par le dispatcher GLOBAL quel que soit l'owner du tour (ALEX-CPR-B04).
 *
 * W2.A : extrait ici AVANT la désactivation de `feature_opportunity`, pour que
 * la suppression du skill (W2.B) ne puisse pas emporter la fonctionnalité.
 *
 * Session only (`temp_memory`) — jamais une préférence durable (BF-PREF-01).
 */

/** Fenêtre glissante d'engagements retenus pour la session. */
export const SESSION_STYLE_COMMITMENTS_KEY = "__session_style_commitments";

const SESSION_STYLE_COMMITMENTS_WINDOW = 3;

/**
 * Installe un engagement de style SESSION dans temp_memory (dédup + fenêtre
 * de 3). Producteur historique n°1 : le dispatcher local `feature_opportunity`
 * (state_patch, eva-r7 B01). Producteur n°2, seul survivant de W2.A : le
 * dispatcher GLOBAL via `TurnFrame.session_style_commitment_hint`.
 */
export function installSessionStyleCommitment(
  tempMemory: Record<string, unknown>,
  commitment: string,
): Record<string, unknown> {
  const clean = String(commitment ?? "").trim();
  if (!clean) return tempMemory;
  const previous = Array.isArray(tempMemory[SESSION_STYLE_COMMITMENTS_KEY])
    ? (tempMemory[SESSION_STYLE_COMMITMENTS_KEY] as unknown[]).map(String)
    : [];
  return {
    ...tempMemory,
    [SESSION_STYLE_COMMITMENTS_KEY]: [
      ...previous.filter((c) => c !== clean),
      clean,
    ].slice(-SESSION_STYLE_COMMITMENTS_WINDOW),
  };
}

/**
 * Bloc de prompt réinjecté à CHAQUE tour, dans chaque composeur (companion,
 * présence, safety). Null quand aucun engagement n'a été pris.
 */
export function sessionStyleCommitmentsPromptBlock(
  tempMemory: Record<string, unknown> | null | undefined,
): string | null {
  const raw = (tempMemory as Record<string, unknown> | null | undefined)
    ?.[SESSION_STYLE_COMMITMENTS_KEY];
  const commitments = Array.isArray(raw)
    ? raw.map((c) => String(c ?? "").trim()).filter(Boolean)
    : [];
  if (commitments.length === 0) return null;
  return [
    "=== CONTRAINTE DE STYLE SESSION (engagement pris) ===",
    ...commitments.map((c) => `- ${c}`),
    "Cet engagement, pris avec le user sur cette conversation, PRIME sur tout reflexe de style par defaut (emoji de warmth compris), y compris en mode soutien. Si la contrainte dit sans emojis: ZERO emoji.",
  ].join("\n");
}
