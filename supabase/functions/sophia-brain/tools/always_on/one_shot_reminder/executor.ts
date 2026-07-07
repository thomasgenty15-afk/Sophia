import {
  createClient,
  type SupabaseClient,
} from "jsr:@supabase/supabase-js@2.87.3";
import { getUserTimeContext } from "../../../../_shared/user_time_context.ts";
import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import {
  type DirectEffectGateInput,
  runDirectEffectGate,
} from "../../../routers/direct_effect_gate.ts";
import type {
  CancelOneShotReminderOutcome,
  CreateOneShotReminderV2Outcome,
  CreateOneShotReminderV2Write,
  OneShotReminderCommittedEffect,
  OneShotReminderDirectEffectTool,
  OneShotReminderEffect,
  OneShotReminderEffectPlan,
  OneShotReminderFailedEffect,
  OneShotReminderToolOutcome,
} from "./contract.ts";
import {
  compactText,
  errorText,
  isDegenerateReminderInstruction,
  slugify,
} from "./instruction_parser.ts";
import {
  readPendingOneShotReminderRows,
  readRecentOneShotReminderRows,
} from "./persistence.ts";
import {
  extractStrictAbsoluteParts,
  extractTargetHHMMFromMessage,
  formatLocalReminderLabel,
  localHHMMForScheduledFor,
} from "./time_parser.ts";
let reminderWriteClient: SupabaseClient | null = null;

function cleanReminderInstructionForStorage(value: string): string {
  return compactText(
    String(value ?? "")
      .replace(/\s+/g, " ")
      .replace(/\s+([,.;:!?])/g, "$1")
      .replace(/[,.;:\s]+$/g, "")
      .trim(),
    220,
  );
}

export function buildOneShotReminderMessagePayload(args: {
  instruction: string;
  requestText?: string | null;
  localLabel?: string | null;
  timezone: string;
  parseSource?: string | null;
  sourceMessageId?: string | null;
}): Record<string, unknown> {
  const instruction = cleanReminderInstructionForStorage(args.instruction);
  return {
    source: "one_shot_reminder_executor",
    reminder_kind: "one_shot",
    reminder_instruction: instruction,
    instruction:
      `Rappel ponctuel demandé explicitement par l'utilisateur. Objet du rappel utilisateur: ${instruction}.`,
    event_grounding: compactText(
      `L'utilisateur a demandé explicitement un rappel ponctuel à propos de: ${instruction}.`,
      240,
    ),
    request_text: compactText(args.requestText ?? "", 500),
    local_label: compactText(args.localLabel ?? "", 160) || null,
    user_timezone: args.timezone,
    parse_source: args.parseSource ?? "router",
    source_message_id: args.sourceMessageId ?? null,
  };
}

function isLocalSupabaseUrl(url: string): boolean {
  try {
    const host = new URL(String(url ?? "")).hostname.toLowerCase();
    return host === "127.0.0.1" || host === "localhost" || host === "kong" ||
      host.startsWith("supabase_");
  } catch {
    return false;
  }
}

function isJwtLike(value: string): boolean {
  return String(value ?? "").split(".").length === 3;
}

function base64Url(bytes: Uint8Array): string {
  const raw = btoa(String.fromCharCode(...bytes));
  return raw.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signLocalServiceRoleJwt(secret: string): Promise<string> {
  const encode = (value: unknown) =>
    base64Url(new TextEncoder().encode(JSON.stringify(value)));
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    iss: "supabase-demo",
    role: "service_role",
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365 * 10,
  });
  const toSign = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(toSign)),
  );
  return `${toSign}.${base64Url(signature)}`;
}

async function getReminderWriteClient(
  fallback: SupabaseClient,
): Promise<SupabaseClient> {
  const optionalEnv = (name: string) => {
    try {
      return Deno.env.get(name) ?? "";
    } catch {
      return "";
    }
  };
  const url = optionalEnv("SUPABASE_URL");
  let serviceRoleKey = optionalEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (url && isLocalSupabaseUrl(url) && !isJwtLike(serviceRoleKey)) {
    const jwtSecret = optionalEnv("JWT_SECRET") ||
      "super-secret-jwt-token-with-at-least-32-characters-long";
    serviceRoleKey = await signLocalServiceRoleJwt(jwtSecret);
  }
  if (!url || !serviceRoleKey) return fallback;

  reminderWriteClient ??= createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return reminderWriteClient;
}

async function createReminderFromEffect(args: {
  effect: OneShotReminderEffect;
  supabase: SupabaseClient;
  userId: string;
  sourceMessageId?: string | null;
  requestId?: string | null;
  timezone: string;
  locale: string;
  instructionIsCanonical?: boolean;
}): Promise<OneShotReminderCommittedEffect | OneShotReminderFailedEffect> {
  const scheduledFor = String(args.effect.scheduled_for ?? "");
  const instruction = cleanReminderInstructionForStorage(
    String(args.effect.reminder_instruction ?? "").trim(),
  );
  if (!scheduledFor) {
    return { type: "create_one_shot_reminder", reason_code: "missing_time" };
  }
  if (
    !instruction ||
    (!args.instructionIsCanonical &&
      isDegenerateReminderInstruction(instruction))
  ) {
    return {
      type: "create_one_shot_reminder",
      reason_code: "missing_instruction",
    };
  }
  const eventContext = `one_shot_reminder:${slugify(instruction) || "generic"}`;
  try {
    const writeClient = await getReminderWriteClient(args.supabase);
    const sourceMessageId = String(args.sourceMessageId ?? "").trim();
    if (sourceMessageId) {
      const { data: existing, error: existingError } = await writeClient
        .from("scheduled_checkins")
        .select("id,scheduled_for,event_context")
        .eq("user_id", args.userId)
        .eq("event_context", eventContext)
        .eq("status", "pending")
        .eq("message_payload->>source_message_id", sourceMessageId)
        .limit(1)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        const actualScheduledFor = String(
          (existing as any)?.scheduled_for ?? scheduledFor,
        );
        return {
          type: "create_one_shot_reminder",
          id: String((existing as any)?.id ?? ""),
          scheduled_for: actualScheduledFor,
          local_label: args.effect.local_label ??
            formatLocalReminderLabel({
              scheduledFor: actualScheduledFor,
              timezone: args.timezone,
              locale: args.locale,
            }),
          reminder_instruction: instruction,
        };
      }
    }
    const { data, error } = await writeClient
      .from("scheduled_checkins")
      .upsert({
        user_id: args.userId,
        origin: "rendez_vous",
        event_context: eventContext,
        draft_message: null,
        message_mode: "dynamic",
        message_payload: buildOneShotReminderMessagePayload({
          instruction,
          requestText: args.effect.request_text,
          localLabel: args.effect.local_label ?? null,
          timezone: args.timezone,
          parseSource: args.effect.reason_code ?? "router",
          sourceMessageId: args.sourceMessageId ?? null,
        }),
        scheduled_for: scheduledFor,
        status: "pending",
      } as any, { onConflict: "user_id,event_context,scheduled_for" })
      .select("id,scheduled_for,event_context")
      .single();
    if (error) throw error;
    const actualScheduledFor = String(
      (data as any)?.scheduled_for ?? scheduledFor,
    );
    return {
      type: "create_one_shot_reminder",
      id: String((data as any)?.id ?? ""),
      scheduled_for: actualScheduledFor,
      local_label: args.effect.local_label ??
        formatLocalReminderLabel({
          scheduledFor: actualScheduledFor,
          timezone: args.timezone,
          locale: args.locale,
        }),
      reminder_instruction: instruction,
    };
  } catch (error) {
    console.warn(JSON.stringify({
      tag: "one_shot_reminder_insert_failed",
      request_id: args.requestId ?? null,
      error: compactText(errorText(error), 300) || "insert_failed",
    }));
    return {
      type: "create_one_shot_reminder",
      reason_code: "insert_failed",
      error_message: compactText(errorText(error), 180) || "insert_failed",
    };
  }
}

async function cancelReminderFromEffect(args: {
  effect: OneShotReminderEffect;
  supabase: SupabaseClient;
  requestId?: string | null;
}): Promise<OneShotReminderCommittedEffect | OneShotReminderFailedEffect> {
  // F4 (paul-broadflow15 T14): la capacite cancel existe desormais — le
  // pending cible passe en "cancelled" (meme vocabulaire de statut que
  // process-checkins). Cible uniquement des ids deja resolus par l'appelant.
  const ids = (args.effect.target_reminder_ids ?? [])
    .map((id) => String(id ?? "").trim())
    .filter(Boolean);
  if (ids.length === 0) {
    return {
      type: "cancel_one_shot_reminder",
      reason_code: "missing_cancel_target",
    };
  }
  try {
    const writeClient = await getReminderWriteClient(args.supabase);
    const { data, error } = await writeClient
      .from("scheduled_checkins")
      .update({ status: "cancelled" })
      .in("id", ids)
      .eq("status", "pending")
      .select("id,scheduled_for");
    if (error) throw error;
    const cancelledIds = (data ?? []).map((row: any) => String(row.id));
    if (cancelledIds.length === 0) {
      return {
        type: "cancel_one_shot_reminder",
        reason_code: "cancel_target_not_pending",
      };
    }
    return {
      type: "cancel_one_shot_reminder",
      id: cancelledIds[0],
      ids: cancelledIds,
      local_label: args.effect.target_local_labels?.[0] ?? undefined,
      target_reminder_ids: cancelledIds,
      target_local_labels: args.effect.target_local_labels ?? undefined,
    };
  } catch (error) {
    console.warn(JSON.stringify({
      tag: "one_shot_reminder_cancel_failed",
      request_id: args.requestId ?? null,
      error: compactText(errorText(error), 300) || "cancel_failed",
    }));
    return {
      type: "cancel_one_shot_reminder",
      reason_code: "cancel_failed",
      error_message: compactText(errorText(error), 180) || "cancel_failed",
    };
  }
}

export type OneShotReminderExecutionEffectsResult = {
  committed_effects: OneShotReminderCommittedEffect[];
  failed_effects: OneShotReminderFailedEffect[];
  blocked_effects: Array<{ type: string; reason_code: string }>;
  attempted_effects: OneShotReminderDirectEffectTool[];
};

export async function executeOneShotReminderEffects(args: {
  effect_plan: OneShotReminderEffectPlan;
  supabase: SupabaseClient;
  userId: string;
  sourceMessageId?: string | null;
  requestId?: string | null;
  timezone?: string;
  locale?: string;
}): Promise<OneShotReminderExecutionEffectsResult> {
  const committed_effects: OneShotReminderCommittedEffect[] = [];
  const failed_effects: OneShotReminderFailedEffect[] = [];
  const attempted_effects: OneShotReminderDirectEffectTool[] = [];
  const timezone = args.timezone ?? "Europe/Paris";
  const locale = args.locale ?? "fr-FR";

  for (const effect of args.effect_plan.allowed_effects) {
    attempted_effects.push(effect.type);
    const outcome = effect.type === "create_one_shot_reminder"
      ? await createReminderFromEffect({
        effect,
        supabase: args.supabase,
        userId: args.userId,
        sourceMessageId: args.sourceMessageId,
        requestId: args.requestId,
        timezone,
        locale,
      })
      : effect.type === "cancel_one_shot_reminder"
      ? await cancelReminderFromEffect({
        effect,
        supabase: args.supabase,
        requestId: args.requestId,
      })
      : { type: effect.type, reason_code: "unsupported_effect" };
    if ("reason_code" in outcome) failed_effects.push(outcome);
    else committed_effects.push(outcome);
  }

  return {
    committed_effects,
    failed_effects,
    blocked_effects: args.effect_plan.blocked_effects,
    attempted_effects,
  };
}

export type OneShotReminderCreateRunner = typeof maybeCreateOneShotReminder;
export type OneShotReminderCancelRunner = typeof maybeCancelOneShotReminder;

export async function maybeCreateOneShotReminderFromStructuredEffect(params: {
  effect: OneShotReminderEffect;
  supabase: SupabaseClient;
  userId: string;
  sourceMessageId?: string | null;
  requestId?: string;
  now?: Date;
  timezone?: string | null;
  locale?: string | null;
}): Promise<OneShotReminderToolOutcome> {
  const tctx = await getUserTimeContext({
    supabase: params.supabase,
    userId: params.userId,
    now: params.now,
  });
  const timezone = String(params.timezone ?? "").trim() || tctx.user_timezone;
  const locale = String(params.locale ?? "").trim() || tctx.user_locale;
  const scheduledFor = String(params.effect.scheduled_for ?? "").trim();
  if (!scheduledFor) {
    return {
      detected: true,
      status: "needs_clarify",
      reason: "missing_time",
      user_message: compactText(params.effect.request_text ?? "", 500),
    };
  }
  const scheduledMs = new Date(scheduledFor).getTime();
  const nowMs = new Date(tctx.now_utc).getTime();
  if (!Number.isFinite(scheduledMs)) {
    return {
      detected: true,
      status: "needs_clarify",
      reason: "unsupported_time",
      user_message: compactText(params.effect.request_text ?? "", 500),
    };
  }
  if (scheduledMs <= nowMs + 30_000) {
    return {
      detected: true,
      status: "needs_clarify",
      reason: "past_time",
      user_message: compactText(params.effect.request_text ?? "", 500),
    };
  }
  // Anti-duplication (garde-fou structurel, charte cmd 0): un one-shot
  // pending existe deja au meme instant exact pour ce user -> la "creation"
  // est presque toujours une question de verification ou un double envoi.
  // On bloque au lieu de recreer; le contexte de confirmation permet au
  // renderer de rappeler le rappel existant.
  // Invariant de re-entrance: la lane direct-effect peut s'executer plusieurs
  // fois dans un meme tour (pipeline, reexec post-flow, executor local d'un
  // skill). Une ligne portant le source_message_id du tour courant est notre
  // propre ecriture, pas un duplicate: on la laisse retomber sur le chemin
  // idempotent de createReminderFromEffect, qui re-renvoie le meme committed.
  const turnSourceMessageId = String(
    params.sourceMessageId ?? params.requestId ?? "",
  ).trim();
  try {
    const pendingRows = await readPendingOneShotReminderRows({
      supabase: params.supabase,
      userId: params.userId,
    });
    const duplicate = pendingRows.some((row) => {
      const rowSourceMessageId = String(
        (row?.message_payload as Record<string, unknown> | null | undefined)
          ?.source_message_id ?? "",
      ).trim();
      if (turnSourceMessageId && rowSourceMessageId === turnSourceMessageId) {
        return false;
      }
      const rowMs = new Date(String(row?.scheduled_for ?? "")).getTime();
      return Number.isFinite(rowMs) && rowMs === scheduledMs;
    });
    if (duplicate) {
      return {
        detected: true,
        status: "needs_clarify",
        reason: "duplicate_pending",
        user_message: compactText(params.effect.request_text ?? "", 500),
      };
    }
  } catch (_error) {
    // Lecture non bloquante: en cas d'echec on laisse la creation suivre
    // son cours plutot que de bloquer un rappel legitime.
  }
  const committed = await createReminderFromEffect({
    effect: {
      ...params.effect,
      scheduled_for: scheduledFor,
      local_label: params.effect.local_label ??
        formatLocalReminderLabel({
          scheduledFor,
          timezone,
          locale,
        }),
      reason_code: params.effect.reason_code ?? "payload",
    },
    supabase: params.supabase,
    userId: params.userId,
    sourceMessageId: params.sourceMessageId ?? params.requestId ?? null,
    requestId: params.requestId,
    timezone,
    locale,
    instructionIsCanonical: true,
  });
  if ("reason_code" in committed) {
    return {
      detected: true,
      status: "failed",
      reason: "insert_failed",
      user_message: compactText(params.effect.request_text ?? "", 500),
      error_message: committed.error_message ?? committed.reason_code,
    };
  }
  const instruction = committed.reminder_instruction ??
    String(params.effect.reminder_instruction ?? "").trim();
  return {
    detected: true,
    status: "success",
    user_message: compactText(params.effect.request_text ?? "", 500),
    scheduled_for: committed.scheduled_for ?? scheduledFor,
    scheduled_for_local_label: committed.local_label ?? "",
    reminder_instruction: instruction,
    event_context: `one_shot_reminder:${slugify(instruction) || "generic"}`,
    inserted_checkin_id: committed.id ?? "",
    parse_source: "payload",
  };
}

export async function maybeCreateOneShotReminder(params: {
  supabase: SupabaseClient;
  userId: string;
  message: string;
  requestId?: string;
  now?: Date;
  contextMessages?: string[];
  forceCreate?: boolean;
  canonicalReminderInstruction?: string;
}): Promise<OneShotReminderToolOutcome> {
  void params.supabase;
  void params.userId;
  void params.requestId;
  void params.now;
  void params.contextMessages;
  void params.canonicalReminderInstruction;
  if (!params.forceCreate) return { detected: false };
  return {
    detected: true,
    status: "needs_clarify",
    reason: "missing_time",
    user_message: compactText(params.message, 500),
  };
}

export async function maybeCancelOneShotReminder(params: {
  supabase: SupabaseClient;
  userId: string;
  message: string;
  requestId?: string;
  now?: Date;
}): Promise<CancelOneShotReminderOutcome> {
  const tctx = await getUserTimeContext({
    supabase: params.supabase,
    userId: params.userId,
    now: params.now,
  });
  let pendingRows: any[] = [];
  try {
    pendingRows = await readPendingOneShotReminderRows({
      supabase: params.supabase,
      userId: params.userId,
    }) as any[];
  } catch (error) {
    return {
      detected: true,
      status: "failed",
      reason: "read_failed",
      user_message: compactText(params.message, 500),
      error_message: compactText(errorText(error), 180) || "read_failed",
    };
  }
  if (pendingRows.length === 0) {
    // eva-r6 B03: distinguer « jamais existe » de « deja envoye/annule ».
    // Un rappel qui vient d'etre fire (pending → awaiting_user) existe bel
    // et bien: le nier serait un faux statut. Fenetre 48h sur scheduled_for.
    let absenceReason: "never_existed" | "already_delivered" | "already_cancelled" =
      "never_existed";
    let nonPendingLocalLabel: string | null = null;
    try {
      const sinceIso = new Date(
        (params.now ?? new Date()).getTime() - 48 * 3_600_000,
      ).toISOString();
      const recentRows = await readRecentOneShotReminderRows({
        supabase: params.supabase,
        userId: params.userId,
        sinceIso,
      });
      const delivered = recentRows.find((row: any) =>
        ["awaiting_user", "delivered", "sent", "completed"].includes(
          String(row?.status ?? ""),
        )
      );
      const cancelled = recentRows.find((row: any) =>
        String(row?.status ?? "") === "cancelled"
      );
      const nonPending = delivered ?? cancelled;
      if (delivered) absenceReason = "already_delivered";
      else if (cancelled) absenceReason = "already_cancelled";
      if (nonPending) {
        nonPendingLocalLabel = localHHMMForScheduledFor(
          String((nonPending as any)?.scheduled_for ?? ""),
          tctx.user_timezone,
        ) || null;
      }
    } catch (_error) {
      // Lecture best-effort: en cas d'echec on garde never_existed (honnete
      // par defaut: « rien a annuler »).
    }
    return {
      detected: true,
      status: "no_reminder",
      user_message: compactText(params.message, 500),
      absence_reason: absenceReason,
      non_pending_local_label: nonPendingLocalLabel,
    };
  }

  const textTargetHHMM = extractTargetHHMMFromMessage(params.message);
  const targets = textTargetHHMM
    ? pendingRows.filter((row: any) =>
      localHHMMForScheduledFor(
        String(row?.scheduled_for ?? ""),
        tctx.user_timezone,
      ) === textTargetHHMM
    )
    : pendingRows.length === 1
    ? pendingRows
    : [];

  // Ambiguite: plusieurs pending et aucune heure cible identifiable — on ne
  // devine JAMAIS quoi annuler (l'ancien code ciblait TOUS les pending).
  if (targets.length === 0 && pendingRows.length > 1 && !textTargetHHMM) {
    return {
      detected: true,
      status: "ambiguous_target",
      pending_count: pendingRows.length,
      user_message: compactText(params.message, 500),
    };
  }

  const ids = targets.map((row: any) => String(row?.id ?? "")).filter(Boolean);
  if (ids.length === 0) {
    return {
      detected: true,
      status: "no_reminder",
      user_message: compactText(params.message, 500),
    };
  }

  const labels = targets
    .map((row: any) =>
      row?.scheduled_for
        ? formatLocalReminderLabel({
          scheduledFor: String(row.scheduled_for),
          timezone: tctx.user_timezone,
          locale: tctx.user_locale,
        })
        : null
    )
    .filter((label): label is string => Boolean(label));
  const cancelled = await cancelReminderFromEffect({
    effect: {
      type: "cancel_one_shot_reminder",
      target_reminder_ids: ids,
      target_local_labels: labels,
    },
    supabase: params.supabase,
    requestId: params.requestId,
  });
  if ("reason_code" in cancelled) {
    return {
      detected: true,
      status: "failed",
      reason: cancelled.reason_code,
      user_message: compactText(params.message, 500),
      error_message: cancelled.error_message ?? cancelled.reason_code,
    };
  }
  return {
    detected: true,
    status: "cancelled",
    cancelled_count: ids.length,
    cancelled_local_labels: labels,
    cancelled_ids: ids,
    user_message: compactText(params.message, 500),
  };
}

export async function runCreateOneShotReminderV2(params: {
  turn_frame: TurnFrame;
  message: string;
  timezone: string;
  locale?: string;
  nowIso: string;
  recent_writes_idempotency?:
    DirectEffectGateInput["recent_writes_idempotency"];
  db_idempotency_check?: DirectEffectGateInput["db_idempotency_check"];
  write_reminder: CreateOneShotReminderV2Write;
}): Promise<CreateOneShotReminderV2Outcome> {
  const hasDispatcherSignal = params.turn_frame.direct_effects.some((effect) =>
    effect.effect_type === "create_one_shot_reminder"
  );
  if (!hasDispatcherSignal) return { detected: false };

  const gate = await runDirectEffectGate({
    effect_type: "create_one_shot_reminder",
    turn_frame: params.turn_frame,
    recent_writes_idempotency: params.recent_writes_idempotency ??
      { source_message_ids: [] },
    db_idempotency_check: params.db_idempotency_check ?? (async () => false),
  });
  if (gate.decision === "blocked") {
    return {
      detected: true,
      status: "blocked",
      reason: gate.reason_code,
      user_message: compactText(params.message, 500),
    };
  }
  if (gate.decision === "needs_clarify") {
    return {
      detected: true,
      status: "needs_clarify",
      reason: gate.reason_code === "past_time" ? "past_time" : "missing_time",
      user_message: compactText(params.message, 500),
    };
  }

  const payload = gate.effect_payload ?? {};
  const parsedFromPayload = typeof payload.scheduled_for === "string" &&
      typeof payload.reminder_instruction === "string"
    ? {
      scheduledFor: payload.scheduled_for,
      reminderInstruction: payload.reminder_instruction,
      eventContext: String(
        payload.event_context ??
          `one_shot_reminder:${slugify(payload.reminder_instruction)}`,
      ),
      parseSource: "payload" as const,
    }
    : null;
  if (!parsedFromPayload) {
    return {
      detected: true,
      status: "needs_clarify",
      reason: "missing_time",
      user_message: compactText(params.message, 500),
    };
  }

  const scheduledMs = new Date(parsedFromPayload.scheduledFor).getTime();
  const nowMs = new Date(params.nowIso).getTime();
  if (!Number.isFinite(scheduledMs) || scheduledMs <= nowMs + 30_000) {
    return {
      detected: true,
      status: "needs_clarify",
      reason: "past_time",
      user_message: compactText(params.message, 500),
    };
  }

  try {
    const written = await params.write_reminder({
      user_id: params.turn_frame.user_id,
      scheduled_for: parsedFromPayload.scheduledFor,
      reminder_instruction: parsedFromPayload.reminderInstruction,
      event_context: parsedFromPayload.eventContext,
      request_text: compactText(params.message, 500),
      timezone: params.timezone,
      idempotency_key: gate.idempotency_key,
    });
    const scheduledFor = written.scheduled_for ??
      parsedFromPayload.scheduledFor;
    return {
      detected: true,
      status: "success",
      user_message: compactText(params.message, 500),
      scheduled_for: scheduledFor,
      scheduled_for_local_label: formatLocalReminderLabel({
        scheduledFor,
        timezone: params.timezone,
        locale: params.locale ?? "fr-FR",
      }),
      reminder_instruction: parsedFromPayload.reminderInstruction,
      event_context: written.event_context ?? parsedFromPayload.eventContext,
      inserted_checkin_id: written.inserted_checkin_id,
      parse_source: parsedFromPayload.parseSource,
    };
  } catch (error) {
    return {
      detected: true,
      status: "failed",
      reason: "insert_failed",
      user_message: compactText(params.message, 500),
      error_message: compactText(errorText(error), 180) || "insert_failed",
    };
  }
}

export function attemptedToolsFromCommitted(
  committed_effects: OneShotReminderCommittedEffect[],
): OneShotReminderDirectEffectTool[] {
  return committed_effects.map((effect) => effect.type)
    .filter((tool, index, all) => all.indexOf(tool) === index);
}
