// PIVOT NUTRITION §1.3 — reengagement_io.ts.
//
// The tests that carry the doctrine:
//   * "the query and the decider share ONE threshold"
//   * "a doubtful episode read blocks the nudge (fail-closed on spam)"

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  decideForCandidates,
  localHourFor,
  type ReengageCandidate,
} from "./reengagement_io.ts";
import { REENGAGE_AFTER_HOURS } from "./reengagement.ts";

const NOW = new Date("2026-08-03T12:00:00.000Z");

function candidate(over: Partial<ReengageCandidate> = {}): ReengageCandidate {
  return {
    userId: "s1",
    lastInboundAt: new Date(NOW.getTime() - 90 * 3600_000).toISOString(),
    localHour: 10,
    timezone: "Europe/Paris",
    hasActivePlan: true,
    optedOut: false,
    nudgedThisEpisode: false,
    lastNudgeAt: null,
    restrictionFlag: false,
    declaredHardWeek: false,
    ...over,
  };
}

Deno.test("the query and the decider share ONE threshold", async () => {
  // A selection query that pre-cuts at a different number than the decider
  // either burns a scan on candidates it will all refuse, or never presents
  // the ones it would accept. The module must import the constant, not restate
  // it.
  const src = await Deno.readTextFile(new URL("./reengagement_io.ts", import.meta.url));
  assert(src.includes("REENGAGE_AFTER_HOURS"), "the threshold must be imported");
  // And no second number may be hardcoded next to it.
  assert(!/const\s+\w*(CUTOFF|THRESHOLD)\w*\s*=\s*\d/.test(src));
  assertEquals(REENGAGE_AFTER_HOURS, 72);
});

Deno.test("a doubtful episode read blocks the nudge (fail-closed on spam)", () => {
  // `loadReengageCandidates` sets nudgedThisEpisode=true when the episode read
  // failed. The asymmetry is deliberate: one nudge missed beats two in a row.
  const out = decideForCandidates([candidate({ nudgedThisEpisode: true })], NOW);
  assertEquals(out[0].decision.decision, "skip");
  if (out[0].decision.decision === "skip") {
    assertEquals(out[0].decision.reason, "already_nudged_this_episode");
  }
});

Deno.test("an unreadable timezone becomes a quiet hour, never a spam hour", () => {
  assertEquals(localHourFor(NOW, "Europe/Paris"), 14);
  assertEquals(localHourFor(NOW, "America/New_York"), 8);
  assertEquals(localHourFor(NOW, ""), null);
  assertEquals(localHourFor(NOW, "Not/AZone"), null);

  // NaN localHour -> isQuietHour(NaN) === true -> defer, not send.
  const out = decideForCandidates([candidate({ localHour: Number.NaN })], NOW);
  assertEquals(out[0].decision.decision, "defer");
});

Deno.test("a candidate in the clear is armed with a tone", () => {
  const out = decideForCandidates([candidate()], NOW);
  assertEquals(out[0].decision.decision, "send");
  if (out[0].decision.decision === "send") {
    assertEquals(out[0].decision.tone, "gentle");
  }
});

Deno.test("the gates still apply through the IO layer", () => {
  const cases: Array<[Partial<ReengageCandidate>, string]> = [
    [{ optedOut: true }, "opted_out"],
    [{ hasActivePlan: false }, "no_active_plan"],
    [{ restrictionFlag: true }, "restriction_flag"],
    [{ lastInboundAt: new Date(NOW.getTime() - 3600_000).toISOString() }, "recent_contact"],
  ];
  for (const [patch, expected] of cases) {
    const out = decideForCandidates([candidate(patch)], NOW);
    assertEquals(out[0].decision.decision, "skip", expected);
    if (out[0].decision.decision === "skip") {
      assertEquals(out[0].decision.reason, expected);
    }
  }
});
