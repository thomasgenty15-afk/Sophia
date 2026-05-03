import type {
  MemoryItemKind,
  RetrievalHint,
  RetrievalMode,
  SensitivityLevel,
  TopicDecision,
} from "../types.v1.ts";

export type GoldenScenarioId = string;

export interface GoldenScenario {
  id: GoldenScenarioId;
  description: string;
  scenario_version: number;
  initial_state?: ScenarioInitialState;
  turns: ScenarioTurn[];
  global_assertions?: GlobalAssertion[];
}

export interface ScenarioInitialState {
  topics?: SeedTopic[];
  entities?: SeedEntity[];
  memory_items?: SeedMemoryItem[];
  payload_state?: SeedPayloadState;
}

export interface SeedTopic {
  id?: string;
  slug: string;
  title: string;
  lifecycle_stage?: "candidate" | "durable" | "dormant" | "archived";
  synthesis?: string;
  search_doc?: string;
  domain_keys?: string[];
  sensitivity_max?: SensitivityLevel;
  metadata?: Record<string, unknown>;
}

export interface SeedEntity {
  id?: string;
  display_name: string;
  aliases?: string[];
  relation_to_user?: string;
  entity_type?: string;
  status?: "candidate" | "active" | "merged" | "archived";
  metadata?: Record<string, unknown>;
}

export interface SeedMemoryItem {
  id?: string;
  kind: MemoryItemKind;
  content_text: string;
  status?:
    | "candidate"
    | "active"
    | "superseded"
    | "invalidated"
    | "hidden_by_user"
    | "deleted_by_user"
    | "archived";
  domain_keys?: string[];
  sensitivity_level?: SensitivityLevel;
  topic_slug?: string;
  entity_aliases?: string[];
  metadata?: Record<string, unknown>;
}

export interface SeedPayloadState {
  active_topic_slug?: string;
  memory_item_ids?: string[];
  entity_aliases?: string[];
  modules?: Record<string, unknown>;
}

export interface ScenarioTurn {
  user?: string;
  assistant_response_mock?: string;
  after_days?: number;
  after_minutes?: number;
  mock_observed?: Partial<ObservedTurnState>;
  expect: TurnExpectation;
}

export interface TurnExpectation {
  retrieval_mode?: RetrievalMode;
  retrieval_hints?: RetrievalHint[];
  topic_decision?: TopicDecision;
  topic_confidence_min?: number;
  active_topic_slug?: string;
  payload_contains?: PayloadAssertion[];
  payload_does_not_contain?: PayloadAssertion[];
  created_items?: CreatedItemAssertion[];
  forbidden_items?: ForbiddenItemAssertion[];
  created_entities?: CreatedEntityAssertion[];
  applied_operations?: AppliedOperationAssertion[];
  no_extraction?: boolean;
}

export interface CreatedItemAssertion {
  kind: MemoryItemKind;
  contains?: string[];
  not_contains?: string[];
  domain_keys_any_of?: string[];
  sensitivity_level?: SensitivityLevel;
  linked_topic_slug?: string;
  linked_entity_aliases_any_of?: string[];
  linked_action?: boolean;
}

export interface ForbiddenItemAssertion {
  kind?: MemoryItemKind;
  contains?: string[];
}

export interface CreatedEntityAssertion {
  display_name?: string;
  aliases_any_of?: string[];
  relation_to_user?: string;
  entity_type?: string;
}

export interface AppliedOperationAssertion {
  operation_type: "invalidate" | "supersede" | "hide" | "delete" | "merge";
  target_kind?: "memory_item" | "entity" | "topic";
}

export interface PayloadAssertion {
  kind?: MemoryItemKind;
  contains?: string;
  topic_slug?: string;
  entity_alias?: string;
}

export interface GlobalAssertion {
  no_invalid_injection?: boolean;
  no_deleted_in_payload?: boolean;
  no_statement_as_fact?: boolean;
  no_cross_user_data?: boolean;
  no_duplicate_extraction_on_retry?: boolean;
  no_message_double_processing?: boolean;
}

export interface ScenarioRunOptions {
  llm_mode: "mock" | "replay" | "record" | "refresh";
  fixtures_dir?: string;
  user_seed?: string;
  isolate_db?: boolean;
}

export interface ScenarioRunResult {
  scenario_id: GoldenScenarioId;
  passed: boolean;
  turn_results: TurnResult[];
  global_assertions_result: Record<string, boolean>;
  duration_ms: number;
  failures: ScenarioFailure[];
}

export interface TurnResult {
  turn_index: number;
  passed: boolean;
  observed: ObservedTurnState;
  failures: AssertionFailure[];
}

export interface ObservedTurnState {
  retrieval_mode: RetrievalMode;
  retrieval_hints: RetrievalHint[];
  topic_decision: TopicDecision;
  active_topic_id: string | null;
  payload_item_ids: string[];
  payload_entities: string[];
  created_item_ids: string[];
  created_entity_ids: string[];
  applied_operations: AppliedOperation[];
  extraction_run_id: string | null;
  duration_ms: number;
}

export interface AppliedOperation {
  operation_type: "invalidate" | "supersede" | "hide" | "delete" | "merge";
  target_kind: "memory_item" | "entity" | "topic";
  target_id: string;
}

export interface AssertionFailure {
  assertion: string;
  message: string;
  expected?: unknown;
  observed?: unknown;
}

export interface ScenarioFailure {
  turn_index?: number;
  message: string;
  failures?: AssertionFailure[];
}

export interface ScenarioRunner {
  run(
    scenario: GoldenScenario,
    options: ScenarioRunOptions,
  ): Promise<ScenarioRunResult>;
  runAll(
    scenarios: GoldenScenario[],
    options: ScenarioRunOptions,
  ): Promise<ScenarioRunResult[]>;
}
