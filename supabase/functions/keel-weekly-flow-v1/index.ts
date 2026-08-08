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
import { resolveStudentFollowing } from "../_shared/keel/following_io.ts";
import { deliverChatMessage } from "../_shared/chat/delivery.ts";
import { localHourFor } from "../_shared/keel/reengagement_io.ts";
import { computeAndStoreWeekReview } from "../_shared/keel/week_review_io.ts";
import { resolveArtifactLocale } from "../_shared/keel/locale.ts";

/**
 * PIVOT C4 — le job qui envoie le point hebdomadaire.
 *
 * Balayage HORAIRE pour la même raison que `keel-daily-pulse-v1` : la fenêtre
 * (dimanche 18h-21h) est en heure LOCALE de l'élève, et un job quotidien ne
 * servirait correctement qu'un seul fuseau.
 *
 * CE QU'IL FAIT : décider, GELER LA LECTURE DE LA SEMAINE, et poser la
 * question. Il n'écrit pas la réponse — elle revient par la bulle, parfois des
 * heures plus tard, et c'est `_shared/chat/deterministic_buttons.ts` qui la
 * traite.
 *
 * ── POURQUOI LE BILAN SE CALCULE ICI ET PAS AU RETOUR DU FORMULAIRE ───────
 * Parce que c'est lui qui CHOISIT la question du bilan. Une lecture recalculée
 * au retour donnerait un autre chiffre (une nuit a passé, l'élève a logué), et
 * la conversation de la semaine suivante en citerait un troisième. Voir
 * `_shared/keel/week_review_io.ts`, « l'ordre des trois temps ».
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

// Le plancher TCA DURABLE n'existe plus (L3, 2026-08-08). Il se lisait ici,
// puis dans `_shared/keel/reengagement_io.ts::isRestrictionFlagged` quand les
// deux lecteurs ont été fusionnés — et il interrogeait `weekly_reviews.risk_band`,
// colonne de l'ancienne weekly review 1:1 qui n'a JAMAIS eu d'écrivain dans ce
// dépôt. Le pavé qui explique le retrait, ce qui reste vivant, et comment
// réarmer sans rebrancher une colonne morte, est resté dans `reengagement_io.ts`.

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
    // Le compte-rendu du BILAN, à côté de celui de l'envoi. Un job qui envoie
    // mille formulaires et gèle zéro lecture est un job qui a l'air vert:
    // c'est exactement la panne silencieuse que ce dépôt a déjà payée avec
    // `toneDelivered`, et le seul remède est de compter les deux séparément.
    const reviewOutcomes: Record<string, number> = {};
    const reviewBranches: Record<string, number> = {};
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
        // `locale` s'ajoute avec le bilan: il décide la langue de l'ARTEFACT
        // gelé (`weekly_reviews.content_locale`), et `keel-daily-pulse-v1` le
        // lit déjà sous ce nom sur la même table — c'est-à-dire que la colonne
        // est éprouvée en production, pas supposée.
        .select("id, timezone, proactive_muted_at, locale")
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

          // MÊME GARDE QUE LE TAP DU SOIR, ET DÉSORMAIS LE MÊME CODE.
          //
          // Elle exigeait ici `student_week_plans` en 'adopted' — une surface
          // que le commit 99697610 a remplacée par le constructeur de repas.
          // Plus rien n'écrivant 'adopted', ce formulaire ne partait plus pour
          // personne, silencieusement. `keel-daily-pulse-v1` portait la même
          // condition écrite séparément, avec une divergence déjà documentée
          // dans son propre commentaire: c'est exactement ce que la définition
          // partagée supprime.
          const following = await resolveStudentFollowing(admin, cursor, weekStart);

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
            // DÉCLARATION — « ce job ne sait pas » — et pas un oubli.
            safetyBand: null,
            // ⚠️ FAUX, ET DIT COMME TEL (L3, 2026-08-08). Cette ligne appelait
            // `isRestrictionFlagged`, qui lisait `weekly_reviews.risk_band` —
            // colonne de l'ancienne weekly review 1:1, SANS AUCUN ÉCRIVAIN
            // (épreuves d'absence: code, `prosrc`, vues, base). Elle rendait
            // déjà `false` pour 100 % des élèves réels; le littéral ne change
            // donc rien au comportement. Le raisonnement complet, et la façon
            // de RÉARMER ce plancher sans le rebrancher sur une colonne morte,
            // sont dans le pavé de `_shared/keel/reengagement_io.ts`.
            restrictionFlagged: false,
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
            hasActivePlan: following.following,
          });

          if (decision.decision === "skip") {
            bySkip[decision.reason] = (bySkip[decision.reason] ?? 0) + 1;
            continue;
          }

          if (!dryRun) {
            // ── LE BILAN EST CALCULÉ ICI, AVANT QUE LA QUESTION NE PARTE ────
            //
            // C'est la condition « en amont du point », et elle n'est pas une
            // commodité d'implémentation: la QUESTION que le bilan posera est
            // choisie par ce calcul-là. Entre cet envoi et la réponse de
            // l'élève il peut s'écouler une nuit, pendant laquelle il loguera
            // peut-être son petit-déjeuner du lundi. Recalculer au retour du
            // formulaire ferait bouger le chiffre sous la question déjà posée,
            // et la conversation de toute la semaine suivante citerait une
            // troisième valeur. Une seule lecture, gelée, relue partout.
            //
            // LA FENÊTRE VA JUSQU'À AUJOURD'HUI, PAS JUSQU'À DIMANCHE MINUIT.
            // On est dimanche soir dans le fuseau de l'élève; la journée court
            // encore. Le bloc porte ses deux dates pour que rien, plus tard, ne
            // présente cette lecture comme une semaine close.
            //
            // ÉCHEC = ON ENVOIE QUAND MÊME. Le formulaire est la MESURE, et
            // elle vaut plus que le commentaire qu'on en fait: un bilan raté
            // coûte un accusé plat, un formulaire non envoyé coûte la semaine.
            const review = await computeAndStoreWeekReview(admin, {
              userId: cursor,
              weekStart,
              weekEnd: localDate,
              contentLocale: resolveArtifactLocale({
                studentProfile: String(row.locale ?? "").trim() || null,
                tenantDefault: null,
              }),
              now,
            });
            reviewOutcomes[review.outcome.split(":").slice(0, 2).join(":")] =
              (reviewOutcomes[review.outcome.split(":").slice(0, 2).join(":")] ?? 0) + 1;
            if (review.reading) {
              reviewBranches[review.reading.branch] =
                (reviewBranches[review.reading.branch] ?? 0) + 1;
            }

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
      week_review_outcomes: reviewOutcomes,
      week_review_branches: reviewBranches,
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
