import { assertEquals } from "jsr:@std/assert@1";

import {
  decideReengagementEpisodeSweep,
  REENGAGEMENT_ABANDONED_MID_FLOW_SILENCE_HOURS,
  REENGAGEMENT_NO_REPLY_CLOSE_DAYS_AFTER_STEP3,
  REENGAGEMENT_STALE_OPEN_CLOSE_DAYS,
  winbackReplyExitStatus,
} from "./reengagement_episodes.ts";

const NOW = new Date("2026-07-19T12:00:00.000Z");

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

const EPISODE_STEP1 = {
  last_touch_step: 1,
  opened_at: daysAgo(2),
  touch1_sent_at: daysAgo(2),
  touch2_sent_at: null,
  touch3_sent_at: null,
  first_reply_at: null,
};

const EPISODE_STEP3 = {
  last_touch_step: 3,
  opened_at: daysAgo(15),
  touch1_sent_at: daysAgo(15),
  touch2_sent_at: daysAgo(12),
  touch3_sent_at: daysAgo(8),
  first_reply_at: null,
};

Deno.test("winbackReplyExitStatus maps pauses to paused and the rest to reengaged", () => {
  assertEquals(winbackReplyExitStatus("pause_short"), "paused");
  assertEquals(winbackReplyExitStatus("pause_week"), "paused");
  assertEquals(winbackReplyExitStatus("wait_for_user"), "paused");
  assertEquals(winbackReplyExitStatus("resume"), "reengaged");
  assertEquals(winbackReplyExitStatus("simplify"), "reengaged");
  assertEquals(winbackReplyExitStatus("unknown"), "reengaged");
});

Deno.test("sweep NEVER fabricates 'reengaged' from a bare inbound timestamp", () => {
  // Charte cmd 0/14 : un inbound (STOP, vocal, réaction, message sans rapport)
  // n'est pas une preuve sémantique de réponse conversationnelle. La clôture-
  // réponse appartient aux closers content-aware (webhook/flow), pas au sweep.
  const decision = decideReengagementEpisodeSweep({
    episode: EPISODE_STEP1,
    lastInboundAtMs: new Date(daysAgo(1)).getTime(),
    platformActivityRecent: false,
    nowMs: NOW.getTime(),
  });
  assertEquals(decision.action, "keep");
});

Deno.test("sweep still closes platform-return even with a recent inbound", () => {
  // L'activité plateforme est un signal d'activité non ambigu (pas une
  // classification d'intention) — elle clôt légitimement.
  const decision = decideReengagementEpisodeSweep({
    episode: EPISODE_STEP3,
    lastInboundAtMs: new Date(daysAgo(1)).getTime(),
    platformActivityRecent: true,
    nowMs: NOW.getTime(),
  });
  assertEquals(decision.action, "close");
  if (decision.action === "close") {
    assertEquals(decision.exit_status, "reactivated_via_platform");
  }
});

Deno.test("sweep keeps an episode with only an old inbound and no other signal", () => {
  const decision = decideReengagementEpisodeSweep({
    episode: EPISODE_STEP1,
    lastInboundAtMs: new Date(daysAgo(5)).getTime(),
    platformActivityRecent: false,
    nowMs: NOW.getTime(),
  });
  assertEquals(decision.action, "keep");
});

Deno.test("sweep closes as platform return when the user came back on the site", () => {
  const decision = decideReengagementEpisodeSweep({
    episode: EPISODE_STEP1,
    lastInboundAtMs: new Date(daysAgo(5)).getTime(),
    platformActivityRecent: true,
    nowMs: NOW.getTime(),
  });
  assertEquals(decision.action, "close");
  if (decision.action === "close") {
    assertEquals(decision.exit_status, "reactivated_via_platform");
    assertEquals(decision.entry_kind, "platform_return");
    assertEquals(decision.first_reply_at, null);
    assertEquals(decision.extraction_status, "nothing_to_extract");
  }
});

Deno.test("sweep closes as no_reply 7 days after step 3, not before", () => {
  const justBefore = decideReengagementEpisodeSweep({
    episode: { ...EPISODE_STEP3, touch3_sent_at: daysAgo(6) },
    lastInboundAtMs: new Date(daysAgo(20)).getTime(),
    platformActivityRecent: false,
    nowMs: NOW.getTime(),
  });
  assertEquals(justBefore.action, "keep");

  const due = decideReengagementEpisodeSweep({
    episode: {
      ...EPISODE_STEP3,
      touch3_sent_at: daysAgo(REENGAGEMENT_NO_REPLY_CLOSE_DAYS_AFTER_STEP3),
    },
    lastInboundAtMs: new Date(daysAgo(20)).getTime(),
    platformActivityRecent: false,
    nowMs: NOW.getTime(),
  });
  assertEquals(due.action, "close");
  if (due.action === "close") {
    assertEquals(due.exit_status, "no_reply");
    assertEquals(due.entry_kind, null);
    assertEquals(due.extraction_status, "nothing_to_extract");
  }
});

Deno.test("sweep keeps an episode still inside the escalation window", () => {
  const decision = decideReengagementEpisodeSweep({
    episode: EPISODE_STEP1,
    lastInboundAtMs: new Date(daysAgo(5)).getTime(),
    platformActivityRecent: false,
    nowMs: NOW.getTime(),
  });
  assertEquals(decision.action, "keep");
});

Deno.test("sweep closes a never-entered episode 30 days after the last touch", () => {
  const justBefore = decideReengagementEpisodeSweep({
    episode: {
      ...EPISODE_STEP1,
      opened_at: daysAgo(29),
      touch1_sent_at: daysAgo(29),
    },
    lastInboundAtMs: new Date(daysAgo(40)).getTime(),
    platformActivityRecent: false,
    nowMs: NOW.getTime(),
  });
  assertEquals(justBefore.action, "keep");

  const due = decideReengagementEpisodeSweep({
    episode: {
      ...EPISODE_STEP1,
      opened_at: daysAgo(REENGAGEMENT_STALE_OPEN_CLOSE_DAYS),
      touch1_sent_at: daysAgo(REENGAGEMENT_STALE_OPEN_CLOSE_DAYS),
    },
    lastInboundAtMs: new Date(daysAgo(40)).getTime(),
    platformActivityRecent: false,
    nowMs: NOW.getTime(),
  });
  assertEquals(due.action, "close");
  if (due.action === "close") {
    assertEquals(due.exit_status, "no_reply");
    assertEquals(due.extraction_status, "nothing_to_extract");
  }
});

Deno.test("sweep leaves an entered episode to the flow while the conversation is fresh", () => {
  const hoursAgoIso = (hours: number) =>
    new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString();
  const decision = decideReengagementEpisodeSweep({
    episode: { ...EPISODE_STEP1, first_reply_at: hoursAgoIso(2) },
    lastInboundAtMs: new Date(hoursAgoIso(1)).getTime(),
    platformActivityRecent: true,
    nowMs: NOW.getTime(),
  });
  assertEquals(decision.action, "keep");
});

Deno.test("sweep closes an entered episode as abandoned after 24h of silence", () => {
  const hoursAgoIso = (hours: number) =>
    new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString();
  const decision = decideReengagementEpisodeSweep({
    episode: {
      ...EPISODE_STEP1,
      first_reply_at: hoursAgoIso(
        REENGAGEMENT_ABANDONED_MID_FLOW_SILENCE_HOURS + 10,
      ),
    },
    lastInboundAtMs: new Date(
      hoursAgoIso(REENGAGEMENT_ABANDONED_MID_FLOW_SILENCE_HOURS),
    ).getTime(),
    platformActivityRecent: false,
    nowMs: NOW.getTime(),
  });
  assertEquals(decision.action, "close");
  if (decision.action === "close") {
    assertEquals(decision.exit_status, "abandoned_mid_flow");
    assertEquals(decision.extraction_status, "pending");
    // Les champs d'entrée ne sont pas réécrits par cette clôture.
    assertEquals(decision.entry_kind, null);
    assertEquals(decision.first_reply_at, null);
  }
});
