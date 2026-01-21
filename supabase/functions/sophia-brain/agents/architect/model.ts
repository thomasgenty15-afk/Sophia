import { generateWithGemini } from "../../../_shared/gemini.ts"
import type { ArchitectModelOutput } from "./types.ts"
import { looksLikeExplicitCreateActionRequest } from "./consent.ts"

export const defaultArchitectModelForRequestId = (requestId?: string): string => {
  const rid = String(requestId ?? "")
  const isEvalLike = rid.includes(":tools:") || rid.includes(":eval")
  return isEvalLike ? "gemini-2.5-flash" : "gemini-3-flash-preview"
}

export async function generateArchitectModelOutput(opts: {
  systemPrompt: string
  message: string
  history: any[]
  tools: any[]
  meta?: { requestId?: string; forceRealAi?: boolean; channel?: "web" | "whatsapp"; model?: string; temperature?: number }
}): Promise<ArchitectModelOutput> {
  const historyText = (opts.history ?? []).slice(-5).map((m: any) => `${m.role}: ${m.content}`).join("\n")
  const temperature = Number.isFinite(Number(opts.meta?.temperature)) ? Number(opts.meta?.temperature) : 0.7
  const toolChoice = looksLikeExplicitCreateActionRequest(opts.message) ? "any" : "auto"
  const response = await generateWithGemini(
    opts.systemPrompt,
    `Historique:\n${historyText}\n\nUser: ${opts.message}`,
    temperature,
    false,
    opts.tools,
    toolChoice,
    {
      requestId: opts.meta?.requestId,
      model: opts.meta?.model ?? defaultArchitectModelForRequestId(opts.meta?.requestId),
      source: "sophia-brain:architect",
      forceRealAi: opts.meta?.forceRealAi,
    },
  )
  return response as any
}


