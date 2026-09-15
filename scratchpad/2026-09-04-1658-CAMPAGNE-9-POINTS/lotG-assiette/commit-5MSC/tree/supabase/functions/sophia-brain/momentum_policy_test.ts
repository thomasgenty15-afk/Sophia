import { assertEquals } from "jsr:@std/assert";

import {
  canUseMessageFamily,
  getMomentumPolicyDefinition,
  isMessageFamilyForbidden,
  listMomentumPolicyDefinitions,
  MOMENTUM_DECISION_TABLE,
  resolveMomentumPolicyBranch,
  summarizeMomentumPolicy,
} from "./momentum_policy.ts";

Deno.test("momentum_policy: registry covers all six states", () => {
  const all = listMomentumPolicyDefinitions();
  assertEquals(all.length, 6);
  assertEquals(MOMENTUM_DECISION_TABLE.length, 6);
});

Deno.test("momentum_policy: friction_legere is diagnostic and recalibration oriented", () => {
  const policy = getMomentumPolicyDefinition("friction_legere");
  assertEquals(policy.primary_action, "diagnose_blocker");
  assertEquals(
    policy.allowed_message_families.includes("blocker_diagnosis"),
    true,
  );
  assertEquals(
    policy.allowed_message_families.includes("recalibration"),
    true,
  );
  assertEquals(
    policy.forbidden_message_families.includes("emotional_support"),
    true,
  );
});

Deno.test("momentum_policy: pause_consentie forbids all pressure families", () => {
  assertEquals(canUseMessageFamily("pause_consentie", "pause_respect"), true);
  assertEquals(
    isMessageFamilyForbidden("pause_consentie", "blocker_diagnosis"),
    true,
  );
  assertEquals(
    isMessageFamilyForbidden("pause_consentie", "reactivation_open_door"),
    true,
  );
  assertEquals(getMomentumPolicyDefinition("pause_consentie").max_proactive_per_7d, 0);
});

Deno.test("momentum_policy: reactivation only allows open-door family", () => {
  const policy = resolveMomentumPolicyBranch({
    state: "reactivation",
    dimensions: {
      engagement: "low",
      progression: "unknown",
      emotional_load: "low",
      consent: "fragile",
    },
  });

  assertEquals(policy.primary_action, "reopen_gently");
  assertEquals(policy.allowed_message_families, ["reactivation_open_door"]);
});

Deno.test("momentum_policy: summarize exposes main operational controls", () => {
  const summary = summarizeMomentumPolicy("momentum");
  assertEquals(summary.state, "momentum");
  assertEquals(summary.primary_action, "reinforce");
  assertEquals(summary.proactive_policy, "supportive_ok");
});
