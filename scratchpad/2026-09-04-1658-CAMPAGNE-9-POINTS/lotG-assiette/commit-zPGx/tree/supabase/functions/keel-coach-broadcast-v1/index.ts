/// <reference path="../tsserver-shims.d.ts" />
/**
 * `keel-coach-broadcast-v1` — LA DIFFUSION D'UN MESSAGE DE COHORTE.
 *
 * Le coach écrit une fois (`keel_coach_send_broadcast`), N élèves reçoivent.
 * Ce job est la seconde moitié: il prend les diffusions non terminées et les
 * sert, élève par élève, au curseur.
 *
 * ── POURQUOI UN JOB ET PAS LA RPC ────────────────────────────────────────
 * Une diffusion synchrone à 500 élèves ferait expirer la requête HTTP du coach,
 * et un échec au 300ᵉ laisserait une cohorte à moitié servie sans moyen de
 * savoir où reprendre. `cursor_user_id` est ce moyen: la ligne porte son propre
 * point de reprise, donc un tick interrompu ne re-livre jamais les 300 premiers.
 *
 * ── LA REPRISE EST IDEMPOTENTE PAR LE CURSEUR, PAS PAR UNE DÉDUP ─────────
 * On avance strictement (`> cursor_user_id`, tri sur `student_user_id`). Un
 * élève déjà servi n'est plus dans la fenêtre: il n'y a donc rien à dédupliquer,
 * et pas de table de dédup à tenir. C'est le même raisonnement que
 * `after_user_id` dans `keel-daily-pulse-v1`.
 *
 * ── CE QUI EST COMPTÉ, ET POURQUOI LES DEUX ─────────────────────────────
 * `delivered_count` et `skipped_count`. Le second n'est pas décoratif: un
 * élève peut être écarté par le plafond non sollicité (il a déjà reçu deux
 * messages aujourd'hui) ou parce qu'il a coupé le proactif. Sans ce compte, le
 * coach croirait que toute sa cohorte a reçu. « Le silence n'est jamais arrondi
 * vers le haut » vaut aussi pour ce qu'on montre au coach.
 *
 * ── UNE DIFFUSION NE PORTE AUCUNE FENÊTRE HORAIRE ───────────────────────
 * Contrairement au tap du soir et au point du dimanche, elle part dès que le
 * tick la voit. Le coach a écrit maintenant; retarder son message de douze
 * heures le rendrait incompréhensible (« cette semaine, on regarde les
 * petits-déjeuners » livré un vendredi soir). Le plafond quotidien de l'élève
 * reste, lui, la protection contre l'arrivée au mauvais moment.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { renderCoachBroadcast } from "../_shared/keel/coach_broadcast.ts";
import { resolveDoctrineOwner } from "../_shared/keel/doctrine_delegation.ts";
import { deliverChatMessage } from "../_shared/chat/delivery.ts";

const FN_NAME = "keel-coach-broadcast-v1";
const PAGE = 200;
const DEFAULT_BUDGET_MS = 45_000;

/** Une diffusion par tick au maximum. Deux coachs qui publient la même heure
 *  sont servis à des ticks différents plutôt que de se partager un budget: une
 *  cohorte à moitié servie est pire que servie une heure plus tard. */
const BROADCASTS_PER_TICK = 1;

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
    const dryRun = body.dry_run === true;
    const budgetRaw = Number(body.budget_ms);
    const budgetMs = Number.isFinite(budgetRaw) && budgetRaw > 0
      ? Math.min(budgetRaw, 120_000)
      : DEFAULT_BUDGET_MS;

    const admin = adminClient();
    const startedAt = Date.now();

    // La plus ancienne d'abord: un coach qui a écrit hier passe avant celui qui
    // vient d'écrire, sinon une diffusion peut se faire doubler indéfiniment.
    const pendingRes = await admin
      .from("coach_broadcasts")
      .select("id, coach_id, body, cursor_user_id, delivered_count, skipped_count, started_at")
      .is("finished_at", null)
      .order("created_at", { ascending: true })
      .limit(BROADCASTS_PER_TICK);
    if (pendingRes.error) throw pendingRes.error;

    const pending = (pendingRes.data ?? []) as Array<Record<string, unknown>>;
    if (pending.length === 0) {
      return jsonResponse(req, {
        ok: true,
        pending: 0,
        request_id: requestId,
      });
    }

    const b = pending[0];
    const broadcastId = String(b.id ?? "");
    const coachId = String(b.coach_id ?? "");

    // LE NOM QUI SIGNE. Lu une fois par diffusion, pas une fois par élève:
    // c'est la même valeur pour toute la cohorte.
    //
    // ⚠️ PASSE PAR LE MÊME RÉSOLVEUR QUE LA CONVERSATION, et ce n'est pas un
    // raffinement. Un coach qui DÉLÈGUE sa doctrine à la maison a un agent qui
    // signe « Sophia » en conversation; si cette diffusion lisait
    // `coaches.display_name` en direct, le même élève recevrait « Sophia » le
    // lundi et « Marc » le jeudi. Deux identités pour un même coach, la même
    // semaine — exactement le mensonge que la délégation existe pour éviter.
    // Une seule définition de « qui signe » (`doctrine_delegation.ts`).
    const coachDisplayName = (await resolveDoctrineOwner(admin, coachId)).displayName;

    const content = renderCoachBroadcast(b.body, coachDisplayName);
    if (!content) {
      // Un corps vide ne peut pas exister (CHECK en base), mais s'il existait on
      // fermerait la diffusion au lieu de la laisser tourner à chaque tick.
      await admin
        .from("coach_broadcasts")
        .update({ finished_at: new Date().toISOString() })
        .eq("id", broadcastId);
      return jsonResponse(req, {
        ok: true,
        broadcast_id: broadcastId,
        closed: "empty_body",
        request_id: requestId,
      });
    }

    let cursor = String(b.cursor_user_id ?? "") || null;
    let delivered = Number(b.delivered_count ?? 0) || 0;
    let skipped = Number(b.skipped_count ?? 0) || 0;
    const skipReasons: Record<string, number> = {};
    let scanned = 0;
    let exhausted = false;

    if (!dryRun && !b.started_at) {
      await admin
        .from("coach_broadcasts")
        .update({ started_at: new Date().toISOString() })
        .eq("id", broadcastId);
    }

    while (true) {
      if (Date.now() - startedAt > budgetMs) break;

      let q = admin
        .from("coach_clients")
        .select("student_user_id")
        .eq("coach_id", coachId)
        .eq("status", "active")
        .not("student_user_id", "is", null)
        .order("student_user_id", { ascending: true })
        .limit(PAGE);
      if (cursor) q = q.gt("student_user_id", cursor);

      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as Array<Record<string, unknown>>;
      if (rows.length === 0) {
        exhausted = true;
        break;
      }

      for (const row of rows) {
        if (Date.now() - startedAt > budgetMs) break;
        const studentId = String(row.student_user_id ?? "");
        if (!studentId) continue;
        scanned++;

        if (dryRun) {
          cursor = studentId;
          continue;
        }

        const res = await deliverChatMessage(admin, {
          userId: studentId,
          content,
          // Non classé dans `delivery_policy.ts`, donc soumis au plafond non
          // sollicité — voir le commentaire qui l'y explique.
          purpose: "keel_coach_broadcast",
          isReply: false,
          requestId,
          metadata: { broadcast_id: broadcastId, coach_id: coachId },
        });

        if (res.delivered) {
          delivered++;
        } else {
          skipped++;
          skipReasons[res.reason] = (skipReasons[res.reason] ?? 0) + 1;
        }

        // LE CURSEUR AVANCE MÊME SUR UN ÉCART. Un élève plafonné aujourd'hui ne
        // doit pas bloquer les 400 suivants ni être re-tenté au tick d'après:
        // le message serait alors livré hors de son moment.
        cursor = studentId;

        // Écrit à CHAQUE élève et pas en fin de page: un tick tué au milieu
        // d'une page ne doit pas re-livrer ce qu'il vient d'envoyer.
        await admin
          .from("coach_broadcasts")
          .update({
            cursor_user_id: cursor,
            delivered_count: delivered,
            skipped_count: skipped,
          })
          .eq("id", broadcastId);
      }
    }

    if (exhausted && !dryRun) {
      await admin
        .from("coach_broadcasts")
        .update({ finished_at: new Date().toISOString() })
        .eq("id", broadcastId);
    }

    return jsonResponse(req, {
      ok: true,
      broadcast_id: broadcastId,
      dry_run: dryRun,
      scanned,
      delivered,
      skipped,
      skipped_by_reason: skipReasons,
      finished: exhausted,
      next_after_user_id: exhausted ? null : cursor,
      request_id: requestId,
    });
  } catch (error) {
    await logEdgeFunctionError({
      functionName: FN_NAME,
      requestId,
      error,
      title: "broadcast_failed",
    });
    return jsonResponse(req, {
      error: "broadcast_failed",
      request_id: requestId,
    }, { status: 500 });
  }
});
