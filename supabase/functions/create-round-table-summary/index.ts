import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { generateWithGemini, generateEmbedding } from '../_shared/gemini.ts'

console.log("Create Round Table Summary Function initialized")

Deno.serve(async (req) => {
  try {
    const payload = await req.json()
    const { record } = payload
    
    // Check payload
    if (!record || !record.module_id) {
        console.log("Invalid payload, skipping round table summary.");
        return new Response('Skipped', { status: 200 })
    }

    const moduleId = record.module_id; // ex: 'round_table_1'
    const userId = record.user_id;

    console.log(`[RoundTable] Processing summary for ${moduleId} user ${userId}`);

    // Init Supabase Admin
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

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

    const summary = await generateWithGemini(prompt, "", 0.3);

    // 2. Vectorize
    const embedding = await generateEmbedding(summary);

    // 3. Store in Memories
    // On utilise type 'insight' pour qu'il soit "actif" dans le cerveau, 
    // mais on taggue 'weekly_review' dans source_type.
    
    // A. Archive old summary if exists
    await supabaseAdmin
      .from('memories')
      .update({ 
        type: 'history',
        metadata: { 
          archived_at: new Date().toISOString(),
          source: 'round-table-trigger'
        }
      })
      .eq('user_id', userId)
      .eq('source_id', moduleId)
      .eq('source_type', 'weekly_review')
      .eq('type', 'insight');

    // B. Insert new summary
    const { error: insertError } = await supabaseAdmin
      .from('memories')
      .insert({
        user_id: userId,
        content: summary,
        type: 'insight', // Active Memory
        source_type: 'weekly_review',
        source_id: moduleId,
        embedding: embedding,
        metadata: {
            energy: record.energy_level,
            wins: record.wins_3,
            blocker: record.main_blocker,
            source: 'create-round-table-summary'
        }
      });

    if (insertError) {
        console.error("[RoundTable] Error inserting memory:", insertError);
        throw insertError;
    }
          
    console.log(`[RoundTable] Success: Weekly Summary created for ${moduleId}`);

    return new Response(JSON.stringify({ success: true }), { 
        headers: { 'Content-Type': 'application/json' } 
    })

  } catch (error) {
    console.error("[RoundTable] Error:", error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})

