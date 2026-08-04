export function isMemorizerWriteEnabled(fallback = true): boolean {
  try {
    const disabled = String(
      (globalThis as any)?.Deno?.env?.get?.("memory_v2_memorizer_disabled") ??
        "",
    ).trim().toLowerCase();
    if (
      disabled === "1" || disabled === "true" || disabled === "yes" ||
      disabled === "on"
    ) {
      return false;
    }
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

export function memorizerCostCapUserDayEur(): number | null {
  try {
    const raw = String(
      (globalThis as any)?.Deno?.env?.get?.(
        "memory_v2_memorizer_cost_cap_user_day_eur",
      ) ?? "0.60",
    ).trim();
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return 0.60;
  }
}
