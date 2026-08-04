import type { CorrectionTargetResolution } from "./types.ts";

export const PENDING_CORRECTION_TARGET_V2_KEY =
  "__pending_correction_target_v2";

export interface PendingCorrectionTargetV2 {
  version: 2;
  status: "awaiting_confirmation";
  requested_at: string;
  expires_at: string;
  user_message: string;
  confirmation_prompt: string;
  confidence: number;
  candidates: CorrectionTargetResolution["candidates"];
}

export interface AmbiguousCorrectionConfirmationResult {
  temp_memory: Record<string, unknown>;
  assistant_message: string | null;
  mutation_allowed: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function ttlIso(nowIso: string, ttlMinutes: number): string {
  const ts = Date.parse(nowIso);
  const base = Number.isFinite(ts) ? ts : Date.now();
  return new Date(base + Math.max(1, ttlMinutes) * 60_000).toISOString();
}

export function readPendingCorrectionTargetV2(
  tempMemory: unknown,
): PendingCorrectionTargetV2 | null {
  const raw = isRecord(tempMemory)
    ? tempMemory[PENDING_CORRECTION_TARGET_V2_KEY]
    : null;
  if (!isRecord(raw) || raw.version !== 2) return null;
  if (raw.status !== "awaiting_confirmation") return null;
  const confirmationPrompt = String(raw.confirmation_prompt ?? "").trim();
  if (!confirmationPrompt) return null;
  return {
    version: 2,
    status: "awaiting_confirmation",
    requested_at: String(raw.requested_at ?? ""),
    expires_at: String(raw.expires_at ?? ""),
    user_message: String(raw.user_message ?? ""),
    confirmation_prompt: confirmationPrompt,
    confidence: Number(raw.confidence ?? 0),
    candidates: Array.isArray(raw.candidates)
      ? raw.candidates.map((candidate) => ({
        item_id: String(candidate?.item_id ?? ""),
        score: Number(candidate?.score ?? 0),
        reason: String(candidate?.reason ?? ""),
      })).filter((candidate) => candidate.item_id)
      : [],
  };
}

export function writePendingCorrectionTargetV2(
  tempMemory: unknown,
  pending: PendingCorrectionTargetV2,
): Record<string, unknown> {
  return {
    ...(isRecord(tempMemory) ? tempMemory : {}),
    [PENDING_CORRECTION_TARGET_V2_KEY]: pending,
  };
}

export function clearPendingCorrectionTargetV2(
  tempMemory: unknown,
): Record<string, unknown> {
  const next = { ...(isRecord(tempMemory) ? tempMemory : {}) };
  delete next[PENDING_CORRECTION_TARGET_V2_KEY];
  return next;
}

export function prepareAmbiguousCorrectionConfirmation(args: {
  temp_memory: unknown;
  resolution: CorrectionTargetResolution;
  user_message: string;
  now_iso?: string;
  ttl_minutes?: number;
}): AmbiguousCorrectionConfirmationResult {
  if (!args.resolution.needs_confirmation) {
    return {
      temp_memory: { ...(isRecord(args.temp_memory) ? args.temp_memory : {}) },
      assistant_message: null,
      mutation_allowed: true,
    };
  }

  const nowIso = args.now_iso ?? new Date().toISOString();
  const prompt = args.resolution.confirmation_prompt ??
    "Tu veux que je corrige quel souvenir exactement ?";
  const pending: PendingCorrectionTargetV2 = {
    version: 2,
    status: "awaiting_confirmation",
    requested_at: nowIso,
    expires_at: ttlIso(nowIso, args.ttl_minutes ?? 10),
    user_message: args.user_message,
    confirmation_prompt: prompt,
    confidence: args.resolution.confidence,
    candidates: args.resolution.candidates,
  };

  return {
    temp_memory: writePendingCorrectionTargetV2(args.temp_memory, pending),
    assistant_message: prompt,
    mutation_allowed: false,
  };
}
