import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { visibleContractIssues } from "./agent.ts";

const CLARTE_FIELD_LABEL =
  "Pourquoi est-ce que tu as l’impression que ton plan n’a plus de sens pour toi aujourd’hui ?" as const;
const CLARTE_FIELD_VALUE =
  "Je fais les actions, mais je ne sens plus pourquoi elles comptent pour moi aujourd'hui.";

function clarteInput() {
  return {
    user_id: "u1",
    stage: "clarte_task" as const,
    user_message: "Je veux une potion de clarté.",
    recent_messages: [],
    selected_potion_label: "Potion de clarté",
    clarte_visible_task: "handoff_ready" as const,
    clarte_state: {
      flow_id: "select_state_potion.clarte" as const,
      selected_potion: "clarte" as const,
      field_id: "plan_meaning_loss_reason" as const,
      field_label: CLARTE_FIELD_LABEL,
      potion_name: "Potion de clarté" as const,
      platform_destination: "section État / Potions" as const,
      field_state: {
        status: "locked" as const,
        candidate_value: null,
        locked_value: CLARTE_FIELD_VALUE,
        previous_value: null,
        needs_user_confirmation: false,
        why_status: "test",
      },
      last_visible_task: "handoff_ready" as const,
      last_handoff_delivered: true,
    },
  };
}

Deno.test("visible agent guard accepts clarté handoff with required data", () => {
  const message = [
    "Oui, ça correspond à une Potion de clarté.",
    "Va dans État / Potions.",
    CLARTE_FIELD_LABEL,
    CLARTE_FIELD_VALUE,
  ].join("\n");

  assertEquals(visibleContractIssues(message, clarteInput()), []);
});

Deno.test("visible agent guard rejects legacy template and mutation claim", () => {
  const issues = visibleContractIssues(
    "Ce que je comprends : c'est activé, ta Potion de clarté est lancée.",
    clarteInput(),
  );

  assert(
    issues.some((issue) => issue.startsWith("forbidden_visible_template")),
  );
  assert(
    issues.some((issue) => issue.startsWith("forbidden_activation_claim")),
  );
});

Deno.test("visible agent guard rejects clarté handoff missing exact platform field", () => {
  const issues = visibleContractIssues(
    "Va dans État / Potions et choisis Potion de clarté.",
    clarteInput(),
  );

  assert(issues.includes("clarte_missing_field_label"));
  assert(issues.includes("clarte_missing_field_value"));
});

Deno.test("select_state_potion clarté has no deterministic visible renderer path", async () => {
  const root =
    "supabase/functions/sophia-brain/tools/operations/select_state_potion";
  const handoff = await Deno.readTextFile(`${root}/handoff.ts`);
  const renderer = await Deno.readTextFile(`${root}/renderer.ts`);
  const visibleAgent = await Deno.readTextFile(
    `${root}/visible_agents/agent.ts`,
  );

  assertEquals(handoff.includes("renderClarteVisibleTask"), false);
  assertEquals(renderer.includes("renderClarteVisibleTask"), false);
  assertEquals(
    renderer.includes("Quand tu regardes ton plan, qu’est-ce qui te donne"),
    false,
  );
  assertEquals(
    handoff.includes("je n'arrive pas à formuler correctement"),
    false,
  );
  assertEquals(handoff.includes("noPotionReply("), false);
  assertEquals(visibleAgent.includes(".match("), false);
  assertEquals(visibleAgent.includes(".test("), false);
  assertEquals(visibleAgent.includes("replace(/"), false);
});
