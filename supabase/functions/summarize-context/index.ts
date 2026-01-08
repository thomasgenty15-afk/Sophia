import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { retryOn429 } from "../_shared/retry429.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log("🚀 START summarize-context");
    const { responses, currentAxis } = await req.json()
    console.log("📥 Body parsed, currentAxis:", currentAxis?.title);

    // Deterministic test mode (no network / no GEMINI_API_KEY required)
    const megaRaw = (Deno.env.get("MEGA_TEST_MODE") ?? "").trim()
    const isLocalSupabase =
      (Deno.env.get("SUPABASE_INTERNAL_HOST_PORT") ?? "").trim() === "54321" ||
      (Deno.env.get("SUPABASE_URL") ?? "").includes("http://kong:8000")
    if (megaRaw === "1" || (megaRaw === "" && isLocalSupabase)) {
      return new Response(
        JSON.stringify({ summary: `MEGA_TEST_STUB: résumé pour ${currentAxis?.title ?? "axe"}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 1. Filtrage Intelligent : On ne garde que les données de l'axe concerné
    // La structure attendue de 'responses.structured_data' est :
    // [ { theme_id, selected_axis: { id, title, problems: [...] } }, ... ]
    
    let axisSpecificData = null;
    let fallbackRawData = null;

    if (responses?.structured_data && Array.isArray(responses.structured_data)) {
        const targetData = responses.structured_data.find((item: any) => 
            item.selected_axis?.id === currentAxis.id || 
            item.theme_id === currentAxis.theme // Fallback thème si ID axe change
        );
        
        if (targetData) {
            console.log("🎯 Données ciblées trouvées pour l'axe:", targetData.selected_axis?.title);
            axisSpecificData = targetData;
        } else {
            console.warn("⚠️ Pas de données structurées trouvées pour cet axe spécifique. Utilisation du bloc complet.");
            fallbackRawData = responses.structured_data; // On envoie tout faute de mieux
        }
    } else {
        // Cas Legacy ou format inattendu
        fallbackRawData = responses;
    }

    const contextData = axisSpecificData || fallbackRawData;

    if (!contextData) {
        throw new Error("Impossible de trouver des données contextuelles à résumer.");
    }

    const systemPrompt = `
      Tu es Sophia, une IA empathique et perspicace.
      Ton rôle est de rassurer l'utilisateur en lui montrant que tu as parfaitement compris sa situation avant de construire son plan d'action pour l'objectif : "${currentAxis.title}".

      TA MISSION :
      Analyser UNIQUEMENT les réponses fournies ci-dessous (qui concernent spécifiquement cet axe) et rédiger un court résumé (3-4 phrases denses) qui synthétise sa situation actuelle.

      TON STYLE :
      - Direct ("Tu...").
      - Empathique mais analytique (fais des liens entre ses symptômes et ses blocages).
      - Montre que tu as lu les détails (ex: ne dis pas juste "tu as des problèmes de sommeil", dis "tes réveils nocturnes semblent liés à ton anxiété professionnelle...").
      - Ne propose PAS de solutions. Fais le constat.

      FORMAT DE RÉPONSE (TEXTE BRUT) :
      Juste le paragraphe de résumé. Pas de titre, pas de markdown.
    `

    const userPrompt = `
      OBJECTIF CIBLE : ${currentAxis.title} (Thème: ${currentAxis.theme})
      
      DONNÉES UTILISATEUR (FILTRÉES POUR CET AXE) :
      ${JSON.stringify(contextData, null, 2)}

      Fais le résumé "Miroir" maintenant.
    `

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
    if (!GEMINI_API_KEY) {
      console.error("❌ GEMINI_API_KEY missing");
      throw new Error('Clé API manquante')
    }

    // 2. Appel Gemini (Modèle 2.0 Flash) — retry 429 avec backoff (timeout 10s par tentative)
    const MAX_ATTEMPTS = 10; // ~50s max de retry pour le résumé
    let response: Response;
    let data: any;

    response = await retryOn429(
      async () => {
        // Timeout par requête (10s)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          console.log("⏰ Timeout Triggered (10s)");
          controller.abort();
        }, 10000);

        try {
          console.log(`📡 Calling Gemini API (Summary)...`);
          return await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: systemPrompt + "\n\n" + userPrompt }] }],
                generationConfig: { responseMimeType: "text/plain" }
              }),
              signal: controller.signal
            }
          );
        } catch (fetchError) {
          console.error("💥 Fetch Error Block:", fetchError);
          if (fetchError?.name === 'AbortError') {
            throw new Error('Gemini request timed out');
          }
          throw fetchError;
        } finally {
          clearTimeout(timeoutId);
        }
      },
      { maxAttempts: MAX_ATTEMPTS, delayMs: 5000 },
    );

    console.log("📨 Response received, status:", response.status);
    data = await response.json();

    if (!response.ok) {
            console.error("Gemini Error:", JSON.stringify(data));
            
            // GESTION ERREUR 429 (QUOTA EXCEEDED)
            if (response.status === 429) {
                throw new Error('Le cerveau de Sophia est en surchauffe (Quota atteint). Veuillez réessayer dans quelques minutes.')
            }
            
            throw new Error(`Gemini Error: ${data.error?.message || 'Unknown error'}`);
    }

    const summary = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!summary) {
        console.error("❌ No summary in response:", JSON.stringify(data));
        throw new Error('Réponse vide de Gemini')
    }

    console.log("✅ Summary generated successfully");
    return new Response(
        JSON.stringify({ summary }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('🔥 Final Error Catch:', error)
    // On renvoie 200 pour faciliter la lecture du message d'erreur côté client
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  }
})

