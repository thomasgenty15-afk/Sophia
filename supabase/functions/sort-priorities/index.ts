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
    const { axes } = await req.json()

    const systemPrompt = `
      Tu es Sophia, une intelligence artificielle experte en stratégie comportementale et en développement personnel.
      Ton rôle est d'analyser un ensemble de 3 problématiques (axes) identifiées chez un utilisateur et de déterminer l'ordre optimal pour les traiter.

      TA MISSION :
      Trier ces 3 axes dans l'ordre "Fondation" -> "Levier" -> "Optimisation" et expliquer pourquoi.

      DÉFINITIONS :
      1. LA FONDATION (N°1) : C'est le problème racine. S'il n'est pas réglé, les autres efforts seront vains. C'est souvent lié à l'énergie physique, au sommeil, ou à une charge mentale paralysante. C'est le "goulot d'étranglement".
      2. LE LEVIER (N°2) : C'est l'action qui aura le plus d'impact visible une fois la fondation posée. C'est souvent lié à l'organisation, la productivité ou les relations.
      3. L'OPTIMISATION (N°3) : C'est le raffinement. C'est aller chercher les derniers %, ou traiter des sujets importants mais moins urgents physiologiquement (ex: sens de la vie, créativité avancée).

      FORMAT DE RÉPONSE ATTENDU (JSON STRICT) :
      {
        "sortedAxes": [
          {
            "originalId": "ID_DU_AXE",
            "role": "foundation", // ou "lever" ou "optimization"
            "reasoning": "Phrase courte et percutante expliquant pourquoi c'est la fondation (ex: 'Impossible d'être productif si tu dors 4h par nuit')."
          },
          // ... les 2 autres
        ]
      }

      RÈGLES :
      - Tu dois renvoyer EXACTEMENT les 3 axes fournis, mais dans le nouvel ordre.
      - Le champ "reasoning" doit s'adresser directement à l'utilisateur ("tu").
    `

    const userPrompt = `
      Voici les 3 axes identifiés pour cet utilisateur (l'ordre actuel est arbitraire) :
      ${JSON.stringify(axes)}

      Classe-les maintenant du plus fondamental au plus "optimisation".
    `

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
    if (!GEMINI_API_KEY) {
      console.error("CRITICAL: GEMINI_API_KEY is missing from env vars.")
      throw new Error('Clé API manquante')
    }

    console.log("Calling Gemini API for sorting...")

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt + "\n\n" + userPrompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      }
    )

    const data = await response.json()
    
    // DEBUG LOGS
    console.log("Gemini Status:", response.status);
    if (!response.ok) {
        console.error("Gemini Error:", JSON.stringify(data));
        throw new Error(`Gemini Error: ${data.error?.message || 'Unknown error'}`);
    }

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!rawText) {
        console.error("Empty Candidate Response:", JSON.stringify(data));
        throw new Error('Réponse vide de Gemini (No candidates)')
    }
    
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
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

