/**
 * Fil de la discussion « Présence ».
 *
 * Politique: VERBATIM d'abord, compression seulement en soupape.
 * - Tant que la discussion tient dans le budget, tout le fil depuis l'entrée
 *   est injecté mot pour mot (les mots exacts du user sont la matière première
 *   d'une conversation émotionnelle).
 * - En cas de débordement, la partie la plus ANCIENNE est pliée dans un résumé
 *   riche (« fil de discussion ») porté par l'état du flow, mis à jour
 *   incrémentalement (jamais de re-résumé complet). La queue récente reste
 *   toujours verbatim.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { generateWithGemini } from "../../../_shared/gemini.ts";
import type { PresenceFlowState } from "./state.ts";
import { withThreadSummary } from "./state.ts";

// Budget verbatim: au-delà, on plie l'excédent le plus ancien dans le résumé.
export const PRESENCE_THREAD_MAX_MESSAGES = 60;
export const PRESENCE_THREAD_MAX_CHARS = 40_000;
// Taille du bloc plié par incrément (évite de replier message par message).
const FOLD_CHUNK_MESSAGES = 20;

export type PresenceThreadMessage = {
  role: string;
  content: string;
  created_at?: string;
};

export function formatPresenceThreadBlock(input: {
  summary: string | null;
  verbatim: PresenceThreadMessage[];
}): string {
  const parts: string[] = [];
  if (input.summary && input.summary.trim()) {
    parts.push(
      "=== FIL DE LA DISCUSSION (début, résumé fidèle) ===\n" +
        input.summary.trim(),
    );
  }
  if (input.verbatim.length > 0) {
    const lines = input.verbatim.map((m) =>
      `${m.role === "assistant" ? "sophia" : "user"}: ${m.content}`
    );
    parts.push(
      "=== FIL DE LA DISCUSSION (verbatim) ===\n" + lines.join("\n\n"),
    );
  }
  return parts.join("\n\n");
}

const FOLD_SYSTEM_PROMPT = [
  "Tu résumes le DÉBUT d'une conversation intime entre un utilisateur et Sophia (coach/amie), pour que la suite de la conversation garde toute sa mémoire.",
  "Produis un résumé FIDÈLE et DENSE en français, à la 3e personne, qui capture:",
  "- les FAITS livrés par l'utilisateur (son histoire, ses exemples, ses chiffres, ses expériences passées) — avec ses mots quand ils comptent;",
  "- les prises de conscience et déclarations importantes de l'utilisateur;",
  "- les positions, nuances et conseils DÉJÀ donnés par Sophia (pour ne pas se répéter ni se contredire);",
  "- l'ARC de la conversation: d'où elle est partie, où elle en est (« il est passé de X à Y »).",
  "Pas de commentaire meta, pas de conclusion, pas de conseil nouveau. Uniquement le résumé.",
  "Si un RÉSUMÉ EXISTANT est fourni, intègre-le: le résultat doit couvrir résumé existant + nouveaux messages, sans perdre d'information importante.",
].join("\n");

/**
 * Construit le bloc de fil pour le prompt et, si le budget déborde, replie
 * l'excédent ancien dans le résumé (1 appel LLM léger, seulement en cas de
 * débordement). Fail-open: si le repli échoue, on tronque le verbatim au
 * budget sans perdre le tour courant, et on garde l'ancien résumé.
 */
export async function buildPresenceThreadContext(input: {
  supabase: SupabaseClient;
  userId: string;
  scope: string;
  flowState: PresenceFlowState;
  requestId?: string;
}): Promise<{ block: string; flowState: PresenceFlowState }> {
  const { data, error } = await input.supabase
    .from("chat_messages")
    .select("role,content,created_at")
    .eq("user_id", input.userId)
    .eq("scope", input.scope)
    .gte("created_at", input.flowState.entered_at)
    .order("created_at", { ascending: true })
    .limit(400);
  if (error) {
    console.warn("[presence] thread load failed (fail-open, no thread)", {
      error: error.message,
    });
    return {
      block: formatPresenceThreadBlock({
        summary: input.flowState.thread_summary,
        verbatim: [],
      }),
      flowState: input.flowState,
    };
  }
  const all = (Array.isArray(data) ? data : []).filter((m: any) =>
    (m?.role === "user" || m?.role === "assistant") &&
    String(m?.content ?? "").trim()
  ) as PresenceThreadMessage[];

  // Messages pas encore pliés dans le résumé.
  const unfolded = all.slice(input.flowState.thread_summary_folded_count);
  const totalChars = unfolded.reduce((sum, m) => sum + m.content.length, 0);
  const overBudget = unfolded.length > PRESENCE_THREAD_MAX_MESSAGES ||
    totalChars > PRESENCE_THREAD_MAX_CHARS;

  if (!overBudget) {
    return {
      block: formatPresenceThreadBlock({
        summary: input.flowState.thread_summary,
        verbatim: unfolded,
      }),
      flowState: input.flowState,
    };
  }

  // Soupape: plie le bloc le plus ancien dans le résumé.
  const foldCount = Math.min(
    FOLD_CHUNK_MESSAGES,
    Math.max(1, unfolded.length - Math.floor(PRESENCE_THREAD_MAX_MESSAGES / 2)),
  );
  const toFold = unfolded.slice(0, foldCount);
  const tail = unfolded.slice(foldCount);
  try {
    const foldInput = [
      input.flowState.thread_summary
        ? `RÉSUMÉ EXISTANT:\n${input.flowState.thread_summary}`
        : "",
      "NOUVEAUX MESSAGES À INTÉGRER:",
      ...toFold.map((m) =>
        `${m.role === "assistant" ? "sophia" : "user"}: ${m.content}`
      ),
    ].filter(Boolean).join("\n\n");
    const result = await generateWithGemini(
      FOLD_SYSTEM_PROMPT,
      foldInput,
      0.3,
      false,
      [],
      "auto",
      {
        requestId: input.requestId,
        userId: input.userId,
        source: "presence.thread_fold",
      },
    );
    const summary = (typeof result === "string" ? result : "").trim();
    if (!summary) throw new Error("empty_fold_summary");
    const nextFlowState = withThreadSummary(
      input.flowState,
      summary,
      input.flowState.thread_summary_folded_count + foldCount,
    );
    return {
      block: formatPresenceThreadBlock({
        summary,
        verbatim: tail,
      }),
      flowState: nextFlowState,
    };
  } catch (error) {
    console.warn("[presence] thread fold failed (fail-open, verbatim trim)", {
      error: error instanceof Error ? error.message : String(error),
    });
    // Fail-open: garde l'ancien résumé + la queue verbatim au budget.
    return {
      block: formatPresenceThreadBlock({
        summary: input.flowState.thread_summary,
        verbatim: tail,
      }),
      flowState: input.flowState,
    };
  }
}
