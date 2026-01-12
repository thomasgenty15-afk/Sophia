export function denoEnv(name: string): string | undefined {
  return (globalThis as any)?.Deno?.env?.get?.(name);
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function isMegaEnabled(): boolean {
  const megaRaw = (denoEnv("MEGA_TEST_MODE") ?? "").trim();
  const isLocalSupabase =
    (denoEnv("SUPABASE_INTERNAL_HOST_PORT") ?? "").trim() === "54321" ||
    (denoEnv("SUPABASE_URL") ?? "").includes("http://kong:8000");
  return megaRaw === "1" || (megaRaw === "" && isLocalSupabase);
}

export function makeNonce(): string {
  const rand = (globalThis.crypto as any)?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return String(rand).replace(/[^a-zA-Z0-9]/g, "").slice(0, 14);
}

export function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function backoffMs(attempt: number) {
  const base = 900;
  const max = 20_000;
  const exp = Math.min(max, base * Math.pow(2, attempt - 1));
  const jitter = Math.floor(Math.random() * 400);
  return Math.min(max, exp + jitter);
}

export function clampInt(n: unknown, min: number, max: number, fallback: number) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(v)));
}

export function randIntExclusive(max: number): number {
  const m = Math.max(1, Math.floor(max));
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return Number(buf[0] % m);
}

export function pickOne<T>(arr: T[]): T {
  return arr[randIntExclusive(arr.length)];
}

export function pickManyUnique<T>(arr: T[], count: number): T[] {
  const n = Math.max(0, Math.min(arr.length, Math.floor(count)));
  const copy = arr.slice();
  // Fisher–Yates shuffle (crypto-backed randomness via randIntExclusive)
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randIntExclusive(i + 1);
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy.slice(0, n);
}

export function looksAffirmative(text: string): boolean {
  const t = (text ?? "").toString().trim().toLowerCase();
  if (!t) return false;
  return /\b(oui|ouais|ok|okay|d'accord|dac|vas[- ]?y|go|let'?s go|carr[ée]|yep|yes)\b/i
    .test(t);
}

export function looksLikeCheckupIntent(text: string): boolean {
  const t = (text ?? "").toString();
  return /\b(check(?:up)?|bilan)\b/i.test(t);
}

export function isBilanCompletedFromChatState(chatState: any): boolean {
  const inv = (chatState as any)?.investigation_state;
  // Investigator marks completion by returning newState=null, which we persist as investigation_state=null.
  if (!inv) return true;
  const status = String(inv?.status ?? "").toLowerCase().trim();
  // Special eval-only: post-checkup finished marker.
  if (status === "post_checkup_done") return true;
  if (["done", "completed", "finished", "stopped", "cancelled", "canceled"].includes(status)) return true;
  const pending = Array.isArray(inv?.pending_items) ? inv.pending_items : null;
  const idx = Number(inv?.current_item_index ?? 0) || 0;
  if (pending && idx >= pending.length) return true;
  if (pending && pending.length === 0) return true;
  return false;
}

export function isUuidLike(v: unknown): boolean {
  const s = String(v ?? "");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(s);
}



