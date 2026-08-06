/// <reference path="../tsserver-shims.d.ts" />
/**
 * `chat-inbound-v1` — L'ENTRÉE DE LA CONVERSATION, SANS META.
 *
 * ── CE QUI REMPLACE QUOI ─────────────────────────────────────────────────────
 * `whatsapp-webhook` faisait 1 645 lignes dans un seul `Deno.serve`, dont
 * environ les deux tiers étaient du legacy B2C (liaison par email, machine à
 * états d'onboarding, paywall Alliance/Architecte, numéro erroné, relances de
 * lien). Ce fichier n'en reprend rien : il reprend l'ORDRE DES GARDES, qui est
 * la seule chose de valeur que ces 1 645 lignes contenaient, et qui vit
 * maintenant explicitement dans `_shared/chat/inbound_pipeline.ts`.
 *
 * Ce qui disparaît, et pourquoi c'est correct :
 *   - la vérification de signature X-Hub  → il n'y a plus de webhook tiers ;
 *     l'appelant est l'élève, authentifié par son JWT ;
 *   - la résolution `phone → profile`     → l'élève EST le porteur du JWT ;
 *   - `whatsapp_inbound_dedup(wamid)`     → `inbound_dedup(user_id, client_message_id)` ;
 *   - le repli « media non supporté »     → le contrat entrant refuse en amont
 *     ce qu'on ne sait pas lire, avec un statut HTTP et un motif.
 *
 * ── LE MOTEUR NE SAIT PAS D'OÙ VIENT LE MESSAGE ──────────────────────────────
 * `processMessage` est appelé avec `channel: "web"` et `scope: "app"`.
 * PAS de `channel: "in_app"` : la valeur `"whatsapp"` gate six branches dans
 * `sophia-brain` (fil rouge, indicateur de frappe, coalescence de rafale) qui
 * sont toutes du transport Meta. Élargir l'union pour y ajouter un troisième
 * nom obligerait à re-décider ces six branches ; `"web"` les évite toutes et
 * dit la vérité — la bulle EST une surface web.
 *
 * `scope: "app"` et pas `"whatsapp"` : le scope porte l'état conversationnel
 * (`user_chat_states`) et l'historique lu par le cerveau. Réutiliser
 * `"whatsapp"` aurait gardé le mot dans chaque ligne écrite à partir
 * d'aujourd'hui, pour ne gagner qu'une continuité d'historique dont aucun élève
 * KEEL réel n'a besoin (aucun n'a jamais parlé sur WhatsApp en production).
 * L'historique WhatsApp existant reste lisible sous son scope.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.87.3";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import {
  parseInboundMessage,
} from "../_shared/chat/inbound_message.ts";
import {
  claimInbound,
  logInboundMessage,
  markInboundProcessed,
} from "../_shared/chat/inbound_pipeline.ts";
import { CHAT_SCOPE, deliverChatMessage } from "../_shared/chat/delivery.ts";
import { closeKeelReengagementEpisodeOnInbound } from "../_shared/keel/reengagement_io.ts";
import { ACTIVE_FLOW_STATE_TABLE } from "../sophia-brain/router/active_flow_state.ts";
import {
  handleDeterministicButton,
} from "../_shared/chat/deterministic_buttons.ts";
import {
  classifyArmedQuestionReply,
  resolveArmedQuestion,
} from "../_shared/chat/armed_question.ts";
import { processMessage } from "../sophia-brain/router/run.ts";
import { extractHiddenFilRougeNote } from "../sophia-brain/chat_text.ts";

const FN_NAME = "chat-inbound-v1";

function env(name: string): string {
  return String(Deno.env.get(name) ?? "").trim();
}

function envInt(name: string, fallback: number): number {
  const raw = env(name);
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(1_000, Math.floor(n)) : fallback;
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label}_timeout_${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsOptions(req);
  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, { status: 405 });
  }
  const corsBlock = enforceCors(req);
  if (corsBlock) return corsBlock;

  const requestId = getRequestId(req);
  let userIdForLog: string | null = null;

  try {
    const authHeader = String(req.headers.get("authorization") ?? "").trim();
    if (!authHeader) {
      return jsonResponse(req, {
        error: "Missing Authorization header",
        request_id: requestId,
      }, { status: 401 });
    }

    const supabaseUrl = env("SUPABASE_URL");
    const anonKey = env("SUPABASE_ANON_KEY");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) {
      // Pattern (g) du gantelet : une configuration absente est une PANNE, pas
      // un tour vide. La dire ici évite qu'un 200 silencieux passe pour un
      // succès (c'est ainsi que `handleCorsOptions` sans garde a fait répondre
      // « ok » de 2 octets à toutes les requêtes pendant des semaines).
      return jsonResponse(req, {
        error: "chat-inbound-v1 misconfigured: missing Supabase env",
        request_id: requestId,
      }, { status: 500 });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await userClient.auth.getUser();
    const user = authData?.user;
    if (authError || !user) {
      return jsonResponse(req, {
        error: "Unauthorized",
        request_id: requestId,
      }, { status: 401 });
    }
    userIdForLog = user.id;

    // ── GARDE 0 : LE COMPTE EXISTE-T-IL ENCORE ? ─────────────────────────────
    // Edge case n°5 : un élève supprimé/purgé qui poste doit recevoir un refus
    // propre, pas un tour fantôme. Le JWT peut survivre à la ligne `profiles`
    // (il est valide jusqu'à son expiration), donc l'existence se vérifie, elle
    // ne se déduit pas de l'authentification.
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id,deletion_requested_at")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) {
      return jsonResponse(req, {
        error: "Account no longer exists",
        request_id: requestId,
      }, { status: 410 });
    }
    if ((profile as { deletion_requested_at?: string | null }).deletion_requested_at) {
      return jsonResponse(req, {
        error: "Account deletion pending",
        request_id: requestId,
      }, { status: 410 });
    }

    // ── GARDE 1 : LE CONTRAT ─────────────────────────────────────────────────
    let body: unknown = null;
    try {
      const raw = await req.text();
      body = raw.trim() ? JSON.parse(raw) : {};
    } catch {
      return jsonResponse(req, {
        error: "invalid_json",
        request_id: requestId,
      }, { status: 400 });
    }

    const parsed = parseInboundMessage({
      body,
      userId: user.id,
      nowIso: new Date().toISOString(),
    });
    if (!parsed.ok) {
      return jsonResponse(req, {
        error: parsed.reason,
        request_id: requestId,
      }, { status: parsed.status });
    }
    const message = parsed.message;

    // ── GARDE 2 : IDEMPOTENCE ────────────────────────────────────────────────
    const claim = await claimInbound(admin, { message, requestId });
    if (claim.status === "error") throw claim.error;
    if (claim.status === "duplicate") {
      // Edge case n°4 : un retry réseau du client ne rejoue PAS le moteur.
      // 200 et pas 409 : côté client, un rejeu réussi et un rejeu ignoré
      // doivent être indiscernables — sinon le client réessaie encore.
      return jsonResponse(req, {
        ok: true,
        duplicate: true,
        request_id: requestId,
      }, { status: 200 });
    }

    // ── GARDE 3 : LA QUESTION ARMÉE, AVANT LA JOURNALISATION ─────────────────
    // Résolue AVANT que le tour ne soit journalisé, exprès : le compteur de
    // tours armés lit `chat_messages`, et journaliser d'abord ferait compter le
    // tour en cours parmi ceux qui périment la question. La question mourrait
    // donc un tour trop tôt — le défaut exact que le plafond à 3 tours existait
    // pour éviter.
    let effectiveMessage = message;
    let armedResolution: string | null = null;
    if (message.kind === "text") {
      const armed = await resolveArmedQuestion(admin, {
        userId: user.id,
        nowIso: message.received_at,
        replyToMessageId: message.reply_to,
      });
      if (armed) {
        const classified = await classifyArmedQuestionReply({
          question: armed,
          inboundText: message.text,
          requestId,
          userId: user.id,
        });
        const matched = armed.buttons.find((b) => b.payload === classified.choice);
        if (matched) {
          // La réponse libre EST la réponse au bouton. On la fait suivre le
          // chemin déterministe, sans réécrire le texte de l'élève : c'est son
          // message qui reste dans la bulle, pas le libellé du bouton.
          effectiveMessage = {
            ...message,
            kind: "button",
            button_payload: matched.payload,
          };
          armedResolution = matched.payload;
        }
      }
    }

    // ── GARDE 4 : LE JOURNAL ET LA PRÉSENCE ──────────────────────────────────
    const inboundChatId = await logInboundMessage(admin, {
      message,
      requestId,
      scope: CHAT_SCOPE,
    });

    // L'ÉPISODE DE DÉCROCHAGE SE FERME ICI, ET NULLE PART AILLEURS.
    //
    // `closeKeelReengagementEpisodeOnInbound` existait, était testée, et
    // n'était appelée par PERSONNE (QA WEB L5: son seul référent hors
    // définition était son propre test, qui asserte sur du texte source).
    //
    // Ce que ça produisait, mesuré: la relance part, l'épisode s'ouvre,
    // l'élève répond — et l'épisode reste ouvert pour toujours. Or
    // `nudgedThisEpisode` vaut `Boolean(openEpisode)`: chaque élève passé une
    // fois par la boucle en sortait DÉFINITIVEMENT. Un verrou permanent, par
    // élève, en silence.
    //
    // Ici et pas dans le moteur de tour: c'est le SEUL point par lequel un
    // message d'élève entre, et un bouton compte autant qu'une phrase — un
    // élève qui répond « All good » au tap du soir a rompu son silence.
    //
    // Best-effort assumé: un échec de fermeture ne doit jamais faire échouer
    // la réception d'un message (la fonction avale déjà ses erreurs).
    const reengagementClose = await closeKeelReengagementEpisodeOnInbound(
      admin,
      { userId: user.id, atIso: message.received_at },
    );

    // ── PHASE B : ARMER LE CADRE DE REPRISE, ICI ET NULLE PART AILLEURS ─────
    //
    // `closed === true` signifie exactement une chose: ce message entrant est
    // une réponse à une relance KEEL. C'est le SEUL instant où le runtime le
    // sait — l'épisode vient d'être clos par la ligne au-dessus, et
    // `processMessage` (plus bas) ne pourra plus le lire.
    //
    // Scope `"app"`, comme tout le reste de ce fichier. Le winback armait sur
    // `"whatsapp"` et c'est précisément ce qui rendrait le flow invisible.
    //
    // `awaiting_first_reply: true` n'est pas décoratif: c'est lui que lit le
    // carve-out de fraîcheur d'`active_flow_state.ts`. Sans lui, l'état
    // expirerait à 4 h alors que l'élève répond des jours après.
    //
    // Best-effort assumé, comme la fermeture juste au-dessus: rater le cadre
    // dégrade le tour en réponse normale, ce qui est le comportement d'avant
    // ce chantier. Faire échouer la réception d'un message serait pire.
    if (reengagementClose.closed) {
      try {
        const nowIso = message.received_at;
        const { data: stateRow } = await admin
          .from(ACTIVE_FLOW_STATE_TABLE)
          .select("temp_memory")
          .eq("user_id", user.id)
          .eq("scope", CHAT_SCOPE)
          .maybeSingle();
        const tempMemory =
          (stateRow?.temp_memory ?? {}) as Record<string, unknown>;
        const { error: armError } = await admin
          .from(ACTIVE_FLOW_STATE_TABLE)
          .upsert({
            user_id: user.id,
            scope: CHAT_SCOPE,
            temp_memory: {
              ...tempMemory,
              __active_conversation_skill_v1: {
                version: 1,
                skill_id: "keel_reengagement_resume_v1",
                status: "active",
                turn_count: 0,
                started_at: nowIso,
                updated_at: nowIso,
                working_state: {
                  keel_reengagement_resume_local_state: {
                    version: 1,
                    stage: "welcome_back",
                    turns_in_flow: 0,
                    awaiting_first_reply: true,
                    episode_id: reengagementClose.episodeId,
                    days_inactive_at_open: reengagementClose.daysInactiveAtOpen,
                    armed_at: nowIso,
                  },
                },
              },
            },
          }, { onConflict: "user_id,scope" });
        // LIRE `error`, PAS SEULEMENT ATTRAPER. Le client PostgREST ne throw
        // PAS sur une écriture refusée: il rend `{ error }`. Ce bloc a donc
        // journalisé `keel_reengagement_resume_armed` à chaque réponse alors
        // qu'il écrivait dans une table INEXISTANTE (`user_states`), et le
        // `catch` ci-dessous n'a jamais rien vu. Le seul symptôme observable
        // était l'absence du cadre — c'est-à-dire rien.
        console.log(JSON.stringify({
          tag: armError
            ? "keel_reengagement_resume_arm_failed"
            : "keel_reengagement_resume_armed",
          request_id: requestId,
          user_id: user.id,
          episode_id: reengagementClose.episodeId,
          error: armError ? String(armError.message ?? armError) : undefined,
        }));
      } catch (error) {
        console.warn("[keel/reengagement] resume arming failed", error);
      }
    }

    // ── GARDE 5 : LES BOUTONS DÉTERMINISTES, AVANT LE DISPATCHER ─────────────
    // Un `button_payload` est une valeur que NOUS avons émise et qui n'a qu'un
    // sens possible. La faire interpréter par un LLM, c'est payer un appel pour
    // risquer une erreur sur une donnée exacte.
    const deterministic = await handleDeterministicButton(admin, {
      message: effectiveMessage,
      requestId,
    });
    if (deterministic.handled) {
      await markInboundProcessed(admin, {
        dedupId: claim.dedupId,
        chatMessageId: inboundChatId,
      });
      return jsonResponse(req, {
        ok: true,
        handled_by: deterministic.reason,
        armed_resolution: armedResolution,
        request_id: requestId,
      }, { status: 200 });
    }

    // ── GARDE 6 : LE MOTEUR DE TOUR ──────────────────────────────────────────
    // Inchangé. Safety, dispatcher global, flows locaux, mémoire, doctrine :
    // tout est derrière cet appel, et ce chantier n'y touche pas.
    const response = await withTimeout(
      processMessage(
        admin,
        user.id,
        message.text,
        [],
        {
          requestId,
          channel: "web",
          scope: CHAT_SCOPE,
          forceBrainTrace: false,
          clientNowIso: message.received_at,
        },
        {
          // Le tour entrant est DÉJÀ journalisé (garde 3) : laisser le moteur
          // le réécrire produirait deux lignes pour un message, et la bulle
          // afficherait le doublon.
          logMessages: false,
          messageMetadata: {
            channel: "in_app",
            client_message_id: message.client_message_id,
            request_id: requestId,
          },
          disableDebounce: true,
        },
      ),
      envInt("CHAT_INBOUND_BRAIN_TIMEOUT_MS", 120_000),
      "chat_inbound_brain",
    );

    // ── GARDE 7 : LA LIVRAISON ───────────────────────────────────────────────
    // `isReply: true` : c'est l'autre moitié d'un échange, pas une
    // notification. Elle ne traverse aucun plafond et n'en consomme aucun.
    const visible = extractHiddenFilRougeNote(String(response?.content ?? ""));
    const delivered = await deliverChatMessage(admin, {
      userId: user.id,
      content: String(visible.visibleText ?? "").trim(),
      isReply: true,
      requestId,
      metadata: {
        in_reply_to_client_message_id: message.client_message_id,
        agent_mode: (response as { mode?: string } | null)?.mode ?? null,
      },
    });

    await markInboundProcessed(admin, {
      dedupId: claim.dedupId,
      chatMessageId: inboundChatId,
    });

    return jsonResponse(req, {
      ok: true,
      delivered: delivered.delivered,
      delivery_reason: delivered.reason,
      chat_message_id: delivered.chatMessageId,
      request_id: requestId,
    }, { status: 200 });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    await logEdgeFunctionError({
      functionName: FN_NAME,
      requestId,
      userId: userIdForLog,
      error,
    }).catch(() => {});
    return jsonResponse(req, {
      error: messageText,
      request_id: requestId,
    }, { status: 500 });
  }
});
