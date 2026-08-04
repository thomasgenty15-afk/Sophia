import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { checkRegistryCooldown } from "./v2-cooldown-registry.ts";

import {
  logV2Event,
  type RendezVousStateChangedPayload,
  V2_EVENT_TYPES,
} from "./v2-events.ts";
import type {
  ConfidenceLevel,
  RendezVousKind,
  RendezVousState,
  UserRendezVousRow,
} from "./v2-types.ts";

export const ACTIVE_RENDEZ_VOUS_STATES = [
  "draft",
  "scheduled",
  "delivered",
] as const satisfies readonly RendezVousState[];

export const TERMINAL_RENDEZ_VOUS_STATES = [
  "completed",
  "skipped",
  "cancelled",
] as const satisfies readonly RendezVousState[];

export const ALLOWED_RENDEZ_VOUS_TRANSITIONS: Record<
  RendezVousState,
  readonly RendezVousState[]
> = {
  draft: ["scheduled", "cancelled"],
  scheduled: ["delivered", "cancelled"],
  delivered: ["completed", "skipped", "cancelled"],
  skipped: [],
  cancelled: [],
  completed: [],
};

type RendezVousPosture = UserRendezVousRow["posture"];
type RendezVousBudgetClass = UserRendezVousRow["budget_class"];

export interface CreateRendezVousInput {
  id?: string;
  user_id: string;
  cycle_id: string;
  transformation_id?: string | null;
  kind: RendezVousKind;
  state?: RendezVousState;
  budget_class: RendezVousBudgetClass;
  trigger_reason: string;
  confidence: ConfidenceLevel;
  scheduled_for?: string | null;
  posture: RendezVousPosture;
  source_refs?: Record<string, unknown> | null;
  linked_checkin_id?: string | null;
}

export interface CreateRendezVousOptions {
  nowIso?: string;
  cooldownKey?: string;
  enforceRefusedCooldown?: boolean;
  eventMetadata?: Record<string, unknown>;
}

export interface TransitionRendezVousOptions {
  nowIso?: string;
  scheduledFor?: string | null;
  linkedCheckinId?: string | null;
  sourceRefsPatch?: Record<string, unknown>;
  eventMetadata?: Record<string, unknown>;
}

export interface RendezVousHistoryOptions {
  cycleId?: string;
  transformationId?: string;
  kind?: RendezVousKind | RendezVousKind[];
  states?: RendezVousState[];
  limit?: number;
}

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function resolveInitialRendezVousState(
  input: Pick<CreateRendezVousInput, "state" | "scheduled_for">,
): "draft" | "scheduled" {
  if (input.state === "draft" || input.state === "scheduled") {
    return input.state;
  }
  return input.scheduled_for ? "scheduled" : "draft";
}

export function buildRefusedRendezVousCooldownKey(
  input: Pick<UserRendezVousRow, "kind" | "cycle_id" | "transformation_id">,
): string {
  return `${input.kind}:${input.transformation_id ?? input.cycle_id}`;
}

export function assertRendezVousCreationAllowed(
  input: CreateRendezVousInput,
  state = resolveInitialRendezVousState(input),
): void {
  if (!cleanText(input.trigger_reason)) {
    throw new Error("Rendez-vous requires a non-empty trigger_reason.");
  }

  if (input.confidence === "low") {
    throw new Error("Rendez-vous cannot be created with confidence=low.");
  }

  if (state !== "draft" && state !== "scheduled") {
    throw new Error(
      `Rendez-vous must start as draft or scheduled, received "${state}".`,
    );
  }

  if (state === "scheduled" && !cleanText(input.scheduled_for)) {
    throw new Error("Scheduled rendez-vous requires scheduled_for.");
  }
}

export function assertRendezVousTransitionAllowed(
  currentState: RendezVousState,
  nextState: RendezVousState,
): void {
  if (currentState === nextState) return;

  const allowed = ALLOWED_RENDEZ_VOUS_TRANSITIONS[currentState] ?? [];
  if (!allowed.includes(nextState)) {
    throw new Error(
      `Invalid rendez-vous transition: ${currentState} -> ${nextState}.`,
    );
  }
}

export function buildRendezVousStateChangedPayload(args: {
  row: Pick<
    UserRendezVousRow,
    | "user_id"
    | "cycle_id"
    | "transformation_id"
    | "id"
    | "kind"
    | "state"
    | "budget_class"
    | "scheduled_for"
    | "trigger_reason"
    | "linked_checkin_id"
  >;
  previousState: RendezVousState | null;
  metadata?: Record<string, unknown>;
}): RendezVousStateChangedPayload {
  return {
    user_id: args.row.user_id,
    cycle_id: args.row.cycle_id,
    transformation_id: args.row.transformation_id,
    rendez_vous_id: args.row.id,
    kind: args.row.kind,
    previous_state: args.previousState,
    new_state: args.row.state,
    budget_class: args.row.budget_class,
    scheduled_for: args.row.scheduled_for,
    trigger_reason: args.row.trigger_reason,
    linked_checkin_id: args.row.linked_checkin_id,
    metadata: args.metadata,
  };
}

async function getRendezVousById(
  supabase: SupabaseClient,
  id: string,
): Promise<UserRendezVousRow | null> {
  const { data, error } = await supabase
    .from("user_rendez_vous")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data as UserRendezVousRow | null;
}

export async function createRendezVous(
  supabase: SupabaseClient,
  input: CreateRendezVousInput,
  options: CreateRendezVousOptions = {},
): Promise<UserRendezVousRow> {
  const nowIso = options.nowIso ?? new Date().toISOString();
  const state = resolveInitialRendezVousState(input);

  assertRendezVousCreationAllowed(input, state);

  if (options.enforceRefusedCooldown ?? true) {
    const cooldownKey = options.cooldownKey ??
      buildRefusedRendezVousCooldownKey({
        kind: input.kind,
        cycle_id: input.cycle_id,
        transformation_id: input.transformation_id ?? null,
      });
    const cooldown = await checkRegistryCooldown(
      supabase,
      input.user_id,
      "refused_rendez_vous",
      cooldownKey,
      nowIso,
    );
    if (cooldown.is_cooled_down) {
      throw new Error(
        `Cannot create rendez-vous while refused_rendez_vous cooldown is active for "${cooldownKey}".`,
      );
    }
  }

  const insertPayload = {
    id: input.id,
    user_id: input.user_id,
    cycle_id: input.cycle_id,
    transformation_id: input.transformation_id ?? null,
    kind: input.kind,
    state,
    budget_class: input.budget_class,
    trigger_reason: cleanText(input.trigger_reason),
    confidence: input.confidence,
    scheduled_for: input.scheduled_for ?? null,
    posture: input.posture,
    source_refs: normalizeRecord(input.source_refs),
    linked_checkin_id: input.linked_checkin_id ?? null,
  };

  const { data, error } = await supabase
    .from("user_rendez_vous")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error) throw error;

  const row = data as UserRendezVousRow;
  await logV2Event(
    supabase,
    V2_EVENT_TYPES.RENDEZ_VOUS_STATE_CHANGED,
    buildRendezVousStateChangedPayload({
      row,
      previousState: null,
      metadata: options.eventMetadata,
    }),
  );

  return row;
}

export async function transitionRendezVous(
  supabase: SupabaseClient,
  id: string,
  newState: RendezVousState,
  options: TransitionRendezVousOptions = {},
): Promise<UserRendezVousRow> {
  const existing = await getRendezVousById(supabase, id);
  if (!existing) {
    throw new Error(`Rendez-vous "${id}" not found.`);
  }

  if (existing.state === newState) {
    return existing;
  }

  assertRendezVousTransitionAllowed(existing.state, newState);

  const nextScheduledFor = options.scheduledFor === undefined
    ? existing.scheduled_for
    : options.scheduledFor;
  const nextSourceRefs = {
    ...normalizeRecord(existing.source_refs),
    ...normalizeRecord(options.sourceRefsPatch),
  };

  if (newState !== "draft" && newState !== "cancelled" && !nextScheduledFor) {
    throw new Error(
      `Rendez-vous state "${newState}" requires scheduled_for to be set.`,
    );
  }

  const updatePayload: Partial<UserRendezVousRow> = {
    state: newState,
    scheduled_for: nextScheduledFor,
    linked_checkin_id: options.linkedCheckinId === undefined
      ? existing.linked_checkin_id
      : options.linkedCheckinId,
    source_refs: nextSourceRefs,
  };

  if (newState === "delivered" && !existing.delivered_at) {
    updatePayload.delivered_at = options.nowIso ?? new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("user_rendez_vous")
    .update(updatePayload)
    .eq("id", id)
    .eq("state", existing.state)
    .select("*")
    .single();

  if (error) throw error;

  const row = data as UserRendezVousRow;
  await logV2Event(
    supabase,
    V2_EVENT_TYPES.RENDEZ_VOUS_STATE_CHANGED,
    buildRendezVousStateChangedPayload({
      row,
      previousState: existing.state,
      metadata: options.eventMetadata,
    }),
  );

  return row;
}

export async function getActiveRendezVous(
  supabase: SupabaseClient,
  userId: string,
  cycleId: string,
): Promise<UserRendezVousRow[]> {
  const { data, error } = await supabase
    .from("user_rendez_vous")
    .select("*")
    .eq("user_id", userId)
    .eq("cycle_id", cycleId)
    .in("state", [...ACTIVE_RENDEZ_VOUS_STATES])
    .order("scheduled_for", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as UserRendezVousRow[] | null) ?? [];
}

export async function getRendezVousHistory(
  supabase: SupabaseClient,
  userId: string,
  options: RendezVousHistoryOptions = {},
): Promise<UserRendezVousRow[]> {
  let query = supabase
    .from("user_rendez_vous")
    .select("*")
    .eq("user_id", userId);

  if (options.cycleId) {
    query = query.eq("cycle_id", options.cycleId);
  }

  if (options.transformationId) {
    query = query.eq("transformation_id", options.transformationId);
  }

  const kinds = Array.isArray(options.kind)
    ? options.kind
    : options.kind
    ? [options.kind]
    : [];
  if (kinds.length === 1) {
    query = query.eq("kind", kinds[0]);
  } else if (kinds.length > 1) {
    query = query.in("kind", kinds);
  }

  if (options.states && options.states.length > 0) {
    query = query.in("state", options.states);
  }

  const limit = Math.max(1, Math.min(200, options.limit ?? 50));
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data as UserRendezVousRow[] | null) ?? [];
}
