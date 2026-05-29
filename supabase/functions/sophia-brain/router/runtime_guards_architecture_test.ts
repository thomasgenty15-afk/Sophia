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
  assertEquals(exportedSemanticHelpers, [
    "detectsActiveToolCancellation",
    "detectsDurableCoachPreference",
    "detectsExactDurableStatus",
    "detectsExplicitAttackCardCreationRequest",
    "detectsExplicitNoStatusRequest",
    "detectsExplicitOneShotReminderCreate",
    "detectsExplicitProductHelp",
    "detectsMultiEntityDurableStatus",
    "detectsPonctualResponseFormatConstraint",
    "detectsRecapRequest",
    "looksLikeAttackCardSlotCorrection",
  ]);
});

Deno.test("turn_intent_arbitrator_transitional_comment_inventory_is_whitelisted", async () => {
  const text = await Deno.readTextFile(
    new URL("./router/turn_intent_arbitrator.ts", ROOT),
  );
  const allowedTransitionals = [
    "detectsExplicitOneShotReminderCreate",
    "detectsActiveToolCancellation",
    "detectsDurableCoachPreference",
    "detectsExplicitProductHelp",
    "detectsExactDurableStatus",
    "detectsRecapRequest",
    "detectsPonctualResponseFormatConstraint",
    "looksLikeAttackCardSlotCorrection",
    "detectsMultiEntityDurableStatus",
    "detectsExplicitAttackCardCreationRequest",
  ].sort();
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
});

Deno.test("executed_tools_require_success_and_final_guards_rewrite_uncommitted_claims", () => {
  assertEquals(executedToolsForStatus("blocked", ["prepare_attack_card"]), []);
  assertEquals(executedToolsForStatus("failed", ["prepare_attack_card"]), []);
  assertEquals(executedToolsForStatus("success", ["prepare_attack_card"]), [
    "prepare_attack_card",
  ]);

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

Deno.test("architecture_sources_do_not_contain_destructive_supabase_commands", async () => {
  const files = [
    "./router/run.ts",
    "./router/operation_runtime_pipeline.ts",
    "./router/effect_ledger.ts",
    "./router/effect_ledger_adapter.ts",
  ];
  for (const file of files) {
    const text = await Deno.readTextFile(new URL(file, ROOT));
    assertEquals(text.includes("supabase db reset"), false, file);
    assertEquals(text.includes("supabase db push --linked"), false, file);
  }
});
