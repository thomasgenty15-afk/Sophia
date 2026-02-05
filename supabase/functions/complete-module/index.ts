import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.87.3";
import { generateWithGemini, generateEmbedding } from "../_shared/gemini.ts";
import { WEEKS_CONTENT } from "../_shared/weeksContent.ts";
import { processCoreIdentity } from "../_shared/identity-manager.ts";
import { enforceCors, getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { getRequestContext } from "../_shared/request_context.ts";

type PaidTier = "system" | "alliance" | "architecte";

function env(name: string): string | null {
  const v = Deno.env.get(name);
  const t = (v ?? "").trim();
  return t.length > 0 ? t : null;
}

function isActiveSubscription(row: any): boolean {
  if (!row) return false;
  const status = String(row.status ?? "").toLowerCase();
  if (status !== "active" && status !== "trialing") return false;
  const endRaw = row.current_period_end ? String(row.current_period_end) : "";
  if (!endRaw) return true;
  const end = new Date(endRaw).getTime();
  return Number.isFinite(end) ? Date.now() < end : true;
}

function tierFromStripePriceId(priceId: string | null): PaidTier | null {
  const id = (priceId ?? "").trim();
  if (!id) return null;
  const system = new Set([env("STRIPE_PRICE_ID_SYSTEM_MONTHLY"), env("STRIPE_PRICE_ID_SYSTEM_YEARLY")].filter(Boolean) as string[]);
  const alliance = new Set([env("STRIPE_PRICE_ID_ALLIANCE_MONTHLY"), env("STRIPE_PRICE_ID_ALLIANCE_YEARLY")].filter(Boolean) as string[]);
  const architecte = new Set([env("STRIPE_PRICE_ID_ARCHITECTE_MONTHLY"), env("STRIPE_PRICE_ID_ARCHITECTE_YEARLY")].filter(Boolean) as string[]);
  if (architecte.has(id)) return "architecte";
  if (alliance.has(id)) return "alliance";
  if (system.has(id)) return "system";
  return null;
}

async function getEffectiveTierForUser(supabaseAdmin: any, userId: string): Promise<PaidTier | "none"> {
  try {
    const { data } = await supabaseAdmin
      .from("subscriptions")
      .select("status,stripe_price_id,current_period_end")
      .eq("user_id", userId)
      .maybeSingle();
    if (!isActiveSubscription(data)) return "none";
    return tierFromStripePriceId((data as any)?.stripe_price_id ?? null) ?? "none";
  } catch {
    return "none";
  }
}

// --- REGISTRY ---
type ModuleType = 'week' | 'forge' | 'round_table';

interface TargetModule {
  id: string;
  delayDays?: number;
  condition?: 'next_sunday' | 'immediate' | 'fixed_delay';
}

interface ModuleDefinition {
  id: string;
  nextModules?: (string | TargetModule)[]; 
  defaultUnlockDelayDays?: number;
  defaultUnlockCondition?: 'next_sunday' | 'immediate' | 'fixed_delay';
}

const MODULES_REGISTRY: Record<string, ModuleDefinition> = {
  // --- SEMAINE ---
  'week_1': { id: 'week_1', nextModules: ['week_2'], defaultUnlockDelayDays: 7 },
  'week_2': { id: 'week_2', nextModules: ['week_3'], defaultUnlockDelayDays: 7 },
  'week_3': { id: 'week_3', nextModules: ['week_4'], defaultUnlockDelayDays: 7 },
  // ... (suite simplifiée pour l'exemple)
  'week_12': { 
    id: 'week_12', 
    nextModules: [
      { id: 'forge_level_2', delayDays: 7, condition: 'fixed_delay' },
      { id: 'round_table_1', condition: 'next_sunday' } 
    ]
  },
  'forge_level_2': { id: 'forge_level_2', nextModules: ['forge_level_3'], defaultUnlockDelayDays: 5 },
  'round_table_1': { id: 'round_table_1', nextModules: ['round_table_2'], defaultUnlockCondition: 'next_sunday' },
  'round_table_2': { id: 'round_table_2', nextModules: ['round_table_3'], defaultUnlockCondition: 'next_sunday' },
};

// --- HELPER DATES ---
function getUnlockDate(condition: string = 'fixed_delay', delayDays: number = 0): Date {
  const now = new Date();
  if (condition === 'next_sunday') {
    const nextSunday = new Date(now);
    nextSunday.setDate(now.getDate() + (7 - now.getDay()) % 7);
    if (nextSunday.getDay() === now.getDay()) { 
        nextSunday.setDate(nextSunday.getDate() + 7);
    }
    nextSunday.setHours(9, 0, 0, 0);
    return nextSunday;
  }
  const unlockDate = new Date(now);
  unlockDate.setDate(now.getDate() + delayDays);
  return unlockDate;
}

serve(async (req) => {
  let ctx = getRequestContext(req)
  if (req.method === "OPTIONS") {
    return handleCorsOptions(req);
  }
  const corsErr = enforceCors(req);
  if (corsErr) return corsErr;
  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(authHeader.replace('Bearer ', ''));

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({} as any));
    const { moduleId } = body as any;
    ctx = getRequestContext(req, { ...(body as any), user_id: user.id })

  // Entitlements:
  // - All tiers can access Architecte preview weeks 1 & 2.
  // - Only Architecte tier can access week_3+ and any post-week-12 content.
  const tier = await getEffectiveTierForUser(supabaseClient, user.id);
  const hasFullArchitecte = tier === "architecte";
  if (typeof moduleId === "string" && moduleId.startsWith("week_")) {
    const n = Number(String(moduleId).replace("week_", ""));
    if (Number.isFinite(n) && n > 2 && !hasFullArchitecte) {
      return new Response(JSON.stringify({ error: "Paywall: requires architecte", required_tier: "architecte" }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // Helper to determine table based on module ID
  const getTableForModule = (id: string) => {
    return id.startsWith('week_') ? 'user_week_states' : 'user_module_state_entries';
  };

  const table = getTableForModule(moduleId);

  // --- 1. LOGIC: FORGE & MICRO-MEMORY (Le Micro-Souvenir) ---
  // Uniquement pour les modules de la Forge (pas Table Ronde, pas Semaine globale)
  let aiSummary: string | null = null;

  if (table === 'user_module_state_entries' && !moduleId.startsWith('round_table_')) {
    try {
      console.log(`[CompleteModule] Fetching content for ${moduleId} user ${user.id}`);
      const { data: entry, error: fetchError } = await supabaseClient
        .from('user_module_state_entries')
        .select('content')
        .eq('user_id', user.id)
        .eq('module_id', moduleId)
        .single();
      
      if (fetchError) {
          console.error("[CompleteModule] Fetch error:", fetchError);
      }

      const contentStr = typeof entry?.content === 'string' 
        ? entry.content 
        : (entry?.content as any)?.content; 

      console.log(`[CompleteModule] Content found: "${contentStr?.substring(0, 20)}..." (Length: ${contentStr?.length})`);

      if (contentStr && contentStr.length > 10) {
        // 1. Find Question Context
        let questionText = "Question du module";
        for (const week of Object.values(WEEKS_CONTENT)) {
           const w = week as any; 
           if (w.subQuestions) {
             const sq = w.subQuestions.find((s: any) => s.id === moduleId);
             if (sq) {
               questionText = sq.question + " : " + sq.placeholder;
               break;
             }
           }
        }

        // 2. Generate Summary
        const prompt = `Voici la réponse de l'utilisateur au module "${questionText}".
        Fais un résumé dense à la 3ème personne ("Il est stressé par...").
        Inclus les mots-clés de la question.`;

        aiSummary = await generateWithGemini(prompt, contentStr);

        // 3. Vectorize
        const vectorText = `Question : ${questionText}\nRésumé Réponse : ${aiSummary}`;
        const embedding = await generateEmbedding(vectorText);

        // 4. Store Memory (Micro-Souvenir)
        // A. Archive old active insight
        await supabaseClient
          .from('memories')
          .update({ 
            type: 'history',
            metadata: { 
              archived_at: new Date().toISOString(),
              source: 'complete-module-history'
            }
          })
          .eq('user_id', user.id)
          .eq('source_id', moduleId)
          .eq('source_type', 'module')
          .eq('type', 'insight');

        // B. Insert new active insight
        await supabaseClient
          .from('memories')
          .insert({
            user_id: user.id,
            source_id: moduleId,
            source_type: 'module',
            type: 'insight',
            content: vectorText,
            embedding: embedding,
            metadata: { 
              source: 'complete-module', 
              version_date: new Date().toISOString() 
            }
          });
          
        console.log(`Forge Micro-Memory created for ${moduleId}`);
      }
    } catch (err) {
      console.error("Error creating Forge Memory:", err);
    }
  }

  // --- 2. UPDATE STATUS ---
  const updatePayload: any = { 
    status: 'completed', 
    completed_at: new Date().toISOString() 
  };
  
  if (aiSummary) {
    updatePayload.ai_summary = aiSummary;
  }

  const { error: updateError } = await supabaseClient
    .from(table)
    .update(updatePayload)
    .eq('user_id', user.id)
    .eq('module_id', moduleId);

  if (updateError) {
    return new Response(JSON.stringify({ error: updateError }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // --- 3. UNLOCK NEXT MODULES ---
  const config = MODULES_REGISTRY[moduleId];
  if (config && config.nextModules) {
    const nextModulesPayload = config.nextModules.map(target => {
      const targetId = typeof target === 'string' ? target : target.id;
      const specificDelay = typeof target === 'object' ? target.delayDays : undefined;
      const specificCondition = typeof target === 'object' ? target.condition : undefined;
      const delay = specificDelay ?? config.defaultUnlockDelayDays ?? 0;
      const condition = specificCondition ?? config.defaultUnlockCondition ?? 'fixed_delay';
      const availableAt = getUnlockDate(condition, delay);

      return {
        targetId,
        payload: {
          user_id: user.id,
          module_id: targetId,
          status: 'available',
          available_at: availableAt.toISOString()
        }
      };
    });

    const weekPayloads = nextModulesPayload
      .filter(item => getTableForModule(item.targetId) === 'user_week_states')
      .map(item => item.payload);

    const modulePayloads = nextModulesPayload
      .filter(item => getTableForModule(item.targetId) === 'user_module_state_entries')
      .map(item => item.payload);

    // Paywall enforcement: prevent unlocking week_3+ and other advanced modules unless Architecte.
    const allowedWeekPayloads = weekPayloads.filter((p: any) => {
      const id = String(p.module_id ?? "");
      if (id.startsWith("week_")) {
        const n = Number(id.replace("week_", ""));
        if (Number.isFinite(n) && n > 2 && !hasFullArchitecte) return false;
      }
      if ((id.startsWith("forge") || id.startsWith("round_table")) && !hasFullArchitecte) return false;
      return true;
    });

    if (allowedWeekPayloads.length > 0) {
      await supabaseClient.from('user_week_states').upsert(allowedWeekPayloads, { onConflict: 'user_id,module_id' });
    }
    if (modulePayloads.length > 0) {
      const allowedModulePayloads = modulePayloads.filter((p: any) => {
        const id = String(p.module_id ?? "");
        if ((id.startsWith("forge") || id.startsWith("round_table")) && !hasFullArchitecte) return false;
        return true;
      });
      if (allowedModulePayloads.length > 0) {
        await supabaseClient.from('user_module_state_entries').upsert(allowedModulePayloads, { onConflict: 'user_id,module_id' });
      }
    }
  }

  // --- 4. LOGIC: CORE IDENTITY (Le Temple) ---
  // Nous sommes à la fin du traitement, c'est le moment idéal pour mettre à jour l'identité en asynchrone (ou await pour être sûr)
  
  // Cas A : Fin de Semaine (ex: 'week_1')
  if (moduleId.startsWith('week_')) {
      const weekNum = parseInt(moduleId.replace('week_', ''));
      if (!isNaN(weekNum)) {
          // On lance la construction du Temple pour cette semaine
          await processCoreIdentity(supabaseClient, user.id, weekNum, 'completion');
      }
  }
  
  // Cas B : Update Module Forge (ex: 'a1_c2_m1')
  // Note: complete-module est appelé quand on valide. Si on met juste à jour le contenu sans valider, c'est une autre route ?
  // Généralement complete-module est appelé à la fin. Si l'user revient dessus et sauvegarde, ça passe par où ?
  // Si c'est juste un 'update' SQL depuis le front, complete-module n'est PAS appelé.
  // C'est là que le bat blesse pour le "Temps 2" (Mise à jour).
  // SI le front appelle 'complete-module' même pour une mise à jour d'un module déjà complété, alors c'est bon.
  // SINON, il faut que le front appelle cette fonction explicitement.
  // Supposons pour l'instant que 'complete-module' est appelé aussi lors des updates de la Forge (re-validation).
  
  else if (moduleId.startsWith('a') && !moduleId.startsWith('round_table')) {
      // Regex pour extraire l'axe (weekNum) : a(\d+)_
      const match = moduleId.match(/^a(\d+)_/);
      if (match) {
          const weekNum = parseInt(match[1]);
          // On lance la mise à jour du Temple
          await processCoreIdentity(supabaseClient, user.id, weekNum, 'update_forge');
      }
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
  } catch (error) {
    console.error(`[complete-module] request_id=${ctx.requestId} user_id=${ctx.userId ?? "null"}`, error);
    await logEdgeFunctionError({
      functionName: "complete-module",
      error,
      requestId: ctx.requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: { client_request_id: ctx.clientRequestId },
    })
    return new Response(JSON.stringify({ error: (error as any)?.message ?? String(error), request_id: ctx.requestId }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
