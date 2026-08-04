import type { TurnFrame } from "../../contracts/turn_frame.v1.ts";
import { RECENT_MESSAGE_LIMITS } from "../../context/recent_messages_policy.ts";
import type { ActiveConversationSkillWorkingState } from "./active_skill_state.ts";

export type SkillId =
  | "safety_crisis"
  // W3.2 — flow CLINIQUE (TCA), distinct de la crise suicidaire. Son entrée ne
  // vient pas d'un signal dispatcher mais du plancher déterministe
  // `_shared/keel/restriction_guard.ts`.
  | "disordered_eating_guard"
  | "product_help"
  | "coaching_recommendation"
  | "daily_action_coaching_recommendation_v1"
  | "feature_opportunity"
  | "plan_realignment"
  // W4.4 — KEEL. Lane d'exécution résolue en Tier 0 déterministe (aucun modèle
  // sur le chemin de la permission).
  | "plan_question"
  | "winback_reengagement_v1";

export type SkillMemoryItem = {
  id: string;
  kind: string;
  content_text: string;
  status?: string;
  sensitivity_level?: "normal" | "sensitive" | "safety" | number;
  topic_ids?: string[];
  domain_keys?: string[];
};

export type SkillContext = {
  skill_id: SkillId;
  user_id: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  active_skill_working_state: ActiveConversationSkillWorkingState | null;
  turn_frame: TurnFrame;
  relevant_memory_items: SkillMemoryItem[];
  plan_items: Array<Record<string, unknown>>;
  product_surfaces: Array<Record<string, unknown>>;
  exclusions: string[];
  runtime_context?: {
    recent_effects_summary?: string | null;
    recent_direct_effect_confirmation_context?: Record<string, unknown> | null;
    user_identity?: {
      first_name: string | null;
      age: number | null;
      gender: "male" | "female" | "other" | null;
    } | null;
  };
  precomputed_safety_crisis_local_dispatcher_output?: unknown;
  /** P7-A (paul-p6reval R1-B06): co-demande de recall mémoire BÉNIGNE posée
   * sur un tour possédé par safety — le visible agent la restitue en une
   * ligne ou la diffère honnêtement, jamais un silence. */
  benign_recall_request?: { asked: boolean; facts: string[] } | null;
  /**
   * W4.2 / QA agent-12: `profiles.country`, ISO 3166-1 alpha-2, tel que le
   * runtime l'a lu — JAMAIS dérivé de la locale ici, la précédence est la
   * règle de `crisis_resources.ts`. C'est le canal par lequel la lane crise
   * apprend le pays, le même que `disordered_eating_guard_runtime.country`
   * pour la lane TCA.
   *
   * `null` = pays inconnu, et cela DOIT rester distinguable d'un pays connu:
   * le repli international n'est correct que sur un inconnu déclaré.
   */
  student_country?: string | null;
};

export type LoadSkillContextInput = {
  user_id: string;
  active_skill_working_state: ActiveConversationSkillWorkingState | null;
  turn_frame: TurnFrame;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  memory_runtime?: {
    load: (args: { skill_id: SkillId; user_id: string }) =>
      | Promise<SkillMemoryItem[]>
      | SkillMemoryItem[];
  };
  plan_snapshot?: { items?: Array<Record<string, unknown>> } | null;
  product_registry?: Array<Record<string, unknown>>;
};

function sensitivityRank(level: SkillMemoryItem["sensitivity_level"]): number {
  if (level === "safety" || level === 4) return 4;
  if (level === "sensitive" || level === 3 || level === 2) return 3;
  if (level === 1) return 1;
  return 0;
}

export async function loadBaseSkillContext(
  skillId: SkillId,
  input: LoadSkillContextInput,
  policy: {
    include_plan: boolean;
    include_product: boolean;
    allow_sensitive: boolean;
    allow_safety_memory: boolean;
  },
): Promise<SkillContext> {
  const loaded = input.memory_runtime
    ? await input.memory_runtime.load({
      skill_id: skillId,
      user_id: input.user_id,
    })
    : [];
  const exclusions: string[] = [];
  const relevant = loaded.filter((item) => {
    if (item.status && item.status !== "active") {
      exclusions.push(`non_active:${item.id}`);
      return false;
    }
    const sensitivity = sensitivityRank(item.sensitivity_level);
    if (sensitivity >= 4 && !policy.allow_safety_memory) {
      exclusions.push(`safety_memory:${item.id}`);
      return false;
    }
    if (sensitivity >= 3 && !policy.allow_sensitive) {
      exclusions.push(`sensitive_memory:${item.id}`);
      return false;
    }
    return true;
  });
  const recentLimit = skillId === "safety_crisis"
    ? RECENT_MESSAGE_LIMITS.conversationRepair
    : RECENT_MESSAGE_LIMITS.toolFlow;
  return {
    skill_id: skillId,
    user_id: input.user_id,
    recent_messages: input.recent_messages.slice(-recentLimit),
    active_skill_working_state: input.active_skill_working_state,
    turn_frame: input.turn_frame,
    relevant_memory_items: relevant,
    plan_items: policy.include_plan ? input.plan_snapshot?.items ?? [] : [],
    product_surfaces: policy.include_product
      ? input.product_registry ?? []
      : [],
    exclusions,
  };
}
