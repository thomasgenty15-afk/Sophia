import { assert, assertEquals } from "jsr:@std/assert@1";
import { STATUS_RECAP_MIGRATION_STATUS } from "./status_recap/contract.ts";
import { WEEKLY_REVIEW_MIGRATION_STATUS } from "./weekly_review/contract.ts";
import { conversationEffectsFromCandidates } from "./_shared/conversation_skill_contract.ts";

const ROOT = new URL(".", import.meta.url);
const KNOWN_CONVERSATION_SKILL_EXCEPTIONS = [{
  name: "status_recap",
  reason:
    "Status recap is a read-only runtime skill and is not yet split into a full local dispatcher.",
  removal_criteria:
    "Status recap migrates to a full local dispatcher or remains documented as read-only.",
}, {
  name: "weekly_review",
  reason:
    "Weekly review runtime still owns bridge orchestration while operation commits remain behind owner tools.",
  removal_criteria:
    "Weekly review exposes standard intake.ts + skill.ts and typed request-only bridge effects.",
}];

function skillPath(skill: string, file: string): URL {
  return new URL(`./${skill}/${file}`, ROOT);
}

Deno.test("conversation skills expose standard files or documented exception", async () => {
  const localDispatcherSkills = {
    emotional_repair: [
      "contract.ts",
      "local_flow.ts",
      "visible_agent.ts",
      "skill.ts",
    ],
    safety_crisis: [
      "contract.ts",
      "local_dispatcher.ts",
      "reducer.ts",
      "visible_agent.ts",
      "skill.ts",
    ],
    product_help: [
      "contract.ts",
      "local_flow.ts",
      "visible_agent.ts",
      "skill.ts",
    ],
    demotivation_repair: [
      "contract.ts",
      "context_pack.ts",
      "local_flow.ts",
      "visible_agent.ts",
      "skill.ts",
    ],
  } as const;
  for (const [skill, files] of Object.entries(localDispatcherSkills)) {
    for (const file of files) {
      const stat = await Deno.stat(skillPath(skill, file));
      assert(stat.isFile, `${skill}/${file}`);
    }
  }
  for (const file of ["intake.ts", "reducer.ts", "renderer.ts", "prompt.ts"]) {
    try {
      await Deno.stat(skillPath("demotivation_repair", file));
      throw new Error(`demotivation_repair/${file} should be removed`);
    } catch (error) {
      assert(error instanceof Deno.errors.NotFound);
    }
  }
  assertEquals(
    STATUS_RECAP_MIGRATION_STATUS.durable_effect_policy,
    "never_mutates",
  );
  assert(
    WEEKLY_REVIEW_MIGRATION_STATUS.durable_effect_policy.includes(
      "does not apply durable plan changes directly",
    ),
  );
  assert(
    KNOWN_CONVERSATION_SKILL_EXCEPTIONS.every((item) =>
      item.reason && item.removal_criteria
    ),
  );
});

Deno.test("operation suggestions remain suggestions and do not execute tools", () => {
  const effects = conversationEffectsFromCandidates({
    operation_suggestions: [{
      operation_type: "prepare_attack_card",
      reason: "blocage ponctuel",
      confidence_band: "medium",
      urgency: "medium",
      source_skill_id: "demotivation_repair",
      requires_user_consent: true,
      operation_input_hint: { title: "ouvrir le document" },
    }],
  });
  assertEquals(effects.committed, []);
  assertEquals(
    effects.allowed[0] &&
      (effects.allowed[0] as any).type,
    "operation_suggestion_candidate",
  );
});

Deno.test("operation suggestions without explicit consent are blocked", () => {
  const effects = conversationEffectsFromCandidates({
    operation_suggestions: [{
      operation_type: "prepare_attack_card",
      reason: "bad suggestion",
      confidence_band: "medium",
      urgency: "low",
      source_skill_id: "demotivation_repair",
      requires_user_consent: false,
    }],
  });

  assertEquals(effects.allowed, []);
  assertEquals(effects.committed, []);
  assert(
    effects.blocked.some((effect) =>
      effect.type === "operation_suggestion" &&
      effect.reason_code === "user_consent_required"
    ),
  );
});

Deno.test("memory candidates are candidates, not committed memory", () => {
  const effects = conversationEffectsFromCandidates({
    memory_write_candidates: [{
      kind: "statement",
      content_text: "Blocage ponctuel sur le mail.",
      evidence_source_ids: ["message-1"],
      confidence_band: "medium",
      should_persist_default: false,
      anti_identity_freeze_checked: true,
      sensitivity_level: 1,
      persistence_rationale: "Session-only context emitted by a skill.",
    }],
  });
  assertEquals(effects.committed, []);
  assertEquals(effects.allowed.length, 1);
});

Deno.test("conversation skills do not commit durable effects directly", async () => {
  const skills = [
    "emotional_repair",
    "demotivation_repair",
    "safety_crisis",
    "product_help",
    "status_recap",
    "weekly_review",
  ];
  const offenders: string[] = [];
  for (const skill of skills) {
    for await (const entry of Deno.readDir(skillPath(skill, ""))) {
      if (
        !entry.isFile ||
        !entry.name.endsWith(".ts") ||
        entry.name.endsWith("_test.ts")
      ) continue;
      const file = `${skill}/${entry.name}`;
      const text = await Deno.readTextFile(skillPath(skill, entry.name));
      if (text.includes("recordCommittedEffect")) {
        offenders.push(`${file}:recordCommittedEffect`);
      }
      if (
        /effects\s*:\s*{[\s\S]{0,240}committed\s*:\s*\[(?!\s*\])/.test(text)
      ) {
        offenders.push(`${file}:non_empty_committed_effect_literal`);
      }
    }
  }
  assertEquals(offenders, []);
});
