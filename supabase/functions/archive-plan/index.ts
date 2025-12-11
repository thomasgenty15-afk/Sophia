import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { generateWithGemini, generateEmbedding } from '../_shared/gemini.ts'

console.log("Archive Plan Function initialized")

Deno.serve(async (req) => {
  try {
    const payload = await req.json()
    
    // Webhook payload check
    if (!payload.record || !payload.type) {
        return new Response('Invalid payload', { status: 400 })
    }

    const { record, old_record, type } = payload
    const status = record.status
    const oldStatus = old_record?.status

    console.log(`[ArchivePlan] Triggered for plan ${record.id} (Status: ${status})`)

    // Only proceed if status CHANGED to 'completed' or 'archived'
    // Or if it's an INSERT with 'completed' (unlikely but safe to handle)
    const isCompleted = status === 'completed' || status === 'archived'
    const wasCompleted = oldStatus === 'completed' || oldStatus === 'archived'

    if (!isCompleted || wasCompleted) {
        return new Response('No action needed', { status: 200 })
    }

    // --- LOGIC ---
    
    // 1. Init Supabase (Service Role needed to read all data if RLS blocks)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const userId = record.user_id
    const planId = record.id
    // record.created_at is used for context
    const planCreatedAt = record.created_at

    // --- DATA FETCHING ---

    // A. User Vital Signs Entries (Monitoring)
    const { data: vitals } = await supabaseAdmin
        .from('user_vital_sign_entries')
        .select(`
            value, recorded_at,
            user_vital_signs ( label, unit )
        `)
        .eq('plan_id', planId)
        .order('recorded_at', { ascending: true })

    // B. User Actions (Execution)
    const { data: actions } = await supabaseAdmin
        .from('user_actions')
        .select('*')
        .eq('plan_id', planId)

    // C. User Framework Entries (Recap)
    const { data: frameworks } = await supabaseAdmin
        .from('user_framework_entries')
        .select('*')
        .eq('plan_id', planId)

    // D. User Answers (Questionnaire linked to this Plan)
    let answersContext = "Données du questionnaire non disponibles.";
    if (record.goal_id) {
        const { data: goal } = await supabaseAdmin
            .from('user_goals')
            .select('source_answers_id, axis_id')
            .eq('id', record.goal_id)
            .single()
        
        if (goal && goal.source_answers_id) {
             const { data: answers } = await supabaseAdmin
                .from('user_answers')
                .select('content')
                .eq('id', goal.source_answers_id)
                .single()
             
             if (answers && answers.content) {
                 // FILTERING BY AXIS
                 // Structure of answers.content is usually: { "theme_energy": {...}, "theme_sense": {...} }
                 // The axis_id usually matches the key (e.g. 'energy' -> 'theme_energy')
                 // Let's try to be smart about matching.
                 
                 const fullContent = answers.content as Record<string, any>;
                 let targetSection = null;

                 // 1. Direct match (e.g. axis_id='theme_energy')
                 if (fullContent[goal.axis_id]) {
                     targetSection = fullContent[goal.axis_id];
                 } 
                 // 2. Prefix match (e.g. axis_id='energy' -> key='theme_energy')
                 else {
                     const key = Object.keys(fullContent).find(k => k.includes(goal.axis_id));
                     if (key) targetSection = fullContent[key];
                 }

                 if (targetSection) {
                     answersContext = JSON.stringify(targetSection, null, 2);
                 } else {
                     // Fallback: If no specific section found, maybe the structure is flat or different?
                     // Let's truncate just in case.
                     answersContext = "Section spécifique non trouvée. Extrait global: " + JSON.stringify(fullContent).substring(0, 500) + "...";
                 }
             }
        }
    }


    // --- CONTEXT CONSTRUCTION ---
    
    let context = `CONTEXTE DU PLAN D'ACTION (ARCHIVAGE) :\n`
    context += `Titre: "${record.title || 'Sans titre'}"\n`
    context += `Deep Why (Pourquoi profond): ${record.deep_why || 'N/A'}\n`
    context += `Problème Initial: ${record.context_problem || 'N/A'}\n`
    context += `Inputs Why (Motivation initiale): ${record.inputs_why || 'N/A'}\n`
    context += `Inputs Blockers (Blocages initiaux): ${record.inputs_blockers || 'N/A'}\n`
    context += `Inputs Context (Contexte global): ${record.inputs_context || 'N/A'}\n`
    
    if (record.recraft_reason) {
        context += `\n[HISTORIQUE DE RECRAFT]\n`
        context += `Raison du recraft: ${record.recraft_reason}\n`
        context += `Défis du recraft: ${record.recraft_challenges || 'N/A'}\n`
    }

    context += `\n--- QUESTIONNAIRE INITIAL (AXE CIBLÉ) ---\n`
    context += answersContext + "\n"

    context += `\n--- SIGNAUX VITAUX (SUIVI) ---\n`
    if (vitals && vitals.length > 0) {
        // Group by label to show evolution
        const groupedVitals: any = {}
        vitals.forEach((v: any) => {
            const label = v.user_vital_signs?.label || 'Inconnu'
            if (!groupedVitals[label]) groupedVitals[label] = []
            groupedVitals[label].push(`${v.value} (${new Date(v.recorded_at).toLocaleDateString()})`)
        })
        
        for (const [label, values] of Object.entries(groupedVitals)) {
            const vals = values as string[];
            context += `- ${label}: ${vals.join(' -> ')}\n`
        }
    } else {
        context += "Pas de données de signaux vitaux enregistrées.\n"
    }

    context += `\n--- ACTIONS & EXÉCUTION ---\n`
    if (actions && actions.length > 0) {
        actions.forEach((a: any) => {
            context += `- Action: ${a.title} (${a.type})\n`
            context += `  Statut: ${a.status}\n`
            context += `  Répétitions: ${a.current_reps} / ${a.target_reps}\n`
        })
    } else {
        context += "Aucune action définie.\n"
    }

    context += `\n--- CADRES & EXERCICES (FRAMEWORKS) ---\n`
    if (frameworks && frameworks.length > 0) {
        frameworks.forEach((f: any) => {
            context += `- Framework: ${f.framework_title} (${f.framework_type})\n`
            context += `  (Complété le ${new Date(f.created_at).toLocaleDateString()})\n`
        })
    }

    // 4. Generate "Récit de Cycle"
    const systemPrompt = `
      Tu es "L'Archiviste" du système Sophia.
      Ton rôle est de générer une SYNTHÈSE STRATÉGIQUE de ce cycle terminé.
      
      OBJECTIF RAG (Retrieval Augmented Generation) :
      Ce document doit servir de "mémoire long terme" pour les futurs agents.
      Il ne doit pas être vague ("Il a fait des efforts"), mais EXPLOITABLE ("Le vital sign Stress a chuté de 8 à 4 quand il a fait du sport").
      
      Structure attendue :
      1. PROFIL INITIAL (Source Questionnaire & Inputs) :
         - Qui est l'utilisateur à ce moment T ? (Contexte, blocages profonds extraits du questionnaire).
         - Quel était l'objectif précis ?
      
      2. ANALYSE FACTUELLE DE L'EXÉCUTION :
         - Corrélation Actions / Résultats (Vitals). Qu'est-ce qui a bougé ?
         - Taux de complétion des actions.
         - Si recraft : Analyse du pivot.
      
      3. MÉTA-APPRENTISSAGES & PATTERNS :
         - Patterns de succès (ex: "Réussit mieux les actions courtes le matin").
         - Patterns d'échec (ex: "Abandonne dès que le stress dépasse 7/10").
      
      Ton : Clinique, Précis, Densité d'information maximale.
      IMPORTANT : N'utilise PAS de gras (**texte**) ni de mise en forme Markdown riche. Utilise du texte brut simple.
    `

    console.log(`[ArchivePlan] Generating narrative for user ${userId}...`)
    const narrative = await generateWithGemini(systemPrompt, context, 0.3)
    
    console.log(`[ArchivePlan] Narrative generated (${narrative.length} chars). Embedding...`)

    // 5. Vectorize
    const embedding = await generateEmbedding(narrative)

    // 6. Store in Memories
    const { error: insertError } = await supabaseAdmin
        .from('memories')
        .insert({
            user_id: userId,
            content: narrative,
            type: 'archive',
            source_type: 'plan',
            source_id: planId,
            embedding: embedding,
            metadata: {
                plan_title: record.title,
                archived_at: new Date().toISOString(),
                rag_optimized: true
            }
        })

    if (insertError) {
        console.error("Error inserting memory:", insertError)
        throw insertError
    }

    console.log(`[ArchivePlan] Successfully archived plan ${planId}`)

    return new Response(JSON.stringify({ success: true }), { 
        headers: { 'Content-Type': 'application/json' } 
    })

  } catch (error) {
    console.error("Error in archive-plan:", error)
    return new Response(JSON.stringify({ error: error.message }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
    })
  }
})
