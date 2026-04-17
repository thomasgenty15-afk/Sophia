import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../_shared/gemini.ts";
import type {
  DefenseCardContent,
  DominantImpulse,
} from "../../_shared/v2-types.ts";
import {
  type ActiveTransformationRuntime,
  getActiveTransformationRuntime,
} from "../../_shared/v2-runtime.ts";

type DetectedTrigger = {
  impulse_id: string;
  situation: string;
  signal: string;
  defense_response: string;
  source_excerpt: string;
};

export type DefenseCardWatcherResult = {
  triggers_found: number;
  stored: boolean;
};

function buildTriggerDetectionPrompt(card: DefenseCardContent): string {
  const cardBlock = card.impulses
    .map((imp: DominantImpulse) => {
      const triggers = imp.triggers
        .map(
          (t) =>
            `  - [${t.trigger_id}] Situation: "${t.situation}" | Signal: "${t.signal}"`,
        )
        .join("\n");
      return `Pulsion "${imp.label}" (${imp.impulse_id}):\n${triggers}`;
    })
    .join("\n\n");

  return `Tu analyses un historique de conversation pour identifier des NOUVELLES situations à risque liées aux pulsions de l'utilisateur.

## Carte de défense actuelle
${cardBlock}

## Ta mission
Identifie dans la conversation si l'utilisateur mentionne une situation/contexte où il a été confronté à une pulsion qui N'EST PAS déjà cartographiée dans la carte ci-dessus.

## Distinction Situation vs Signal
- Situation (Stratège) = TERRAIN externe: quand, où, avec qui, dans quel contexte
- Signal (Surveillant) = DÉCLENCHEUR INTERNE observable: pensée automatique, sensation physique, micro-comportement AVANT la bascule
  Bon: "je soupire et regarde le placard" / "mâchoire serrée"
  Mauvais: "je suis stressé" (trop vague)

## Règles
- Ne retourne QUE les triggers NOUVEAUX (pas ceux déjà dans la carte)
- La situation mentionnée doit être claire et spécifique
- Déduis le signal et la réponse défensive si possible
- Retourne un tableau JSON vide [] si rien de nouveau
- Maximum 3 triggers par analyse

## Format de sortie JSON strict
[
  {
    "impulse_id": "id de la pulsion concernée (existante dans la carte)",
    "situation": "TERRAIN externe précis",
    "signal": "DÉCLENCHEUR INTERNE observable déduit",
    "defense_response": "Réponse défensive concrète < 30s suggérée",
    "source_excerpt": "Extrait court du message source (max 100 chars)"
  }
]`;
}

export async function detectDefenseCardNewTriggers(args: {
  supabase: SupabaseClient;
  userId: string;
  transcript: string;
  meta?: { requestId?: string };
}): Promise<DefenseCardWatcherResult> {
  const { supabase, userId, transcript, meta } = args;

  if (!transcript.trim()) {
    return { triggers_found: 0, stored: false };
  }

  let runtime: ActiveTransformationRuntime;
  try {
    runtime = await getActiveTransformationRuntime(supabase, userId);
  } catch {
    return { triggers_found: 0, stored: false };
  }

  const transformationId = runtime.transformation?.id ?? null;
  if (!transformationId) {
    return { triggers_found: 0, stored: false };
  }

  const { data: card } = await supabase
    .from("user_defense_cards")
    .select("id, content")
    .eq("user_id", userId)
    .eq("transformation_id", transformationId)
    .maybeSingle();

  if (!card) {
    return { triggers_found: 0, stored: false };
  }

  const content = card.content as DefenseCardContent;
  if (!content.impulses?.length) {
    return { triggers_found: 0, stored: false };
  }

  const systemPrompt = buildTriggerDetectionPrompt(content);

  try {
    const raw = await generateWithGemini(
      systemPrompt,
      `Historique de conversation récent:\n\n${transcript.slice(0, 4000)}`,
      0.2,
      true,
      [],
      "auto",
      {
        requestId: meta?.requestId,
        model: getGlobalAiModel("gemini-2.5-flash"),
        source: "watcher:defense_card_trigger_detection",
      },
    );

    const cleaned = String(raw ?? "")
      .replace(/```json?\s*/gi, "")
      .replace(/```/g, "")
      .trim();

    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return { triggers_found: 0, stored: false };
    }

    const validTriggers: DetectedTrigger[] = parsed
      .filter(
        (t: any) =>
          t &&
          typeof t.impulse_id === "string" &&
          typeof t.situation === "string" &&
          t.situation.trim().length > 5,
      )
      .slice(0, 3)
      .map((t: any) => ({
        impulse_id: String(t.impulse_id).trim(),
        situation: String(t.situation).trim().slice(0, 200),
        signal: String(t.signal ?? "").trim().slice(0, 200),
        defense_response: String(t.defense_response ?? "").trim().slice(0, 200),
        source_excerpt: String(t.source_excerpt ?? "").trim().slice(0, 100),
      }));

    if (validTriggers.length === 0) {
      return { triggers_found: 0, stored: false };
    }

    const knownImpulseIds = new Set(
      content.impulses.map((imp) => imp.impulse_id),
    );
    const filteredTriggers = validTriggers.filter((t) =>
      knownImpulseIds.has(t.impulse_id)
    );

    if (filteredTriggers.length === 0) {
      return { triggers_found: 0, stored: false };
    }

    const { data: stateRow } = await supabase
      .from("user_chat_states")
      .select("temp_memory")
      .eq("user_id", userId)
      .eq("scope", "whatsapp")
      .maybeSingle();

    const tempMemory =
      (stateRow?.temp_memory &&
          typeof stateRow.temp_memory === "object"
        ? { ...(stateRow.temp_memory as Record<string, unknown>) }
        : {}) as Record<string, unknown>;

    tempMemory.__defense_card_pending_triggers = {
      detected_at: new Date().toISOString(),
      triggers: filteredTriggers,
      card_id: card.id,
    };

    await supabase
      .from("user_chat_states")
      .update({ temp_memory: tempMemory })
      .eq("user_id", userId)
      .eq("scope", "whatsapp");

    console.log(
      `[Watcher:DefenseCard] ${filteredTriggers.length} new triggers detected for user=${userId}`,
    );

    return { triggers_found: filteredTriggers.length, stored: true };
  } catch (e) {
    console.warn(
      "[Watcher:DefenseCard] trigger detection failed (non-blocking):",
      e,
    );
    return { triggers_found: 0, stored: false };
  }
}
