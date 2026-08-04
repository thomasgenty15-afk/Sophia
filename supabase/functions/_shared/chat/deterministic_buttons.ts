/**
 * LES RÉPONSES DÉTERMINISTES — traitées avant que le moindre LLM ne soit appelé.
 *
 * ── LA RÈGLE, ET ELLE N'A PAS CHANGÉ DE CANAL ────────────────────────────────
 * Un `button_payload` est une valeur que NOUS avons émise, qui n'a qu'un sens
 * possible, et qui revient telle quelle. La faire descendre jusqu'au dispatcher
 * revient à payer un appel LLM pour interpréter une chaîne exacte — et à
 * accepter qu'il se trompe sur elle. C'était déjà le raisonnement du bloc
 * « PIVOT N2 — LE TAP DU SOIR » dans `whatsapp-webhook` ; il survit intact,
 * seul le nom du champ change (`interactive_id` → `button_payload`).
 *
 * ── CE QUI N'EST PAS ICI, ET POURQUOI ────────────────────────────────────────
 * Le TEXTE libre n'entre jamais ici. `readPulseReply` ne lit que l'identifiant
 * de bouton : un « moyen » tapé à la main dans une conversation en cours n'est
 * pas une réponse au tap, et le dispatcher le traite mieux que nous. La règle
 * est reprise mot pour mot du webhook, parce qu'elle a été payée une fois.
 *
 * ── LE FORMULAIRE HEBDO ──────────────────────────────────────────────────────
 * Un `form_response` est un objet de formulaire, pas une phrase. Le laisser
 * descendre ferait analyser du JSON comme un message d'élève. Et l'attribution
 * ne vient PAS du jeton : le jeton dit la SEMAINE, l'élève est le porteur du
 * JWT. Un jeton qui ferait l'aller-retour avec un identifiant dedans serait un
 * identifiant modifiable désignant la ligne à écrire.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import {
  readPulseReply,
  renderPulseAck,
  renderPulseAxisQuestion,
} from "../keel/daily_pulse.ts";
import { writePulseAxis, writePulseLevel } from "../keel/daily_pulse_io.ts";
import { localDateFor } from "../keel/reengagement_io.ts";
import {
  parseWeeklyFlowToken,
  renderWeeklyFlowAck,
} from "../keel/weekly_flow.ts";
import { writeWeeklyFlowReply } from "../keel/weekly_flow_io.ts";
import { deliverChatMessage } from "./delivery.ts";
import { handled, type InboundStepOutcome, PASS } from "./inbound_pipeline.ts";
import type { InboundMessage } from "./inbound_message.ts";

async function timezoneFor(
  admin: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .maybeSingle();
  return String((data as { timezone?: string | null } | null)?.timezone ?? "")
    .trim() || null;
}

/**
 * L'accusé d'une réponse déterministe est une RÉPONSE, pas une notification :
 * `isReply: true`. Sans ça, un élève qui tape trois boutons dans la même
 * journée verrait ses accusés mangés par le plafond quotidien — c'est-à-dire
 * qu'il taperait dans le vide.
 */
async function ack(
  admin: SupabaseClient,
  args: {
    userId: string;
    requestId: string;
    body: string;
    buttons?: { payload: string; label: string }[];
    purpose: string;
  },
): Promise<void> {
  await deliverChatMessage(admin, {
    userId: args.userId,
    content: args.body,
    isReply: true,
    purpose: args.purpose,
    buttons: args.buttons ?? [],
    requestId: args.requestId,
  });
}

export async function handleDeterministicButton(
  admin: SupabaseClient,
  args: { message: InboundMessage; requestId: string },
): Promise<InboundStepOutcome> {
  const { message } = args;

  // ── LE POINT HEBDOMADAIRE ─────────────────────────────────────────────────
  if (message.kind === "form") {
    const week = parseWeeklyFlowToken(message.form_token);
    if (!week) {
      // Un jeton illisible ne fait PAS retomber le tour sur le dispatcher :
      // il analyserait le JSON du formulaire comme une phrase. On journalise
      // le jeton reçu, tronqué, sans jamais le laisser désigner quoi que ce
      // soit — puis on répond honnêtement.
      console.warn(JSON.stringify({
        tag: "keel.weekly_flow.unusable_token",
        user_id: message.user_id,
        form_token: String(message.form_token ?? "").slice(0, 64),
      }));
      await ack(admin, {
        userId: message.user_id,
        requestId: args.requestId,
        purpose: "keel_weekly_flow_ack",
        body:
          "Something went wrong on my side and I couldn't save that. Sorry — could you send it again?",
      });
      return handled("weekly_flow_unusable_token");
    }
    try {
      const written = await writeWeeklyFlowReply(admin, {
        userId: message.user_id,
        weekStart: week,
        responseJson: message.form_response,
      });
      await ack(admin, {
        userId: message.user_id,
        requestId: args.requestId,
        purpose: "keel_weekly_flow_ack",
        body: renderWeeklyFlowAck(written.reply),
      });
    } catch (error) {
      const err = error as { message?: string; code?: string; details?: string };
      console.error(JSON.stringify({
        tag: "keel.weekly_flow.write_failed",
        user_id: message.user_id,
        week,
        // Une erreur PostgREST n'est pas une `Error` : sans ces champs le
        // journal ne disait que « [object Object] », et c'est ainsi qu'un
        // 42P10 permanent sur l'upsert est resté invisible.
        error: error instanceof Error
          ? error.message
          : [err?.code, err?.message, err?.details].filter(Boolean).join(" — ") ||
            String(error),
      }));
      // L'élève a rempli huit champs : le silence complet lui ferait croire que
      // c'est enregistré. On le dit, sans lui renvoyer un chiffre.
      await ack(admin, {
        userId: message.user_id,
        requestId: args.requestId,
        purpose: "keel_weekly_flow_ack",
        body:
          "Something went wrong on my side and I couldn't save that. Sorry — could you send it again?",
      });
    }
    return handled("weekly_flow");
  }

  if (message.kind !== "button") return PASS;

  // ── LE TAP DU SOIR ────────────────────────────────────────────────────────
  const pulse = readPulseReply(message.button_payload);
  if (pulse.kind === "none") return PASS;

  const localDate = localDateFor(
    new Date(message.received_at),
    await timezoneFor(admin, message.user_id),
  );

  if (pulse.kind === "level") {
    const wrote = await writePulseLevel(admin, {
      userId: message.user_id,
      localDate,
      level: pulse.level,
      source: "chat",
    });
    await ack(admin, {
      userId: message.user_id,
      requestId: args.requestId,
      purpose: "keel_daily_pulse_ack",
      body: renderPulseAck(pulse.level, null),
    });
    // La question d'axe n'est posée QUE si quelque chose a coincé — et c'est un
    // second message, armé de ses boutons. Deux messages plutôt qu'un accusé
    // qui pose une question : la bulle affiche les boutons sous LA question,
    // pas sous un « Got it ».
    if (wrote.needsAxis) {
      const axisQuestion = renderPulseAxisQuestion();
      await ack(admin, {
        userId: message.user_id,
        requestId: args.requestId,
        purpose: "keel_daily_pulse_axis",
        body: axisQuestion.body,
        buttons: axisQuestion.buttons.map((b) => ({
          payload: b.id,
          label: b.title,
        })),
      });
    }
    return handled("daily_pulse_level");
  }

  await writePulseAxis(admin, {
    userId: message.user_id,
    localDate,
    axis: pulse.axis,
  });
  await ack(admin, {
    userId: message.user_id,
    requestId: args.requestId,
    purpose: "keel_daily_pulse_ack",
    body: renderPulseAck("hard", pulse.axis),
  });
  return handled("daily_pulse_axis");
}
