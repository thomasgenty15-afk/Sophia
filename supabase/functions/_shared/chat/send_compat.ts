/**
 * LA COUTURE DES ANCIENS `purposes` — un seul point, pas dix.
 *
 * ── LE PROBLÈME ──────────────────────────────────────────────────────────────
 * `process-checkins` fait 5 269 lignes et appelle `whatsapp-send` en DIX
 * endroits. Réécrire dix sites d'appel sur du legacy B2C, c'est dix occasions
 * de casser une garde qu'on n'a pas relue — et ce fichier porte des règles
 * chèrement acquises (fenêtres de fraîcheur, anti-doublon, placement par
 * `time_of_day`).
 *
 * Ce module remplace donc **la fonction d'envoi**, pas ses appelants. Les dix
 * sites gardent leur payload, leurs gardes et leur forme; seule la destination
 * change.
 *
 * ── CE QUI ARRIVE AUX TEMPLATES ──────────────────────────────────────────────
 * Le catalogue `WHATSAPP_TEMPLATE_CATALOG` ne meurt PAS avec Meta: il devient
 * la source de COMPOSITION locale. `renderWhatsAppTemplate` rendait déjà le
 * corps et les boutons pour que le classifieur puisse voir la question posée;
 * on rend maintenant la même chose pour l'ÉLÈVE. Un template devient un message
 * armé de ses boutons — exactement ce que `armed_question.ts` attend.
 *
 * C'est la traduction littérale de la consigne du chantier: « les purposes de
 * `whatsapp-send` deviennent des messages directs composés côté serveur, écrits
 * dans le ledger, livrés par Realtime ».
 *
 * ── LE SEUL CAS QUI REFUSE, ET POURQUOI ──────────────────────────────────────
 * Un template INCONNU du catalogue rendait `[TEMPLATE:<nom>]`. C'est acceptable
 * pour un classifieur (qui sait alors qu'il ne sait pas), et **inacceptable
 * pour un élève** — il verrait littéralement « [TEMPLATE:sophia_checkin_v2 ».
 * On refuse la livraison avec un motif, plutôt que d'envoyer un artefact.
 * C'est le même arbitrage que le repli `global_reach_template`, qui a envoyé
 * « J'ai une info pour toi » en français à des anglophones parce qu'un purpose
 * non mappé tombait sur un défaut silencieux.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { renderWhatsAppTemplate } from "./message_catalog.ts";
import { type ChatButton, deliverChatMessage } from "./delivery.ts";

export type LegacySendPayload = {
  user_id?: string;
  purpose?: string;
  message?: {
    type?: string;
    body?: string;
    name?: string;
    components?: unknown;
    buttons?: Array<{ id?: string; title?: string } | string>;
  };
  metadata_extra?: Record<string, unknown>;
  /** Ignorés: reliquats de l'API Meta, sans équivalent in-app. */
  to?: string;
  require_opted_in?: boolean;
  force_template?: boolean;
};

export type LegacySendResult = {
  /** Forme conservée: les appelants lisent `skipped` pour savoir si ça a filé. */
  skipped: boolean;
  reason: string;
  message_id: string | null;
};

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function readButtons(raw: unknown): ChatButton[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((b) => {
      if (typeof b === "string") {
        const label = cleanText(b);
        return label ? { payload: label, label } : null;
      }
      if (!b || typeof b !== "object") return null;
      const rec = b as Record<string, unknown>;
      const label = cleanText(rec.title);
      const payload = cleanText(rec.id) || label;
      return label ? { payload, label } : null;
    })
    .filter((b): b is ChatButton => b !== null);
}

/**
 * Compose et livre ce qu'un ancien appel `whatsapp-send` demandait.
 *
 * Rend la MÊME forme de résultat que `whatsapp-send` (`skipped`), pour que les
 * appelants qui la lisent — et il y en a — continuent de fonctionner sans
 * réécriture.
 */
export async function deliverLegacyPurpose(
  admin: SupabaseClient,
  payload: LegacySendPayload,
): Promise<LegacySendResult> {
  const userId = cleanText(payload.user_id);
  if (!userId) return { skipped: true, reason: "missing_user", message_id: null };

  const purpose = cleanText(payload.purpose);
  const message = payload.message ?? {};
  const type = cleanText(message.type) || "text";

  let body = cleanText(message.body);
  let buttons: ChatButton[] = readButtons(message.buttons);

  if (type === "template") {
    const rendered = renderWhatsAppTemplate({
      name: cleanText(message.name),
      components: message.components,
    });
    if (!rendered.known) {
      // Un artefact n'est pas un message. Voir l'en-tête.
      console.warn(JSON.stringify({
        tag: "legacy_purpose_unknown_template",
        user_id: userId,
        purpose,
        template: cleanText(message.name),
      }));
      return {
        skipped: true,
        reason: "unknown_template",
        message_id: null,
      };
    }
    body = rendered.content;
    // Les libellés du catalogue deviennent les boutons in-app. Le payload EST
    // le libellé: c'est ce que le classifieur de question armée compare, et
    // c'est ce que les anciens `mapTemplateChoiceToFlags` attendaient.
    buttons = rendered.buttons.map((label) => ({ payload: label, label }));
  }

  if (!body) return { skipped: true, reason: "empty_body", message_id: null };

  const res = await deliverChatMessage(admin, {
    userId,
    content: body,
    purpose,
    buttons,
    metadata: payload.metadata_extra ?? {},
  });
  return {
    skipped: !res.delivered,
    reason: res.reason,
    message_id: res.chatMessageId,
  };
}
