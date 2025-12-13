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
    const { action, problem, plan, submissionId } = await req.json()

    // 1. Initialize Supabase Client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 2. Fetch Context (Inputs) if submissionId is available
    let contextData = {
        why: "",
        blockers: "",
        context: "",
        recraftReason: "",
        recraftChallenges: ""
    };

    if (submissionId) {
        // Fetch user_answers to get the inputs
        // We look for 'onboarding' or 'global_plan' associated with this submission
        const { data: answersData, error } = await supabase
            .from('user_answers')
            .select('content')
            .eq('submission_id', submissionId)
            .maybeSingle();
        
        if (!error && answersData?.content) {
            // The structure of content depends on how it was saved. 
            // Usually it has inputs: { why, blockers, context ... } or structured_data
            // Based on generate-plan, inputs are often passed directly, but here we need to find them.
            // In Recraft.tsx, we saw `responses` structure.
            // Let's try to find common fields.
            
            const c = answersData.content;
            // Try to extract standard inputs if they exist at root or in structured objects
            // This is a best-effort extraction
            contextData.why = c.why || c.inputs?.why || "";
            contextData.blockers = c.blockers || c.inputs?.blockers || "";
            contextData.context = c.context || c.inputs?.context || "";
            
            // If it was a recraft, maybe we have specific fields
            if (c.recraftReason) contextData.recraftReason = c.recraftReason;
            if (c.recraftChallenges) contextData.recraftChallenges = c.recraftChallenges;
        }
    }

    // 3. Build Prompt
    const systemPrompt = `
      Tu es Sophia, une coach experte en déblocage comportemental.
      Ta mission est d'aider un utilisateur coincé sur une action précise.
      Tu dois générer UNE SEULE action intermédiaire ("Step") pour débloquer la situation.
      
      Cette action doit être :
      - Plus petite et plus facile que l'action bloquante.
      - Immédiatement réalisable.
      - Une "passerelle" psychologique pour contourner la résistance.

      TYPES D'ACTIONS (RAPPEL STRICT) :
      - "mission" : Action ponctuelle concrète (ex: "Préparer ses affaires", "Mettre le réveil").
      - "habitude" : Action répétitive ou rituel (ex: "Respirer 3 fois", "Boire un verre d'eau").
      - "framework" : Exercice d'ÉCRITURE uniquement (ex: "Lister 3 peurs"). Si pas d'écriture, ce n'est PAS un framework.
      
      Format de sortie : JSON UNIQUEMENT.
      Structure :
      {
        "title": "Titre de l'action (Court et impactant)",
        "description": "Description précise de ce qu'il faut faire",
        "questType": "side", 
        "type": "mission" (ou "habitude" / "framework"),
        "tracking_type": "boolean" (ou "counter"), // OBLIGATOIRE
        "time_of_day": "morning" (ou "afternoon", "evening", "night", "any_time"), // OBLIGATOIRE
        "targetReps": 1 (Nombre de fois si habitude, sinon 1),
        "tips": "Un conseil rapide",
        "rationale": "Pourquoi ça va marcher (explication neuro/psycho)",
        // Si type = framework, ajouter frameworkDetails comme d'habitude
        "frameworkDetails": { ... } 
      }
    `;

    const userPrompt = `
      CONTEXTE DU PLAN :
      - Identité visée : "${plan?.identity || 'Non définie'}"
      - Motivation profonde : "${plan?.deepWhy || contextData.why || 'Non définie'}"
      - Règles d'or : "${plan?.goldenRules || 'Non définies'}"
      
      CONTEXTE UTILISATEUR (Si dispo) :
      - Contexte initial : "${contextData.context}"
      - Blocages connus : "${contextData.blockers}"
      ${contextData.recraftReason ? `- Raison du Recraft précédent : "${contextData.recraftReason}"` : ''}
      ${contextData.recraftChallenges ? `- Challenges du Recraft : "${contextData.recraftChallenges}"` : ''}
      
      L'ACTION BLOQUANTE :
      - Titre : "${action.title}"
      - Description : "${action.description}"
      
      LE PROBLÈME (INPUT UTILISATEUR) :
      "${problem}"
      
      TA MISSION :
      Génère une action intermédiaire intelligente pour débloquer ça.
      Si l'utilisateur dit "J'ai pas le temps", propose un truc de 2 minutes.
      Si c'est "J'ai peur", propose une étape de préparation ou de visualisation.
      Si c'est "C'est trop dur", découpe en une étape ridiculeusement simple.
      
      Réponds uniquement avec le JSON de la nouvelle action.
    `;

    // 4. Call Gemini API
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing')

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt + "\n\n" + userPrompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      }
    )

    if (!response.ok) {
        const errData = await response.json();
        throw new Error(`Gemini Error: ${errData.error?.message || response.statusText}`);
    }

    const data = await response.json()
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text
    
    if (!rawText) throw new Error('Empty response from Gemini')
    
    const jsonString = rawText.replace(/```json\n?|```/g, '').trim()
    const newActionData = JSON.parse(jsonString)

    // Add ID and default fields
    const finalAction = {
        id: `inter_${Date.now()}`,
        ...newActionData,
        isCompleted: false,
        status: 'active' // Default to active so it shows up
    }

    return new Response(
      JSON.stringify(finalAction),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  }
})

