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
    const { responses, currentAxis } = await req.json()

    // 1. Préparation du prompt
    // On filtre un peu les réponses pour ne garder que ce qui semble pertinent si possible, 
    // ou on envoie tout le bloc si c'est pas trop gros. 
    // Ici on assume que 'responses' contient tout le questionnaire.

    const systemPrompt = `
      Tu es Sophia, une IA empathique et perspicace.
      Ton rôle est de rassurer l'utilisateur en lui montrant que tu as parfaitement compris sa situation avant de construire son plan d'action.

      TA MISSION :
      Analyser les réponses de l'utilisateur au questionnaire (concernant l'axe "${currentAxis.title}") et rédiger un court résumé (4-5 lignes maximum) qui synthétise sa situation actuelle.

      TON STYLE :
      - Direct, empathique, mais sans jugement.
      - Utilise "Tu".
      - Montre que tu as saisi les nuances (pas juste "tu dors mal", mais "tu as du mal à décrocher le soir à cause du stress...").
      - Ne propose PAS de solutions maintenant. Fais juste le constat "miroir".

      FORMAT DE RÉPONSE (TEXTE BRUT) :
      Juste le paragraphe de résumé. Pas de guillemets, pas de "Voici le résumé".
    `

    const userPrompt = `
      CONTEXTE : L'utilisateur veut travailler sur : ${currentAxis.title} (Thème: ${currentAxis.theme}).
      
      SES RÉPONSES AU QUESTIONNAIRE :
      ${JSON.stringify(responses)}

      Fais le résumé "Ce que je sais de toi" maintenant.
    `

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
    if (!GEMINI_API_KEY) {
      throw new Error('Clé API manquante')
    }

    // 2. Appel Gemini
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt + "\n\n" + userPrompt }] }],
          generationConfig: { responseMimeType: "text/plain" }
        })
      }
    )

    const data = await response.json()

    if (!response.ok) {
         console.error("Gemini Error:", JSON.stringify(data));
         throw new Error(`Gemini Error: ${data.error?.message || 'Unknown error'}`);
    }

    const summary = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!summary) throw new Error('Réponse vide de Gemini')

    return new Response(
      JSON.stringify({ summary }),
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

