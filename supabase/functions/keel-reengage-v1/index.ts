/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import {
  decideForCandidates,
  loadReengageCandidates,
  openReengagementEpisode,
} from "../_shared/keel/reengagement_io.ts";
import { toneInstruction } from "../_shared/keel/reengagement.ts";

/**
 * PIVOT NUTRITION §1.3 — la boucle REMARQUER, en job.
 *
 * « 48-72h de silence → relance douce, zéro culpabilisation. C'est la boucle
 * qui sauve le jour 9 — celle pour laquelle le coach paie. »
 *
 * CE QUE FAIT CE JOB: sélectionner, décider, ouvrir l'épisode. Il n'écrit PAS
 * le message lui-même: la génération passe par le composeur (qui porte la
 * doctrine du coach et la ceinture de sortie), et l'envoi par le moteur
 * outbound existant. Un job proactif qui rédigerait son propre texte
 * contournerait les deux, et c'est exactement là que la voix du coach se perd.
 *
 * `dry_run: true` (défaut en local) décide sans rien ouvrir: c'est le mode qui
 * permet d'observer qui SERAIT relancé avant d'envoyer quoi que ce soit.
 */

const DEFAULT_BUDGET_MS = 45_000;

function cleanText(value: unknown, fallback = ""): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  try {
    const guard = ensureInternalRequest(req);
    if (guard) return guard;

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const nowIso = cleanText(body.now);
    const nowCandidate = nowIso ? new Date(nowIso) : new Date();
    const now = Number.isFinite(nowCandidate.getTime()) ? nowCandidate : new Date();
    const dryRun = body.dry_run === true;
    const budgetMsRaw = Number(body.budget_ms);
    const budgetMs = Number.isFinite(budgetMsRaw) && budgetMsRaw > 0
      ? Math.min(budgetMsRaw, 120_000)
      : DEFAULT_BUDGET_MS;

    const admin = adminClient();
    const startedAt = Date.now();

    const candidates = await loadReengageCandidates(admin, {
      now,
      limit: Number(body.limit) || 200,
      afterUserId: cleanText(body.after_user_id),
    });
    const outcomes = decideForCandidates(candidates, now);

    // Le compte par motif est la sortie la plus utile de ce job: « 0 envoyé »
    // est une information très différente selon qu'il s'agit de 40 élèves en
    // heures calmes ou de 40 élèves déjà relancés.
    const bySkipReason: Record<string, number> = {};
    let sent = 0;
    let deferred = 0;
    const armed: Array<{ user_id: string; tone: string; hours_silent: number }> = [];

    for (const outcome of outcomes) {
      if (Date.now() - startedAt > budgetMs) break;
      const d = outcome.decision;
      if (d.decision === "skip") {
        bySkipReason[d.reason] = (bySkipReason[d.reason] ?? 0) + 1;
        continue;
      }
      if (d.decision === "defer") {
        deferred++;
        continue;
      }
      if (!dryRun) {
        const opened = await openReengagementEpisode(admin, {
          userId: outcome.userId,
          at: now.toISOString(),
          daysInactive: Math.floor(d.hoursSilent / 24),
        });
        // Pas d'épisode ouvert => pas d'armement. Sans ce garde, un échec
        // d'écriture produirait une relance non tracée, donc une seconde au
        // tick suivant.
        if (!opened.opened) {
          bySkipReason.episode_open_failed = (bySkipReason.episode_open_failed ?? 0) + 1;
          continue;
        }
      }
      sent++;
      armed.push({
        user_id: outcome.userId,
        tone: d.tone,
        hours_silent: Math.round(d.hoursSilent),
      });
    }

    return jsonResponse(req, {
      ok: true,
      dry_run: dryRun,
      candidates: candidates.length,
      armed: sent,
      deferred_quiet_hours: deferred,
      skipped_by_reason: bySkipReason,
      // L'instruction de ton part avec l'armement: c'est elle qui porte
      // "n'énumère pas les jours" et "le protocole ne change pas".
      tone_instructions: armed.length > 0
        ? { [armed[0].tone]: toneInstruction(armed[0].tone as never) }
        : {},
      armed_users: armed.slice(0, 50),
      request_id: requestId,
    }, { includeCors: false });
  } catch (error) {
    await logEdgeFunctionError({
      functionName: "keel-reengage-v1",
      requestId,
      error,
      metadata: { source: "edge" },
    });
    return jsonResponse(req, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      request_id: requestId,
    }, { status: 500, includeCors: false });
  }
});
