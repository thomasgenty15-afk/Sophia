import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { enforceCors, getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";
import { generateWithGemini } from "../_shared/gemini.ts";

type PersonalizationLevel = 1 | 2 | 3;

function str(v: unknown): string {
  return String(v ?? "").trim();
}

function buildContextPolicy(level: PersonalizationLevel): Record<string, unknown> {
  if (level === 1) {
    return {
      include_creation_instruction: true,
      include_creation_rationale: true,
      include_plan_why: false,
      include_plan_blockers: false,
      include_north_star: false,
      include_topic_memories_last_week: false,
      include_topic_metadata: false,
    };
  }
  if (level === 2) {
    return {
      include_creation_instruction: true,
      include_creation_rationale: true,
      include_plan_why: true,
      include_plan_blockers: true,
      include_north_star: true,
      include_topic_memories_last_week: false,
      include_topic_metadata: false,
    };
  }
  return {
    include_creation_instruction: true,
    include_creation_rationale: true,
    include_plan_why: true,
    include_plan_blockers: true,
    include_north_star: true,
    include_topic_memories_last_week: true,
    include_topic_metadata: true,
  };
}

function heuristicLevel(instruction: string, rationale: string): PersonalizationLevel {
  const text = `${instruction}\n${rationale}`.toLowerCase();
  const needsTopicMemory =
    /ce qu'?on s'?est dit|nos discussions|mes conversations|topic|mémoire|memory|semaine derni[èe]re|historique/.test(text);
  if (needsTopicMemory) return 3;

  const needsPlanContext =
    /pourquoi|je continue|blocage|objectif|cap|progression|progr[eè]s|doute|rechute|north star|[ée]toile polaire/.test(text);
  if (needsPlanContext) return 2;

  return 1;
}

async function classifyWithAI(params: {
  instruction: string;
  rationale: string;
  requestId: string;
}): Promise<{ level: PersonalizationLevel; reason: string }> {
  const { instruction, rationale, requestId } = params;
  const systemPrompt = `
Tu classes une initiative WhatsApp de Sophia en niveau de personnalisation.

Règles strictes:
- Retourne uniquement un JSON valide.
- Schéma:
{
  "level": 1 | 2 | 3,
  "reason": "string courte (<= 180 chars)"
}

Définition des niveaux:
- Niveau 1: aucun contexte personnel externe requis. Message générique possible.
- Niveau 2: nécessite le contexte plan (pourquoi profond, blocages, north star).
- Niveau 3: niveau 2 + nécessite aussi des topic memories récentes et leur metadata.

Choisis le niveau minimum nécessaire pour produire un message fidèle à l'intention.
`;

  const userPrompt = `
Initiative:
- Instruction: ${instruction || "n/a"}
- Rationale: ${rationale || "n/a"}
`;

  const raw = await generateWithGemini(
    systemPrompt.trim(),
    userPrompt.trim(),
    0.1,
    true,
    [],
    "auto",
    {
      requestId,
      source: "classify-recurring-reminder",
      model: "gemini-2.5-flash",
      maxRetries: 2,
      forceRealAi: true,
    },
  );

  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  const levelRaw = Number((parsed as any)?.level);
  const reason = str((parsed as any)?.reason).slice(0, 180);
  const level: PersonalizationLevel = levelRaw === 3 ? 3 : levelRaw === 2 ? 2 : 1;
  return { level, reason: reason || "Classification automatique par intention utilisateur." };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsOptions(req);
  const corsErr = enforceCors(req);
  if (corsErr) return corsErr;
  const corsHeaders = getCorsHeaders(req);

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({} as any));
    const reminderId = str((body as any)?.reminder_id);
    if (!reminderId) {
      return new Response(JSON.stringify({ error: "Missing reminder_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = str(Deno.env.get("SUPABASE_URL"));
    const anonKey = str(Deno.env.get("SUPABASE_ANON_KEY"));
    const serviceKey = str(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authErr } = await userClient.auth.getUser();
    if (authErr || !authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = authData.user.id;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: reminder, error: reminderErr } = await admin
      .from("user_recurring_reminders")
      .select("id,user_id,message_instruction,rationale")
      .eq("id", reminderId)
      .eq("user_id", userId)
      .maybeSingle();
    if (reminderErr) throw reminderErr;
    if (!reminder) {
      return new Response(JSON.stringify({ error: "Reminder not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const instruction = str((reminder as any).message_instruction);
    const rationale = str((reminder as any).rationale);

    const requestId = `${crypto.randomUUID()}:classify-recurring-reminder`;
    let level: PersonalizationLevel = heuristicLevel(instruction, rationale);
    let reason = "Classification heuristique.";
    try {
      const ai = await classifyWithAI({ instruction, rationale, requestId });
      level = ai.level;
      reason = ai.reason || reason;
    } catch (e) {
      console.warn("[classify-recurring-reminder] ai_fallback_heuristic", e);
    }

    const contextPolicy = buildContextPolicy(level);
    const { error: updateErr } = await admin
      .from("user_recurring_reminders")
      .update({
        personalization_level: level,
        context_policy: contextPolicy,
        classification_reason: reason,
        last_classified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", reminderId)
      .eq("user_id", userId);
    if (updateErr) throw updateErr;

    return new Response(
      JSON.stringify({
        success: true,
        reminder_id: reminderId,
        personalization_level: level,
        context_policy: contextPolicy,
        classification_reason: reason,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[classify-recurring-reminder] error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
