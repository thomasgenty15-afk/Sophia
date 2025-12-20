export function isPrelaunchLockdownEnabled(): boolean {
  // Vite exposes only variables prefixed with VITE_
  // NOTE: Values are strings baked at build time. Be strict but robust to common representations.
  return parseBooleanEnv(getPrelaunchLockdownRawValue(), false);
}

export function getPrelaunchLockdownRawValue(): string {
  return String(import.meta.env.VITE_PRELAUNCH_LOCKDOWN ?? "").trim();
}

function parseBooleanEnv(raw: string, defaultValue: boolean): boolean {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return defaultValue;
  if (["1", "true", "yes", "y", "on", "enabled"].includes(v)) return true;
  if (["0", "false", "no", "n", "off", "disabled"].includes(v)) return false;
  // If someone sets a weird value (ex: "FALSE "), fall back to default rather than guessing.
  return defaultValue;
}


