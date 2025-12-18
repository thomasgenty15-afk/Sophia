export function isPrelaunchLockdownEnabled(): boolean {
  // Vite exposes only variables prefixed with VITE_
  return String(import.meta.env.VITE_PRELAUNCH_LOCKDOWN ?? "").toLowerCase() === "true";
}


