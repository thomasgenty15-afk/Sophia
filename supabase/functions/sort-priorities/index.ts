import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { generateWithGemini } from "../_shared/gemini.ts"

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

    // Deterministic test mode (no network / no GEMINI_API_KEY required)
    const megaRaw = (Deno.env.get("MEGA_TEST_MODE") ?? "").trim()
    const isLocalSupabase =
      (Deno.env.get("SUPABASE_INTERNAL_HOST_PORT") ?? "").trim() === "54321" ||
      (Deno.env.get("SUPABASE_URL") ?? "").includes("http://kong:8000")
    if (megaRaw === "1" || (megaRaw === "" && isLocalSupabase)) {
      const roles = count === 1 ? ["foundation"] : count === 2 ? ["foundation", "lever"] : ["foundation", "lever", "optimization"];
      const sortedAxes = axes.map((a: any, i: number) => ({
        originalId: a.originalId ?? a.id ?? String(i),
        role: roles[Math.min(i, roles.length - 1)],
        reasoning: `MEGA_TEST_STUB: reasoning for ${a.title ?? a.axis_title ?? a.originalId ?? a.id ?? i}`,
      }));
      return new Response(JSON.stringify({ sortedAxes }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    
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

    const resultStr = await generateWithGemini(
      systemPrompt,
      userPrompt,
      0.7,
      true, // jsonMode
      [], 
      "auto",
      { source: "sort-priorities" } // No userId here as it might be pre-auth
    );

    let result;
    if (typeof resultStr === 'string') {
        try {
            result = JSON.parse(resultStr);
        } catch (e) {
            console.error("JSON Parse Error:", e, resultStr);
            throw new Error("Invalid JSON from Gemini");
        }
    } else {
        // Should not happen as we didn't pass tools
        throw new Error("Unexpected tool call response");
    }

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
