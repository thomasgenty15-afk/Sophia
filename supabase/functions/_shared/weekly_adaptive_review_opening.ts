import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";
import {
  applyScheduledCheckinGreetingPolicy,
  generateDynamicWhatsAppCheckinMessage,
} from "./scheduled_checkins.ts";
import {
  buildWeeklyProgressReviewGrounding,
  WEEKLY_PROGRESS_REVIEW_EVENT_CONTEXT,
} from "./weekly_progress_review.ts";
import {
  buildWeeklyAdaptiveReviewGrounding,
  buildWeeklyAdaptiveReviewInstruction,
} from "./weekly_adaptive_review.ts";
import type { MomentumSnapshotV2 } from "./momentum_v2.ts";

async function fetchWhatsappTempMemory(
  supabaseAdmin: SupabaseClient,
  userId: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabaseAdmin
    .from("user_chat_states")
    .select("temp_memory")
    .eq("user_id", userId)
    .eq("scope", "whatsapp")
    .maybeSingle();
  if (error) throw error;
  const tempMemory = (data as any)?.temp_memory;
  return tempMemory && typeof tempMemory === "object"
    ? tempMemory as Record<string, unknown>
    : {};
}

export function weeklyAdaptiveReviewOpeningLooksValid(message: string): boolean {
  const text = String(message ?? "").trim();
  if (!text) return false;
  const questionCount = (text.match(/\?/g) ?? []).length;
  if (questionCount > 1) return false;
  const normalized = text.normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  if (
    /\bbridge\b|bridge_week|semaine pont|carry_over|mode advance|repeat_week|level_review|not_relevant|item_decision|plan_patch|\boperation\b|brouillon|dominant_blocker|habit_verdict/
      .test(normalized)
  ) return false;
  if (
    /%|\b\d+\s*\/\s*\d+\b|\badherence\b|\bratio\b|\bpourcentage\b/.test(
      normalized,
    )
  ) {
    return false;
  }
  if (/ce qui ressort surtout\s*:\s*le contexte/.test(normalized)) {
    return false;
  }
  return /bilan.{0,40}semaine|point de fin de semaine|faire le point.{0,80}semaine|point.{0,80}semaine/
    .test(normalized);
}

export async function generateWeeklyAdaptiveReviewOpening(params: {
  supabaseAdmin: SupabaseClient;
  userId: string;
  scheduledFor: string;
  requestId: string;
  review: unknown;
  adaptiveReview: unknown;
  momentumSnapshot?: MomentumSnapshotV2 | null;
  allowGreeting: boolean;
}): Promise<string> {
  const tempMemory = await fetchWhatsappTempMemory(
    params.supabaseAdmin,
    params.userId,
  ).catch(() => ({}));
  const previousWeeklySummary =
    (tempMemory as any)?.__last_weekly_adaptive_review_summary ?? null;
  const eventGrounding = [
    buildWeeklyProgressReviewGrounding(params.review as any),
    `weekly_adaptive_review=${
      buildWeeklyAdaptiveReviewGrounding(params.adaptiveReview as any)
    }`,
    params.momentumSnapshot
      ? `momentum_snapshot_v2=${JSON.stringify(params.momentumSnapshot)}`
      : "",
    previousWeeklySummary
      ? `previous_weekly_summary=${JSON.stringify(previousWeeklySummary)}`
      : "",
  ].filter(Boolean).join("\n\n");
  const baseInstruction = [
    buildWeeklyAdaptiveReviewInstruction(params.adaptiveReview as any),
    "",
    "Generation du message d'ouverture weekly:",
    "- Tu dois ecrire le premier message envoye par Sophia, pas une reponse au user.",
    "- Objectif: transformer le JSON weekly_progress_review + weekly_adaptive_review en message humain, fluide et court. Ne recopie jamais des labels internes.",
    "- Le message final doit etre une reformulation IA naturelle des faits; les donnees structurees servent seulement de brief.",
    "- Message court WhatsApp, naturel, 4 a 7 lignes maximum.",
    params.allowGreeting
      ? "- La derniere interaction est assez ancienne: commence par une salutation courte et naturelle, comme le daily."
      : "- La conversation est recente: ne commence pas par une salutation.",
    "- Dis toujours clairement que c'est le moment du bilan de la semaine ou du point de fin de semaine.",
    "- Parle a un humain: pas de ratio, pas de pourcentage, pas de '5/6', pas de '83%'.",
    "- Si tu dois resumer les actions, cite 1 ou 2 actions maximum seulement si cela rend le bilan plus concret.",
    "- Ne fais pas de recap jour par jour et ne repete pas les actions non faites une par une.",
    "- Si le signal est faible, dis qu'il faut en discuter avant de decider la suite. Ne dis pas 'recuperer la data' ou 'pas de signal'.",
    "- Si une categorie est vague comme 'context', traduis-la en langage concret seulement si les donnees le justifient, par exemple 'semaine chargee'. Sinon, ignore-la.",
    "- Evite les formules rigides du type 'Ce qui ressort surtout: ...' quand elles produisent une etiquette abstraite.",
    "- Structure: annonce du bilan de la semaine, micro-synthese humaine, direction probable pour la semaine prochaine si elle est utile, puis une seule question large.",
    previousWeeklySummary
      ? "- Si previous_weekly_summary existe et contient suggested_opening_question, tu peux utiliser cette question comme question unique d'ouverture si elle est plus pertinente que 'comment tu as vecu la semaine ?'. Ne recite pas la synthese interne."
      : "",
    "- La question unique doit inviter le user a raconter la semaine dans l'ensemble; elle ne doit pas separer progression ressentie et etat/energie en deux questions.",
    "- Ne conclus pas encore que la validation est disponible: elle ne se debloque qu'apres la discussion weekly terminee.",
  ].join("\n");

  const attempts: string[] = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const body = await generateDynamicWhatsAppCheckinMessage({
      admin: params.supabaseAdmin,
      userId: params.userId,
      eventContext: WEEKLY_PROGRESS_REVIEW_EVENT_CONTEXT,
      scheduledFor: params.scheduledFor,
      instruction: attempt === 0 ? baseInstruction : [
        baseInstruction,
        "",
        "Correction obligatoire: le message precedent ne respectait pas les regles weekly.",
        "Regenere avec une seule question maximum, aucun vocabulaire interne, aucun ratio/pourcentage, une mention claire du bilan de la semaine, et sans dire que la validation est deja disponible.",
        "Le rendu doit sonner comme un coach WhatsApp, pas comme un rapport technique.",
        `Tentatives precedentes: ${JSON.stringify(attempts)}`,
      ].join("\n"),
      eventGrounding,
      source: attempt === 0
        ? "process-checkins:weekly_adaptive_review_opening"
        : "process-checkins:weekly_adaptive_review_opening_repair",
      requestId: params.requestId,
      fallbackMessage: null,
    });
    const normalizedBody = applyScheduledCheckinGreetingPolicy({
      text: body,
      allowRelaunchGreeting: params.allowGreeting,
    });
    attempts.push(normalizedBody);
    if (weeklyAdaptiveReviewOpeningLooksValid(normalizedBody)) {
      return normalizedBody;
    }
    if ((Deno.env.get("WEEKLY_OPENING_DEBUG") ?? "").trim() === "1") {
      console.warn(JSON.stringify({
        tag: "weekly_adaptive_review_opening_rejected",
        request_id: params.requestId,
        attempt: attempt + 1,
        text: normalizedBody,
      }));
    }
  }
  throw new Error("weekly_adaptive_review_opening_invalid");
}
