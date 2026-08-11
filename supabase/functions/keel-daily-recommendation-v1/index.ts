/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { runRecommendationStep } from "../_shared/keel/daily_recommendation_engine.ts";

/**
 * FF-028 — LE MOTEUR DE RECOMMANDATION DU SOIR.
 *
 * ── CE FICHIER NE DÉCIDE RIEN ──────────────────────────────────────────────
 * Il pagine `profiles`, tient un budget de temps, et rend un compte-rendu. Tout
 * ce qui décide et tout ce qui écrit vit dans
 * `_shared/keel/daily_recommendation_engine.ts`, joignable sans HTTP — ce qui
 * est la condition pour que la logique du soir soit éprouvée EN CONDITIONS
 * RÉELLES et pas seulement par des doubles. La coupure est copiée sur ce que
 * `keel-daily-pulse-v1` fait de mieux, moins ce qu'il fait de moins bien (son
 * corps de décision est dans son index, donc injouable hors production).
 *
 * ── LE PATRON EST CELUI DU JOB DU SOIR, PAS CELUI DU MEMORIZER ──────────────
 * La fiche dit « batch de fin de journée, le patron du memorizer ». Le
 * memorizer tourne à `0 0 * * *` UTC — c'est-à-dire à une heure DIFFÉRENTE pour
 * chaque fuseau, et souvent en plein après-midi. Un message du soir qui arrive
 * à 15h est faux, et surtout il ne peut pas tenir « un seul message par soir »
 * avec le tap, qui vit en heure LOCALE.
 *
 * Le balayage est donc HORAIRE, avec une fenêtre en heure locale de l'élève —
 * exactement `keel-daily-pulse-v1` et `keel-reengage-v1`, et pour la raison
 * déjà écrite là-bas (le bug latent « planificateur cassé hors Europe »).
 *
 * ── LA FENÊTRE 19h-20h EST CE QUI TIENT « UN SEUL MESSAGE PAR SOIR » ────────
 * Elle précède STRICTEMENT celle du tap du soir (20h-22h). Ce n'est donc pas
 * une convention entre deux crons: au tick de 19h le tap est hors fenêtre et ne
 * peut pas parler; aux ticks de 20h et 21h le tap lit
 * `wasRecommendationSentToday` et se retire. Les deux jobs peuvent tourner dans
 * n'importe quel ordre, y compris en parallèle: l'élève reçoit UN message.
 *
 * La priorité va à la recommandation, et c'est un arbitrage assumé: elle est
 * RARE (faim récurrente ET deux compositions rassasiantes qui n'ont pas suffi,
 * puis un mois de cooldown), le tap est quotidien et sa cadence a déjà son
 * propre repli. Perdre un tap ce soir-là ne coûte rien; perdre la proposition
 * coûte un mois.
 *
 * ── CE QU'IL N'ÉCRIT PAS: LA RÉPONSE ────────────────────────────────────────
 * Elle arrive par un bouton, des minutes ou des heures plus tard, et c'est
 * `_shared/chat/deterministic_buttons.ts` qui la reçoit. Ici on propose; on
 * n'applique jamais.
 *
 * `dry_run: true` décide sans écrire ni envoyer: le mode qui permet de voir QUI
 * serait sollicité avant d'ouvrir la vanne — et, pour ce moteur-là, de mesurer
 * la part de soirs silencieux, qui est ce que §10 demande.
 */

const FN_NAME = "keel-daily-recommendation-v1";
const PAGE = 200;
const DEFAULT_BUDGET_MS = 45_000;

function cleanText(v: unknown, fb = ""): string {
  const t = String(v ?? "").trim();
  return t || fb;
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
    const cand = nowIso ? new Date(nowIso) : new Date();
    const now = Number.isFinite(cand.getTime()) ? cand : new Date();
    const dryRun = body.dry_run === true;
    const budgetRaw = Number(body.budget_ms);
    const budgetMs = Number.isFinite(budgetRaw) && budgetRaw > 0
      ? Math.min(budgetRaw, 120_000)
      : DEFAULT_BUDGET_MS;

    const admin = adminClient();
    const startedAt = Date.now();

    let cursor = cleanText(body.after_user_id);
    let scanned = 0;
    /** Élèves réellement ANALYSÉS (dans la fenêtre locale). */
    let analysed = 0;
    let proposed = 0;
    /**
     * POURQUOI ON S'EST TU — le compteur qui porte §10.
     *
     * « Part des soirs SANS recommandation (attendu: majoritaire) » n'est pas
     * une intuition qu'on vérifie à la main: c'est ce tableau. Sans lui, un
     * moteur devenu bavard et un moteur qui se tait correctement produisent le
     * même `proposed: 0` les soirs où personne ne déclenche.
     */
    const silentReasons: Record<string, number> = {};
    const proposedActions: Record<string, number> = {};
    /** Ce que la doctrine a retiré, et pourquoi. R5 rendue visible. */
    const doctrineRemoved: Record<string, number> = {};
    const bySkip: Record<string, number> = {};
    const failures: string[] = [];
    let exhausted = false;

    while (true) {
      let q = admin
        .from("profiles")
        .select("id, timezone, proactive_muted_at")
        .eq("keel_role", "student")
        .order("id", { ascending: true })
        .limit(PAGE);
      if (cursor) q = q.gt("id", cursor);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as Array<Record<string, unknown>>;
      if (rows.length === 0) {
        exhausted = true;
        break;
      }

      for (const row of rows) {
        cursor = String(row.id ?? "");
        scanned++;
        try {
          const step = await runRecommendationStep(admin, {
            userId: cursor,
            timezone: row.timezone ? String(row.timezone) : null,
            optedOut: Boolean(row.proactive_muted_at),
            now,
            dryRun,
            requestId,
            onDoctrineRemoved: (id, reason) => {
              const key = `${id}:${reason.split(":")[0]}`;
              doctrineRemoved[key] = (doctrineRemoved[key] ?? 0) + 1;
            },
          });

          if (step.outcome === "outside_window") {
            bySkip.outside_window = (bySkip.outside_window ?? 0) + 1;
            continue;
          }
          // AVANT `analysed++`, et c'est le sujet. Un foyer gelé (D4) n'a pas
          // été analysé: le compter comme un « soir silencieux » gonflerait
          // exactement la mesure de §10 dans le sens qui rassure. Il se compte
          // avec les sauts, sous son motif nommé.
          if (step.outcome === "skipped") {
            bySkip[step.reason] = (bySkip[step.reason] ?? 0) + 1;
            continue;
          }
          analysed++;
          if (step.outcome === "silent") {
            silentReasons[step.reason] = (silentReasons[step.reason] ?? 0) + 1;
            continue;
          }
          if (step.outcome === "not_delivered") {
            bySkip[step.reason] = (bySkip[step.reason] ?? 0) + 1;
            continue;
          }
          proposed++;
          proposedActions[step.action] = (proposedActions[step.action] ?? 0) + 1;
        } catch (error) {
          // Une erreur PostgREST n'est PAS une `Error`: sans ces champs, le
          // journal ne dit que « [object Object] ». C'est exactement ce qui a
          // masqué un 42P10 permanent dans le point hebdo.
          const err = error as {
            message?: string;
            code?: string;
            details?: string;
            hint?: string;
          };
          failures.push(
            `${cursor}: ${
              error instanceof Error ? error.message : [
                err?.code,
                err?.message,
                err?.details,
                err?.hint,
              ].filter(Boolean).join(" — ") || String(error)
            }`,
          );
        }
        if (Date.now() - startedAt > budgetMs) break;
      }
      if (Date.now() - startedAt > budgetMs) break;
    }

    return jsonResponse(req, {
      ok: true,
      dry_run: dryRun,
      scanned,
      // `analysed` compte les élèves DANS la fenêtre; `proposed` ceux qui ont
      // reçu quelque chose. Leur rapport EST la mesure de §10 (« part des soirs
      // sans recommandation, attendu: majoritaire »), et elle se lit sans
      // requête supplémentaire.
      analysed,
      proposed,
      silent: Math.max(0, analysed - proposed),
      silent_reasons: silentReasons,
      proposed_actions: proposedActions,
      doctrine_removed: doctrineRemoved,
      skipped_by_reason: bySkip,
      exhausted,
      next_after_user_id: exhausted ? null : cursor || null,
      failures: failures.slice(0, 50),
      request_id: requestId,
    }, { includeCors: false });
  } catch (error) {
    await logEdgeFunctionError({
      functionName: FN_NAME,
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
