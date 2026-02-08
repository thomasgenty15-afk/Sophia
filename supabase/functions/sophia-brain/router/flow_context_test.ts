import { buildFlowContext } from "./flow_context.ts";

function assertEquals(actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`Assertion failed.\nExpected: ${e}\nActual:   ${a}`);
  }
}

Deno.test("buildFlowContext: returns pendingSignalResolution for dual_tool without active machine", () => {
  const ctx = buildFlowContext({
    __pending_dual_tool: {
      tool1: { verb: "activer", target_hint: "sport" },
      tool2: { verb: "supprimer", target_hint: "lecture" },
    },
  });

  assertEquals(ctx?.pendingSignalResolution?.pending_type, "dual_tool");
  assertEquals(ctx?.pendingSignalResolution?.dual_tool?.tool1_verb, "activer");
  assertEquals(
    ctx?.pendingSignalResolution?.dual_tool?.tool2_verb,
    "supprimer",
  );
});

Deno.test("buildFlowContext: returns pendingSignalResolution for non-expired resume_prompt", () => {
  const ctx = buildFlowContext({
    __router_resume_prompt_v1: {
      kind: "safety_recovery",
      asked_at: new Date().toISOString(),
    },
  });

  assertEquals(ctx?.pendingSignalResolution?.pending_type, "resume_prompt");
  assertEquals(
    ctx?.pendingSignalResolution?.resume_prompt?.kind,
    "safety_recovery",
  );
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
