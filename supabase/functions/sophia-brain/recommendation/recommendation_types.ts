import type { RiskBand, TurnFrame } from "../contracts/turn_frame.v1.ts";
import type { ConversationSkillOutput } from "../contracts/skill_output.v1.ts";
import type { ProductSurfaceDefinition } from "../product_surface_registry/registry.ts";

export type RecommendationDecision =
  | "recommend"
  | "recommend_operation"
  | "ask_clarification"
  | "defer"
  | "blocked";

export type ProductRecommendation = {
  recommendation_id: string;
  decision: RecommendationDecision;
  surface_id?: string | null;
  executor_tool_id?: string | null;
  operation_type?: string | null;
  operation_input?: Record<string, unknown> | null;
  confidence: number;
  timing: "now" | "later" | "watch";
  presentation_level: 0 | 1 | 2 | 3 | 4 | 5;
  cta_style: "none" | "soft" | "direct";
  requires_consent: boolean;
  reason: string;
  user_facing_offer?: string | null;
  alternatives: Array<{
    surface_id: string;
    confidence: number;
    reason: string;
  }>;
  do_not_recommend: Array<{
    surface_id: string;
    reason: string;
  }>;
  blocked_reason?: string;
};

export type RecommendationLlmRunner = (input: {
  system_prompt: string;
  user_prompt: string;
  json_mode: true;
  model_name: string;
}) => Promise<unknown>;

export type RecommendationToolInput = {
  user_id: string;
  channel: "web" | "whatsapp";
  current_skill_id?: string;
  skill_output?: ConversationSkillOutput;
  turn_frame: TurnFrame;
  memory_payload: unknown;
  active_topic_state?: unknown;
  presentation_state?: unknown;
  plan_items?: Array<{
    id: string;
    title: string;
    status?: string;
    item_type?: string;
    dimension?: string;
  }>;
  available_surfaces: ProductSurfaceDefinition[];
  recent_recommendations: Array<Record<string, unknown>>;
  user_preferences?: unknown;
  safety_context_risk_band: RiskBand;
  llm_runner?: RecommendationLlmRunner;
  model_name?: string;
  on_stats?: (stats: {
    latency_ms: number;
    prompt_version: string;
    model_name: string;
    used_llm: boolean;
  }) => void;
};
