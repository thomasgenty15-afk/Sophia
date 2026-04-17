import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { generateWithGemini } from "../../_shared/gemini.ts";
import {
  executeDefenseCardAction,
  type DefenseCardActionResult,
} from "../../update-defense-card-v3/index.ts";
import type { DefenseCardContent, DominantImpulse } from "../../_shared/v2-types.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DefenseCardReviewMeta = {
  requestId?: string;
  forceRealAi?: boolean;
  model?: string;
};

export type DefenseCardReviewResult = {
  text: string;
  executed_tools: string[];
  tool_execution: "none" | "success" | "error";
  wins_logged: number;
};

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const DEFENSE_CARD_TOOLS = [
  {
    name: "log_defense_win",
    description:
      "Logge une victoire quand l'utilisateur raconte avoir résisté à une pulsion. Utilise cet outil UNIQUEMENT quand l'utilisateur décrit explicitement avoir résisté à une tentation/pulsion.",
    parameters: {
      type: "object",
      properties: {
        impulse_id: {
          type: "string",
          description: "ID de la pulsion concernée",
        },
        trigger_id: {
          type: "string",
          description: "ID du trigger spécifique (null si situation non listée)",
        },
      },
      required: ["impulse_id"],
    },
  },
  {
    name: "add_trigger_to_card",
    description:
      "Ajoute un nouveau trigger/situation à la carte de défense UNIQUEMENT si l'utilisateur demande explicitement de mettre à jour sa carte ou confirme clairement une proposition d'ajout.",
    parameters: {
      type: "object",
      properties: {
        impulse_id: {
          type: "string",
          description: "ID de la pulsion concernée",
        },
        situation: {
          type: "string",
          description: "Le TERRAIN: contexte externe (quand, où, avec qui). Ex: 'Pause déjeuner seul au bureau'",
        },
        signal: {
          type: "string",
          description: "Le DÉCLENCHEUR INTERNE observable: pensée automatique, sensation physique ou micro-comportement juste avant la bascule. PAS une émotion vague. Ex: 'je regarde le distributeur machinalement'",
        },
        defense_response: {
          type: "string",
          description: "Réponse défensive concrète faisable en < 30 secondes",
        },
      },
      required: ["impulse_id", "situation", "signal", "defense_response"],
    },
  },
];

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

function buildDefenseCardReviewPrompt(card: DefenseCardContent): string {
  const cardBlock = card.impulses
    .map((imp) => {
      const triggers = imp.triggers
        .map((t) => `  - [${t.trigger_id}] ${t.situation} → signal: ${t.signal} → défense: ${t.defense_response}`)
        .join("\n");
      return `Pulsion "${imp.label}" (${imp.impulse_id}):\n${triggers}\n  Plan B: ${imp.generic_defense}`;
    })
    .join("\n\n");

  return `Tu es Sophia. L'utilisateur a une carte de défense contre ses pulsions. Tu dois détecter quand il mentionne:
1. Avoir RÉSISTÉ à une pulsion → logge une victoire avec log_defense_win
2. Une NOUVELLE situation à risque non cartographiée ET demande explicitement de mettre à jour sa carte → utilise add_trigger_to_card

## Carte de défense actuelle
${cardBlock}

## Rappel: distinction Situation vs Signal
- Situation (Stratège) = le TERRAIN externe: quand, où, avec qui, dans quel contexte
- Signal (Surveillant) = le DÉCLENCHEUR INTERNE observable: pensée automatique, sensation physique, micro-comportement juste AVANT la bascule
  ✅ "je soupire et regarde le placard" / "mâchoire serrée" / "je me dis 'juste un petit'"
  ❌ "je suis stressé" (trop vague) / "je suis fatigué" (c'est une situation, pas un signal)

## Règles
- N'utilise log_defense_win que si l'utilisateur dit EXPLICITEMENT avoir résisté ou surmonté une tentation
- Confirme brièvement la victoire: "Bien joué ! Je note cette victoire dans ta carte."
- N'utilise add_trigger_to_card que si l'utilisateur demande EXPLICITEMENT d'ajouter / noter / mettre sur sa carte cette nouvelle situation, ou s'il confirme clairement une proposition juste avant dans l'historique récent
- Quand tu ajoutes un trigger, veille à bien séparer la situation (terrain) du signal (déclencheur interne observable)
- Reste naturelle, concise, empathique
- Si le message ne concerne pas les pulsions ou la carte, réponds normalement sans utiliser d'outil`;
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = "gemini-2.5-flash-preview-05-20";

function hasExplicitCardUpdateConsent(
  message: string,
  history: any[],
): boolean {
  const current = String(message ?? "").toLowerCase();
  const currentHasConsent = [
    /\bajoute\b/,
    /\brajoute\b/,
    /\bnote\b/,
    /\binscris\b/,
    /\bmet(?:s)?\b.*\bcarte\b/,
    /\bajoute\b.*\bcarte\b/,
    /\boui\b.*\bajoute\b/,
    /\boui\b.*\bcarte\b/,
  ].some((pattern) => pattern.test(current));
  if (currentHasConsent) return true;

  const recentAssistant = history
    .slice(-4)
    .reverse()
    .find((entry: any) => entry?.role === "assistant");
  const assistantText = String(recentAssistant?.content ?? "").toLowerCase();
  const userConfirmed = /\b(oui|ok|vas[- ]?y|fais[- ]?le|go)\b/.test(current);
  const assistantAskedToAdd = /\b(ajouter|note[rz]?|mettre).*\bcarte\b/.test(
    assistantText,
  );

  return userConfirmed && assistantAskedToAdd;
}

async function loadDefenseCard(
  supabase: SupabaseClient,
  userId: string,
  transformationId: string,
): Promise<{ cardId: string; content: DefenseCardContent } | null> {
  const { data, error } = await supabase
    .from("user_defense_cards")
    .select("id, content")
    .eq("user_id", userId)
    .eq("transformation_id", transformationId)
    .maybeSingle();

  if (error || !data) return null;
  return { cardId: data.id, content: data.content as DefenseCardContent };
}

/**
 * Scans a conversation message for defense-card-related signals (victories, new triggers).
 * Called by the companion agent when a defense card exists for the active transformation.
 */
export async function checkDefenseCardSignals(
  supabase: SupabaseClient,
  userId: string,
  transformationId: string,
  message: string,
  history: any[],
  meta?: DefenseCardReviewMeta,
): Promise<DefenseCardReviewResult> {
  const cardData = await loadDefenseCard(supabase, userId, transformationId);
  if (!cardData) {
    return { text: "", executed_tools: [], tool_execution: "none", wins_logged: 0 };
  }

  const systemPrompt = buildDefenseCardReviewPrompt(cardData.content);
  const recentHistory = history
    .slice(-4)
    .map((h: any) => {
      const role = h?.role === "assistant" ? "Sophia" : "Utilisateur";
      const content = typeof h?.content === "string" ? h.content.trim() : "";
      return content ? `${role}: ${content}` : null;
    })
    .filter((line): line is string => Boolean(line))
    .join("\n");

  const userPrompt = [
    recentHistory ? `Historique récent:\n${recentHistory}` : null,
    `Message utilisateur:\n${message}`,
  ].filter((block): block is string => Boolean(block)).join("\n\n");

  const model = meta?.model ?? DEFAULT_MODEL;
  const response = await generateWithGemini(
    systemPrompt,
    userPrompt,
    0.3,
    false,
    DEFENSE_CARD_TOOLS,
    "auto",
    {
      requestId: meta?.requestId,
      model,
      source: "sophia-brain:defense_card_review",
      forceRealAi: meta?.forceRealAi,
    },
  );

  if (typeof response === "string") {
    return { text: response.trim(), executed_tools: [], tool_execution: "none", wins_logged: 0 };
  }

  if (response && typeof response === "object") {
    const toolName = (response as any)?.tool ?? (response as any)?.name ?? null;
    const toolArgs = (response as any)?.args ?? (response as any)?.arguments ?? {};

    if (toolName === "log_defense_win") {
      try {
        const { error } = await supabase.from("user_defense_wins").insert({
          defense_card_id: cardData.cardId,
          impulse_id: String(toolArgs.impulse_id ?? ""),
          trigger_id: toolArgs.trigger_id ? String(toolArgs.trigger_id) : null,
          source: "conversation",
          logged_at: new Date().toISOString(),
        });
        if (error) throw error;

        const followUp = await generateWithGemini(
          systemPrompt,
          `${userPrompt}\n\n[VICTOIRE LOGGUÉE pour ${toolArgs.impulse_id}. Confirme brièvement.]`,
          0.3,
          false,
          [],
          "auto",
          {
            requestId: meta?.requestId ? `${meta.requestId}:followup` : undefined,
            model,
            source: "sophia-brain:defense_card_review:followup",
            forceRealAi: meta?.forceRealAi,
          },
        );

        const text = typeof followUp === "string"
          ? followUp.replace(/\*\*/g, "").trim()
          : "Bien joué ! Je note cette victoire dans ta carte. 💪";

        return { text, executed_tools: ["log_defense_win"], tool_execution: "success", wins_logged: 1 };
      } catch (err) {
        console.error("[defense_card_reviewer] log win failed:", err);
        return {
          text: "J'ai voulu noter ta victoire mais j'ai eu un souci technique. On en reparle !",
          executed_tools: ["log_defense_win"],
          tool_execution: "error",
          wins_logged: 0,
        };
      }
    }

    if (toolName === "add_trigger_to_card") {
      if (!hasExplicitCardUpdateConsent(message, history)) {
        return { text: "", executed_tools: [], tool_execution: "none", wins_logged: 0 };
      }

      try {
        await executeDefenseCardAction(supabase, userId, {
          action: "add_trigger",
          defense_card_id: cardData.cardId,
          impulse_id: String(toolArgs.impulse_id ?? ""),
          situation: String(toolArgs.situation ?? ""),
          signal: String(toolArgs.signal ?? ""),
          defense_response: String(toolArgs.defense_response ?? ""),
        });

        const followUp = await generateWithGemini(
          systemPrompt,
          `${userPrompt}\n\n[TRIGGER AJOUTÉ: "${toolArgs.situation}" sur ${toolArgs.impulse_id}. Confirme.]`,
          0.3,
          false,
          [],
          "auto",
          {
            requestId: meta?.requestId ? `${meta.requestId}:followup` : undefined,
            model,
            source: "sophia-brain:defense_card_review:followup",
            forceRealAi: meta?.forceRealAi,
          },
        );

        const text = typeof followUp === "string"
          ? followUp.replace(/\*\*/g, "").trim()
          : "C'est noté, j'ai ajouté cette situation à ta carte de défense.";

        return { text, executed_tools: ["add_trigger_to_card"], tool_execution: "success", wins_logged: 0 };
      } catch (err) {
        console.error("[defense_card_reviewer] add trigger failed:", err);
        return {
          text: "J'ai voulu mettre à jour ta carte mais j'ai eu un souci technique.",
          executed_tools: ["add_trigger_to_card"],
          tool_execution: "error",
          wins_logged: 0,
        };
      }
    }
  }

  return { text: "", executed_tools: [], tool_execution: "none", wins_logged: 0 };
}
