import type { NoteInformation } from "../../contracts/note_information.v1.ts";
import type { SkillContext, SkillMemoryItem } from "../_shared/context.ts";
import type { RunDemotivationRepairSkillInput } from "./skill.ts";

function compactText(value: unknown, max = 220): string | null {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, max) : null;
}

function compactPlanItem(item: Record<string, unknown>) {
  return {
    id: compactText(item.id, 80),
    title: compactText(item.title, 140),
    status: compactText(item.status, 80),
    kind: compactText(item.kind, 80),
    dimension: compactText(item.dimension, 80),
    source: "db_derived",
    confidence: "medium",
    freshness: "current_snapshot",
    evidence: [compactText(item.title, 140)].filter(Boolean),
  };
}

function inboundNote(context: SkillContext): NoteInformation | null {
  const active = context.active_skill_working_state as any;
  return active?.note_information ??
    active?.working_state?.note_information ??
    (context as any).note_information ??
    (context as any).flow_opportunity_context?.note_information ??
    null;
}

export function buildDemotivationRepairDbContextPack(
  input: RunDemotivationRepairSkillInput,
) {
  const planItems = Array.isArray(input.context.plan_items)
    ? input.context.plan_items.slice(0, 6).map(compactPlanItem)
    : [];
  const activeItems = planItems.filter((item) =>
    item.status === "active" || item.status === "in_progress" || !item.status
  ).slice(0, 4);
  return {
    source: "skill_context",
    freshness: "current_turn",
    confidence: "medium",
    status: "db_derived",
    evidence: [
      planItems.length > 0 ? "plan_items_compacted" : "",
      activeItems.length > 0 ? "active_or_candidate_actions_compacted" : "",
    ].filter(Boolean),
    plan_context: {
      active_or_candidate_items: activeItems,
      total_items_seen: planItems.length,
    },
    potion_bridge_catalog: {
      allowed_from_demotivation_repair: ["clarte", "courage", "rappel"],
      rappel_visible_label: "Potion anti-décrochage",
      source: "contract",
    },
    note_information_inbound: inboundNote(input.context),
    exclusions: input.context.exclusions ?? [],
  };
}

function sensitivity(item: SkillMemoryItem): "normal" | "sensitive" | "safety" {
  const raw = String(item.sensitivity_level ?? "").trim();
  if (raw === "safety" || raw === "4") return "safety";
  if (raw === "sensitive" || raw === "3" || raw === "2") return "sensitive";
  return "normal";
}

export function buildDemotivationRepairMicroMemoryContext(
  input: RunDemotivationRepairSkillInput,
) {
  const exclusions: string[] = [];
  const items = (input.context.relevant_memory_items ?? []).flatMap((item) => {
    const itemSensitivity = sensitivity(item);
    if (itemSensitivity === "safety") {
      exclusions.push(`safety_memory:${item.id}`);
      return [];
    }
    const summary = compactText(item.content_text, 180);
    if (!summary) return [];
    return [{
      summary,
      source: "semantic_memory",
      linked_object: {
        type: "memory_item",
        id: item.id,
        label: compactText(item.kind, 80),
      },
      freshness: "recent",
      confidence: "medium",
      evidence: [summary],
      sensitivity: itemSensitivity,
    }];
  }).slice(0, 3);
  return {
    items,
    exclusions,
    budget: {
      max_items: 3,
      reason:
        "demotivation_repair only uses close memory to relate demotivation to an active action, recent blocker, or plan pressure without locking the cause.",
    },
    usage_rule:
      "Memory can create candidates only. If the user did not confirm the link this turn, ask or propose instead of affirming.",
  };
}
