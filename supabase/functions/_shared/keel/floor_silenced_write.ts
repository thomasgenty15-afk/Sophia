/**
 * L2 — SOUS PLANCHER, LA DONNÉE ENTRE ; C'EST LA RÉPONSE QUI SE TAIT.
 *
 * ── LE DÉFAUT QUE CE MODULE FERME ───────────────────────────────────────────
 * Mesuré 3/3 par FF-017, puis 6/6 en FR et EN par FF-020, relu en `psql` :
 * sous `safety_band` (ou sous le plancher de restriction alimentaire), une
 * déclaration de repas produisait `direct_effects_to_run = []` et ZÉRO ligne
 * `protocol_events`. Le plancher n'avalait pas seulement la SOLLICITATION
 * (« et avec quoi ? »), il avalait le FAIT.
 *
 * FF-017 §1 veut « déclaration ÉCRITE, aucune question ». Le code faisait « ni
 * question NI écriture ». C'était une contradiction fiche ↔ arbitrage
 * `v5-arbitrations`, restée ouverte jusqu'à l'arbitrage humain du 2026-08-08 :
 *
 *      « Écrire le fait, taire la réponse. »
 *
 * La donnée entre en base. La personne n'est ni relancée, ni félicitée, ni
 * questionnée, ni complimentée. Le plancher avale la sollicitation, PLUS
 * l'effet.
 *
 * ── LE PATRON EXISTAIT DÉJÀ, ET IL EST PROUVÉ ───────────────────────────────
 * FF-008 (le poids annoncé) et FF-027 (le signal de faim) écrivent DIRECTEMENT
 * en base, hors `direct_effects` — le commentaire de `run.ts` le dit mot pour
 * mot : « IL N'EST PAS DANS `direct_effects`, DONC LA BANDE DE SÉCURITÉ NE
 * L'AVALE PAS ». Leur restitution se tait parce que le fait n'atteint JAMAIS la
 * couche qui parle : ni le frame, ni le prompt du skill, ni le renderer.
 *
 * Ce module rend au repas la même propriété, par le seul chemin qu'un repas
 * puisse emprunter (`protocol_events` a son exécuteur write-through, et en
 * inventer un second forkerait le schéma).
 *
 * ── LA TRACE EXISTAIT DÉJÀ AUSSI ; C'EST LE LECTEUR QUI MANQUAIT ────────────
 * FF-021 a établi (contre ce que T-7 affirmait) que
 * `conversation_turn_traces.route_decision.blocked_paths` porte déjà
 * `"direct_effects.log_protocol_event"` AVEC son motif, sur la branche
 * restriction ET sur la branche safety, 3/3. Ce module est ce lecteur : il ne
 * devine pas l'état du plancher, il RELIT la décision que `routers.ts` vient
 * d'écrire.
 *
 * ── CE QU'IL NE FAIT PAS, ET C'EST LA MOITIÉ DU LOT ─────────────────────────
 *  · Il ne touche NI aux chemins de crise NI au plancher lui-même. `routers.ts`
 *    est inchangé : le tour appartient toujours à `safety` ou à
 *    `disordered_eating_guard`, et `direct_effects_to_run` reste vide.
 *  · Il n'ouvre AUCUN genre de demande. Le budget (`daily_ask_budget.ts`,
 *    `DAILY_ASK_BUDGET = 1`) et les deux gates de FF-021 (`b36e5de9`, drapeau
 *    BRUT en paramètre requis, refus nommé avant toute I/O) sont hors de son
 *    chemin et le restent.
 *  · Il ne rend RIEN de visible. Voir `SILENCED_WRITE_EFFECT_TYPES`.
 */

import type { BlockedPath } from "../../sophia-brain/contracts/route_decision.v1.ts";

/**
 * LES MOTIFS QUI SIGNIFIENT « LE PLANCHER A PRIS LE TOUR ».
 *
 * Liste FERMÉE, recopiée des cinq branches de `routers.ts` qui vident
 * `direct_effects_to_run` : trois branches safety, deux branches du plancher de
 * restriction (entrée et continuation).
 *
 * ⚠️ CONDITION DE DÉSARMEMENT (doctrine P9), et elle est essentielle : les
 * motifs de `blockedDirectEffects` — `direct_effect_not_strong_enough`,
 * `target_ambiguous`, `target_missing` — sont ABSENTS, exprès. Ce sont des
 * refus JUSTES : l'effet n'était pas assez sûr pour être écrit, et le plancher
 * n'y est pour rien. Les rejouer ici transformerait un lecteur de plancher en
 * contournement de gate, ce qui est exactement le contraire du lot.
 */
export const FLOOR_SILENCING_REASON_CODES: ReadonlySet<string> = new Set([
  // routers.ts — safety haute/critique
  "safety_priority",
  // routers.ts — crise active (flow ouvert)
  "active_safety_priority",
  // routers.ts — idéation passive à band medium
  "distress_ideation_safety_priority",
  // routers.ts — plancher de restriction, entrée
  "restriction_flag_priority",
  // routers.ts — plancher de restriction, continuation
  "active_restriction_flag_priority",
]);

/**
 * LES EFFETS QUI S'ÉCRIVENT QUAND MÊME, ET EUX SEULS.
 *
 * `log_protocol_event` est le SEUL. Il écrit un FAIT que la personne vient de
 * rapporter : ce qu'elle a mangé, et sa relation au plan (FF-009). Le perdre,
 * c'est perdre la donnée centrale du produit au moment exact où le message la
 * portait — et sur un chemin de sécurité, c'est aussi aveugler la revue du
 * coach précisément sur la semaine qui compte.
 *
 * ── POURQUOI LES QUATRE AUTRES RESTENT AVALÉS ───────────────────────────────
 *  · `track_progress_plan_item` — une coche de progrès EST la pression
 *    d'adhérence que le plancher existe pour suspendre (`routers.ts` le dit :
 *    « Zéro effet durable : une coche de progrès ou un rappel de conformité
 *    committé pendant ce flow EST la pression d'adhérence »).
 *  · `create_one_shot_reminder` — P3-A/P5-A : plus aucun carve-out rappel à
 *    high/critical. Le runtime rend un différé HONNÊTE
 *    (`safety_crisis_deferred`) et re-sert après la crise. Écrire ici casserait
 *    un arbitrage déjà mesuré et testé.
 *  · `declare_deviation` — un écart PLANIFIÉ est une négociation de plan, donc
 *    de l'adhérence, et il porte sur le futur : rien n'est perdu à le refaire
 *    après.
 *  · `declare_safety_constraint` — une allergie déclarée en crise est un vrai
 *    sujet, et il est OUVERT : il n'est pas dans le périmètre décidé par
 *    l'humain le 2026-08-08 (voir `scratchpad/RAPPORT-L2-PLANCHER.md`). Il est
 *    laissé tel quel plutôt que tranché en passant.
 */
export const SILENCED_WRITE_EFFECT_TYPES: ReadonlySet<string> = new Set([
  "log_protocol_event",
]);

export type FloorSilencedWriteDecision = {
  /** Les effets à exécuter en silence. Vide ⇒ rien à faire, aucune I/O. */
  effect_types: string[];
  /** Le motif du plancher, pour le log et la trace. `null` si rien. */
  reason_code: string | null;
};

const NOTHING: FloorSilencedWriteDecision = Object.freeze({
  effect_types: [],
  reason_code: null,
});

/**
 * Que faut-il écrire en silence sur ce tour ?
 *
 * @param blockedPaths `route_decision.blocked_paths`, tel que `routers.ts`
 *   vient de l'écrire. C'est la SEULE entrée : on ne relit pas le plancher, on
 *   ne recalcule pas la bande, on n'interroge pas le frame. Un second lieu de
 *   vérité sur l'état du plancher est exactement la classe de panne que ce
 *   dépôt paie en boucle (« le déterministe décide, la couche du dessus ne le
 *   sait pas »).
 * @param isKeelStudent REQUIS, jamais optionnel — cicatrice
 *   `optional-gate-params-are-disarmed-gates`. Un non-élève n'a ni protocole ni
 *   `protocol_events` : il n'y a rien à écrire, et un défaut implicite ferait
 *   tourner une lane KEEL sur un compte legacy.
 */
export function floorSilencedWriteForTurn(args: {
  blockedPaths: readonly BlockedPath[] | null | undefined;
  isKeelStudent: boolean;
}): FloorSilencedWriteDecision {
  if (args.isKeelStudent !== true) return NOTHING;
  const paths = Array.isArray(args.blockedPaths) ? args.blockedPaths : [];
  const types: string[] = [];
  let reason: string | null = null;
  for (const entry of paths) {
    const path = String(entry?.path ?? "");
    const reasonCode = String(entry?.reason_code ?? "");
    if (!path.startsWith("direct_effects.")) continue;
    if (!FLOOR_SILENCING_REASON_CODES.has(reasonCode)) continue;
    const effectType = path.slice("direct_effects.".length);
    if (!SILENCED_WRITE_EFFECT_TYPES.has(effectType)) continue;
    if (!types.includes(effectType)) types.push(effectType);
    // Le PREMIER motif rencontré, et il ne change pas: `routers.ts` écrit un
    // seul motif par branche, et une branche possède le tour entier.
    reason ??= reasonCode;
  }
  return types.length === 0 ? NOTHING : { effect_types: types, reason_code: reason };
}
