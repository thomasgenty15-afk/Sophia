import { buildFlowContext } from "./flow_context.ts";

function assertEquals(actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`Assertion failed.\nExpected: ${e}\nActual:   ${a}`);
  }
}

Deno.test("buildFlowContext: ignores dual_tool pending context in release-1 simplified mode", () => {
  const ctx = buildFlowContext({
    __pending_dual_tool: {
      tool1: { verb: "activer", target_hint: "sport" },
      tool2: { verb: "supprimer", target_hint: "lecture" },
    },
  });

  assertEquals(ctx, undefined);
});

Deno.test("buildFlowContext: ignores resume_prompt pending context in release-1 simplified mode", () => {
  const ctx = buildFlowContext({
    __router_resume_prompt_v1: {
      kind: "safety_recovery",
      asked_at: new Date().toISOString(),
    },
  });

  assertEquals(ctx, undefined);
});

Deno.test("buildFlowContext: ignores expired resume_prompt marker", () => {
  const old = new Date(Date.now() - 31 * 60 * 1000).toISOString();
  const ctx = buildFlowContext({
    __router_resume_prompt_v1: {
      kind: "toolflow",
      asked_at: old,
    },
  });

  assertEquals(ctx, undefined);
});
