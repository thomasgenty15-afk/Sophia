import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3"
import { processMessage } from "../sophia-brain/router.ts"
import { sendWhatsAppText } from "./wa_whatsapp_api.ts"
import { loadHistory } from "./wa_db.ts"

function buildWhatsappOnboardingGuard(params: { onboardingStartedAtIso: string | null }) {
  const started = (params.onboardingStartedAtIso ?? "").trim()
  if (!started) return { active: false, block: "" }
  const ts = new Date(started).getTime()
  if (!Number.isFinite(ts)) return { active: false, block: "" }
  const within24h = Date.now() - ts >= 0 && Date.now() - ts < 24 * 60 * 60 * 1000
  if (!within24h) return { active: false, block: "" }

  const block =
    `=== WHATSAPP GUARDRAIL (CRITIQUE) ===\n` +
    `WHATSAPP_ONBOARDING_GUARD_24H=true\n` +
    `whatsapp_onboarding_started_at=${started}\n\n` +
    `RÈGLES ABSOLUES (pendant 24h après le début de l'onboarding WhatsApp):\n` +
    `- Interdiction de dire/insinuer qu'une action/exercice/framework/phase est "activé(e)", "débloqué(e)", "lancé(e)", "maintenant actif(ve)".\n` +
    `- Interdiction d'annoncer des changements de plan ("j'ai activé", "c'est officiel", "je viens d'activer").\n` +
    `- Sur WhatsApp, tu peux COACHER et proposer des pas concrets, mais la (dés)activation d'actions se fait uniquement sur le dashboard.\n` +
    `- Formulations autorisées: "On va commencer par...", "Je te propose...", "Ta prochaine étape est...", "Dans ton plan, l'étape suivante s'appelle..."\n` +
    `- Si l'utilisateur demande d'activer: réponds que tu ne peux pas activer via WhatsApp, et guide vers le dashboard.\n`

  return { active: true, block }
}

export async function replyWithBrain(params: {
  admin: SupabaseClient
  userId: string
  fromE164: string
  inboundText: string
  requestId: string
  replyToWaMessageId?: string | null
  contextOverride: string
  whatsappMode?: "onboarding" | "normal"
  forceMode?: "companion" | "architect" | "assistant" | "investigator" | "firefighter" | "sentry"
  purpose?: string
}) {
  const scope = "whatsapp"
  const history = await loadHistory(params.admin, params.userId, 20, scope)
  const { data: prof } = await params.admin
    .from("profiles")
    .select("whatsapp_onboarding_started_at")
    .eq("id", params.userId)
    .maybeSingle()

  const guard = buildWhatsappOnboardingGuard({
    onboardingStartedAtIso: (prof as any)?.whatsapp_onboarding_started_at ?? null,
  })
  const contextOverride = [guard.block, params.contextOverride]
    .filter((s) => String(s ?? "").trim().length > 0)
    .join("\n\n")
  const brain = await processMessage(
    params.admin as any,
    params.userId,
    params.inboundText,
    history,
    { requestId: params.requestId, channel: "whatsapp", scope, whatsappMode: params.whatsappMode ?? "normal" },
    { logMessages: false, contextOverride, forceMode: params.forceMode },
  )
  const sendResp = await sendWhatsAppText(params.fromE164, brain.content)
  const outId = (sendResp as any)?.messages?.[0]?.id ?? null
  await params.admin.from("chat_messages").insert({
    user_id: params.userId,
    scope,
    role: "assistant",
    content: brain.content,
    agent_used: brain.mode,
    metadata: {
      channel: "whatsapp",
      wa_outbound_message_id: outId,
      is_proactive: false,
      reply_to_wa_message_id: params.replyToWaMessageId ?? null,
      purpose: params.purpose ?? "whatsapp_state_soft_brain_reply",
    },
  })
  return { brain, outId }
}


