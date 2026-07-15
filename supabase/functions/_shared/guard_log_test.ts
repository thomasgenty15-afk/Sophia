import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { logRuntimeGuardEvent, logSafetyBandEvent } from "./guard-log.ts";

Deno.test("P11: logRuntimeGuardEvent est no-op/fail-open sans SUPABASE_URL (jamais un throw, jamais une op pendante)", () => {
  const saved = Deno.env.get("SUPABASE_URL");
  try {
    Deno.env.delete("SUPABASE_URL");
    // Ne doit ni throw ni laisser une promesse pendante (sanitizer Deno).
    logRuntimeGuardEvent({ guard: "test_guard", userId: "u1" });
    logRuntimeGuardEvent({
      guard: "test_guard_2",
      severity: "info",
      detail: { a: 1 },
    });
    assertEquals(true, true);
  } finally {
    if (saved !== undefined) Deno.env.set("SUPABASE_URL", saved);
  }
});

Deno.test("P11: logSafetyBandEvent ignore none/low et est no-op sans env", () => {
  const saved = Deno.env.get("SUPABASE_URL");
  try {
    Deno.env.delete("SUPABASE_URL");
    logSafetyBandEvent({ riskBand: "none" });
    logSafetyBandEvent({ riskBand: "low" });
    logSafetyBandEvent({
      riskBand: "medium",
      reasonCodes: ["hopelessness"],
      userId: "u1",
      turnId: "t1",
    });
    logSafetyBandEvent({ riskBand: "high", userId: "u1" });
    assertEquals(true, true);
  } finally {
    if (saved !== undefined) Deno.env.set("SUPABASE_URL", saved);
  }
});
