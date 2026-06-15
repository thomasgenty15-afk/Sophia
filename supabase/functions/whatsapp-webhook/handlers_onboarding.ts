import { runWhatsAppOnboardingLocalFlow } from "./onboarding/local_flow.ts";
import { isWhatsAppOnboardingLocalState } from "./onboarding/state.ts";

export const WHATSAPP_ONBOARDING_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function isWhatsAppOnboardingExpired(args: {
  whatsappState: unknown;
  startedAt: unknown;
  stateUpdatedAt?: unknown;
  nowMs?: number;
}): boolean {
  if (!isWhatsAppOnboardingLocalState(args.whatsappState)) return false;
  const startedRaw = String(args.startedAt ?? "").trim();
  const fallbackRaw = String(args.stateUpdatedAt ?? "").trim();
  const anchorRaw = startedRaw || fallbackRaw;
  if (!anchorRaw) return false;
  const anchorMs = new Date(anchorRaw).getTime();
  if (!Number.isFinite(anchorMs)) return false;
  const nowMs = Number.isFinite(args.nowMs) ? args.nowMs! : Date.now();
  return nowMs - anchorMs > WHATSAPP_ONBOARDING_MAX_AGE_MS;
}

export async function clearExpiredWhatsAppOnboardingState(params: {
  admin: any;
  userId: string;
  whatsappState: unknown;
  startedAt: unknown;
  stateUpdatedAt?: unknown;
  nowIso?: string;
}): Promise<boolean> {
  const nowIso = params.nowIso ?? new Date().toISOString();
  if (
    !isWhatsAppOnboardingExpired({
      whatsappState: params.whatsappState,
      startedAt: params.startedAt,
      stateUpdatedAt: params.stateUpdatedAt,
      nowMs: new Date(nowIso).getTime(),
    })
  ) {
    return false;
  }

  await params.admin.from("profiles").update({
    whatsapp_state: null,
    whatsapp_state_updated_at: nowIso,
    whatsapp_onboarding_started_at: null,
  }).eq("id", params.userId);
  return true;
}

export function isWhatsAppPreferenceOnboardingDoneFromTempMemory(
  tempMemory: unknown,
): boolean {
  if (
    !tempMemory || typeof tempMemory !== "object" || Array.isArray(tempMemory)
  ) {
    return false;
  }
  const done = (tempMemory as Record<string, unknown>)
    .__whatsapp_onboarding_done;
  if (!done || typeof done !== "object" || Array.isArray(done)) {
    return false;
  }
  const completedAt = String(
    (done as Record<string, unknown>).completed_at ?? "",
  ).trim();
  return completedAt.length > 0;
}

export function isWhatsAppPlanFinalizationWaitState(
  whatsappState: unknown,
): boolean {
  const state = String(whatsappState ?? "").trim();
  return state === "awaiting_plan_finalization" ||
    state === "awaiting_plan_finalization_support";
}

export function shouldResumePlanFinalizationForWhatsAppPreferences(args: {
  whatsappState: unknown;
  onboardingCompleted: unknown;
  whatsappPreferenceOnboardingDone: unknown;
}): boolean {
  return Boolean(args.onboardingCompleted) &&
    isWhatsAppPlanFinalizationWaitState(args.whatsappState) &&
    args.whatsappPreferenceOnboardingDone === false;
}

export async function hasCompletedWhatsAppPreferenceOnboarding(
  admin: any,
  userId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("user_chat_states")
    .select("temp_memory")
    .eq("user_id", userId)
    .eq("scope", "whatsapp")
    .maybeSingle();
  return isWhatsAppPreferenceOnboardingDoneFromTempMemory(
    (data as any)?.temp_memory,
  );
}

export async function handleOnboardingState(params: any): Promise<boolean> {
  const st = String(params.whatsappState || "").trim();
  if (!isWhatsAppOnboardingLocalState(st)) return false;

  const result = await runWhatsAppOnboardingLocalFlow({
    admin: params.admin,
    userId: params.userId,
    whatsappState: st,
    webOnboardingCompleted: Boolean(params.onboardingCompleted),
    whatsappPreferencesDone: Boolean(params.whatsappPreferenceOnboardingDone),
    fromE164: params.fromE164,
    requestId: params.requestId,
    waMessageId: params.waMessageId,
    text: String(params.text ?? ""),
  });
  return Boolean(result.handled);
}
