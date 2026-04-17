import {
  shouldLoadActionsDetails,
  type ContextProfile,
} from "./types.ts"

function assert(cond: unknown, msg?: string) {
  if (!cond) throw new Error(msg ?? "Assertion failed")
}

const ON_DEMAND_PROFILE: ContextProfile = {
  temporal: true,
  plan_metadata: true,
  plan_json: false,
  actions_summary: true,
  actions_details: "on_demand",
  identity: false,
  event_memories: false,
  global_memories: false,
  topic_memories: false,
  facts: false,
  short_term: false,
  history_depth: 5,
  vitals: false,
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
