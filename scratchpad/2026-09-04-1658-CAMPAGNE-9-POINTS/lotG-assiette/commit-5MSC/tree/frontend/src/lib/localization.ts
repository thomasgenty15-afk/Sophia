// ⚠️ `DEFAULT_LOCALE = "fr-FR"` VIVAIT ICI, ET C'ÉTAIT UNE SECONDE SOURCE DE
// VÉRITÉ SUR LA LANGUE. Un reliquat du produit grand public: il écrivait
// « fr-FR » dans `profiles.locale` de tout compte créé, quelle que soit la
// langue du visiteur. `UserProfile.tsx` avait déjà cessé de l'importer (voir sa
// note ligne 20), et plus aucun fichier du dépôt ne le lisait — vérifié par
// grep sur `frontend/src`. Retiré: l'autorité de la langue est
// `keel/i18n/runtime.ts` (`signupProfileLocale`, `chosenUiLocale`), et celle du
// FORMATAGE est `keel/i18n/format.ts`.
//
// `DEFAULT_TIMEZONE` reste, et ce n'est pas une inconséquence: un fuseau n'est
// pas une langue. Il a trois lecteurs vivants (`UserProfile`, `Auth`), il sert
// de repli quand le navigateur ne sait pas se situer, et il ne décide d'aucun
// mot affiché.
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
    // `supportedValuesOf` manque encore aux typings de la lib TS visée ici.
    // On nomme LA SEULE méthode qu'on appelle: `Intl as any` aurait rendu
    // `any` tout ce qui en descend — `list`, puis `all`, puis le tableau rendu
    // par la fonction — et le typecheck aurait cessé de mordre en silence.
    const intl = Intl as unknown as {
      supportedValuesOf?: (key: string) => unknown;
    };
    const list = intl.supportedValuesOf?.("timeZone");
    if (Array.isArray(list) && list.length) {
      const all = list.filter(
        (x: unknown): x is string => typeof x === "string" && x.trim() !== "",
      );
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


