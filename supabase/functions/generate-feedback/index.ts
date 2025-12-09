import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { energyLevel, wins, block, ratings, nextFocus, history } = await req.json()

    const identityAligned = ratings[3] === 'yes' ? "Oui" : ratings[3] === 'mixed' ? "Moyen" : "Non";
    
    // Formatage de l'historique pour le prompt
    const historyText = history && history.length > 0 
      ? history.map((entry: any, i: number) => 
          `- Semaine -${i+1}: Énergie ${entry.energy_level}%, Alignement: ${entry.identity_alignment}`
        ).join('\n')
      : "Aucun historique disponible (C'est la première fois).";

    const systemPrompt = `
      Tu es Sophia, une coach de vie IA empathique, sage et perspicace.
      L'utilisateur vient de terminer sa "Table Ronde" hebdomadaire (bilan de la semaine).
      
      TA MISSION :
      Analyser ses réponses pour lui donner un feedback immédiat, encourageant et utile.
      Prends en compte l'historique des semaines précédentes pour noter les tendances (baisse d'énergie, maintien de l'alignement, etc.).
      
      TON :
      Bienveillant, calme, mais direct. Pas de phrases toutes faites ("C'est super"). Sois spécifique.
      
      SORTIE JSON ATTENDUE :
      {
        "feedback": "Un paragraphe (3-4 phrases) qui synthétise sa semaine. Connecte son niveau d'énergie avec ses victoires/blocages et l'historique récent.",
        "insight": "Une phrase percutante d'analyse (ex: 'Tu sembles tirer ton énergie de l'accomplissement, mais attention au coût émotionnel.').",
        "tip": "Un conseil court et actionnable pour sa priorité de la semaine prochaine."
      }
    `;

    const userPrompt = `
      DONNÉES DE LA SEMAINE :
      - Niveau d'énergie : ${energyLevel}/100
      - Victoires (Gratitude) : "${wins}"
      - Blocage majeur : "${block}"
      - Alignement Identitaire (A-t-il honoré ses standards ?) : ${identityAligned}
      - Priorité pour la semaine prochaine (Le Cap) : "${nextFocus}"
      
      HISTORIQUE (Dernières semaines) :
      ${historyText}
      
      Génère le feedback en JSON maintenant.
    `;

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
    if (!GEMINI_API_KEY) {
      throw new Error('Clé API Gemini manquante')
    }

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
        const errorData = await response.json();
        throw new Error(`Erreur Gemini: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json()
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text
    
    if (!rawText) throw new Error('Réponse vide de Gemini')

    const jsonString = rawText.replace(/```json\n?|```/g, '').trim()
    const result = JSON.parse(jsonString)

    return new Response(
      JSON.stringify(result),
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

