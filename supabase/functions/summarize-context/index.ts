import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { logEdgeFunctionError } from "../_shared/error-log.ts"
import { getRequestContext } from "../_shared/request_context.ts"
import { generateWithGemini } from "../_shared/gemini.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-request-id, x-client-request-id, x-sophia-client-request-id',
}

serve(async (req) => {
  let ctx = getRequestContext(req)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({} as any))
    ctx = getRequestContext(req, body)
    console.log(`[summarize-context] request_id=${ctx.requestId} user_id=${ctx.userId ?? "null"} START`)
    const { responses, currentAxis, mode } = body as any
    const isRecraftMode = mode === 'recraft'
    console.log(`[summarize-context] request_id=${ctx.requestId} currentAxis=${currentAxis?.title ?? "—"} mode=${mode ?? 'standard'}`)

    // Deterministic test mode (no network / no GEMINI_API_KEY required)
    const megaRaw = (Deno.env.get("MEGA_TEST_MODE") ?? "").trim()
    const isLocalSupabase =
      (Deno.env.get("SUPABASE_INTERNAL_HOST_PORT") ?? "").trim() === "54321" ||
      (Deno.env.get("SUPABASE_URL") ?? "").includes("http://kong:8000")
    if (megaRaw === "1" || (megaRaw === "" && isLocalSupabase)) {
      return new Response(
        JSON.stringify({
          summary: `MEGA_TEST_STUB: résumé pour ${currentAxis?.title ?? "axe"}`,
          suggested_pacing: {
            id: "balanced",
            reason: "MEGA_TEST_STUB: rythme progressif par défaut en mode test.",
          },
          examples: {
            why: [
              "MEGA_TEST_STUB: Je veux changer parce que ça pèse sur mon quotidien et mon humeur.",
              "MEGA_TEST_STUB: Je veux retrouver de la stabilité et arrêter de subir ce sujet.",
              "MEGA_TEST_STUB: J’en ai assez de me sentir bloqué(e) et je veux des progrès concrets.",
            ],
            blockers: [
              "MEGA_TEST_STUB: Je manque d’énergie et je pars trop vite puis j’abandonne.",
              "MEGA_TEST_STUB: Je me décourage quand je ne vois pas de résultat immédiat.",
              "MEGA_TEST_STUB: Je ne sais pas quoi faire exactement, donc je procrastine.",
            ],
            actions_good_for_me: [
              "MEGA_TEST_STUB: Une marche de 15 min m’aide à retrouver de l’énergie.",
              "MEGA_TEST_STUB: Écrire 3 lignes chaque soir m’apaise vraiment.",
              "MEGA_TEST_STUB: Préparer mes affaires la veille me met en mouvement.",
            ],
          },
        }),
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
    const assistantContext = (responses as any)?.assistant_context || (responses as any)?.assistantContext || null;

    if (!contextData) {
        throw new Error("Impossible de trouver des données contextuelles à résumer.");
    }

    // Questions adaptées selon le mode
    const questionLabels = isRecraftMode ? {
      why: "Pourquoi ce changement de plan ? (Qu'est-ce qui n'a pas marché ?)",
      blockers: "Nouveaux blocages ou contraintes ?",
      actions_good_for_me: "Quelles sont les actions qui auraient le plus d'impact et qui te viennent à l'esprit ?",
    } : {
      why: "Pourquoi est-ce important pour toi aujourd'hui ?",
      blockers: "Quels sont les vrais blocages (honnêtement) ?",
      actions_good_for_me: "Quelles sont les actions qui auraient le plus d'impact et qui te viennent à l'esprit ?",
    }

    const examplesInstructions = isRecraftMode
      ? `3) Générer 2 exemples PERCUTANTS par question pour aider l'utilisateur à remplir 3 questions:
         - why: "${questionLabels.why}" → Exemples orientés "échec du plan précédent", "ce qui n'a pas fonctionné", "nouvelle situation"
         - blockers: "${questionLabels.blockers}" → Exemples orientés "nouvelles contraintes", "obstacles découverts"
         - actions_good_for_me: "${questionLabels.actions_good_for_me}" → Exemples d'actions concrètes déjà efficaces pour lui/elle`
      : `3) Générer 2 exemples PERCUTANTS par question pour aider l'utilisateur à remplir 3 questions:
         - why: "${questionLabels.why}"
         - blockers: "${questionLabels.blockers}"
         - actions_good_for_me: "${questionLabels.actions_good_for_me}"`

    const jsonSchema = isRecraftMode
      ? `{
        "summary": string,
        "suggested_pacing": { "id": "fast"|"balanced"|"slow", "reason": string },
        "examples": { "why": string[], "blockers": string[], "actions_good_for_me": string[] }
      }`
      : `{
        "summary": string,
        "suggested_pacing": { "id": "fast"|"balanced"|"slow", "reason": string },
        "examples": { "why": string[], "blockers": string[], "actions_good_for_me": string[] }
      }`

    const systemPrompt = `
      Tu es Sophia, une IA empathique et perspicace.
      ${isRecraftMode 
        ? `L'utilisateur revient pour REFAIRE son plan d'action car le précédent n'a pas fonctionné. Ton rôle est de comprendre ce qui a échoué et de l'aider à repartir sur de bonnes bases pour l'objectif : "${currentAxis.title}".`
        : `Ton rôle est de rassurer l'utilisateur en lui montrant que tu as parfaitement compris sa situation avant de construire son plan d'action pour l'objectif : "${currentAxis.title}".`
      }

      TA MISSION :
      1) Produire un résumé "miroir" (3-4 phrases denses) qui synthétise sa situation actuelle${isRecraftMode ? ' et ce qui semble avoir bloqué' : ''}.
      2) Proposer un rythme conseillé :
         - PAR DÉFAUT : "fast" (1 mois). C'est le standard pour garder la motivation.
         - "balanced" (2 mois) : UNIQUEMENT si l'utilisateur mentionne explicitement vouloir y aller doucement ou a un emploi du temps très chargé.
         - "slow" (3 mois) : UNIQUEMENT pour des cas très lourds (trauma, burnout avéré).
      ${examplesInstructions}

      CONTRAINTES IMPORTANTES :
      - N'invente pas de détails factuels. Si une info manque, fais une proposition générique clairement "à adapter".
      - Les exemples doivent être COURTS (max 15 mots), style "Je...", impactants.
      - PAS DE BLA-BLA. Droit au but.
      - Le résumé reste en "Tu..." (comme aujourd'hui).

      FORMAT DE RÉPONSE : JSON STRICT (pas de markdown, pas de texte autour).
      Schéma:
      ${jsonSchema}
    `

    const userPrompt = `
      OBJECTIF CIBLE : ${currentAxis.title} (Thème: ${currentAxis.theme})

      ${assistantContext ? `CE QUE SOPHIA SAIT DÉJÀ (PRIORITÉ ÉLEVÉE) :
      ${JSON.stringify(assistantContext, null, 2)}
      ` : ""}
      
      DONNÉES UTILISATEUR (FILTRÉES POUR CET AXE) :
      ${JSON.stringify(contextData, null, 2)}

      Retourne le JSON demandé maintenant.
    `

    const SUMMARY_MODEL = (Deno.env.get("GLOBAL_AI_MODEL") ?? "").trim() || "gemini-2.5-flash"
    const raw = await generateWithGemini(
      systemPrompt,
      userPrompt,
      0.3,
      true,
      [],
      "auto",
      {
        requestId: ctx.requestId,
        model: SUMMARY_MODEL,
        source: "summarize-context",
        userId: ctx.userId ?? undefined,
      },
    )
    if (typeof raw !== "string") throw new Error("Réponse invalide de Gemini")
    if (!raw) {
        console.error("❌ No summary in response");
        throw new Error('Réponse vide de Gemini')
    }

    // Parse JSON (robust fallback to previous behavior)
    let parsed: any = null
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = null
    }

    const summary = (parsed && typeof parsed === "object" && typeof parsed.summary === "string")
      ? parsed.summary
      : raw

    const suggested_pacing =
      parsed?.suggested_pacing && typeof parsed.suggested_pacing === "object"
        ? parsed.suggested_pacing
        : undefined

    const examples =
      parsed?.examples && typeof parsed.examples === "object"
        ? parsed.examples
        : undefined

    console.log("✅ Summary generated successfully");
    return new Response(
        JSON.stringify({ summary, suggested_pacing, examples }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error(`[summarize-context] request_id=${ctx.requestId} user_id=${ctx.userId ?? "null"} ERROR`, error)
    await logEdgeFunctionError({
      functionName: "summarize-context",
      error,
      requestId: ctx.requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: { client_request_id: ctx.clientRequestId },
    })
    // On renvoie 200 pour faciliter la lecture du message d'erreur côté client
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  }
})
