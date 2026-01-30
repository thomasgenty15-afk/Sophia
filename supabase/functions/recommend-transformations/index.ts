import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { generateWithGemini } from "../_shared/gemini.ts"
import { logEdgeFunctionError } from "../_shared/error-log.ts"
import { getRequestContext } from "../_shared/request_context.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type SeverityLevel = 1 | 2 | 3
type RecommendationPan = "habit" | "mindset" | "context"

type CatalogTheme = {
  id: string
  title?: string
  axes?: Array<{
    id: string
    title?: string
    description?: string
    problems?: Array<{ id: string; label?: string }>
  }>
}

type Recommendation = {
  themeId: string
  axisId: string
  axisTitle?: string
  problemIds?: string[]
  reasoning?: string
  pan?: RecommendationPan
}

type RecommendOutput = {
  severityLevel?: SeverityLevel
  severityRationale?: string
  recommendations: Recommendation[]
  globalMessage?: string
}

function clampSeverity(v: unknown): SeverityLevel {
  const n = Number(v)
  if (n === 1 || n === 2 || n === 3) return n
  return 2
}

function buildCatalogIndex(availableTransformations: CatalogTheme[]) {
  const themeById = new Map<string, CatalogTheme>()
  const axisById = new Map<string, { themeId: string; axis: NonNullable<CatalogTheme["axes"]>[number] }>()
  const problemsByAxisId = new Map<string, Set<string>>()

  for (const theme of availableTransformations ?? []) {
    if (!theme?.id) continue
    themeById.set(theme.id, theme)
    for (const axis of theme.axes ?? []) {
      if (!axis?.id) continue
      axisById.set(axis.id, { themeId: theme.id, axis })
      const set = new Set<string>()
      for (const p of axis.problems ?? []) {
        if (p?.id) set.add(p.id)
      }
      problemsByAxisId.set(axis.id, set)
    }
  }

  return { themeById, axisById, problemsByAxisId }
}

function sanitizeOutput(
  raw: any,
  index: ReturnType<typeof buildCatalogIndex>,
): { output: RecommendOutput; issues: string[]; targetCount: number } {
  const issues: string[] = []

  const recsIn = Array.isArray(raw?.recommendations) ? raw.recommendations : []
  const inferredSeverity = recsIn.length === 1 ? 1 : recsIn.length >= 3 ? 3 : 2
  const severityLevel = clampSeverity(raw?.severityLevel ?? inferredSeverity)
  const targetCount = severityLevel

  const seenThemes = new Set<string>()
  const seenPans = new Set<string>()
  const seenAxes = new Set<string>()

  const outRecs: Recommendation[] = []
  for (const r of recsIn) {
    const axisId = String(r?.axisId ?? "")
    if (!axisId || !index.axisById.has(axisId)) {
      issues.push(`axisId invalide: ${axisId || "<vide>"}`)
      continue
    }

    if (seenAxes.has(axisId)) {
      issues.push(`axisId dupliqué: ${axisId}`)
      continue
    }

    const axisInfo = index.axisById.get(axisId)!
    const themeId = String(r?.themeId ?? axisInfo.themeId)
    const canonicalThemeId = axisInfo.themeId
    if (themeId !== canonicalThemeId) issues.push(`themeId corrigé pour axisId=${axisId}`)

    if (seenThemes.has(canonicalThemeId)) {
      issues.push(`themeId dupliqué: ${canonicalThemeId}`)
      continue
    }

    const pan = (r?.pan === "habit" || r?.pan === "mindset" || r?.pan === "context")
      ? (r.pan as RecommendationPan)
      : undefined
    if (!pan) {
      issues.push(`pan manquant/invalid pour axisId=${axisId}`)
    } else if (seenPans.has(pan)) {
      issues.push(`pan dupliqué: ${pan}`)
      continue
    }

    const axisTitle = String(r?.axisTitle ?? axisInfo.axis?.title ?? "")
    const reasoning = String(r?.reasoning ?? "").trim()
    if (!reasoning) issues.push(`reasoning manquant pour axisId=${axisId}`)

    const allowedProblems = index.problemsByAxisId.get(axisId) ?? new Set<string>()
    const problemIdsIn = Array.isArray(r?.problemIds) ? r.problemIds : []
    const problemIds = Array.from(
      new Set(
        problemIdsIn
          .map((x: any) => String(x))
          .filter((id: string) => allowedProblems.has(id)),
      ),
    ).slice(0, 2)
    if (problemIds.length > 2) issues.push(`trop de problemIds pour axisId=${axisId}`)

    outRecs.push({
      themeId: canonicalThemeId,
      axisId,
      axisTitle,
      problemIds,
      reasoning: reasoning || `Axe pertinent au vu de ta situation.`,
      pan,
    })
    seenThemes.add(canonicalThemeId)
    seenAxes.add(axisId)
    if (pan) seenPans.add(pan)
  }

  // Count enforcement (soft): we don't invent missing items here; we report issues.
  if (outRecs.length !== targetCount) {
    issues.push(`nombre de recos=${outRecs.length} attendu=${targetCount}`)
  }

  const globalMessage = typeof raw?.globalMessage === "string" ? raw.globalMessage : undefined
  const severityRationale = typeof raw?.severityRationale === "string" ? raw.severityRationale : undefined

  return {
    output: {
      severityLevel,
      severityRationale,
      recommendations: outRecs,
      globalMessage,
    },
    issues,
    targetCount,
  }
}

serve(async (req) => {
  let ctx = getRequestContext(req)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // On lit le body. On ne vérifie PAS le JWT ici (on suppose que la fonction est déployée en --no-verify-jwt si besoin)
    // ou que le client envoie un token Anon valide.
    const body = await req.json().catch(() => ({} as any))
    ctx = getRequestContext(req, body)
    const { userAnswers, availableTransformations } = body as any

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

      OBJECTIF CRITIQUE : Commence par jauger la "gravité" et décider COMBIEN de transformations sont nécessaires (1, 2 ou 3). Ensuite seulement, choisis les axes.

      NIVEAUX DE GRAVITÉ (severityLevel) :
      - 1 = Problème étroit / habitude spécifique, sans cascade majeure (ex: "arrêter le chocolat"). -> 1 transformation.
      - 2 = Problème plus structurel (confiance, stress, discipline…), avec 2 pans complémentaires utiles. -> 2 transformations.
      - 3 = Situation lourde / multi-domaines (ex: harcèlement, deuil, surpoids sévère avec impacts, contexte très difficile). -> 3 transformations.

      RÈGLES DE SÉLECTION :
      1. Tu dois choisir EXACTEMENT severityLevel axes (1, 2 ou 3). Pas plus, pas moins.
      2. RÈGLE D'OR : Chaque transformation doit traiter un VRAI pan distinct (pas deux transformations pour le même sujet). Tu dois tagger chaque recommandation avec un "pan" unique :
         - "habit" = comportements / habitudes / routines.
         - "mindset" = émotions / confiance / croyances / identité.
         - "context" = environnement / relations / contraintes externes.
         Si severityLevel=2, choisis 2 pans différents. Si severityLevel=3, choisis les 3 pans (un de chaque).
      3. CONTRAINTE TECHNIQUE : Maximum 1 Axe par Thème (ThemeId). Tu ne peux pas choisir deux axes appartenant au même thème.
      4. Pour chaque Axe choisi, tu dois sélectionner les Problèmes (checkboxes) qui semblent correspondre à la situation de l'utilisateur.
         **ATTENTION : Sélectionne MAXIMUM 2 problèmes par axe. Choisis uniquement les plus pertinents.**
      5. Tes choix doivent être justifiés par la situation décrite par l'utilisateur.
      6. IMPORTANT : Base-toi UNIQUEMENT sur le catalogue fourni ci-dessous. N'invente pas d'axes en dehors de cette liste.

      FORMAT DE SORTIE (JSON STRICT) :
      {
        "severityLevel": 1,
        "severityRationale": "1 phrase courte expliquant pourquoi tu as choisi 1/2/3.",
        "recommendations": [
          {
            "themeId": "ID_DU_THEME",
            "axisId": "ID_DE_L_AXE",
            "axisTitle": "TITRE_DE_L_AXE",
            "problemIds": ["ID_PROBLEME_1", "ID_PROBLEME_2"], 
            "pan": "habit",
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

    const genOpts = {
      source: "recommend-transformations",
      // Force 2.5 first: we observed 3.0 flash preview can be slower / timeout in some environments.
      // Keep `generateWithGemini` fallback chain intact.
      model: "gemini-2.5-flash",
    } as const

    const index = buildCatalogIndex(availableTransformations as CatalogTheme[])

    async function callGemini(promptOverride?: { system?: string; user?: string }) {
      return await generateWithGemini(
        promptOverride?.system ?? systemPrompt,
        promptOverride?.user ?? userPrompt,
        0.7,
        true, // jsonMode
        [],
        "auto",
        genOpts, // No userId
      )
    }

    const resultStr = await callGemini()

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

    // Validation + repair pass if needed (keeps UX stable)
    let { output, issues, targetCount } = sanitizeOutput(result, index)
    if (issues.length > 0) {
      console.warn("[recommend-transformations] validation issues:", issues)
      // Only repair if we are missing count or duplicated pan/theme etc.
      if (issues.some((s) => s.includes("nombre de recos=") || s.includes("dupliqué") || s.includes("pan manquant"))) {
        const repairSystem = systemPrompt + `\n\nIMPORTANT: Tu dois corriger une sortie JSON invalide. Respecte STRICTEMENT le schéma et les règles.`
        const repairUser = `
Voici ta sortie précédente:
${JSON.stringify(result)}

Problèmes détectés:
${issues.map((s) => `- ${s}`).join("\n")}

Rappels non négociables:
- severityLevel = 1/2/3
- EXACTEMENT ${targetCount} recommandations
- pans distincts (habit/mindset/context) selon severityLevel
- 1 axe max par thème
- problemIds valides et max 2 par axe

Retourne uniquement un JSON STRICT corrigé.
`
        const repairedStr = await callGemini({ system: repairSystem, user: repairUser })
        if (typeof repairedStr === "string") {
          try {
            const repaired = JSON.parse(repairedStr)
            const second = sanitizeOutput(repaired, index)
            output = second.output
            issues = second.issues
          } catch (e) {
            console.error("[recommend-transformations] repair parse failed:", e, repairedStr)
          }
        }
      }
    }

    return new Response(
      JSON.stringify(output),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error(`[recommend-transformations] request_id=${ctx.requestId} user_id=${ctx.userId ?? "null"}`, error)
    await logEdgeFunctionError({
      functionName: "recommend-transformations",
      error,
      requestId: ctx.requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: { client_request_id: ctx.clientRequestId },
    })
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
