import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { buildPresenceSystemBlock } from "./prompt.ts";
import { PRESENCE_ALLOWED_KEYS, stripToPresenceContext } from "./context.ts";
import { formatPresenceThreadBlock } from "./thread.ts";
import type { LoadedContext } from "../../context/types.ts";
import {
  applyPresenceFlowState,
  commitPresenceResult,
  readActivePresenceState,
} from "./apply.ts";
import { ACTIVE_CONVERSATION_SKILL_KEY } from "../_shared/active_skill_state.ts";

// ── Prompt ──────────────────────────────────────────────────────────────────

Deno.test("presence system block: friend mandate, curiosity, zero product", () => {
  const block = buildPresenceSystemBlock();
  assertStringIncludes(block, "PRESENCE_MANDATE");
  assertStringIncludes(block, "Miroir des faits du USER");
  assertStringIncludes(block, "nuance honnetement");
  assertStringIncludes(block, "UNE vraie question");
  assertStringIncludes(block, "Longueur a la hauteur");
  assertStringIncludes(block, "Ne pousse AUCUN dispositif produit");
  // Demande de méthode = réponse en conversation, pas une offre.
  assertStringIncludes(block, "reponds EN CONVERSATION");
  // Ban artefact formaté (fausse carte inline observée en QA r6).
  assertStringIncludes(block, "Ne produis JAMAIS un artefact mis en forme");
  // Plus aucune machinerie d'offre.
  assertEquals(block.includes("PIVOT_ACTION"), false);
  assertEquals(block.includes("phrase conditionnelle"), false);
});

// ── Context stripping ────────────────────────────────────────────────────────

Deno.test("stripToPresenceContext keeps memory/identity/effects, drops product AND recentTurns", () => {
  const loaded: LoadedContext = {
    identity: "=== IDENTITÉ ===",
    facts: "=== FACTS ===",
    memoryV2Payload: "=== MEMOIRE ===",
    momentumBlockersAddon: "=== MOMENTUM ===",
    recentEffectsSummary: "=== EFFETS RÉCENTS ===",
    // Remplacé par le fil verbatim complet (thread.ts):
    recentTurns: "=== HISTORIQUE TRONQUÉ ===",
    // Ceux-là doivent disparaître:
    surfaceOpportunityAddon: "PUSH FEATURE",
    dashboardCapabilitiesLiteAddon: "DASHBOARD",
    coachingInterventionAddon: "COACHING PUSH",
    currentWeekPlanContext: "PLAN",
    planItemIndicators: "PLAN ITEMS",
    durableEffectsSummary: "INVENTAIRE PRODUIT",
    defenseCardWinAddon: "CARTE",
  };
  const stripped = stripToPresenceContext(loaded);
  assertEquals(stripped.identity, "=== IDENTITÉ ===");
  assertEquals(stripped.recentEffectsSummary, "=== EFFETS RÉCENTS ===");
  assertEquals(stripped.momentumBlockersAddon, "=== MOMENTUM ===");
  assertEquals(stripped.recentTurns, undefined);
  assertEquals(stripped.surfaceOpportunityAddon, undefined);
  assertEquals(stripped.dashboardCapabilitiesLiteAddon, undefined);
  assertEquals(stripped.coachingInterventionAddon, undefined);
  assertEquals(stripped.currentWeekPlanContext, undefined);
  assertEquals(stripped.durableEffectsSummary, undefined);
  assertEquals(stripped.defenseCardWinAddon, undefined);
});

Deno.test("allowlist never leaks a product key nor recentTurns", () => {
  const forbidden = [
    "recentTurns",
    "surfaceOpportunityAddon",
    "dashboardCapabilitiesAddon",
    "dashboardCapabilitiesLiteAddon",
    "dashboardRedirectAddon",
    "coachingInterventionAddon",
    "planFeedbackAddon",
    "currentWeekPlanContext",
    "planItemIndicators",
    "durableEffectsSummary",
    "defenseCardWinAddon",
    "defenseCardPendingTriggersAddon",
    "trackProgressAddon",
  ];
  for (const key of forbidden) {
    assertEquals(PRESENCE_ALLOWED_KEYS.includes(key as never), false);
  }
});

// ── Thread block ─────────────────────────────────────────────────────────────

Deno.test("formatPresenceThreadBlock: summary head + verbatim tail", () => {
  const block = formatPresenceThreadBlock({
    summary: "Il est parti de « je suis cassé » vers « mon corps sait faire ».",
    verbatim: [
      { role: "user", content: "Mais j'ai peur de retomber." },
      { role: "assistant", content: "Cette peur est cohérente." },
    ],
  });
  assertStringIncludes(block, "FIL DE LA DISCUSSION (début, résumé fidèle)");
  assertStringIncludes(block, "je suis cassé");
  assertStringIncludes(block, "FIL DE LA DISCUSSION (verbatim)");
  assertStringIncludes(block, "user: Mais j'ai peur de retomber.");
  assertStringIncludes(block, "sophia: Cette peur est cohérente.");
});

Deno.test("formatPresenceThreadBlock without summary is verbatim-only", () => {
  const block = formatPresenceThreadBlock({
    summary: null,
    verbatim: [{ role: "user", content: "salut" }],
  });
  assertEquals(block.includes("résumé fidèle"), false);
  assertStringIncludes(block, "verbatim");
});

// ── State application ────────────────────────────────────────────────────────

const T0 = "2026-07-09T20:00:00.000Z";

Deno.test("applyPresenceFlowState enters from a clean state", () => {
  const res = applyPresenceFlowState({
    tempMemory: {},
    activeSkillState: null,
    kind: "maintain",
    nowIso: T0,
    localDate: "2026-07-09",
    topicHint: "anxiété",
  });
  assertEquals(res.transition, "enter");
  const active = res.tempMemory[ACTIVE_CONVERSATION_SKILL_KEY] as Record<
    string,
    unknown
  >;
  assertEquals(active.skill_id, "presence_conversation");
  assertEquals(readActivePresenceState(active)?.turns_in_flow, 1);
});

Deno.test("applyPresenceFlowState maintains and advances an active flow", () => {
  const entered = applyPresenceFlowState({
    tempMemory: {},
    activeSkillState: null,
    kind: "maintain",
    nowIso: T0,
    localDate: "2026-07-09",
  });
  const active = entered.tempMemory[ACTIVE_CONVERSATION_SKILL_KEY];
  const res = applyPresenceFlowState({
    tempMemory: entered.tempMemory,
    activeSkillState: active,
    kind: "maintain",
    nowIso: "2026-07-09T20:05:00.000Z",
    localDate: "2026-07-09",
  });
  assertEquals(res.transition, "maintain");
  assertEquals(res.flow_state?.turns_in_flow, 2);
});

Deno.test("applyPresenceFlowState exits (tool_pull) clears active state", () => {
  const entered = applyPresenceFlowState({
    tempMemory: {},
    activeSkillState: null,
    kind: "maintain",
    nowIso: T0,
    localDate: "2026-07-09",
  });
  const active = entered.tempMemory[ACTIVE_CONVERSATION_SKILL_KEY];
  const res = applyPresenceFlowState({
    tempMemory: entered.tempMemory,
    activeSkillState: active,
    kind: "tool_pull",
    nowIso: "2026-07-09T20:05:00.000Z",
    localDate: "2026-07-09",
  });
  assertEquals(res.transition, "exit");
  assertEquals(res.exit_reason, "tool_pull");
  assertEquals(res.tempMemory[ACTIVE_CONVERSATION_SKILL_KEY], undefined);
});

Deno.test("commitPresenceResult re-applies decision onto fresh temp memory", () => {
  const res = applyPresenceFlowState({
    tempMemory: {},
    activeSkillState: null,
    kind: "maintain",
    nowIso: T0,
    localDate: "2026-07-09",
  });
  // Simule une tempMemory post-génération qui a perdu l'état.
  const fresh = { some_other_key: 1 } as Record<string, unknown>;
  const committed = commitPresenceResult(fresh, res, T0);
  assertEquals(
    (committed[ACTIVE_CONVERSATION_SKILL_KEY] as Record<string, unknown>)
      .skill_id,
    "presence_conversation",
  );
  assertEquals(committed.some_other_key, 1);
});
