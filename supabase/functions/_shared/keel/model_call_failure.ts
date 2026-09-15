/**
 * QUAND L'APPEL AU MODÈLE N'ABOUTIT PAS — un type, pas une chaîne. Module PUR.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-14 · BÊTA 2B — CE QUE LA PERSONNE VOYAIT, MESURÉ
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ TROIS PANNES ORDINAIRES INJECTÉES AU BANC, TROIS FOIS LE MÊME DÉFAUT. Le
 * `catch` extérieur de `generate-household-meal-v1` rendait **500** avec le
 * message du fournisseur, brut, en anglais :
 *
 *     {"ok":false,"error":"OpenAI error: Rate limit reached for requests"}
 *     {"ok":false,"error":"error sending request: connection closed before …"}
 *     {"ok":false,"error":"Empty OpenAI response"}
 *
 * Trois choses fausses d'un coup :
 *   ① le plan de bêta l'interdit — « aucun code brut … comme seule sortie d'un
 *     problème ordinaire » ;
 *   ② le nom du fournisseur atteint une surface lue par un utilisateur ;
 *   ③ `planRefusals.ts` fait correspondre des JETONS, pas du texte libre : ces
 *     trois-là n'ont donc AUCUNE phrase, et l'écran rend ce qu'il peut.
 *
 * ── POURQUOI UN TYPE ET PAS UNE LECTURE DU MESSAGE ────────────────────────
 * Classer « est-ce une panne fournisseur ? » en lisant la chaîne serait un
 * matcher maison sur du texte que nous n'écrivons pas tous — « jamais de
 * matcher maison » est une cicatrice mesurée de ce dépôt (12 faux positifs sur
 * 12). Le SITE D'APPEL sait, lui, qu'il vient d'appeler le modèle : c'est là
 * que l'information est sûre, et c'est là qu'on la pose.
 *
 * ⛔ ET ON N'ACCUSE PAS LE MODÈLE. Le jeton dit « la composition n'a pas
 * abouti », jamais « le modèle a échoué » : la cause peut être notre requête,
 * le réseau, une clé, un plafond. « Ne pas attribuer une panne au modèle avant
 * de localiser sa première apparition dans la chaîne » vaut aussi pour un nom
 * de refus.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

/**
 * L'APPEL AU MODÈLE N'A PAS ABOUTI.
 *
 * ⚠️ `message` GARDE LA CHAÎNE D'ORIGINE, et c'est voulu : elle part au journal
 * et à `system_error_logs`, où elle sert au diagnostic. Ce qui ne doit pas
 * sortir, c'est qu'elle atteigne l'ÉCRAN — et c'est le `catch` du handler qui
 * s'en charge, en rendant un jeton à la place.
 */
export class ModelCallFailed extends Error {
  /**
   * ⛔ UN CHAMP, PAS SEULEMENT `instanceof`. Une fonction edge recharge ses
   * modules : deux instances de la même classe peuvent coexister, et
   * `instanceof` rendrait alors `false` sur un objet parfaitement légitime.
   * Le drapeau survit à ça.
   */
  readonly modelCallFailed = true;
  /** Ce qui a été tenté — `composition` ou `repair`. Compté, jamais affiché. */
  readonly phase: "composition" | "repair";
  override readonly cause: unknown;

  constructor(phase: "composition" | "repair", cause: unknown) {
    super(
      cause instanceof Error ? cause.message : String(cause ?? "unknown"),
    );
    this.name = "ModelCallFailed";
    this.phase = phase;
    this.cause = cause;
  }
}

/**
 * EST-CE UN APPEL MODÈLE QUI N'A PAS ABOUTI ?
 *
 * ⚠️ LE DRAPEAU D'ABORD, `instanceof` ENSUITE. Voir le pavé de
 * `modelCallFailed`.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function isModelCallFailure(error: unknown): error is ModelCallFailed {
  if (error instanceof ModelCallFailed) return true;
  return (
    typeof error === "object" && error !== null &&
    (error as { modelCallFailed?: unknown }).modelCallFailed === true
  );
}
