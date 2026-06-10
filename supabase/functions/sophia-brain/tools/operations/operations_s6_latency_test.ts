import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { runAdjustPlanItemIntake } from "./adjust_plan_item/intake.ts";

Deno.test("S6 operations latency smoke keeps adjust_plan as platform handoff under 4s average", async () => {
  const started = Date.now();

  const adjust = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "reduis ma marche",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    trigger_message_id: "lat-adjust",
    safety_pregate_risk_band: "none",
    operation_input: {
      scope: {
        kind: "specific_plan_item",
        plan_item_id: "walk",
        title: "marche",
      },
      target: {
        kind: "plan_item",
        plan_item_id: "walk",
        title: "marche",
      },
    },
  });

  assertEquals(adjust.status, "fallback_dashboard");
  assertEquals(adjust.phase, "platform_handoff");
  assertEquals((Date.now() - started) < 4000, true);
});
