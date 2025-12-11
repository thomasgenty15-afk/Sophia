import { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { generateWithGemini, generateEmbedding } from '../../_shared/gemini.ts'

export async function runWatcher(
  supabase: SupabaseClient, 
  userId: string, 
  lastProcessedAt: string
) {
  console.log(`[Veilleur] Triggered for user ${userId}`)

  // 1. Fetch messages since last_processed_at
  const { data: messages, error } = await supabase
    .from('chat_messages')
    .select('role, content, created_at')
    .eq('user_id', userId)
    .gt('created_at', lastProcessedAt)
    .order('created_at', { ascending: true })

  if (error || !messages || messages.length === 0) {
    console.log('[Veilleur] No new messages found or error', error)
    return
  }

  // 2. Prepare transcript
  // Limit to reasonable amount if somehow 100s of messages
  const batch = messages.slice(-50) // Safe upper limit
  const transcript = batch.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n')

  // 3. Analyze with Gemini
  const systemPrompt = `
    Tu es "Le Veilleur" du système Sophia.
    Ton rôle est d'analyser ce lot de messages récents pour en extraire des "Pépites" (Insights clés) sur l'utilisateur.
    
    Une Pépite c'est :
    - Une info FACTUELLE (ex: "Il fait du tennis le mardi", "Vit à Paris", "En couple").
    - Une info ÉMOTIONNELLE ou PSYCHOLOGIQUE récurrente (ex: "Souvent anxieux le soir", "Motivation intrinsèque forte").
    - Une préférence ou contrainte (ex: "N'aime pas les notifications", "Préfère le tutoiement").
    - Un objectif ou projet mentionné.

    N'invente rien. Si rien de pertinent, renvoie une liste vide.
    Sois concis et précis.
    
    SORTIE JSON ATTENDUE :
    {
      "insights": [
        "Insight 1...",
        "Insight 2..."
      ]
    }
  `

  try {
    const jsonStr = await generateWithGemini(systemPrompt, transcript, 0.2, true)
    const result = JSON.parse(jsonStr)
    const insights = result.insights || []

    console.log(`[Veilleur] Extracted ${insights.length} insights`)

    // 4. Vectorize and Store
    for (const insight of insights) {
      try {
        const embedding = await generateEmbedding(insight)
        
        await supabase.from('memories').insert({
          user_id: userId,
          content: insight,
          type: 'insight',
          source_type: 'chat',
          source_id: `batch_${new Date().toISOString()}`,
          embedding
        })
      } catch (embError) {
        console.error(`[Veilleur] Error embedding insight: "${insight}"`, embError)
      }
    }

  } catch (err) {
    console.error('[Veilleur] Error processing batch:', err)
  }
}

