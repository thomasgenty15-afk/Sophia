export const DEFAULT_LOCALE = "fr-FR";
export const DEFAULT_TIMEZONE = "Europe/Paris";

export function detectBrowserTimezone(): string | null {
  try {
    const tz = Intl?.DateTimeFormat?.().resolvedOptions?.().timeZone;
    return typeof tz === "string" && tz.trim() ? tz : null;
  } catch {
    return null;
  }
}

function uniqKeepOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of items) {
    const v = (it ?? "").trim();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export function getAllSupportedTimezones(detected?: string | null): string[] {
  const common = [
    DEFAULT_TIMEZONE,
    "UTC",
    "Europe/London",
    "Europe/Brussels",
    "Europe/Zurich",
    "Europe/Berlin",
    "Europe/Madrid",
    "Europe/Rome",
    "America/New_York",
    "America/Los_Angeles",
    "America/Chicago",
    "America/Toronto",
    "America/Montreal",
    "Asia/Dubai",
    "Asia/Tokyo",
    "Asia/Singapore",
    "Australia/Sydney",
  ];

  // Modern browsers: Intl.supportedValuesOf('timeZone')
  try {
    const anyIntl = Intl as any;
    const list = anyIntl?.supportedValuesOf?.("timeZone");
    if (Array.isArray(list) && list.length) {
      const all = list.filter((x: any) => typeof x === "string" && x.trim());
      const region = detected ? detected.split("/")[0] : null;
      const regionMatches = region ? all.filter((tz: string) => tz.startsWith(region + "/")) : [];

      return uniqKeepOrder([
        ...(detected ? [detected] : []),
        ...common,
        ...regionMatches,
        ...all,
      ]);
    }
  } catch {
    // ignore
  }

  // Fallback (older runtimes): not possible to enumerate all IANA zones reliably without shipping a tzdb list.
  return uniqKeepOrder([...(detected ? [detected] : []), ...common]);
}

export function getSupportedTimezones(opts?: { detected?: string | null; limit?: number }): string[] {
  const detected = (opts?.detected ?? null) || null;
  const limit = typeof opts?.limit === "number" ? Math.max(20, Math.floor(opts!.limit)) : 200;

  return getAllSupportedTimezones(detected).slice(0, limit);
}


