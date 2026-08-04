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
import { sendKeelWhatsApp } from "../_shared/keel/internal_send.ts";

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

    // Le template de repli, nommé EXPLICITEMENT. Jamais le repli générique de
    // `whatsapp-send`: un purpose non mappé y tombe sur `global_reach_template`
    // — « J'ai une info pour toi », en français — et c'est l'incident du
    // 2026-07-12. Les variables d'env existent pour que ops repointe sans
    // redéploiement le jour où Meta approuve une autre version.
    const templateName = cleanText(
      Deno.env.get("WHATSAPP_KEEL_PULSE_TEMPLATE_NAME"),
      PULSE_TEMPLATE_NAME_DEFAULT,
    );
    const templateLang = cleanText(
      Deno.env.get("WHATSAPP_KEEL_PULSE_TEMPLATE_LANG"),
      PULSE_TEMPLATE_LANG_DEFAULT,
    );

    let cursor = cleanText(body.after_user_id);
    let scanned = 0;
    let sent = 0;
    /** Combien des envois ci-dessus sont passés par le template hors fenêtre. */
    let sentViaTemplate = 0;
    const bySkip: Record<string, number> = {};
    const failures: string[] = [];
    let exhausted = false;

    while (true) {
      let q = admin
        .from("profiles")
        .select("id, timezone, whatsapp_opted_in, whatsapp_opted_out_at, phone_number")
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
            optedOut: Boolean(row.whatsapp_opted_out_at) || row.whatsapp_opted_in === false,
            hasActivePlan: ((planRes.data ?? []) as unknown[]).length > 0 ||
              ((swpRes.data ?? []) as unknown[]).length > 0,
          });

          if (decision.decision === "skip") {
            bySkip[decision.reason] = (bySkip[decision.reason] ?? 0) + 1;
            continue;
          }

          if (!dryRun) {
            const message = renderPulseQuestion();
            // Même défaut que le point hebdo, même correctif: `functions.invoke`
            // n'envoie pas `x-internal-secret`, seule porte de `whatsapp-send`.
            const sent = await sendKeelWhatsApp({
              user_id: cursor,
              to: row.phone_number,
              purpose: "keel_daily_pulse",
              message: {
                type: "interactive_buttons",
                body: message.body,
                buttons: message.buttons,
              },
            });
            if (!sent.ok) {
              // 409 = fenêtre 24h fermée. Ce n'est PAS une panne, et surtout
              // c'est le cas NOMINAL de ce job: l'élève qu'on veut mesurer est
              // justement celui qui n'a pas écrit depuis la veille. Le compter
              // en `failures` faisait ressembler un soir normal à un incident.
              //
              // Le template porte la même question et les mêmes trois boutons;
              // les payloads voyagent par index (voir
              // `pulseTemplateButtonComponents`). Toute autre erreur reste une
              // vraie erreur.
              if (sent.status !== 409) throw new Error(sent.error);
              const viaTemplate = await sendKeelWhatsApp({
                user_id: cursor,
                to: row.phone_number,
                purpose: "keel_daily_pulse",
                message: {
                  type: "template",
                  name: templateName,
                  language: templateLang,
                  components: pulseTemplateButtonComponents(message.buttons),
                },
              });
              if (!viaTemplate.ok) throw new Error(viaTemplate.error);
              sentViaTemplate++;
            }
          }
          sent++;
        } catch (error) {
          failures.push(
            `${cursor}: ${error instanceof Error ? error.message : String(error)}`,
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
      sent_via_template: sentViaTemplate,
      template_name: templateName,
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
