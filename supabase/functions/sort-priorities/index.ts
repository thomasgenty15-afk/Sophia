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

    if (!axes || !Array.isArray(axes) || axes.length === 0) {
        throw new Error('Axes invalides ou vides');
    }

    const count = axes.length;
    
    let instructions = "";
    
    if (count === 1) {
        instructions = `
            CAS UNIQUE (1 AXE) :
            L'utilisateur a choisi un seul combat. C'est une excellente stratégie de focus.
            - Renvoie cet unique axe.
            - Role: "foundation"
            - Reasoning: Tu DOIS rédiger un message d'encouragement spécifique commençant par "Tu as décidé de choisir seulement une transformation, tu as raison c'est mieux de faire étape par étape, surtout que..." et complète avec les bénéfices globaux de travailler sur cet axe précis (${axes[0].title}). Sois bienveillante et motivante.
        `;
    } else if (count === 2) {
        instructions = `
            CAS DUO (2 AXES) :
            Trier ces 2 axes dans l'ordre "Fondation" -> "Levier".
            
            ROLES :
            1. LA FONDATION (N°1) : Le problème racine / urgence physiologique ou mentale.
            2. LE LEVIER (N°2) : L'action à fort impact une fois la fondation posée.
            
            Pour chaque axe, explique brièvement le choix dans "reasoning".
        `;
    } else {
        instructions = `
            CAS TRIO (3 AXES) :
            Trier ces 3 axes dans l'ordre "Fondation" -> "Levier" -> "Optimisation".
            
            ROLES :
            1. LA FONDATION (N°1) : Problème racine / urgence.
            2. LE LEVIER (N°2) : Fort impact, organisation, productivité.
            3. L'OPTIMISATION (N°3) : Raffinement, long terme.
            
            Pour chaque axe, explique brièvement le choix dans "reasoning".
        `;
    }

    const systemPrompt = `
      Tu es Sophia, une intelligence artificielle experte en stratégie comportementale et en développement personnel.
      Ton rôle est d'analyser les problématiques (axes) identifiées chez un utilisateur et de déterminer l'ordre optimal pour les traiter, ou de valider leur choix unique.

      ${instructions}

      FORMAT DE RÉPONSE ATTENDU (JSON STRICT) :
      {
        "sortedAxes": [
          {
            "originalId": "ID_DU_AXE",
            "role": "foundation", // ou "lever" ou "optimization"
            "reasoning": "Ton explication ou message d'encouragement ici."
          }
          // ... répéter pour chaque axe
        ]
      }

      RÈGLES :
      - Tu dois renvoyer EXACTEMENT les ${count} axe(s) fourni(s).
      - Le champ "reasoning" doit s'adresser directement à l'utilisateur ("tu").
    `

    const userPrompt = `
      Voici les ${count} axe(s) identifié(s) pour cet utilisateur :
      ${JSON.stringify(axes)}
      
      Génère la réponse JSON.
    `

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
    if (!GEMINI_API_KEY) {
      console.error("CRITICAL: GEMINI_API_KEY is missing from env vars.")
      throw new Error('Clé API manquante')
    }

    console.log(`Calling Gemini API for sorting (${count} axes)...`)

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
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
