export type ResponseOwner =
  | "safety"
  // W3.2 — owner CLINIQUE (TCA), distinct de "safety" (crise suicidaire). Il
  // n'est jamais sélectionné par un signal du dispatcher : seul le plancher
  // déterministe `_shared/keel/restriction_guard.ts` l'ouvre.
  | "disordered_eating_guard"
  | "product_help"
  // W4.4 — KEEL. Lane d'EXÉCUTION (« je peux remplacer X par Y ? »), distincte
  // de `plan_realignment` qui est la lane de DÉCROCHAGE. Non collante: aucune
  // branche de continuation, la question se répond en un tour.
  | "plan_question"
  // W2.A: "feature_opportunity" retiré de l'union — plus aucun owner possible.
  | "presence_conversation"
  | "attack_keyword_support"
  | "direct_effect"
  | "normal_reply";

export type MemoryUseKind =
  | "reference_resolution"
  | "target_resolution"
  | "context_only"
  | "none";

export type BlockedPath = {
  path: string;
  reason_code: string;
  raw_score?: number;
  adjusted_score?: number;
};

export type RouteDecision = {
  route_version: "v1";
  response_owner: ResponseOwner;
  selected_handler?: string;
  blocked_paths: BlockedPath[];
  direct_effects_to_run: string[];
  reason_code: string;
  memory_used_for_route: boolean;
  memory_item_ids_used_for_route: string[];
  memory_use_kind: MemoryUseKind;
  active_flow_arbitration?: {
    decision: string;
    active_owner: string;
    selected_owner: string;
    resume_policy: string;
    reason_code: string;
    continuation_intent?: string | null;
  };
};
