import { generateWithGemini } from "../../../_shared/gemini.ts"
import type {
  CheckupItem,
  GlobalCheckupItemState,
  GlobalCheckupState,
  InvestigationState,
} from "./types.ts"

type ExtractedItemCoverage = {
  item_id: string
  covered: boolean
  status: "completed" | "missed" | "partial" | "value" | "unclear" | "not_addressed"
  evidence?: string | null
  obstacle?: string | null
  value?: number | null
  confidence?: number
}

export type GlobalCheckupExtraction = {
  overall_tone?: "positive" | "mixed" | "difficult" | "unclear" | null
  energy_signal?: "high" | "medium" | "low" | "unclear" | null
  freeform_user_update?: string | null
  items?: ExtractedItemCoverage[]
}

function sanitizeConfidence(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

export function normalizeLite(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function spokenLabelForItem(item: CheckupItem): string {
  const rawTitle = String(item?.title ?? "").trim()
  const rawDesc = String(item?.description ?? "").trim()
  const title = rawTitle || rawDesc || ""
  if (!title) return "ce point"
  const t = normalizeLite(title)

  if (item?.type === "vital") {
    if (/ecran|screen|scroll|tiktok|instagram|youtube/i.test(t)) return "les écrans"
    if (/sommeil|dormi|nuit|coucher|reveil|réveil/i.test(t)) return "ta nuit"
    if (/endormissement|tete\s+sur\s+l.?oreiller|oreiller/i.test(t)) return "t'endormir"
    if (/energie|humeur|moral|forme|batterie/i.test(t)) return "ton énergie"
    if (/stress|anxieux|anxiete/i.test(t)) return "ton stress"
  }

  const words = title.split(/\s+/).filter(Boolean)
  return words.slice(0, 6).join(" ").trim() || "ce point"
}

export function initializeGlobalCheckupState(
  items: CheckupItem[],
  openingMode: "broad_open" | "continuation" = "broad_open",
): GlobalCheckupState {
  const itemStates: Record<string, GlobalCheckupItemState> = {}
  for (const item of items) {
    itemStates[item.id] = {
      item_id: item.id,
      covered: false,
      status: "not_addressed",
      confidence: 0,
      logged: false,
    }
  }
  return {
    opening_mode: openingMode,
    broad_opening_used: false,
    overall_tone: null,
    energy_signal: null,
    freeform_user_update: null,
    items: itemStates,
  }
}

export function mergeGlobalExtraction(
  state: InvestigationState,
  extraction: GlobalCheckupExtraction,
): InvestigationState {
  const current = state.temp_memory?.global_checkup_state ??
    initializeGlobalCheckupState(state.pending_items)
  const nextItems: Record<string, GlobalCheckupItemState> = { ...current.items }

  for (const entry of extraction.items ?? []) {
    const existing = nextItems[String(entry.item_id)] ?? {
      item_id: String(entry.item_id),
      covered: false,
      status: "not_addressed",
      confidence: 0,
      logged: false,
    }
    const covered = Boolean(entry.covered) &&
      ["completed", "missed", "partial", "value"].includes(String(entry.status))
    nextItems[String(entry.item_id)] = {
      ...existing,
      covered,
      status: entry.status,
      evidence: entry.evidence ?? existing.evidence ?? null,
      obstacle: entry.obstacle ?? existing.obstacle ?? null,
      value: Number.isFinite(Number(entry.value)) ? Number(entry.value) : existing.value ?? null,
      confidence: sanitizeConfidence(entry.confidence ?? existing.confidence),
    }
  }

  return {
    ...state,
    temp_memory: {
      ...(state.temp_memory ?? {}),
      global_checkup_state: {
        ...current,
        freeform_user_update: extraction.freeform_user_update ?? current.freeform_user_update ?? null,
        overall_tone: extraction.overall_tone ?? current.overall_tone ?? null,
        energy_signal: extraction.energy_signal ?? current.energy_signal ?? null,
        items: nextItems,
        last_extracted_at: new Date().toISOString(),
      },
    },
  }
}

export function markItemsLoggedInGlobalState(
  state: InvestigationState,
  itemIds: string[],
): InvestigationState {
  const current = state.temp_memory?.global_checkup_state
  if (!current || !Array.isArray(itemIds) || itemIds.length === 0) return state
  const nextItems = { ...current.items }
  for (const itemId of itemIds) {
    const existing = nextItems[itemId]
    if (!existing) continue
    nextItems[itemId] = { ...existing, covered: true, logged: true }
  }
  return {
    ...state,
    temp_memory: {
      ...(state.temp_memory ?? {}),
      global_checkup_state: {
        ...current,
        items: nextItems,
      },
    },
  }
}

export function getNextUncoveredItems(
  state: InvestigationState,
  limit = 2,
): CheckupItem[] {
  const globalState = state.temp_memory?.global_checkup_state
  const withCoverage = state.pending_items.filter((item) => {
    const itemState = globalState?.items?.[item.id]
    const isLogged = String(state.temp_memory?.item_progress?.[item.id]?.phase ?? "") === "logged"
    return !isLogged && !(itemState?.covered === true)
  })

  const typeOrder: Record<string, number> = { action: 0, vital: 1, framework: 2 }
  return withCoverage
    .slice()
    .sort((a, b) => (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99))
    .slice(0, Math.max(1, limit))
}

export function findFirstUnloggedIndex(state: InvestigationState): number {
  for (let i = 0; i < state.pending_items.length; i++) {
    const item = state.pending_items[i]
    const phase = String(state.temp_memory?.item_progress?.[item.id]?.phase ?? "")
    if (phase !== "logged") return i
  }
  return state.pending_items.length
}

export function buildBroadOpeningQuestion(): string {
  return "Comment ça s'est passé aujourd'hui ?"
}

export function buildGroupedFollowUpMessage(opts: {
  coveredItems: CheckupItem[]
  nextItems: CheckupItem[]
}): string {
  const coveredLabels = opts.coveredItems
    .slice(0, 2)
    .map((item) => spokenLabelForItem(item))
    .filter(Boolean)
  const nextLabels = opts.nextItems
    .slice(0, 2)
    .map((item) => spokenLabelForItem(item))
    .filter(Boolean)

  const coveredIntro = coveredLabels.length > 0
    ? `Ok, je vois pour ${coveredLabels.join(" et ")}. `
    : ""
  if (nextLabels.length === 0) return `${coveredIntro}C'est bon pour le point d'aujourd'hui 🙂`
  if (nextLabels.length === 1) return `${coveredIntro}Et pour ${nextLabels[0]}, ça a donné quoi ?`
  return `${coveredIntro}Et pour ${nextLabels[0]} et ${nextLabels[1]}, ça a donné quoi ?`
}

export function buildCompletedReactionMessage(items: CheckupItem[]): string {
  const labels = items.slice(0, 2).map((item) => spokenLabelForItem(item)).filter(Boolean)
  if (labels.length === 0) return ""
  if (labels.length === 1) return `Top pour ${labels[0]} 🙂`
  return `Top pour ${labels[0]} et ${labels[1]} 🙂`
}

export function buildMissedReasonQuestion(item: CheckupItem): string {
  return `Ok pour ${spokenLabelForItem(item)}. Qu'est-ce qui a coincé ?`
}

export async function extractGlobalCheckupCoverage(opts: {
  message: string
  items: CheckupItem[]
  history: any[]
  meta?: { requestId?: string; forceRealAi?: boolean; model?: string }
}): Promise<GlobalCheckupExtraction> {
  const message = String(opts.message ?? "").trim()
  if (message.length < 3) return {}

  const itemsBlock = opts.items.map((item) =>
    [
      `- id: ${item.id}`,
      `  type: ${item.type}`,
      `  title: ${item.title}`,
      `  description: ${item.description ?? ""}`,
      `  tracking_type: ${item.tracking_type}`,
      `  unit: ${item.unit ?? ""}`,
      `  day_scope: ${item.day_scope ?? ""}`,
    ].join("\n")
  ).join("\n")

  const historyBlock = (opts.history ?? [])
    .slice(-8)
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n")

  const prompt = `
Tu extrais un état global de bilan quotidien à partir d'une réponse libre utilisateur.

OBJECTIF:
- Détecter les items explicitement couverts par le message.
- Un item est covered=true UNIQUEMENT si on sait clairement s'il est fait / pas fait / partiel, ou si une valeur numérique a été donnée pour un vital.
- Si le message parle d'un item mais sans statut décidable, mets status="unclear" et covered=false.
- N'invente rien. Si ce n'est pas mentionné assez clairement, n'extrais pas l'item.

IMPORTANT:
- Les réponses vagues "oui", "non", "les deux", "comme d'hab" sans sujet explicite NE DOIVENT PAS être projetées sur plusieurs items.
- Pour les vitals, utilise status="value" si une valeur est donnée.
- Pour les actions/frameworks: status in {"completed","missed","partial","unclear"}.
- Retourne uniquement du JSON valide.

JSON attendu:
{
  "overall_tone": "positive" | "mixed" | "difficult" | "unclear" | null,
  "energy_signal": "high" | "medium" | "low" | "unclear" | null,
  "freeform_user_update": string | null,
  "items": [
    {
      "item_id": string,
      "covered": boolean,
      "status": "completed" | "missed" | "partial" | "value" | "unclear" | "not_addressed",
      "value": number | null,
      "evidence": string | null,
      "obstacle": string | null,
      "confidence": number
    }
  ]
}

ITEMS EN ATTENTE:
${itemsBlock}

HISTORIQUE RÉCENT:
${historyBlock}
`.trim()

  try {
    const raw = await generateWithGemini(
      prompt,
      message,
      0.1,
      true,
      [],
      "auto",
      {
        requestId: opts.meta?.requestId,
        model: opts.meta?.model,
        source: "sophia-brain:investigator:global-coverage",
        forceRealAi: opts.meta?.forceRealAi,
      },
    )
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw
    return {
      overall_tone: parsed?.overall_tone ?? null,
      energy_signal: parsed?.energy_signal ?? null,
      freeform_user_update: parsed?.freeform_user_update ?? message,
      items: Array.isArray(parsed?.items)
        ? parsed.items
          .map((item: any) => ({
            item_id: String(item?.item_id ?? "").trim(),
            covered: Boolean(item?.covered),
            status: String(item?.status ?? "unclear") as ExtractedItemCoverage["status"],
            value: Number.isFinite(Number(item?.value)) ? Number(item.value) : null,
            evidence: typeof item?.evidence === "string" ? item.evidence : null,
            obstacle: typeof item?.obstacle === "string" ? item.obstacle : null,
            confidence: sanitizeConfidence(item?.confidence),
          }))
          .filter((item: ExtractedItemCoverage) => item.item_id.length > 0)
        : [],
    }
  } catch (error) {
    console.warn("[Investigator] global coverage extraction failed (non-blocking):", error)
    return {
      freeform_user_update: message,
      items: [],
    }
  }
}
