import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { generateWithGemini } from '../_shared/gemini.ts'
import { ensureInternalRequest } from "../_shared/internal-auth.ts"
import { logEdgeFunctionError } from "../_shared/error-log.ts"
import { getRequestContext } from "../_shared/request_context.ts"

console.log("Create Round Table Summary Function initialized")

Deno.serve(async (req) => {
  let ctx = getRequestContext(req)
  try {
    const guard = ensureInternalRequest(req)
    if (guard) return guard
    const payload = await req.json().catch(() => ({} as any))
    ctx = getRequestContext(req, payload)
    const { record } = payload
    
    // Check payload
    if (!record || !record.module_id) {
        console.log("Invalid payload, skipping round table summary.");
        return new Response('Skipped', { status: 200 })
    }

    const moduleId = record.module_id; // ex: 'round_table_1'
    const userId = record.user_id;

    console.log(`[create-round-table-summary] request_id=${ctx.requestId} user_id=${userId} module_id=${moduleId}`);

    // 1. Generate Summary
    const prompt = `
        Voici le bilan hebdomadaire (Table Ronde) de l'utilisateur :
        - Énergie : ${record.energy_level}/100
        - Victoires : ${record.wins_3}
        - Blocage Principal : ${record.main_blocker}
        - Alignement Identitaire : ${record.identity_alignment}
        - Intention pour la semaine prochaine : ${record.week_intention}

        Génère un résumé très court et percutant (1 phrase ou 2 max) qui capture l'essentiel de son état d'esprit cette semaine.
        Format attendu : "Semaine [N] : [Résumé]"
        Ton : Coach analytique.
    `;

    const summary = await generateWithGemini(prompt, "", 0.3, false, [], "auto", {
      requestId: ctx.requestId,
      userId: ctx.userId ?? null,
      source: "create-round-table-summary",
    });

    console.log(`[RoundTable] Memory storage disabled. Generated summary for ${moduleId}: ${String(summary).slice(0, 120)}`);

    return new Response(JSON.stringify({ success: true }), { 
        headers: { 'Content-Type': 'application/json' } 
    })

  } catch (error) {
    console.error(`[create-round-table-summary] request_id=${ctx.requestId} user_id=${ctx.userId ?? "null"}`, error)
    await logEdgeFunctionError({
      functionName: "create-round-table-summary",
      error,
      requestId: ctx.requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: { client_request_id: ctx.clientRequestId },
    })
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})
