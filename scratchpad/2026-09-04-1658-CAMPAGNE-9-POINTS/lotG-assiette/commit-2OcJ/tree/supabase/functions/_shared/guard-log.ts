// P11 (observabilité bêta): remontée des DÉCLENCHEMENTS DE GARDES runtime
// dans le production log admin. Les ceintures P8-P10 (claims strippés,
// rétractation droppée, refus confabulé retiré, mass-cancel…) loggaient en
// console.warn — invisibles dans AdminProductionLog qui agrège des TABLES.
// Ce module écrit dans `system_error_logs` (déjà une source du RPC
// get_production_log, sans flag) via logEdgeFunctionError : un déclenchement
// de garde = une ligne source='guards' dans le fil admin ; un tour safety
// medium+ = une ligne source='safety'.
//
// Contrat: FIRE-AND-FORGET et FAIL-OPEN absolus — jamais un await sur le
// chemin de réponse, jamais une exception qui remonte, no-op quand
// SUPABASE_URL est absent (tests unitaires).

import { logEdgeFunctionError } from "./error-log.ts";

export function logRuntimeGuardEvent(args: {
  /** Identifiant court de la garde, ex "commit_claim_stripped". */
  guard: string;
  userId?: string | null;
  requestId?: string | null;
  severity?: "info" | "warn" | "error";
  detail?: Record<string, unknown>;
}): void {
  try {
    if (!(Deno.env.get("SUPABASE_URL") ?? "").trim()) return;
    // P12-C nit (paul-p9reval): marqueur d'audit nommé — `error_name:
    // "Error"` sur un événement nominal était du bruit de logger.
    const marker = new Error(args.guard);
    marker.name = args.guard;
    void logEdgeFunctionError({
      functionName: "sophia-brain",
      error: marker,
      severity: args.severity ?? "warn",
      title: `Garde · ${args.guard}`,
      source: "guards",
      userId: args.userId ?? null,
      requestId: args.requestId ?? null,
      metadata: args.detail ?? {},
    });
  } catch (_error) {
    // fail-open: l'observabilité ne casse jamais un tour.
  }
}

// KEEL W1.3 bug 1 — the band allowlist stopped at `high`, so `critical`
// (the only band that always blocks every side effect, see
// sophia-brain/safety/safety_thresholds.ts) was the single band NEVER
// surfaced in the admin production log: the worst turn was the invisible
// one. Bands live here as data, not as a chain of `!==` comparisons, so
// adding a band to RiskBand fails visibly at review time.
const OBSERVED_SAFETY_BANDS = new Set(["medium", "high", "critical"]);

/** Exporte la decision de filtrage pour qu'un test l'observe sans sink. */
export function isObservedSafetyBand(riskBand: unknown): boolean {
  return OBSERVED_SAFETY_BANDS.has(
    String(riskBand ?? "").trim().toLowerCase(),
  );
}

/** medium = warn, high/critical = error. */
export function safetyBandSeverity(riskBand: unknown): "warn" | "error" {
  return String(riskBand ?? "").trim().toLowerCase() === "medium"
    ? "warn"
    : "error";
}

/**
 * Tour safety medium+ visible dans le fil admin (la table
 * conversation_turn_traces n'est pas une source du production log) —
 * medium = warn, high/critical = error (le filtre « erreurs seulement »
 * remonte les tours de crise en premier).
 */
export function logSafetyBandEvent(args: {
  riskBand: string;
  reasonCodes?: string[];
  userId?: string | null;
  turnId?: string | null;
  responseOwner?: string | null;
}): void {
  try {
    const band = String(args.riskBand ?? "").trim().toLowerCase();
    if (!isObservedSafetyBand(band)) return;
    if (!(Deno.env.get("SUPABASE_URL") ?? "").trim()) return;
    const marker = new Error(`safety_band_${band}`);
    marker.name = `safety_band_${band}`;
    void logEdgeFunctionError({
      functionName: "sophia-brain",
      error: marker,
      severity: safetyBandSeverity(band),
      title: `Safety · band ${band}${
        (args.reasonCodes ?? []).length
          ? ` · ${(args.reasonCodes ?? []).join(",")}`
          : ""
      }`,
      source: "safety",
      userId: args.userId ?? null,
      metadata: {
        risk_band: band,
        reason_codes: args.reasonCodes ?? [],
        turn_id: args.turnId ?? null,
        response_owner: args.responseOwner ?? null,
      },
    });
  } catch (_error) {
    // fail-open.
  }
}
