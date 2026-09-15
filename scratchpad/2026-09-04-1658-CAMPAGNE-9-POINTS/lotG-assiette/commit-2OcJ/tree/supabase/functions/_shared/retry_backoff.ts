/**
 * LE BACKOFF DE RENVOI — ce qui reste de `whatsapp_outbound_tracking.ts`.
 *
 * ── CE QUI EST MORT AVEC META ────────────────────────────────────────────────
 * `createWhatsAppOutboundRow`, `markWhatsAppOutboundSent/Skipped/Failed`: quatre
 * fonctions qui géraient le cycle de vie d'un envoi Graph (file, verrou,
 * `provider_message_id`, erreurs Meta). La livraison in-app est une écriture:
 * elle réussit ou elle échoue, et un INSERT rejoué sans clé d'idempotence
 * produirait un doublon — ce qui est pire que l'absence. Il n'y a donc plus de
 * worker de renvoi (`process-whatsapp-outbound-retries` est supprimé).
 *
 * ── CE QUI SURVIT, ET POURQUOI ───────────────────────────────────────────────
 * Cette table de délais est PURE et n'a jamais rien eu de WhatsApp : elle sert
 * aussi aux relances de `scheduled_checkins` dans `process-checkins`, qui n'ont
 * rien à voir avec Graph. Le fichier a été réduit à ce qu'il est vraiment.
 */

/** Délais successifs: 1 min, 5 min, 30 min, 2 h, 6 h, 24 h (puis plafond). */
export function computeNextRetryAtIso(attemptCount: number): string {
  const scheduleSec = [60, 5 * 60, 30 * 60, 2 * 60 * 60, 6 * 60 * 60, 24 * 60 * 60];
  const idx = Math.max(
    0,
    Math.min(scheduleSec.length - 1, Math.floor(attemptCount)),
  );
  return new Date(Date.now() + scheduleSec[idx] * 1000).toISOString();
}
