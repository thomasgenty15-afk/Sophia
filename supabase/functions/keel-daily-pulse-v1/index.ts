/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import {
  decideDailyPulse,
  PULSE_TEMPLATE_LANG_DEFAULT,
  PULSE_TEMPLATE_NAME_DEFAULT,
  pulseTemplateButtonComponents,
  renderPulseQuestion,
} from "../_shared/keel/daily_pulse.ts";
import { loadPulseDay, wasPulseAskedToday } from "../_shared/keel/daily_pulse_io.ts";
import { localDateFor, localHourFor } from "../_shared/keel/reengagement_io.ts";
import { deliverChatMessage } from "../_shared/chat/delivery.ts";

/**
 * PIVOT NUTRITION — N2 : le job qui envoie le tap du soir.
 *
 * Balayage HORAIRE, parce que la fenêtre (20h-22h) est en heure LOCALE de
 * l'élève : un job quotidien ne pourrait servir correctement qu'un seul fuseau.
 * C'est le même raisonnement que `keel-reengage-v1`, et c'est le bug latent
 * n°2 documenté dans BUILD_PLAN W1.3 (« planificateur cassé hors Europe »).
 *
 * CE QU'IL FAIT : décider, et poser la question. Il n'écrit pas la réponse —
 * c'est le webhook qui la reçoit et l'écrit, parce que la réponse arrive par
 * un bouton, des minutes ou des heures plus tard.
 *
 * `dry_run: true` décide sans envoyer : le mode qui permet de voir QUI serait
 * sollicité avant d'ouvrir la vanne.
 */

const FN_NAME = "keel-daily-pulse-v1";
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

// `localDateFor` vient de `_shared/keel/reengagement_io.ts`. Elle était copiée
// ici; le webhook en avait une troisième copie et lisait un profil SANS la
// colonne `timezone`, donc rangeait le tap au jour UTC pendant que ce job
// interrogeait le jour local. Une seule implémentation, un seul jour.

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
    let sent = 0;
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

        const tz = row.timezone ? String(row.timezone) : null;
        const localHour = localHourFor(now, tz);
        const localDate = localDateFor(now, tz);

        // La fenêtre d'abord: c'est le filtre le moins cher, et il écarte
        // l'écrasante majorité des élèves à chaque tick.
        if (localHour === null || localHour < 20 || localHour >= 22) {
          bySkip.outside_window = (bySkip.outside_window ?? 0) + 1;
          continue;
        }

        try {
          const day = await loadPulseDay(admin, { userId: cursor, localDate });
          const planRes = await admin
            .from("plan_versions")
            .select("id")
            .eq("student_id", cursor)
            .eq("status", "published")
            .limit(1);
          if (planRes.error) throw planRes.error;

          // Le plan de l'élève OU un programme publié: en 1:N c'est
          // `student_week_plans` qui fait foi, mais un élève 1:1 garde son
          // plan_version. On accepte les deux, sinon le modèle 1:N n'aurait
          // jamais de tap.
          //
          // `status='adopted'` OBLIGATOIRE. Sans ce filtre, un brouillon
          // généré et jamais adopté comptait comme plan actif: l'élève qui a
          // regardé une proposition sans la prendre recevait « How was
          // today? » tous les soirs, alors qu'il ne suit rien. « Rien à
          // suivre, rien à demander » — c'est la garde `no_active_plan`, et
          // elle ne mordait pas. Le point hebdomadaire, lui, exigeait déjà
          // `adopted`: les deux surfaces divergeaient sur ce que « avoir un
          // plan » veut dire.
          const swpRes = await admin
            .from("student_week_plans")
            .select("id")
            .eq("user_id", cursor)
            .eq("status", "adopted")
            .limit(1);
          if (swpRes.error) throw swpRes.error;

          const decision = decideDailyPulse({
            localHour,
            answeredToday: day.answeredToday,
            // La question est-elle déjà sortie ce jour local ? Le cron est
            // horaire et la fenêtre fait deux heures: sans cette garde, le
            // silence de l'élève valait relance une heure plus tard.
            askedToday: await wasPulseAskedToday(admin, {
              userId: cursor,
              localDate,
              timezone: tz,
              now,
            }),
            // Le mode `attach` demande le dernier échange; ce job ne l'a pas
            // sous la main et l'attachement se décide côté conversation. Ici
            // on envoie toujours en standalone, ce qui est le cas nominal du
            // soir (l'élève n'écrit pas à 20h dans la majorité des cas).
            minutesSinceLastExchange: null,
            // ⚠️ DÉCLARATION, PAS OUBLI — et la garde reste inactive ici.
            //
            // Ce champ était omis, et l'omission était invisible: la garde
            // `safety_active` de ce job était testée, verte, et ne pouvait pas
            // mordre. Le champ est devenu REQUIS pour que ça ne puisse plus
            // arriver en silence.
            //
            // Il vaut `null` parce que ce dépôt n'a AUCUN état de crise
            // persisté et interrogeable: la bande vit dans le tour, pas dans
            // une table. La câbler pour de bon demande de décider où cet état
            // s'écrit — une décision de conception, pas une ligne de code, et
            // elle est remontée telle quelle dans STATUS-MORNING.
            safetyBand: null,
            // ── DE-WHATSAPP — LE MUTE VIENT DU RÉGLAGE PRODUIT, PAS DE META ──
            //
            // 🔴 LE DÉFAUT QUE CETTE LIGNE CORRIGE, MESURÉ EN LOCAL LE 2026-08-04:
            // la condition était
            //     Boolean(row.whatsapp_opted_out_at) || row.whatsapp_opted_in === false
            // et `profiles.whatsapp_opted_in` vaut `false` par défaut. Un élève
            // KEEL n'a JAMAIS donné d'opt-in Meta — il n'y a pas de parcours qui
            // le lui demande. **Tous les élèves KEEL étaient donc `opted_out`**,
            // et le tap du soir n'atteignait personne.
            //
            // Constaté sur la base locale: 14 profils sur 108 écartés en
            // `opted_out`, dont l'élève de la vérification au navigateur. La
            // colonne était le vestige d'une obligation réglementaire Meta; la
            // lire à l'envers (« pas d'opt-in ⇒ muet ») faisait taire toute la
            // base du produit qu'on est en train de construire.
            //
            // `proactive_muted_at` est le réglage produit: il n'est posé QUE
            // quand l'élève coupe ses relances (migration 20260804121000, dont
            // le backfill est délibérément asymétrique pour cette raison exacte).
            optedOut: Boolean(row.proactive_muted_at),
            hasActivePlan: ((planRes.data ?? []) as unknown[]).length > 0 ||
              ((swpRes.data ?? []) as unknown[]).length > 0,
          });

          if (decision.decision === "skip") {
            bySkip[decision.reason] = (bySkip[decision.reason] ?? 0) + 1;
            continue;
          }

          if (!dryRun) {
            const message = renderPulseQuestion();
            // DE-WHATSAPP — la livraison est une ÉCRITURE, plus un appel Graph.
            //
            // Ce qui disparaît avec Meta, et ce que ça supprime de complexité:
            //   * `sendKeelWhatsApp` + `x-internal-secret` (les 403 silencieux
            //     qui comptaient chaque envoi en `failures` sans rien envoyer);
            //   * le 409 « fenêtre 24h fermée », qui était le cas NOMINAL de ce
            //     job — l'élève qu'on veut mesurer est justement celui qui n'a
            //     pas écrit depuis la veille;
            //   * le repli template et ses payloads de boutons voyageant par
            //     index, avec le risque de divergence de libellés qui allait
            //     avec.
            // Il ne reste qu'une ligne écrite dans la bulle, et Realtime.
            const delivered = await deliverChatMessage(admin, {
              userId: cursor,
              content: message.body,
              purpose: "keel_daily_pulse",
              buttons: message.buttons.map((b) => ({
                payload: b.id,
                label: b.title,
              })),
              requestId,
            });
            if (!delivered.delivered) {
              // Un refus de livraison N'EST PAS une panne: mute, plafond ou
              // état périmé sont des décisions produit. On les compte par motif
              // pour qu'un soir « rien n'est parti » soit lisible, au lieu de
              // ressembler à un incident ou — pire — à un succès.
              bySkip[`delivery:${delivered.reason}`] =
                (bySkip[`delivery:${delivered.reason}`] ?? 0) + 1;
              continue;
            }
          }
          sent++;
        } catch (error) {
          // Une erreur PostgREST n'est PAS une `Error`: sans ces champs, le
          // journal ne dit que « [object Object] ». C'est exactement ce qui a
          // masqué un 42P10 permanent dans le point hebdo, et ce qui a rendu
          // illisible la panne du 2026-08-04 quand une vue de compat a été
          // droppée sous les pieds de ce job.
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
      sent,
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
