/**
 * FF-062 R11 — LA CORRECTION, ÉCRITE SUR LA LIGNE.
 *
 * Le module pur voisin décide ce que le chiffre devient; celui-ci le pose dans
 * `protocol_events.recognized.energy_estimate`.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { correctEnergy, type EnergyCorrection } from "./energy_correction.ts";

/** Le `purpose` de l'accusé de correction. */
export const ENERGY_FIX_ACK_PURPOSE = "keel_energy_fix_ack";

export type EnergyFixOutcome =
  | { ok: true; kcal: number; basis: string }
  /**
   * ⚠️ `stale` ET `failed` SONT DEUX CHOSES, ET LES CONFONDRE ÉTAIT UN DÉFAUT
   * MESURÉ EN RUN RÉEL LE 2026-09-02.
   *
   * Le jeton citait le fait d'un AUTRE élève: la garde de propriété a tenu, la
   * ligne de la victime n'a pas bougé — et l'accusé a répondu « quelque chose a
   * mal tourné de mon côté, réessaie ». C'est faux deux fois: rien n'a mal
   * tourné, et « réessaie » invite à rejouer une requête qui ne peut jamais
   * aboutir.
   *
   *   `stale`  — la ligne n'existe pas, n'est pas la vôtre, ou ne porte aucun
   *              chiffre à remplacer. Aucun de ces trois états ne changera en
   *              réessayant.
   *   `failed` — une vraie panne de lecture ou d'écriture. Là, réessayer a un
   *              sens.
   *
   * Les trois cas de `stale` se disent PAREIL à la personne, et c'est
   * délibéré: distinguer « pas à vous » de « n'existe pas » renseignerait un
   * jeton forgé sur ce qui existe chez les autres.
   */
  | { ok: false; reason: "empty" | "not_a_number" | "stale" | "failed" }
  | { ok: false; reason: "out_of_range"; min: number; max: number };

/**
 * Remplacer le chiffre d'énergie d'un fait photo.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * TROIS GARDES, ET AUCUNE N'EST DÉCORATIVE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ ① `.eq("user_id")` — MESURÉ EN RUN ADVERSARIAL (H2), sur le chargeur
 * voisin. Cette fonction tourne sous `service_role`: la RLS ne s'applique PAS,
 * et l'`eventId` vient de la CHARGE D'UN JETON, c'est-à-dire d'une chaîne que
 * le client contrôle. Sans ce filtre, un jeton forgé citant le fait d'un AUTRE
 * élève réécrirait sa ligne. C'est la cicatrice
 * `rls-is-not-a-substitute-for-eq-user-id`, mot pour mot.
 *
 * ⛔ ② ON NE CRÉE JAMAIS `energy_estimate` — on le REMPLACE. Une ligne qui n'en
 * portait pas est une ligne dont la porte des quatre gardes était FERMÉE à
 * l'ingestion (plancher TCA, mineur, coach qui ne compte pas, affichage
 * éteint), ou dont le modèle n'a rien proposé. Y écrire un chiffre par ce
 * chemin contournerait la garde la plus sensible du produit — avec un jeton
 * que le client a forgé, en plus. Absence de chiffre ⇒ refus.
 *
 * ⛔ ③ RIEN D'AUTRE NE BOUGE. La lecture de la photo — aliments, groupes,
 * bande de portion, verdicts — reste ce que le modèle a rendu. La personne a
 * corrigé UN nombre, pas réécrit ce qu'on a vu dans son assiette.
 *
 * NE JETTE JAMAIS: l'appelant rend un accusé, et un 500 ferait croire à la
 * personne que sa correction est perdue alors qu'elle ne l'est peut-être pas.
 */
export async function applyEnergyFix(
  admin: SupabaseClient,
  args: { userId: string; eventId: string; raw: unknown },
): Promise<EnergyFixOutcome> {
  const parsed: EnergyCorrection = correctEnergy(args.raw);
  if (!parsed.ok) return parsed;

  try {
    const read = await admin
      .from("protocol_events")
      .select("recognized")
      .eq("id", args.eventId)
      // ① — voir le pavé.
      .eq("user_id", args.userId)
      .maybeSingle();
    if (read.error) throw read.error;
    const row = (read.data ?? null) as
      | { recognized?: Record<string, unknown> | null }
      | null;
    if (!row) return { ok: false, reason: "stale" };

    const recognized = (row.recognized ?? {}) as Record<string, unknown>;
    // ② — absence de chiffre ⇒ refus. On ne crée pas ce que la porte a fermé.
    if (!recognized.energy_estimate) {
      console.warn(JSON.stringify({
        tag: "keel.energy_fix.no_estimate_to_replace",
        user_id: args.userId,
        event_id: args.eventId,
        effect: "refus: on ne CRÉE pas un chiffre que la porte a ferme",
      }));
      return { ok: false, reason: "stale" };
    }

    const wrote = await admin
      .from("protocol_events")
      .update({
        // ③ — un seul champ change, par recopie explicite du reste.
        recognized: { ...recognized, energy_estimate: parsed.estimate },
      } as never)
      .eq("id", args.eventId)
      .eq("user_id", args.userId)
      // ⚠️ RELU. Sans `.select()`, PostgREST rend 204 sur un UPDATE qui n'a
      // touché AUCUNE ligne, et l'accusé annoncerait une correction qui n'a pas
      // eu lieu. C'est la cicatrice `rls-is-not-a-substitute-for-eq-user-id`
      // dans sa seconde moitié: « update 0 ligne = 204 muet ».
      .select("id")
      .maybeSingle();
    if (wrote.error) throw wrote.error;
    // Zéro ligne touchée: la ligne a disparu entre la lecture et l'écriture.
    // `stale`, pas `failed` — réessayer ne la fera pas revenir.
    if (!wrote.data) return { ok: false, reason: "stale" };

    return {
      ok: true,
      kcal: parsed.estimate.kcal,
      basis: parsed.estimate.basis,
    };
  } catch (error) {
    console.warn(JSON.stringify({
      tag: "keel.energy_fix.write_failed",
      user_id: args.userId,
      event_id: args.eventId,
      error: error instanceof Error ? error.message : [
        (error as { code?: string })?.code,
        (error as { message?: string })?.message,
        (error as { details?: string })?.details,
        (error as { hint?: string })?.hint,
      ].filter(Boolean).join(" — ") || String(error),
    }));
    return { ok: false, reason: "failed" };
  }
}
