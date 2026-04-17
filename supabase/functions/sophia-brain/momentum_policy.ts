import type {
  ConsentLevel,
  EngagementLevel,
  EmotionalLoadLevel,
  MomentumStateLabel,
  ProgressionLevel,
} from "./momentum_state.ts";

export type MomentumMessageFamily =
  | "celebration"
  | "consolidation"
  | "next_step"
  | "blocker_diagnosis"
  | "recalibration"
  | "micro_step"
  | "meta_intervention"
  | "pressure_release"
  | "pause_respect"
  | "emotional_support"
  | "reactivation_open_door";

export type MomentumPolicyAction =
  | "reinforce"
  | "diagnose_blocker"
  | "reduce_pressure"
  | "respect_pause"
  | "stabilize"
  | "reopen_gently";

export interface MomentumPolicyDefinition {
  state: MomentumStateLabel;
  label: string;
  objective: string;
  primary_action: MomentumPolicyAction;
  allowed_message_families: MomentumMessageFamily[];
  forbidden_message_families: MomentumMessageFamily[];
  proactive_policy:
    | "supportive_ok"
    | "diagnostic_only"
    | "very_light_only"
    | "none"
    | "open_door_only";
  max_proactive_per_7d: number;
  min_gap_hours: number;
  exit_when: string[];
}

export interface MomentumDecisionTableRow {
  if_state: MomentumStateLabel;
  objective: string;
  branch_action: MomentumPolicyAction;
  allowed_message_families: MomentumMessageFamily[];
  forbidden_message_families: MomentumMessageFamily[];
}

export interface MomentumPolicySnapshot {
  state: MomentumStateLabel;
  dimensions: {
    engagement: EngagementLevel;
    progression: ProgressionLevel;
    emotional_load: EmotionalLoadLevel;
    consent: ConsentLevel;
  };
}

export const MOMENTUM_POLICY_REGISTRY: Record<
  MomentumStateLabel,
  MomentumPolicyDefinition
> = {
  momentum: {
    state: "momentum",
    label: "Momentum",
    objective: "Renforcer la dynamique en cours sans casser l'elan.",
    primary_action: "reinforce",
    allowed_message_families: [
      "celebration",
      "consolidation",
      "next_step",
    ],
    forbidden_message_families: [
      "meta_intervention",
      "pressure_release",
      "pause_respect",
      "emotional_support",
      "reactivation_open_door",
    ],
    proactive_policy: "supportive_ok",
    max_proactive_per_7d: 3,
    min_gap_hours: 24,
    exit_when: [
      "progression n'est plus up",
      "consentement n'est plus open",
      "charge emotionnelle devient high",
      "engagement chute durablement",
    ],
  },
  friction_legere: {
    state: "friction_legere",
    label: "Friction Legere",
    objective: "Comprendre le vrai blocage et recalibrer sans culpabiliser.",
    primary_action: "diagnose_blocker",
    allowed_message_families: [
      "blocker_diagnosis",
      "recalibration",
      "micro_step",
    ],
    forbidden_message_families: [
      "celebration",
      "meta_intervention",
      "pause_respect",
      "emotional_support",
      "reactivation_open_door",
    ],
    proactive_policy: "diagnostic_only",
    max_proactive_per_7d: 2,
    min_gap_hours: 48,
    exit_when: [
      "progression revient a up",
      "consentement devient fragile ou closed",
      "charge emotionnelle devient high",
      "engagement descend durablement",
    ],
  },
  evitement: {
    state: "evitement",
    label: "Evitement",
    objective: "Baisser la pression et changer le format de relation.",
    primary_action: "reduce_pressure",
    allowed_message_families: [
      "meta_intervention",
      "pressure_release",
    ],
    forbidden_message_families: [
      "celebration",
      "consolidation",
      "next_step",
      "blocker_diagnosis",
      "micro_step",
      "pause_respect",
      "emotional_support",
      "reactivation_open_door",
    ],
    proactive_policy: "very_light_only",
    max_proactive_per_7d: 1,
    min_gap_hours: 72,
    exit_when: [
      "consentement redevient open et engagement remonte",
      "silence prolonge fait glisser vers reactivation",
      "charge emotionnelle devient high",
      "stop explicite active une pause",
    ],
  },
  pause_consentie: {
    state: "pause_consentie",
    label: "Pause Consentie",
    objective: "Respecter la frontiere posee par le user.",
    primary_action: "respect_pause",
    allowed_message_families: [
      "pause_respect",
    ],
    forbidden_message_families: [
      "celebration",
      "consolidation",
      "next_step",
      "blocker_diagnosis",
      "recalibration",
      "micro_step",
      "meta_intervention",
      "pressure_release",
      "emotional_support",
      "reactivation_open_door",
    ],
    proactive_policy: "none",
    max_proactive_per_7d: 0,
    min_gap_hours: 9999,
    exit_when: [
      "le user rouvre explicitement la relation",
      "la pause expire et un vrai signal de reprise apparait",
    ],
  },
  soutien_emotionnel: {
    state: "soutien_emotionnel",
    label: "Soutien Emotionnel",
    objective: "Stabiliser et accompagner sans logique de performance.",
    primary_action: "stabilize",
    allowed_message_families: [
      "emotional_support",
      "pressure_release",
    ],
    forbidden_message_families: [
      "celebration",
      "consolidation",
      "next_step",
      "blocker_diagnosis",
      "recalibration",
      "micro_step",
      "meta_intervention",
      "pause_respect",
      "reactivation_open_door",
    ],
    proactive_policy: "very_light_only",
    max_proactive_per_7d: 1,
    min_gap_hours: 72,
    exit_when: [
      "charge emotionnelle n'est plus high",
      "le watcher confirme une sortie durable",
      "un stop explicite bascule vers pause_consentie",
    ],
  },
  reactivation: {
    state: "reactivation",
    label: "Reactivation",
    objective: "Rouvrir la porte sans mentionner l'echec ni mettre de pression.",
    primary_action: "reopen_gently",
    allowed_message_families: [
      "reactivation_open_door",
    ],
    forbidden_message_families: [
      "celebration",
      "consolidation",
      "next_step",
      "blocker_diagnosis",
      "recalibration",
      "micro_step",
      "meta_intervention",
      "pause_respect",
      "emotional_support",
      "pressure_release",
    ],
    proactive_policy: "open_door_only",
    max_proactive_per_7d: 1,
    min_gap_hours: 96,
    exit_when: [
      "le user repond de maniere substantielle",
      "consentement se ferme explicitement",
      "charge emotionnelle devient high",
    ],
  },
};

export const MOMENTUM_DECISION_TABLE: MomentumDecisionTableRow[] = [
  {
    if_state: "momentum",
    objective: MOMENTUM_POLICY_REGISTRY.momentum.objective,
    branch_action: MOMENTUM_POLICY_REGISTRY.momentum.primary_action,
    allowed_message_families:
      MOMENTUM_POLICY_REGISTRY.momentum.allowed_message_families,
    forbidden_message_families:
      MOMENTUM_POLICY_REGISTRY.momentum.forbidden_message_families,
  },
  {
    if_state: "friction_legere",
    objective: MOMENTUM_POLICY_REGISTRY.friction_legere.objective,
    branch_action: MOMENTUM_POLICY_REGISTRY.friction_legere.primary_action,
    allowed_message_families:
      MOMENTUM_POLICY_REGISTRY.friction_legere.allowed_message_families,
    forbidden_message_families:
      MOMENTUM_POLICY_REGISTRY.friction_legere.forbidden_message_families,
  },
  {
    if_state: "evitement",
    objective: MOMENTUM_POLICY_REGISTRY.evitement.objective,
    branch_action: MOMENTUM_POLICY_REGISTRY.evitement.primary_action,
    allowed_message_families:
      MOMENTUM_POLICY_REGISTRY.evitement.allowed_message_families,
    forbidden_message_families:
      MOMENTUM_POLICY_REGISTRY.evitement.forbidden_message_families,
  },
  {
    if_state: "pause_consentie",
    objective: MOMENTUM_POLICY_REGISTRY.pause_consentie.objective,
    branch_action: MOMENTUM_POLICY_REGISTRY.pause_consentie.primary_action,
    allowed_message_families:
      MOMENTUM_POLICY_REGISTRY.pause_consentie.allowed_message_families,
    forbidden_message_families:
      MOMENTUM_POLICY_REGISTRY.pause_consentie.forbidden_message_families,
  },
  {
    if_state: "soutien_emotionnel",
    objective: MOMENTUM_POLICY_REGISTRY.soutien_emotionnel.objective,
    branch_action: MOMENTUM_POLICY_REGISTRY.soutien_emotionnel.primary_action,
    allowed_message_families:
      MOMENTUM_POLICY_REGISTRY.soutien_emotionnel.allowed_message_families,
    forbidden_message_families:
      MOMENTUM_POLICY_REGISTRY.soutien_emotionnel.forbidden_message_families,
  },
  {
    if_state: "reactivation",
    objective: MOMENTUM_POLICY_REGISTRY.reactivation.objective,
    branch_action: MOMENTUM_POLICY_REGISTRY.reactivation.primary_action,
    allowed_message_families:
      MOMENTUM_POLICY_REGISTRY.reactivation.allowed_message_families,
    forbidden_message_families:
      MOMENTUM_POLICY_REGISTRY.reactivation.forbidden_message_families,
  },
];

export function listMomentumPolicyDefinitions(): MomentumPolicyDefinition[] {
  return Object.values(MOMENTUM_POLICY_REGISTRY);
}

export function getMomentumPolicyDefinition(
  state: MomentumStateLabel,
): MomentumPolicyDefinition {
  return MOMENTUM_POLICY_REGISTRY[state];
}

export function resolveMomentumPolicyBranch(
  snapshot: MomentumPolicySnapshot,
): MomentumPolicyDefinition {
  return getMomentumPolicyDefinition(snapshot.state);
}

export function canUseMessageFamily(
  state: MomentumStateLabel,
  family: MomentumMessageFamily,
): boolean {
  return getMomentumPolicyDefinition(state).allowed_message_families.includes(
    family,
  );
}

export function isMessageFamilyForbidden(
  state: MomentumStateLabel,
  family: MomentumMessageFamily,
): boolean {
  return getMomentumPolicyDefinition(state).forbidden_message_families.includes(
    family,
  );
}

export function summarizeMomentumPolicy(
  state: MomentumStateLabel,
): Record<string, unknown> {
  const policy = getMomentumPolicyDefinition(state);
  return {
    state: policy.state,
    primary_action: policy.primary_action,
    proactive_policy: policy.proactive_policy,
    max_proactive_per_7d: policy.max_proactive_per_7d,
    min_gap_hours: policy.min_gap_hours,
  };
}
