/**
 * Contexte du flow « Présence ».
 *
 * Garantie anti-poussée STRUCTURELLE (pas une regle de prompt): on part du
 * LoadedContext companion deja charge et on ne garde qu'une allowlist — le
 * catalogue produit, les capacites dashboard, les opportunites de surface et
 * les addons de recommandation sont RETIRES. Le modele ne peut pas pousser ce
 * qu'il ne voit pas.
 *
 * On CONSERVE en revanche `recentEffectsSummary` (contrat d'outcome des effets
 * du tour — charte cmd 15/16: si un rappel vient d'etre commite en mode
 * presence, le renderer doit pouvoir le confirmer honnetement) et la memoire /
 * l'identite / le fil (la matiere du miroir facon ami).
 */

import type { LoadedContext } from "../../context/types.ts";

// Blocs conserves: presence, memoire, identite, honnetete des effets.
// NOTE: recentTurns (15 messages tronques a 420 chars) est volontairement
// ABSENT — le fil de la discussion est fourni en verbatim complet par
// thread.ts (buildPresenceThreadBlock), avec soupape de compression.
const PRESENCE_ALLOWED_KEYS: ReadonlyArray<keyof LoadedContext> = [
  "temporal",
  "facts",
  "identity",
  "shortTerm",
  "whatsappFilRouge",
  "memoryV2Payload",
  "eventMemories",
  "globalMemories",
  "topicMemories",
  "momentumBlockersAddon",
  "recentEffectsSummary",
  "deferredUserPref",
];

/**
 * Retourne une copie du LoadedContext ne gardant que l'allowlist présence.
 * Tout le reste (produit / dashboard / surface / recommandation / inventaire
 * durable) est retiré.
 */
export function stripToPresenceContext(loaded: LoadedContext): LoadedContext {
  const out: LoadedContext = {};
  for (const key of PRESENCE_ALLOWED_KEYS) {
    const value = loaded[key];
    if (typeof value === "string" && value.length > 0) {
      (out as Record<string, string>)[key as string] = value;
    }
  }
  return out;
}

export { PRESENCE_ALLOWED_KEYS };
