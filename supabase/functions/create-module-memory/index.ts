import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { generateWithGemini, generateEmbedding } from '../_shared/gemini.ts'
import { WEEKS_CONTENT } from '../_shared/weeksContent.ts'
import { ensureInternalRequest } from "../_shared/internal-auth.ts"

console.log("Create Module Memory Function initialized")

Deno.serve(async (req) => {
  try {
    const guard = ensureInternalRequest(req)
    if (guard) return guard
    const payload = await req.json()
    const { record } = payload
    
    // Check payload
    if (!record || !record.module_id || !record.content) {
        console.log("Invalid payload or empty content, skipping memory creation.");
        return new Response('Skipped', { status: 200 })
    }

    const moduleId = record.module_id;
    const userId = record.user_id;
    
    // Extract content string
    const contentStr = typeof record.content === 'string' 
        ? record.content 
        : (record.content as any)?.content || (record.content as any)?.answer;

    if (!contentStr || contentStr.length < 10) {
        console.log(`Content too short for memory (${moduleId})`);
        return new Response('Skipped: Content too short', { status: 200 })
    }

    console.log(`[Memory] Processing memory for module ${moduleId} user ${userId}`);

    // Init Supabase Admin
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Find Question Context
    let questionText = "Question du module";
    let found = false;
    
    // We assume WEEKS_CONTENT is available and structure is correct
    // Iterate over weeks to find the module
    for (const weekKey in WEEKS_CONTENT) {
       const week = (WEEKS_CONTENT as any)[weekKey];
       if (week.subQuestions) {
         const sq = week.subQuestions.find((s: any) => s.id === moduleId);
         if (sq) {
           questionText = sq.question + " : " + sq.placeholder;
           found = true;
           break;
         }
       }
    }

    if (!found) {
        console.log(`[Memory] Warning: Module definition not found for ${moduleId}. Using generic context.`);
    }

    // 2. Generate Summary
    const prompt = `Voici la réponse de l'utilisateur au module "${questionText}".
    Fais un résumé dense à la 3ème personne ("Il est stressé par...").
    Inclus les mots-clés de la question.
    Contexte : C'est une réponse à un exercice d'introspection.`;

    const aiSummary = await generateWithGemini(prompt, contentStr);

    // 3. Vectorize
    const vectorText = `Question : ${questionText}\nRésumé Réponse : ${aiSummary}`;
    const embedding = await generateEmbedding(vectorText);

    // 4. Store Memory (Micro-Souvenir)
    
    // A. Archive old active insight (if any)
    await supabaseAdmin
      .from('memories')
      .update({ 
        type: 'history',
        metadata: { 
          archived_at: new Date().toISOString(),
          source: 'create-module-memory-trigger'
        }
      })
      .eq('user_id', userId)
      .eq('source_id', moduleId)
      .eq('source_type', 'module')
      .eq('type', 'insight');

    // B. Insert new active insight
    const { error: insertError } = await supabaseAdmin
      .from('memories')
      .insert({
        user_id: userId,
        source_id: moduleId,
        source_type: 'module',
        type: 'insight',
        content: vectorText,
        embedding: embedding,
        metadata: { 
          source: 'create-module-memory', 
          version_date: new Date().toISOString() 
        }
      });

    if (insertError) {
        console.error("[Memory] Error inserting memory:", insertError);
        throw insertError;
    }
          
    console.log(`[Memory] Success: Micro-Memory created for ${moduleId}`);

    return new Response(JSON.stringify({ success: true }), { 
        headers: { 'Content-Type': 'application/json' } 
    })

  } catch (error) {
    console.error("[Memory] Error:", error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})
