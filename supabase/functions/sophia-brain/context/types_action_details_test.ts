import {
  shouldLoadActionsDetails,
  type ContextProfile,
} from "./types.ts"

function assert(cond: unknown, msg?: string) {
  if (!cond) throw new Error(msg ?? "Assertion failed")
}

// W2.D-2 — `ContextProfile` (context/types.ts:18-42) no longer carries `plan_json`,
// `actions_summary`, `actions_details` or `vitals`; the profile is now purely about memory and
// history depth, and `shouldLoadActionsDetails` decides on the TRIGGERS alone
// (`types.ts:206-215` ignores every field of `profile` except its truthiness). The literal is
// trimmed to the fields that exist. Note that "ON_DEMAND" is now a property of the call site,
// not of the profile — the name is kept so the two cases below still read as a pair.
const ON_DEMAND_PROFILE: ContextProfile = {
  temporal: true,
  identity: false,
  event_memories: false,
  global_memories: false,
  topic_memories: false,
  facts: false,
  short_term: false,
  history_depth: 5,
}

Deno.test("shouldLoadActionsDetails: plan_item_discussion trigger enables on_demand details", () => {
  const enabled = shouldLoadActionsDetails(ON_DEMAND_PROFILE, {
    plan_item_discussion_detected: true,
    plan_item_discussion_hint: "méditation du soir",
  })
  assert(enabled === true, "expected on_demand details to be enabled")
})

Deno.test("shouldLoadActionsDetails: no trigger keeps on_demand details disabled", () => {
  const disabled = shouldLoadActionsDetails(ON_DEMAND_PROFILE, {})
  assert(disabled === false, "expected on_demand details to stay disabled")
})
