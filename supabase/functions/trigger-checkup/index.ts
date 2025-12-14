import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 1. Déterminer l'heure et le message
    // On utilise l'heure UTC. Paris = UTC+1 (Hiver) ou UTC+2 (Été).
    // Si on veut 9h Paris, c'est 8h UTC. Si on veut 21h Paris, c'est 20h UTC.
    // Mais ici on va être simple : on regarde l'heure du serveur (UTC souvent).
    
    const now = new Date()
    const hour = now.getHours()
    
    let message = ""
    let checkupType = ""

    // Logique simplifiée : 
    // Si appelé le matin (entre 6h et 11h) -> Checkup Matin
    // Si appelé le soir (entre 18h et 23h) -> Checkup Soir
    // Sinon -> Défaut (Soir) ou erreur ?
    
    // NOTE: pg_cron appellera ça à des heures précises.
    // Donc on peut se fier à l'heure d'appel.
    
    if (hour < 12) {
        checkupType = "morning"
        message = "Bonjour ! ☀️\nBien dormi ? On fait un petit point sur ta nuit ?"
    } else {
        checkupType = "evening"
        message = "Bonsoir ! 🌙\nC'est l'heure du bilan de la journée. Tu es dispo pour faire le point ?"
    }

    console.log(`Triggering ${checkupType} checkup at ${hour}h (Server Time)`)

    // 2. Récupérer les utilisateurs éligibles
    // On prend tous ceux qui ont un plan ACTIF.
    const { data: plans, error: plansError } = await supabase
        .from('user_plans')
        .select('user_id')
        .eq('status', 'active')

    if (plansError) throw plansError

    // Dédoublonner les user_ids
    const userIds = [...new Set(plans.map(p => p.user_id))]
    
    console.log(`Found ${userIds.length} users to notify.`)

    // 3. Envoyer le message
    const results = []
    
    for (const userId of userIds) {
        // Insérer le message en tant qu'assistant
        const { error: msgError } = await supabase
            .from('chat_messages')
            .insert({
                user_id: userId,
                role: 'assistant',
                content: message
            })
        
        if (msgError) {
            console.error(`Failed to notify user ${userId}:`, msgError)
            results.push({ userId, status: 'error', error: msgError })
        } else {
            results.push({ userId, status: 'sent' })
        }
    }

    return new Response(
      JSON.stringify({ 
          success: true, 
          type: checkupType, 
          count: results.filter(r => r.status === 'sent').length,
          details: results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

