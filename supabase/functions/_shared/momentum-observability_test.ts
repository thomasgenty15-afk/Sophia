import { assertEquals } from "jsr:@std/assert";

import { buildMomentumStateObservabilityEvents } from "./momentum-observability.ts";
import { readMomentumState } from "../sophia-brain/momentum_state.ts";

function stateWith(args: {
  current_state?: string;
  state_reason?: string;
  pending_target?: string;
  confirmations?: number;
}) {
  const base = readMomentumState({});
  return {
    ...base,
    current_state: args.current_state as any,
    state_reason: args.state_reason,
    stability: args.pending_target
      ? {
        pending_transition: {
          target_state: args.pending_target as any,
          reason: "test_pending",
          confirmations: args.confirmations ?? 1,
          first_seen_at: "2026-03-19T10:00:00.000Z",
          last_seen_at: "2026-03-19T10:00:00.000Z",
          source: "router" as const,
        },
      }
      : {},
  };
}

Deno.test("momentum observability: emits base applied event", () => {
  const events = buildMomentumStateObservabilityEvents({
    source: "router",
    previous: stateWith({ current_state: "momentum" }),
    next: stateWith({ current_state: "momentum", state_reason: "progression_up_and_open_consent" }),
  });

  assertEquals(events[0]?.eventName, "router_momentum_state_applied");
});

Deno.test("momentum observability: emits pending transition event when pending target appears", () => {
  const events = buildMomentumStateObservabilityEvents({
    source: "router",
    previous: stateWith({ current_state: "momentum" }),
    next: stateWith({ current_state: "momentum", pending_target: "friction_legere", confirmations: 1 }),
  });

  assertEquals(events.some((evt) => evt.eventName === "momentum_transition_pending"), true);
});

Deno.test("momentum observability: emits confirmed transition when state changes", () => {
  const events = buildMomentumStateObservabilityEvents({
    source: "watcher",
    previous: stateWith({ current_state: "friction_legere" }),
    next: stateWith({ current_state: "evitement", state_reason: "low_engagement_with_fragile_consent" }),
  });

  assertEquals(events.some((evt) => evt.eventName === "momentum_transition_confirmed"), true);
});

Deno.test("momentum observability: emits rejected transition when pending disappears without state change", () => {
  const events = buildMomentumStateObservabilityEvents({
    source: "watcher",
    previous: stateWith({ current_state: "momentum", pending_target: "friction_legere", confirmations: 2 }),
    next: stateWith({ current_state: "momentum" }),
  });

  assertEquals(events.some((evt) => evt.eventName === "momentum_transition_rejected"), true);
});
