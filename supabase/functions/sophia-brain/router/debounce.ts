import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"

export const DEFAULT_DEBOUNCE_WAIT_MS = 3500

export async function debounceAndBurstMerge(opts: {
  supabase: SupabaseClient
  userId: string
  scope: string
  loggedMessageId: string
  userMessage: string
  debounceWaitMs?: number
}): Promise<{ aborted: boolean; userMessage: string }> {
  const { supabase, userId, scope, loggedMessageId } = opts
  let userMessage = opts.userMessage
  const waitMs = opts.debounceWaitMs ?? DEFAULT_DEBOUNCE_WAIT_MS

  await new Promise((resolve) => setTimeout(resolve, waitMs))

  // Vérification : Suis-je toujours le dernier message user ?
  const { data: latestMsg } = await supabase
    .from("chat_messages")
    .select("id, created_at")
    .eq("user_id", userId)
    .eq("scope", scope)
    .eq("role", "user")
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  if (latestMsg && latestMsg.id !== loggedMessageId) {
    console.log(
      `[Router] 🛑 Race condition avoided. Current msg ${loggedMessageId} is older than latest ${latestMsg.id}. Aborting.`,
    )
    return { aborted: true, userMessage }
  }

  const now = new Date()
  const tenSecondsAgo = new Date(now.getTime() - 10000).toISOString()

  const { data: burstMessages } = await supabase
    .from("chat_messages")
    .select("content, created_at")
    .eq("user_id", userId)
    .eq("scope", scope)
    .eq("role", "user")
    .gte("created_at", tenSecondsAgo)
    .order("created_at", { ascending: true })

  if (burstMessages && burstMessages.length > 1) {
    const combinedContent = burstMessages.map((m: any) => m.content).join(" \n\n")
    console.log(`[Router] 🔗 Burst detected. Merging ${burstMessages.length} messages into one prompt.`)
    userMessage = combinedContent
  }

  return { aborted: false, userMessage }
}



