/**
 * LOT B.7 — L'ÉCRITURE DE LA DÉCLARATION SUR LA FOURCHETTE.
 *
 * ⛔ ELLE SE POSE À CÔTÉ DU FAIT, JAMAIS À SA PLACE. `energy_estimate` — le
 * chiffre et sa base — n'est PAS touché: un « ça a l'air juste » n'a rien
 * mesuré, et un « c'était plus » ne dit pas de combien. Promouvoir l'un ou
 * l'autre en `declared_quantities` lui emprunterait une fiabilité (2,3 % de
 * MAPE) que ce geste n'a jamais eue — l'erreur que l'en-tête de
 * `energy_correction.ts` corrige déjà à propos de R11.
 *
 * On écrit donc une clé À PART dans le même `recognized`, en préservant tout
 * le reste par étalement. Le lecteur d'énergie n'a rien à changer: il ne
 * connaît pas cette clé, et c'est ce qui garantit que la déclaration ne peut
 * pas déplacer un chiffre.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import type { EnergyBandVerdict } from "./energy_band_feedback.ts";

/**
 * Où la déclaration vit, dans `protocol_events.recognized`.
 *
 * ⚠️ UNE CLÉ, PAS UNE COLONNE. Une colonne demanderait une migration pour un
 * champ que seul ce geste écrit et que seule une mesure relit; `recognized`
 * est déjà le sac de ce que l'analyse a compris de cette photo, et la
 * déclaration en fait partie.
 */
export const ENERGY_BAND_FEEDBACK_KEY = "energy_band_feedback";

/**
 * Le `purpose` de l'accusé.
 *
 * ⚠️ LE SIEN, PAS CELUI DE LA PHOTO. `keel_meal_photo_ack` sert la bulle qui
 * porte la fourchette; réutiliser le même rendrait les deux indiscernables
 * dans `outbound_messages`, et la mesure de ce lot — le taux de réponse — se
 * lirait sur un dénominateur qui mélange l'accusé et sa réponse.
 */
export const ENERGY_BAND_ACK_PURPOSE = "keel_energy_band_ack";

export interface EnergyBandFeedbackRow {
  readonly verdict: EnergyBandVerdict;
  readonly at: string;
}

export type EnergyBandWriteOutcome =
  | { ok: true; already: boolean }
  /** La ligne n'existe pas, ou elle n'appartient pas à cette personne. */
  | { ok: false; reason: "stale" }
  /** La ligne ne porte aucune estimation: il n'y a rien à calibrer. */
  | { ok: false; reason: "no_estimate" }
  | { ok: false; reason: "write_failed" };

/**
 * ⚠️ `.eq("user_id", …)` EN PLUS DE `.eq("id", …)`, ET CE N'EST PAS REDONDANT.
 * RLS ne contraint rien sous `service_role`, et un identifiant d'événement
 * voyage dans la charge d'un bouton: sans ce second filtre, une charge forgée
 * écrirait sur la ligne de quelqu'un d'autre. C'est la cicatrice
 * `rls-is-not-a-substitute-for-eq-user-id`, et elle vaut ici mot pour mot.
 */
export async function writeEnergyBandFeedback(
  admin: SupabaseClient,
  args: {
    userId: string;
    eventId: string;
    verdict: EnergyBandVerdict;
    now: Date;
  },
): Promise<EnergyBandWriteOutcome> {
  try {
    const read = await admin
      .from("protocol_events")
      .select("recognized")
      .eq("id", args.eventId)
      .eq("user_id", args.userId)
      .maybeSingle();
    if (read.error) throw read.error;
    const row = (read.data ?? null) as
      | { recognized?: Record<string, unknown> | null }
      | null;
    if (!row) return { ok: false, reason: "stale" };

    const recognized = (row.recognized ?? {}) as Record<string, unknown>;
    // ⛔ PAS DE DÉCLARATION SANS CHIFFRE. Les quatre portes de `energy_gate`
    // effacent l'estimation à l'ingestion quand l'une d'elles est fermée. Une
    // déclaration écrite là-dessus calibrerait une fourchette que personne n'a
    // jamais vue — et fausserait la seule mesure que ce geste sert.
    if (!recognized.energy_estimate) return { ok: false, reason: "no_estimate" };

    // Ré-appuyer ne fabrique pas une seconde déclaration, et ne fait pas non
    // plus mentir l'accusé: `already` le dit, et l'appelant reste vrai.
    const prior = recognized[ENERGY_BAND_FEEDBACK_KEY] as
      | EnergyBandFeedbackRow
      | undefined;
    if (prior?.verdict === args.verdict) return { ok: true, already: true };

    const wrote = await admin
      .from("protocol_events")
      .update({
        recognized: {
          ...recognized,
          [ENERGY_BAND_FEEDBACK_KEY]: {
            verdict: args.verdict,
            at: args.now.toISOString(),
          },
        },
      } as never)
      .eq("id", args.eventId)
      .eq("user_id", args.userId)
      .select("id")
      .maybeSingle();
    if (wrote.error) throw wrote.error;
    // ⚠️ ZÉRO LIGNE MISE À JOUR N'EST PAS UN SUCCÈS. Un `update` qui ne touche
    // rien rend `204` sans erreur, et l'accusé dirait « c'est noté » sur une
    // ligne que personne n'a écrite. Même cicatrice que la RPC d'un élève rendue
    // au coach: on vérifie la ligne RENDUE, pas l'absence d'erreur.
    if (!wrote.data) return { ok: false, reason: "stale" };
    return { ok: true, already: false };
  } catch (error) {
    console.warn(JSON.stringify({
      tag: "keel.energy_band.write_failed",
      user_id: args.userId,
      event_id: args.eventId,
      verdict: args.verdict,
      error: error instanceof Error ? error.message : String(error),
      effect: "l'accuse dit que la declaration n'a pas ete enregistree",
    }));
    return { ok: false, reason: "write_failed" };
  }
}
