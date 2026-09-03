/**
 * FF-062 R13 — LA LECTURE DU DÉSARMEMENT. L'I/O du module pur voisin.
 *
 * Une seule requête, sur un index qui existe déjà
 * (`idx_chat_messages_user_scope_created`), et rien à écrire.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { CHAT_SCOPE } from "./delivery.ts";
import {
  type DisarmVerdict,
  judgeTapFreshness,
} from "./disarmed_tap.ts";

/**
 * Combien de messages assistant on remonte pour trouver le dernier à boutons.
 *
 * Vingt: une conversation active peut porter beaucoup d'accusés sans boutons
 * entre deux questions, et remonter trop peu ferait conclure « aucun message
 * armé » — donc fail-open — au lieu de trouver le vrai. Remonter beaucoup plus
 * coûterait une lecture large pour un cas qui n'existe pas: au-delà de vingt
 * messages assistant, la question d'hier n'est plus la question du jour.
 */
const SCAN_LIMIT = 20;

/**
 * Le tap est-il périmé ?
 *
 * ⚠️ FAIL-OPEN SUR LA LECTURE, ET C'EST DÉLIBÉRÉ. Une panne rend « pas
 * désarmé »: le pire cas est un tap tardif honoré, c'est-à-dire le comportement
 * d'avant cette règle. Le pire cas de l'inverse est un produit qui refuse TOUS
 * les taps parce que Postgres bégaye — et un bouton qui ne marche jamais est
 * indiscernable d'une panne totale, du point de vue de la personne.
 */
export async function judgeTap(
  admin: SupabaseClient,
  args: { userId: string; replyTo: string | null },
): Promise<DisarmVerdict> {
  const replyTo = String(args.replyTo ?? "").trim();
  if (!replyTo) return { disarmed: false, reason: "no_reply_to" };

  try {
    const { data, error } = await admin
      .from("chat_messages")
      .select("id, metadata")
      .eq("user_id", args.userId)
      .eq("scope", CHAT_SCOPE)
      .eq("role", "assistant")
      .order("created_at", { ascending: false })
      .limit(SCAN_LIMIT);
    if (error) throw error;

    const rows = (data ?? []) as Array<
      { id?: unknown; metadata?: Record<string, unknown> | null }
    >;

    // Le DERNIER message assistant porteur de boutons. Voir le pavé du module
    // pur: un proactif SANS boutons ne remplace pas une question — il ne
    // demande rien.
    const latestArmed = rows.find((r) =>
      Array.isArray(r.metadata?.buttons) &&
      (r.metadata!.buttons as unknown[]).length > 0
    );

    // Le `purpose` de la bulle TAPÉE, pour l'exemption transactionnelle. Elle
    // peut être hors de la fenêtre de scan: on ne la cherche pas plus loin, et
    // son absence ne change rien — un transactionnel ne porte pas de boutons
    // déterministes, donc il n'atteint pas ce chemin.
    const tapped = rows.find((r) => String(r.id ?? "") === replyTo);

    return judgeTapFreshness({
      replyTo,
      latestArmedId: latestArmed ? String(latestArmed.id ?? "") : null,
      replyToPurpose: tapped
        ? String(tapped.metadata?.purpose ?? "") || null
        : null,
    });
  } catch (error) {
    console.warn(JSON.stringify({
      tag: "keel.chat.tap_freshness_unreadable",
      user_id: args.userId,
      reply_to: replyTo,
      // Les quatre champs, pas `String(error)`: une erreur PostgREST n'est pas
      // une `Error`, et le journal ne dirait que « [object Object] ».
      error: error instanceof Error ? error.message : [
        (error as { code?: string })?.code,
        (error as { message?: string })?.message,
        (error as { details?: string })?.details,
        (error as { hint?: string })?.hint,
      ].filter(Boolean).join(" — ") || String(error),
      effect: "fail-open: le tap est honoré",
    }));
    return { disarmed: false, reason: "no_armed_message" };
  }
}
