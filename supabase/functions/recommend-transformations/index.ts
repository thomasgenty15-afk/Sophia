import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { generateWithGemini } from "../_shared/gemini.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Gestion du pre-flight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // On lit le body. On ne vérifie PAS le JWT ici (on suppose que la fonction est déployée en --no-verify-jwt si besoin)
    // ou que le client envoie un token Anon valide.
    const { userAnswers, availableTransformations } = await req.json()

    if (!userAnswers || !availableTransformations) {
        throw new Error('Données manquantes (userAnswers ou availableTransformations)');
    }

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
    if (!GEMINI_API_KEY) {
      throw new Error('Clé API Gemini manquante')
    }

    // On allège les données envoyées à Gemini
    const simplifiedCatalog = availableTransformations.map((theme: any) => ({
        id: theme.id,
        title: theme.title,
        axes: theme.axes?.map((axis: any) => ({
            id: axis.id,
            title: axis.title,
            description: axis.description,
            problems: axis.problems?.map((p: any) => ({
                id: p.id,
                label: p.label
            }))
        }))
    }));

    const systemPrompt = `
      Tu es Sophia, une IA "Architecte de vie" bienveillante, perspicace et pragmatique.
      Ton rôle est d'aider l'utilisateur à choisir ses transformations prioritaires (axes de travail) parmi un catalogue, en fonction de ses réponses à 3 questions introspectives.

      RÈGLES DE SÉLECTION :
      1. Tu dois choisir entre 1 et 3 Axes (Transformations) maximum au total.
      2. RÈGLE D'OR : Ne sélectionne QUE ce qui est vraiment prioritaire ("le cœur du sujet"). Mieux vaut choisir 1 ou 2 axes pertinents et impactants que de remplir les 3 slots pour rien. La qualité prime sur la quantité.
      3. CONTRAINTE TECHNIQUE : Maximum 1 Axe par Thème (ThemeId). Tu ne peux pas choisir deux axes appartenant au même thème (ex: deux axes 'REL_...').
      4. Pour chaque Axe choisi, tu dois sélectionner les Problèmes (checkboxes) qui semblent correspondre à la situation de l'utilisateur.
      5. Tes choix doivent être justifiés par la situation décrite par l'utilisateur.

      FORMAT DE SORTIE (JSON STRICT) :
      {
        "recommendations": [
          {
            "themeId": "ID_DU_THEME",
            "axisId": "ID_DE_L_AXE",
            "problemIds": ["ID_PROBLEME_1", "ID_PROBLEME_2"], 
            "reasoning": "Une phrase courte expliquant pourquoi cet axe est pertinent pour lui."
          }
        ],
        "globalMessage": "Un message chaleureux (max 3 phrases) expliquant ta stratégie globale. Tutoiement uniquement. Termine par un rappel clair : tu dois vérifier et compléter les détails (sous-questions)."
      }
    `

    const userPrompt = `
      CONTEXTE UTILISATEUR :
      1. Points à améliorer pour être heureux à 100% : "${userAnswers.improvement}"
      2. Obstacles identifiés : "${userAnswers.obstacles}"
      3. Autres infos importantes : "${userAnswers.other}"

      CATALOGUE DES TRANSFORMATIONS DISPONIBLES :
      ${JSON.stringify(simplifiedCatalog)}

      Analyse ces réponses et génère le JSON de recommandation.
    `

    console.log("Calling Gemini API...")

    const resultStr = await generateWithGemini(
      systemPrompt,
      userPrompt,
      0.7,
      true, // jsonMode
      [],
      "auto",
      { source: "recommend-transformations" } // No userId
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
        throw new Error("Unexpected tool call");
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
