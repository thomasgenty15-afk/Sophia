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
    void logEdgeFunctionError({
      functionName: "sophia-brain",
      error: new Error(args.guard),
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

/**
 * Tour safety medium+ visible dans le fil admin (la table
 * conversation_turn_traces n'est pas une source du production log) —
 * medium = warn, high = error (le filtre « erreurs seulement » remonte
 * les tours de crise en premier).
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
    if (band !== "medium" && band !== "high") return;
    if (!(Deno.env.get("SUPABASE_URL") ?? "").trim()) return;
    void logEdgeFunctionError({
      functionName: "sophia-brain",
      error: new Error(`safety_band_${band}`),
      severity: band === "high" ? "error" : "warn",
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
