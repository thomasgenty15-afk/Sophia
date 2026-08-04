/**
 * L'ORDRE SACRÉ DES GARDES, sur le chemin neutre.
 *
 * ── CE QU'IL ÉTAIT, ET POURQUOI IL SURVIT ────────────────────────────────────
 * Dans `whatsapp-webhook`, l'ordre était :
 *   dedup (wamid) → STOP → boutons déterministes → journalisation → photo →
 *   pending/flows → dispatcher.
 * Il n'était écrit nulle part : il était la conséquence de 1 645 lignes de
 * `continue` dans une boucle. Chaque déplacement d'un bloc changeait le produit
 * sans que rien ne le dise.
 *
 * Ici il est une LISTE, dans un module qui ne fait que ça. Chaque étape rend
 * soit « j'ai traité le tour » soit « je passe la main », et l'ordre est une
 * donnée du fichier, pas une propriété émergente.
 *
 * ── CE QUI A CHANGÉ, ET CE QUI NE POUVAIT PAS ────────────────────────────────
 *   - `wamid` → `client_message_id`, et la clé de dedup devient
 *     `(user_id, client_message_id)` (l'unique global était sûr pour un
 *     identifiant Meta, mortel pour un identifiant choisi par le client) ;
 *   - le STOP Meta devient un réglage produit : il coupe les relances, jamais
 *     la réponse à quelqu'un qui écrit ;
 *   - la safety n'est PAS ici. Elle vit dans `sophia-brain` et n'a pas bougé
 *     d'une ligne : ce chantier change le transport, pas le cerveau.
 *
 * ── CE QUI EST DÉTERMINISTE RESTE DÉTERMINISTE ───────────────────────────────
 * Un `button_payload` est une valeur EXACTE qui n'a qu'un sens possible. Le
 * laisser descendre jusqu'au dispatcher reviendrait à payer un appel LLM pour
 * interpréter une chaîne qu'on a nous-mêmes émise — et à accepter qu'il se
 * trompe. Les boutons sont donc résolus AVANT le dispatcher, comme le tap du
 * soir l'était dans le webhook.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import type { InboundMessage } from "./inbound_message.ts";

export type InboundStepOutcome =
  /** L'étape a traité le tour : on s'arrête là. */
  | { handled: true; reason: string }
  /** L'étape passe la main à la suivante. */
  | { handled: false };

export const PASS: InboundStepOutcome = { handled: false };

export function handled(reason: string): InboundStepOutcome {
  return { handled: true, reason };
}

export type DedupOutcome =
  | { status: "fresh"; dedupId: string }
  | { status: "duplicate" }
  | { status: "error"; error: Error };

/**
 * L'IDEMPOTENCE, EN PREMIER, ET PAR ÉCRITURE.
 *
 * On insère AVANT de traiter, et c'est le conflit d'unicité qui dit « déjà vu ».
 * Un « SELECT puis INSERT » laisserait deux retries réseau simultanés passer
 * tous les deux — le même défaut que le plafond quotidien avait avant sa
 * réservation atomique (mesuré : 6/6 au lieu de 2).
 */
export async function claimInbound(
  admin: SupabaseClient,
  args: { message: InboundMessage; requestId: string },
): Promise<DedupOutcome> {
  const { data, error } = await admin
    .from("inbound_dedup")
    .insert({
      user_id: args.message.user_id,
      client_message_id: args.message.client_message_id,
      request_id: args.requestId,
      status: "received",
      metadata: {
        kind: args.message.kind,
        button_payload: args.message.button_payload,
        has_media: Boolean(args.message.media_ref),
        reply_to: args.message.reply_to,
      },
    } as never)
    .select("id")
    .maybeSingle();

  if (error) {
    // 23505 = unique_violation ⇒ le client a rejoué le même message.
    if (String((error as { code?: string }).code ?? "") === "23505") {
      return { status: "duplicate" };
    }
    return { status: "error", error: new Error(error.message) };
  }
  const id = String((data as { id?: string } | null)?.id ?? "");
  if (!id) return { status: "error", error: new Error("dedup_insert_no_id") };
  return { status: "fresh", dedupId: id };
}

export async function markInboundProcessed(
  admin: SupabaseClient,
  args: { dedupId: string; chatMessageId: string | null; status?: "processed" | "failed" },
): Promise<void> {
  const { error } = await admin
    .from("inbound_dedup")
    .update({
      status: args.status ?? "processed",
      processed_at: new Date().toISOString(),
      chat_message_id: args.chatMessageId,
    } as never)
    .eq("id", args.dedupId);
  if (error) {
    // Une trace ratée ne défait pas un tour déjà joué.
    console.warn(JSON.stringify({
      tag: "chat_inbound_dedup_mark_failed",
      dedup_id: args.dedupId,
      error: error.message,
    }));
  }
}

/**
 * Journalise l'entrant dans la bulle, et rafraîchit la présence de l'élève.
 *
 * `chat_last_inbound_at` est mis à jour ICI, avant tout routage, pour la même
 * raison que la clôture d'épisode de décrochage l'était dans le webhook : la
 * présence ne doit dépendre ni du handler qui répondra, ni du fait qu'il y ait
 * une réponse. Un STOP, une photo, un « merci » prouvent tous une présence.
 */
export async function logInboundMessage(
  admin: SupabaseClient,
  args: {
    message: InboundMessage;
    requestId: string;
    scope: string;
  },
): Promise<string | null> {
  const { message } = args;
  const { data, error } = await admin
    .from("chat_messages")
    .insert({
      user_id: message.user_id,
      scope: args.scope,
      role: "user",
      // Un formulaire n'a pas de texte visible : on écrit une trace lisible
      // plutôt qu'une chaîne vide, sans jamais la donner au classifieur.
      content: message.text || `[${message.kind}]`,
      created_at: message.received_at,
      metadata: {
        channel: "in_app",
        client_message_id: message.client_message_id,
        kind: message.kind,
        button_payload: message.button_payload,
        media_ref: message.media_ref,
        form_token: message.form_token,
        reply_to: message.reply_to,
        request_id: args.requestId,
      },
    } as never)
    .select("id")
    .maybeSingle();
  if (error) throw error;

  const { error: presenceError } = await admin
    .from("profiles")
    .update({ chat_last_inbound_at: message.received_at } as never)
    .eq("id", message.user_id);
  if (presenceError) {
    console.warn(JSON.stringify({
      tag: "chat_inbound_presence_update_failed",
      user_id: message.user_id,
      error: presenceError.message,
    }));
  }

  return String((data as { id?: string } | null)?.id ?? "") || null;
}
