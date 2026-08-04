/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import {
  buildWeeklyFlowToken,
  decideWeeklyFlow,
  WEEKLY_FLOW_BODY_EN,
  WEEKLY_FLOW_CTA_EN,
  WEEKLY_TEMPLATE_LANG_DEFAULT,
  WEEKLY_TEMPLATE_NAME_DEFAULT,
  weeklyTemplateFlowComponents,
} from "../_shared/keel/weekly_flow.ts";
import {
  hasAnsweredWeek,
  hasAskedWeek,
  weekStartOf,
  WEEKLY_FLOW_WEEK_META_KEY,
} from "../_shared/keel/weekly_flow_io.ts";
import { deliverChatMessage } from "../_shared/chat/delivery.ts";
import {
  isRestrictionFlagged,
  localHourFor,
} from "../_shared/keel/reengagement_io.ts";

/**
 * PIVOT C4 — le job qui envoie le point hebdomadaire.
 *
 * Balayage HORAIRE pour la même raison que `keel-daily-pulse-v1` : la fenêtre
 * (dimanche 18h-21h) est en heure LOCALE de l'élève, et un job quotidien ne
 * servirait correctement qu'un seul fuseau.
 *
 * CE QU'IL FAIT : décider, et poser la question. Il n'écrit pas la réponse —
 * elle arrive par le webhook sous forme de `nfm_reply`, parfois des heures
 * plus tard.
 *
 * ── L'ENVOI EST CONDITIONNÉ À UNE CONFIGURATION QU'ON N'A PAS ENCORE ──────
 * `KEEL_WEEKLY_FLOW_ID` est l'identifiant d'un Flow publié CHEZ META. Tant
 * qu'il est absent, chaque élève est écarté sur `flow_not_configured` et rien
 * ne part. C'est voulu : mieux vaut un job qui ne fait rien et le DIT dans son
 * compte-rendu qu'un job qui émet des bulles vides.
 *
 * `dry_run: true` décide sans envoyer.
 */

const FN_NAME = "keel-weekly-flow-v1";
const PAGE = 200;
const DEFAULT_BUDGET_MS = 45_000;
/** L'écran d'entrée du Flow publié. Doit correspondre à `weeklyFlowJson()`. */
const FLOW_ENTRY_SCREEN = "WEEK_FELT";

function cleanText(v: unknown, fb = ""): string {
  const t = String(v ?? "").trim();
  return t || fb;
}

/**
 * Une erreur PostgREST n'est PAS une `Error`: c'est un objet nu
 * `{ code, message, details, hint }`. `String(...)` le rend `[object Object]`,
 * et le compte-rendu du job ne dit alors plus RIEN sur ce qui a cassé.
 *
 * Constaté en vrai: ce job a échoué sur `column profiles.content_locale does
 * not exist` et n'a su rapporter que « [object Object] », y compris dans
 * `system_error_logs`. Un job qui échoue doit dire de quoi.
 */
function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    const parts = [e.message, e.details, e.hint]
      .map((p) => String(p ?? "").trim())
      .filter(Boolean);
    const code = String(e.code ?? "").trim();
    if (parts.length > 0) return code ? `${code}: ${parts.join(" — ")}` : parts.join(" — ");
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/** La date locale de l'élève. */
function localDateFor(now: Date, tz: string | null): string {
  const zone = String(tz ?? "").trim();
  if (!zone) return now.toISOString().slice(0, 10);
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** Le jour de la semaine local, 0 = dimanche. */
function localDowFor(now: Date, tz: string | null): number {
  const date = localDateFor(now, tz);
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

// Le plancher TCA (`weekly_reviews.risk_band`) se lit désormais dans
// `_shared/keel/reengagement_io.ts::isRestrictionFlagged`, importé ci-dessus.
//
// Il vivait ICI et nulle part ailleurs, et `keel-reengage-v1` posait
// `restrictionFlag: false` en dur: sur le même élève et la même ligne, ce job
// écartait pendant que la relance armait. Deux lecteurs pour un plancher
// clinique, c'est un lecteur de trop. La raison de lire le bilan le plus
// récent quel que soit son âge — un drapeau de restriction ne se périme pas, et
// le lever par simple écoulement du temps serait une décision clinique prise
// par un `order by` — est partie avec la fonction.

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
        // Exactement les colonnes qui EXISTENT et qui sont LUES plus bas.
        // `content_locale` figurait ici et n'existe pas sur `profiles`: PostgREST
        // rendait 42703 dès la première page, le job répondait 500, et AUCUN
        // élève n'a jamais été examiné. Toutes les gardes en aval étaient du
        // code mort derrière un SELECT cassé. Voir le test de dérive de schéma
        // dans `_shared/keel/weekly_flow_schema_test.sql`.
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
        const localDow = localDowFor(now, tz);

        // La fenêtre d'abord: filtre le moins cher, et il écarte six jours sur
        // sept avant la moindre requête.
        if (localHour === null || localDow !== 0 || localHour < 18 || localHour >= 21) {
          bySkip.outside_window = (bySkip.outside_window ?? 0) + 1;
          continue;
        }

        try {
          const localDate = localDateFor(now, tz);
          const weekStart = weekStartOf(localDate);

          const swpRes = await admin
            .from("student_week_plans")
            .select("id")
            .eq("user_id", cursor)
            .eq("status", "adopted")
            .limit(1);
          if (swpRes.error) throw swpRes.error;

          const decision = decideWeeklyFlow({
            localDow,
            localHour,
            answeredThisWeek: await hasAnsweredWeek(admin, cursor, weekStart),
            // La question a-t-elle DÉJÀ été posée ce dimanche ? Le cron passe
            // à 18:40, 19:40 et 20:40 dans la fenêtre, et le silence de l'élève
            // ne fait pas bouger `answeredThisWeek`: sans cette lecture, il
            // reçoit trois fois le même formulaire.
            askedThisWeek: await hasAskedWeek(admin, cursor, weekStart),
            // EXPLICITE, parce que le type l'exige. Ce dépôt n'a aujourd'hui
            // aucun état de crise persisté et interrogeable: la bande vit dans
            // le tour, pas dans une table. Passer `null` est donc une
            // DÉCLARATION — « ce job ne sait pas » — et pas un oubli. Le
            // plancher TCA ci-dessous est le signal clinique réel dont on
            // dispose, et il couvre précisément le risque de cette question.
            safetyBand: null,
            restrictionFlagged: await isRestrictionFlagged(admin, cursor),
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
            hasActivePlan: ((swpRes.data ?? []) as unknown[]).length > 0,
          });

          if (decision.decision === "skip") {
            bySkip[decision.reason] = (bySkip[decision.reason] ?? 0) + 1;
            continue;
          }

          if (!dryRun) {
            // ── DE-WHATSAPP — LE FLOW META DEVIENT UN FORMULAIRE IN-APP ─────
            // Ce qui disparaît: le `flow_id` déclaré chez Meta, l'écran
            // d'entrée, le CTA du Flow, le 409 « fenêtre 24h fermée » (le cas
            // NOMINAL de ce job, puisqu'il vise l'élève silencieux du
            // dimanche), et le template de repli avec son composant de bouton.
            //
            // Ce qui SURVIT à l'identique, parce que c'était la vraie règle:
            // le jeton ne porte QUE la semaine. L'élève est identifié par son
            // JWT, jamais par le contenu d'un jeton qui a fait l'aller-retour
            // par un client.
            const flowToken = buildWeeklyFlowToken(weekStart);
            const delivered = await deliverChatMessage(admin, {
              userId: cursor,
              content: WEEKLY_FLOW_BODY_EN,
              purpose: "keel_weekly_flow",
              buttons: [{ payload: flowToken, label: WEEKLY_FLOW_CTA_EN }],
              requestId,
              metadata: { [WEEKLY_FLOW_WEEK_META_KEY]: weekStart },
              // Même raison qu'en `keel-daily-pulse-v1`: l'horloge qui DÉCIDE
              // doit être celle qui ÉCRIT, sinon le plafond quotidien se compte
              // sur une autre date locale que celle qui a autorisé l'envoi.
              now,
            });
            if (!delivered.delivered) {
              // Un refus est une décision produit (mute, plafond, état
              // périmé), pas une panne. On le NOMME: sans ça, un dimanche
              // entier sans bilan ressemble à un dimanche calme.
              bySkip[`delivery:${delivered.reason}`] =
                (bySkip[`delivery:${delivered.reason}`] ?? 0) + 1;
              continue;
            }
          }
          sent++;
        } catch (error) {
          failures.push(`${cursor}: ${errorText(error)}`);
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
      error: errorText(error),
      request_id: requestId,
    }, { status: 500, includeCors: false });
  }
});
