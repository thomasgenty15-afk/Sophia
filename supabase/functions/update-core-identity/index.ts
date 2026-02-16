import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { generateEmbedding, generateWithGemini } from '../_shared/gemini.ts'
import { WEEKS_CONTENT } from '../_shared/weeksContent.ts'
import { ensureInternalRequest } from "../_shared/internal-auth.ts"
import { logEdgeFunctionError } from "../_shared/error-log.ts"
import { getRequestContext } from "../_shared/request_context.ts"

console.log("Update Core Identity Function initialized")

Deno.serve(async (req) => {
  let ctx = getRequestContext(req)
  try {
    const guard = ensureInternalRequest(req)
    if (guard) return guard
    const payload = await req.json().catch(() => ({} as any))
    ctx = getRequestContext(req, payload)
    
    // Le payload vient du Trigger Database
    // Il peut venir de 'user_week_states' (completion) OU 'user_module_state_entries' (update)
    
    const record = payload.record
    const tableName = payload.table
    const userId = record.user_id
    let weekNum: number | null = null
    
    // 1. Déterminer le numéro de semaine
    if (tableName === 'user_week_states') {
        // format module_id: 'week_1'
        const match = record.module_id.match(/^week_(\d+)$/)
        if (match) weekNum = parseInt(match[1])
    } else if (tableName === 'user_module_state_entries') {
        // format module_id: 'a1_c1_m1' (a = axis/week)
        const match = record.module_id.match(/^a(\d+)_/)
        if (match) weekNum = parseInt(match[1])
    }

    if (!weekNum) {
        return new Response('Ignored: Not a week related record', { status: 200 })
    }

    console.log(`[update-core-identity] request_id=${ctx.requestId} user_id=${userId} week=${weekNum}`)

    // 2. Init Supabase Admin
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 3. Récupérer TOUTES les réponses de cette semaine (Contexte complet)
    // On cherche tous les modules commençant par 'a{weekNum}_'
    const { data: modules, error: modError } = await supabaseAdmin
        .from('user_module_state_entries')
        .select('module_id, content')
        .eq('user_id', userId)
        .like('module_id', `a${weekNum}_%`)
    
    if (modError || !modules || modules.length === 0) {
        console.log('[Identity] No modules found for this week yet.')
        return new Response('No data', { status: 200 })
    }

    // 4. Construire le Transcript de la semaine
    let transcript = `SEMAINE ${weekNum} - RÉPONSES UTILISATEUR :\n\n`
    
    // On essaie de mapper avec les questions réelles si possible
    const weekContent = (WEEKS_CONTENT as any)[`week_${weekNum}`]
    
    modules.forEach(m => {
        let question = "Question inconnue"
        // Tentative de retrouver le texte de la question
        if (weekContent && weekContent.subQuestions) {
            const sq = weekContent.subQuestions.find((s:any) => s.id === m.module_id)
            if (sq) question = sq.question
        }

        const contentStr = typeof m.content === 'string' ? m.content : (m.content as any)?.content || JSON.stringify(m.content)
        
        transcript += `[MODULE ${m.module_id}] ${question}\n`
        transcript += `RÉPONSE: ${contentStr}\n\n`
    })

    // 5. Récupérer l'ancienne identité (si existe)
    const { data: oldIdentity } = await supabaseAdmin
        .from('user_core_identity')
        .select('*')
        .eq('user_id', userId)
        .eq('week_id', `week_${weekNum}`)
        .single()

    // 6. Générer le Résumé Identitaire avec Gemini
    // Cas 1 : Création (Pas d'ancienne identité)
    // Cas 2 : Mise à jour (Ancienne identité présente)
    
    let systemPrompt = ""
    
    if (!oldIdentity) {
        systemPrompt = `
          Tu es l'Architecte de l'Identité du système Sophia.
          Ta mission : Analyser les réponses de l'utilisateur pour cette semaine et extraire l'essence de son identité.
          
          RÈGLES :
          - Produis un résumé dense de 5 lignes maximum.
          - Concentre-toi sur les Valeurs, les Peurs, les Désirs profonds et les Principes directeurs révélés ici.
          - Ne raconte pas les faits ("Il a mangé une pomme"), mais le sens ("Il valorise la santé et la discipline").
          - Style : Analytique, psychologique, précis. Pas de blabla.
        `
    } else {
        systemPrompt = `
          Tu es l'Architecte de l'Identité du système Sophia.
          Mise à jour de l'identité suite à une modification de l'utilisateur (Forge).
          
          ANCIENNE VERSION DE L'IDENTITÉ :
          "${oldIdentity.content}"
          
          Ta mission : Ré-analyser l'ensemble des réponses (inclus les modifications récentes) pour produire une NOUVELLE version de l'identité.
          
          RÈGLES :
          - Garde ce qui est toujours vrai.
          - Ajuste ce qui a changé ou s'est précisé.
          - Produis un résumé dense de 5 lignes maximum.
          - Concentre-toi sur les Valeurs, les Peurs, les Désirs profonds.
        `
    }

    const newIdentityRaw = await generateWithGemini(systemPrompt, transcript, 0.3)
    if (typeof newIdentityRaw !== "string") {
      throw new Error("Identity generation returned a tool call instead of text")
    }
    const newIdentityContent = newIdentityRaw.trim()
    if (!newIdentityContent) {
      throw new Error("Identity generation returned empty content")
    }
    const identityEmbedding = await generateEmbedding(newIdentityContent)

    // 7. Sauvegarde et Archivage
    if (oldIdentity) {
        // Archivage
        await supabaseAdmin.from('user_core_identity_archive').insert({
            identity_id: oldIdentity.id,
            user_id: userId,
            week_id: `week_${weekNum}`,
            content: oldIdentity.content,
            reason: tableName === 'user_week_states' ? 're-completion' : 'update_forge'
        })
        
        // Mise à jour
        await supabaseAdmin.from('user_core_identity').update({
            content: newIdentityContent,
            identity_embedding: identityEmbedding,
            last_updated_at: new Date().toISOString()
        }).eq('id', oldIdentity.id)
        
        console.log(`[Identity] Updated identity for Week ${weekNum}`)
    } else {
        // Création
        await supabaseAdmin.from('user_core_identity').insert({
            user_id: userId,
            week_id: `week_${weekNum}`,
            content: newIdentityContent,
            identity_embedding: identityEmbedding,
        })
        console.log(`[Identity] Created identity for Week ${weekNum}`)
    }

    return new Response(JSON.stringify({ success: true }), { 
        headers: { 'Content-Type': 'application/json' } 
    })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`[update-core-identity] request_id=${ctx.requestId} user_id=${ctx.userId ?? "null"}`, error)
    await logEdgeFunctionError({
      functionName: "update-core-identity",
      error,
      requestId: ctx.requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: { client_request_id: ctx.clientRequestId },
    })
    return new Response(JSON.stringify({ error: errorMessage }), { status: 500 })
  }
})
