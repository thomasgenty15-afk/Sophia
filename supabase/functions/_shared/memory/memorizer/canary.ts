import { sha256Hex } from "./utils.ts";

export async function memoryV2CanaryBucket(userId: string): Promise<number> {
  const hash = await sha256Hex(String(userId ?? "").trim());
  const first = hash.slice(0, 8);
  return parseInt(first, 16) % 100;
}

export async function isMemoryV2WriteCanaryUser(
  userId: string,
  percentage = 5,
): Promise<boolean> {
  const pct = Math.max(0, Math.min(100, Math.floor(percentage)));
  return (await memoryV2CanaryBucket(userId)) < pct;
}

export function isMemorizerWriteEnabled(fallback = false): boolean {
  try {
    const raw = String(
      (globalThis as any)?.Deno?.env?.get?.("memory_v2_memorizer_enabled") ??
        "",
    ).trim().toLowerCase();
    if (!raw) return fallback;
    return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
  } catch {
    return fallback;
  }
}
