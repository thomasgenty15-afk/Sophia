import { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { normalizeScope } from '../state-manager.ts' // Need access to state

export async function runWatcher(
  supabase: SupabaseClient, 
  userId: string, 
  scopeRaw: unknown,
  lastProcessedAt: string,
  meta?: { requestId?: string; forceRealAi?: boolean; channel?: "web" | "whatsapp"; model?: string; scope?: string }
) {
  const watcherDisabled =
    (Deno.env.get("SOPHIA_WATCHER_DISABLED") ?? "").trim() === "1" ||
    (Deno.env.get("SOPHIA_VEILLEUR_DISABLED") ?? "").trim() === "1"
  if (watcherDisabled) return

  const channel = meta?.channel ?? "web"
  const scope = normalizeScope(scopeRaw ?? meta?.scope, channel === "whatsapp" ? "whatsapp" : "web")
  console.log(`[Veilleur] Triggered for user ${userId} scope=${scope}`)

  // Fetch messages since last_processed_at (watcher scope: punctual checkins/signals only)
  const { data: messages, error } = await supabase
    .from('chat_messages')
    .select('role, content, created_at')
    .eq('user_id', userId)
    .eq('scope', scope)
    .gt('created_at', lastProcessedAt)
    .order('created_at', { ascending: true })

  if (error || !messages || messages.length === 0) {
    console.log('[Veilleur] No new messages found or error', error)
    return
  }

  // 3. Prepare transcript (kept for future punctual checkin detection)
  const batch = messages.slice(-50) // Safe upper limit
  const transcript = batch.map((m: any) => `${m.role.toUpperCase()}: ${m.content}`).join('\n')
  void transcript

  // Deterministic mode (MEGA): keep behavior stable for integration tests.
  const megaRaw = (Deno.env.get("MEGA_TEST_MODE") ?? "").trim();
  const isLocalSupabase =
    (Deno.env.get("SUPABASE_INTERNAL_HOST_PORT") ?? "").trim() === "54321" ||
    (Deno.env.get("SUPABASE_URL") ?? "").includes("http://kong:8000");
  const megaEnabled = megaRaw === "1" || (megaRaw === "" && isLocalSupabase);

  if (megaEnabled) {
    const archiveText = `MEGA_TEST_STUB: archive (${batch.length} msgs)`;
    console.log(`[Veilleur] MEGA stub: watcher only (${archiveText}).`);
    return;
  }

  // Watcher no longer handles topic memory nor short-term synthesis.
  // It is reserved for punctual checkin/event detection.
  // (Current implementation is intentionally no-op until that dedicated logic lands.)
  console.log(`[Veilleur] watcher-only mode: no topic-memory processing for user=${userId} scope=${scope}`)
}
