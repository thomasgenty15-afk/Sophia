import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { applyUnexecutedEffectClaimGuard } from "./final_response_guards.ts";
import { applyCoachResponseStylePreferences } from "./response_style_policy.ts";
import {
  createEffectLedger,
  recordRequestedEffect,
  rewriteUncommittedEffectClaims,
} from "./effect_ledger.ts";
import { executedToolsForStatus } from "./effect_ledger_adapter.ts";
import {
  isStatusOnlyNoMutationRequest,
  shouldRenderStatusOnlyNoMutation,
} from "./legacy_semantic_patches.ts";
import {
  oneShotReminderDirectEffectBlockForNonMutationContext,
  oneShotReminderStatusBlocksToolFlow,
} from "../tools/always_on/one_shot_reminder/router.ts";

const ROOT = new URL("../", import.meta.url);

type KnownLegacy = {
  name: string;
  reason: string;
  removal_criteria: string;
};

const KNOWN_L3_SEMANTIC_HELPERS: KnownLegacy[] = [
  {
    name: "detectsExplicitOneShotReminderCreate",
    reason: "L3 transitional documented in runtime-contracts/00-architecture-doctrine.md.",
    removal_criteria:
      "Dispatcher direct_effect.create_one_shot_reminder with raw_text is stable across QA paraphrases.",
  },
  {
    name: "detectsActiveToolCancellation",
    reason: "L3 transitional documented in runtime-contracts/00-architecture-doctrine.md.",
    removal_criteria:
      "Dispatcher skill_signals.exit covers explicit cancellation of active tool flows.",
  },
  {
    name: "detectsDurableCoachPreference",
    reason: "L3 transitional documented in runtime-contracts/00-architecture-doctrine.md.",
    removal_criteria:
      "Dispatcher tool_skill_intents.update_coach_preferences covers durable preference asks.",
  },
  {
    name: "detectsExplicitProductHelp",
    reason: "L3 transitional documented in runtime-contracts/00-architecture-doctrine.md.",
    removal_criteria:
      "Dispatcher product_help few-shots cover product/navigation questions without L3 keywords.",
  },
  {
    name: "detectsExactDurableStatus",
    reason: "L3 transitional documented in runtime-contracts/00-architecture-doctrine.md.",
    removal_criteria:
      "Status/product questions are covered by dispatcher few-shots and status_recap tests.",
  },
  {
    name: "detectsRecapRequest",
    reason: "L3 transitional documented in runtime-contracts/00-architecture-doctrine.md.",
    removal_criteria:
      "Dispatcher routes recap/read-only memory questions without update_coach_preferences false positives.",
  },
  {
    name: "detectsMultiEntityDurableStatus",
    reason: "L3 transitional documented in runtime-contracts/00-architecture-doctrine.md.",
    removal_criteria:
      "Dispatcher routes multi-entity durable status questions to status_only reliably.",
  },
  {
    name: "detectsExplicitNoStatusRequest",
    reason:
      "Known L3 anti-status guard listed in runtime-contracts/00-architecture-doctrine.md as legacy semantic code.",
    removal_criteria:
      "Dispatcher and status_recap cover explicit 'no status panel' requests without L3 keywords.",
  },
  {
    name: "looksLikeAttackCardSlotCorrection",
    reason: "L3 transitional documented in runtime-contracts/00-architecture-doctrine.md.",
    removal_criteria:
      "Active prepare_attack_card intake owns slot corrections and product_help no longer hijacks them.",
  },
  {
    name: "detectsPonctualResponseFormatConstraint",
    reason:
      "Existing L3 transitional for one-turn response format constraints, documented in code as D1.",
    removal_criteria:
      "Dispatcher distinguishes punctual response shape from durable coach preferences.",
  },
  {
    name: "detectsExplicitAttackCardCreationRequest",
    reason:
      "Existing L3 transitional for explicit attack-card creation, documented in code as D5.",
    removal_criteria:
      "Dispatcher routes explicit attack-card creation to prepare_attack_card across QA paraphrases.",
  },
];

const KNOWN_L3_TRANSITIONAL_COMMENTS: KnownLegacy[] = KNOWN_L3_SEMANTIC_HELPERS
  .filter((item) => item.name !== "detectsExplicitNoStatusRequest");

const KNOWN_RUN_TOOL_ROUTER_IMPORTS: KnownLegacy[] = [];

const KNOWN_SUPABASE_DESTRUCTIVE_REFERENCES: KnownLegacy[] = [
  {
    name: "AGENTS.md",
    reason:
      "Safety rule document explicitly forbids destructive Supabase commands.",
    removal_criteria:
      "Never remove unless the safety rule moves to an equivalent root doc.",
  },
  {
    name: ".cursor/rules/safety-no-destructive-db.mdc",
    reason:
      "Editor safety rule explicitly forbids destructive Supabase commands.",
    removal_criteria:
      "Safety rule moves to AGENTS.md only or an equivalent enforced policy file.",
  },
  {
    name: "scripts/local_reset.sh",
    reason:
      "Legacy local helper contains an actual reset command; retained as named debt so no new scripts can add one silently.",
    removal_criteria:
      "Replace with a non-destructive local refresh or require an explicit manual command outside scripts.",
  },
  {
    name: "package.json",
    reason:
      "Legacy npm script exposes db:reset; retained as named debt so new destructive script aliases are blocked.",
    removal_criteria:
      "Remove db:reset or replace it with a non-destructive command.",
  },
  {
    name:
      "supabase/migrations_archive/20260522_pre_squash/99999999999999_LOCAL_seed_internal_secret.template.sql",
    reason:
      "Archived local migration note mentions reset as historical workflow text.",
    removal_criteria:
      "Archive note is deleted or rewritten to avoid reset instructions.",
  },
  {
    name:
      "supabase/migrations_archive/20260522_pre_squash/20251215170000_LOCAL_seed_internal_secret.sql",
    reason:
      "Archived local migration note mentions reset as historical workflow text.",
    removal_criteria:
      "Archive note is deleted or rewritten to avoid reset instructions.",
  },
  {
    name: "supabase/staging-test/README.md",
    reason: "Staging-test safety doc explicitly lists commands not to run.",
    removal_criteria:
      "Safety text moves to AGENTS.md or an equivalent staging runbook.",
  },
  {
    name: "supabase/seed.sql",
    reason:
      "Seed comment mentions reset stability but does not execute a command.",
    removal_criteria: "Comment is rewritten without naming reset.",
  },
  {
    name: "docs/memory-v2-only-runbook.md",
    reason: "Legacy runbook mentions reset as historical local setup debt.",
    removal_criteria:
      "Runbook is updated to a non-destructive local setup flow.",
  },
  {
    name: "docs/agent-playbook/11-skill-qa-conversation-runs.md",
    reason: "QA playbook safety mention forbids reset.",
    removal_criteria: "Safety mention moves to AGENTS.md only.",
  },
];

async function walkTsFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for await (const entry of Deno.readDir(new URL(dir, ROOT))) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory) {
      out.push(...await walkTsFiles(path));
    } else if (
      entry.isFile &&
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith("_test.ts") &&
      entry.name !== "tests.ts" &&
      entry.name !== "runtime_guards_architecture_test.ts"
    ) {
      out.push(path);
    }
  }
  return out;
}

async function walkFiles(
  dir: URL,
  relative = ".",
  include: (path: string) => boolean = () => true,
): Promise<string[]> {
  const out: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    const path = relative === "." ? entry.name : `${relative}/${entry.name}`;
    if (
      entry.isDirectory &&
      ![".git", "node_modules", ".supabase", "dist", "build"].includes(
        entry.name,
      )
    ) {
      out.push(
        ...await walkFiles(new URL(`${entry.name}/`, dir), path, include),
      );
    } else if (entry.isFile && include(path)) {
      out.push(path);
    }
  }
  return out;
}

Deno.test("no_prod_runtime_imports_for_test_helpers", async () => {
  const files = await walkTsFiles(".");
  const offenders: string[] = [];
  for (const file of files) {
    const text = await Deno.readTextFile(new URL(file, ROOT));
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      const isCompatibilityAlias =
        /^\s*export\s+(?:const|function|type)\s+\w+ForTest\b/.test(line) ||
        /\bas\s+\w+ForTest\b/.test(line);
      const isPureTestInjection = /\b(?:set|reset)\w+ForTest\b/.test(line) ||
        /\b(?:traceSink|intakeRunner|intakeModel)\w*ForTest\b/.test(line) ||
        /\b\w+Override\b/.test(line);
      const importsForTest = /^\s*import\b[\s\S]*\b\w+ForTest\b/.test(line);
      const callsForTest = /\b\w+ForTest\s*\(/.test(line);
      if (
        (importsForTest || callsForTest) &&
        !isCompatibilityAlias &&
        !isPureTestInjection
      ) {
        offenders.push(`${file}:${index + 1}:${line.trim()}`);
      }
    });
  }
  assertEquals(offenders, []);
});

Deno.test("legacy_semantic_patches_are_isolated", async () => {
  const runText = await Deno.readTextFile(new URL("./router/run.ts", ROOT));
  assert(!runText.includes("function isStatusOnlyNoMutationRequest("));
  assert(!runText.includes("function shouldRenderStatusOnlyNoMutation("));
  assert(!runText.includes("function detectExplicitNoToolRequest("));

  const legacyText = await Deno.readTextFile(
    new URL("./router/legacy_semantic_patches.ts", ROOT),
  );
  assert(legacyText.includes("LEGACY SEMANTIC PATCH - do not extend."));
  assert(legacyText.includes("removal_condition"));
});

Deno.test("turn_intent_arbitrator_transition_detectors_stay_explicitly_listed", async () => {
  const text = await Deno.readTextFile(
    new URL("./router/turn_intent_arbitrator.ts", ROOT),
  );
  const exportedSemanticHelpers = [...text.matchAll(
    /export function ((?:detects|looksLike)[A-Z]\w+)/g,
  )].map((match) => match[1]).sort();
  assertEquals(
    exportedSemanticHelpers,
    KNOWN_L3_SEMANTIC_HELPERS.map((item) => item.name).sort(),
  );
});

Deno.test("no_new_l3_transitionals_without_whitelist", async () => {
  const text = await Deno.readTextFile(
    new URL("./router/turn_intent_arbitrator.ts", ROOT),
  );
  assert(
    KNOWN_L3_TRANSITIONAL_COMMENTS.every((item) =>
      item.reason && item.removal_criteria
    ),
  );
  const allowedTransitionals = KNOWN_L3_TRANSITIONAL_COMMENTS.map((item) =>
    item.name
  ).sort();
  const detected: string[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const match = line.match(
      /export function ((?:detects|looksLike)[A-Z]\w+)/,
    );
    if (!match) return;
    const nearbyComment = lines.slice(Math.max(0, index - 32), index).join(
      "\n",
    );
    if (nearbyComment.includes("TRANSITIONNEL")) detected.push(match[1]);
  });
  assertEquals(detected.sort(), allowedTransitionals);
});

Deno.test("run_ts_has_no_local_detects_isExplicit_or_looksLike_helpers", async () => {
  const runText = await Deno.readTextFile(new URL("./router/run.ts", ROOT));
  const localHelpers = [...runText.matchAll(
    /function ((?:detects|isExplicit|looksLike)[A-Z]\w+)/g,
  )].map((match) => match[1]).sort();
  assertEquals(localHelpers, []);
});

Deno.test("run_ts_has_no_new_tool_runtime_import_sprawl", async () => {
  const runText = await Deno.readTextFile(new URL("./router/run.ts", ROOT));
  const directToolRouterImports = [...runText.matchAll(
    /from\s+["'](\.\.\/tools\/operations\/[^"']+\/router\.ts)["']/g,
  )].map((match) => match[1]).sort();
  assertEquals(
    directToolRouterImports,
    KNOWN_RUN_TOOL_ROUTER_IMPORTS.map((item) => item.name).sort(),
  );

  const pipelineText = await Deno.readTextFile(
    new URL("./router/operation_runtime_pipeline.ts", ROOT),
  );
  for (
    const tool of [
      "create_recurring_reminder",
      "prepare_attack_card",
      "prepare_defense_card",
      "select_state_potion",
      "update_coach_preferences",
    ]
  ) {
    assert(
      pipelineText.includes(`../tools/operations/${tool}/router.ts`),
      `operation_runtime_pipeline.ts should own ${tool} runtime import`,
    );
  }
});

Deno.test("final_effect_claim_guard_still_rewrites_without_commit", () => {
  const guarded = applyUnexecutedEffectClaimGuard({
    responseContent: "C'est programmé ✅",
    intendedTools: ["create_one_shot_reminder"],
    executedTools: [],
  });
  assert(guarded.includes("je n'ai pas encore programmé"));
});

Deno.test("style_policy_no_emoji_still_applies", () => {
  const guarded = applyCoachResponseStylePreferences({
    userMessage: "Réponds sans emoji, en 3 lignes.",
    responseContent: "Ok 🙂\nJe garde une action.\nTu confirmes ?",
    preferences: {
      noEmoji: false,
      maxLines: null,
      avoidFinalQuestion: true,
    },
  });
  assertEquals(guarded.includes("🙂"), false);
  assertEquals(guarded.includes("?"), false);
});

Deno.test("one_shot_route_guard_behavior_preserved", () => {
  const statusGuard = oneShotReminderStatusBlocksToolFlow({
    message: "Dernier check: le rappel est vraiment programme ?",
    routeIsProductHelp: false,
    explicitProductHelp: false,
    activeCardDrafting: false,
    explicitOperationCommand: false,
    statusOnlyNoMutation: true,
  });
  assertEquals(statusGuard.blocked, true);

  const directEffectGuard =
    oneShotReminderDirectEffectBlockForNonMutationContext({
      message: "Sans rien modifier, recap du rappel.",
      routeIsProductHelp: false,
      statusOnlyNoMutation: true,
      recapOnly: false,
    });
  assertEquals(directEffectGuard.blocked, true);
});

Deno.test("status_recap_guard_behavior_preserved", () => {
  const message =
    "Dernier check sans modifier: qu'est-ce qui a vraiment ete cree ou garde ?";
  assertEquals(isStatusOnlyNoMutationRequest(message), true);
  assertEquals(shouldRenderStatusOnlyNoMutation(message), true);
});

Deno.test("operation_runtime_pipeline_is_unique_runtime_entry_for_tools", async () => {
  const runText = await Deno.readTextFile(new URL("./router/run.ts", ROOT));
  const pipelineText = await Deno.readTextFile(
    new URL("./router/operation_runtime_pipeline.ts", ROOT),
  );

  const forbiddenRunRuntimeSymbols = [
    "maybeRunTrackProgressPlanItemRuntime",
    "createTrackProgressPlanItemWrite",
    "maybeRunCreateRecurringReminderOperation",
    "maybeRunPrepareAttackCardOperation",
    "maybeRunPrepareDefenseCardOperation",
    "maybeRunSelectStatePotionOperation",
    "maybeRunUpdateCoachPreferencesOperation",
  ];
  for (const symbol of forbiddenRunRuntimeSymbols) {
    assertEquals(runText.includes(symbol), false, symbol);
  }

  const pipelineRuntimeSymbols = [
    "runTrackProgressPlanItemDirectEffect",
    "maybeRunCreateRecurringReminderOperation",
    "maybeRunPrepareAttackCardOperation",
    "maybeRunPrepareDefenseCardOperation",
    "maybeRunSelectStatePotionOperation",
    "maybeRunUpdateCoachPreferencesOperation",
  ];
  for (const symbol of pipelineRuntimeSymbols) {
    assert(pipelineText.includes(symbol), symbol);
  }
});

Deno.test("run_ts_does_not_execute_tools_without_effect_ledger_adapter", async () => {
  const runText = await Deno.readTextFile(new URL("./router/run.ts", ROOT));
  assert(runText.includes("recordToolSkillEffectsInLedger"));
  assert(runText.includes("recordAgendaEffectsInLedger"));
  assert(!/executedTools:\s*\[[^\]]+]/.test(runText));
  assert(!/executedTools\s*:\s*status\s*===/.test(runText));
});

Deno.test("executed_tools_require_success_and_final_guards_rewrite_uncommitted_claims", () => {
  assertEquals(executedToolsForStatus("blocked", ["prepare_attack_card"]), []);
  assertEquals(executedToolsForStatus("failed", ["prepare_attack_card"]), []);
  assertEquals(executedToolsForStatus("success", ["prepare_attack_card"]), []);
  assertEquals(
    executedToolsForStatus("success", ["prepare_attack_card"], [{
      type: "prepare_attack_card",
    }]),
    ["prepare_attack_card"],
  );

  const ledger = createEffectLedger("turn-architecture");
  recordRequestedEffect(ledger, {
    effect_id: "requested-card",
    effect_type: "attack_card.create",
    operation_type: "prepare_attack_card",
    source: "tool_skill",
  });
  const rewritten = rewriteUncommittedEffectClaims({
    reply: "Carte créée.",
    ledger,
  });
  assertEquals(rewritten.changed, true);
});

Deno.test("no_executed_tools_from_plain_status_pattern", async () => {
  const files = await walkTsFiles(".");
  const offenders: string[] = [];
  for (const file of files) {
    const text = await Deno.readTextFile(new URL(file, ROOT));
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      const hardcodedExecutedTools =
        /executedTools\s*:\s*\[(?!\s*\])/.test(line) ||
        /executedTools\s*:\s*status\s*===/.test(line);
      if (!hardcodedExecutedTools) return;
      const nearby = lines.slice(Math.max(0, index - 8), index + 9).join("\n");
      const guardedByCommit =
        /committed_effects|committedEffects|committed\.length/.test(nearby);
      if (!guardedByCommit) {
        offenders.push(`${file}:${index + 1}:${line.trim()}`);
      }
    });
  }
  assertEquals(offenders, []);
});

Deno.test("no_supabase_db_reset_reference_outside_safety_docs", async () => {
  const repoRoot = new URL("../../../", ROOT);
  const files = await walkFiles(
    repoRoot,
    ".",
    (path) => !path.endsWith("runtime_guards_architecture_test.ts"),
  );
  const allowed = new Set(
    KNOWN_SUPABASE_DESTRUCTIVE_REFERENCES.map((item) => item.name),
  );
  const offenders: string[] = [];
  for (const file of files) {
    const text = await Deno.readTextFile(new URL(file, repoRoot)).catch(() =>
      ""
    );
    if (
      text.includes("supabase db reset") ||
      text.includes("supabase db push --linked")
    ) {
      if (!allowed.has(file)) offenders.push(file);
    }
  }
  assertEquals(offenders.sort(), []);
});
