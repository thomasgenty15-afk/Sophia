/**
 * ⟳ 2026-09-15 · LOT R — CHAQUE PLAN REFUSÉ EST CONSIGNÉ, AVEC SES MOTIFS.
 *
 * Le serveur SAIT pourquoi il refuse : la liste `refusals` (cause, jour,
 * moment, bouche, terme, détail) est construite pour le 422, et le worker la
 * journalise. Mais rien n'en gardait trace durable — mesuré le 2026-09-15 sur
 * staging : un `plan_not_deliverable` après deux rattrapages, et aucun moyen de
 * dire par quel contrôle. « Comment on fait pour s'améliorer ? »
 *
 * UN SEUL ÉCRIVAIN, dans le wrapper de `generate-household-meal-v1` : il voit
 * TOUTE réponse du handler (rendue tout de suite, ou après le 202). Le handler
 * n'a qu'à poser, au contrôle final, ce que le corps public ne dit pas —
 * le détail non masqué, le candidat refusé, les tours et les appels
 * (`ctx.refused`) — et, dès l'admission, qui demandait (`ctx.who`).
 *
 * ⛔ NE LÈVE JAMAIS. Un journal qui plante la réponse est pire qu'un journal
 * absent. Rend `true` si une ligne a été écrite.
 */
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export const KEEL_PLAN_REFUSALS_TABLE = "keel_plan_refusals";

/** Qui demandait — posé par le handler dès l'admission. */
export interface PlanRefusalWho {
  readonly userId: string;
  readonly householdId: string | null;
  readonly intent: string | null;
  /** 1, ou 2 quand la demande est la relance d'une mère morte (lot C). */
  readonly attempt: number;
}

/** Ce que le corps public ne dit pas — posé par le handler au contrôle final. */
export interface PlanRefusalContext {
  readonly startsOn: string | null;
  readonly durationDays: number | null;
  /** Les contrôles bloquants, AVEC le détail que l'écran masque. */
  readonly refusals: readonly unknown[];
  readonly unevaluated: readonly unknown[];
  readonly incomplete: readonly unknown[];
  readonly validation: unknown;
  /** Le candidat refusé : `{dishes, preparations, cooking_sessions}`. */
  readonly plan: unknown;
  readonly rounds: number | null;
  readonly callsMade: number | null;
  readonly promptVersion: string | null;
  /** `generationModel`, pas `model:` — une épingle refuse ce mot-clé dans la lane. */
  readonly generationModel: string | null;
}

/**
 * Un refus DE PLAN, et pas une garde d'admission : 422 (les contrôles du
 * plan, une règle de maison, un modèle muet), 502 (un modèle illisible), ou
 * n'importe quelle erreur arrivée APRÈS l'acceptation — à ce stade tout ce qui
 * échoue est la composition.
 */
export function isPlanRefusal(status: number, accepted: boolean): boolean {
  return status === 422 || status === 502 || (accepted && status >= 400);
}

/** Ce que le corps public d'un refus porte, lu sans confiance. */
export function readRefusalBody(raw: unknown): {
  token: string;
  detail: string | null;
  refusals: unknown[];
  unevaluated: unknown[];
  incomplete: unknown[];
  validation: unknown;
} {
  const body = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const token = typeof body.error === "string" && body.error.trim() !== "" ? body.error.trim() : "compose_failed";
  const detail = typeof body.detail === "string"
    ? body.detail
    : body.detail == null
    ? null
    : JSON.stringify(body.detail);
  const list = (v: unknown) => Array.isArray(v) ? v : [];
  return {
    token,
    detail,
    refusals: list(body.refusals),
    unevaluated: list(body.unevaluated),
    incomplete: list(body.incomplete),
    validation: body.validation ?? null,
  };
}

export interface RecordPlanRefusalArgs {
  readonly who: PlanRefusalWho | null;
  readonly requestId: string;
  readonly draftId: string | null;
  readonly mode: "sync" | "async";
  readonly status: number;
  readonly body: unknown;
  readonly context: PlanRefusalContext | null;
  readonly wallMs: number | null;
  readonly attempt: number | null;
}

type Admin = Pick<SupabaseClient, "from">;

function log(event: string, extra: Record<string, unknown>): void {
  console.log(JSON.stringify({ tag: "keel.plan_refusal_log", event, ...extra }));
}

export async function recordPlanRefusal(admin: Admin, args: RecordPlanRefusalArgs): Promise<boolean> {
  try {
    if (args.who === null) {
      // Sans identité, aucune ligne n'a de propriétaire — et une ligne sans
      // propriétaire échappe à l'export et à la purge. On le dit, on n'écrit pas.
      log("no_owner", { request_id: args.requestId, status: args.status });
      return false;
    }
    const pub = readRefusalBody(args.body);
    const ctx = args.context;
    // LE CONTEXTE INTERNE PRIME : ses `refusals` portent le détail que le corps
    // public masque. Le corps ne sert que quand le handler n'a rien posé.
    const row = {
      user_id: args.who.userId,
      household_id: args.who.householdId,
      request_id: args.requestId,
      draft_id: args.draftId,
      mode: args.mode,
      intent: args.who.intent,
      starts_on: ctx?.startsOn ?? null,
      duration_days: ctx?.durationDays ?? null,
      http_status: args.status,
      token: pub.token,
      detail: pub.detail,
      refusals: ctx && ctx.refusals.length > 0 ? ctx.refusals : pub.refusals,
      unevaluated: ctx && ctx.unevaluated.length > 0 ? ctx.unevaluated : pub.unevaluated,
      incomplete: ctx && ctx.incomplete.length > 0 ? ctx.incomplete : pub.incomplete,
      validation: ctx?.validation ?? pub.validation,
      plan: ctx?.plan ?? null,
      rounds: ctx?.rounds ?? null,
      calls_made: ctx?.callsMade ?? null,
      wall_ms: args.wallMs,
      attempt: args.attempt,
      prompt_version: ctx?.promptVersion ?? null,
      model: ctx?.generationModel ?? null,
    };
    const { error } = await admin.from(KEEL_PLAN_REFUSALS_TABLE).insert(row);
    if (error) {
      log("insert_failed", { request_id: args.requestId, token: pub.token, message: error.message });
      return false;
    }
    log("recorded", {
      request_id: args.requestId,
      token: pub.token,
      status: args.status,
      refusals: Array.isArray(row.refusals) ? row.refusals.length : 0,
      with_plan: row.plan !== null,
    });
    return true;
  } catch (failure) {
    log("threw", {
      request_id: args.requestId,
      message: failure instanceof Error ? failure.message : String(failure),
    });
    return false;
  }
}
