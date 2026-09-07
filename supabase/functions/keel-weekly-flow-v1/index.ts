/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
// Le plancher TCA, la MÊME porte que la composition de repas et que le tap du
// soir. Ce fichier passait `false` en dur — voir le pavé sous les helpers.
import { evaluateRestrictionForStudent } from "../_shared/keel/restriction_runtime.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import {
  decideWeeklyFlow,
  WEEKLY_TEMPLATE_LANG_DEFAULT,
  WEEKLY_TEMPLATE_NAME_DEFAULT,
  weeklyTemplateFlowComponents,
} from "../_shared/keel/weekly_flow.ts";
import { weekStartOf } from "../_shared/keel/weekly_flow_io.ts";
import { resolveStudentFollowing } from "../_shared/keel/following_io.ts";
import { localHourFor } from "../_shared/keel/reengagement_io.ts";
import {
  computeAndStoreWeekReview,
  readWeekReview,
} from "../_shared/keel/week_review_io.ts";
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

/**
 * Le message d'une erreur, qu'elle soit une `Error` ou un objet PostgREST.
 *
 * ⚠️ `String(error)` rend « [object Object] » sur une erreur PostgREST, et
 * c'est ce qui a masqué un 42P10 permanent dans le point hebdo. Les quatre
 * champs sont lus nommément.
 */
function readableError(error: unknown): string {
  if (error instanceof Error) return error.message;
  const e = error as {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
  };
  return [e?.code, e?.message, e?.details, e?.hint].filter(Boolean).join(" — ") ||
    String(error);
}

/**
 * LE PLANCHER TCA — RÉARMÉ LE 2026-09-01, SUR UNE SOURCE ALIMENTÉE.
 *
 * Il se lisait autrefois par `isRestrictionFlagged`, sur `weekly_reviews.risk_band`
 * — colonne de l'ancienne weekly review 1:1 qui n'a JAMAIS eu d'écrivain. Le
 * lecteur a été retiré en L3 (2026-08-08) et remplacé par un littéral `false`,
 * en le disant. Ce qui restait était une garde ARMÉE dans `decideWeeklyFlow`
 * (`restriction_flagged` y est un motif de skip) qui ne recevait jamais `true`:
 * le formulaire du dimanche demandait son poids et son tour de taille à
 * quelqu'un sous plancher.
 *
 * On ne rebranche PAS la colonne morte: on appelle
 * `evaluateRestrictionForStudent`, la porte que `generate-meal-v1` et
 * `meal-photo-upload-v1` utilisent déjà, dont les déclencheurs lisent des tables
 * vivantes (`student_body_measures`, la prose de l'élève).
 *
 * ── FAIL-CLOSED, ET ICI ÇA COÛTE PEU ────────────────────────────────────────
 * Une évaluation en panne saute le formulaire de CE dimanche pour cet élève. Le
 * cron repasse à 18:40, 19:40 et 20:40, donc une panne transitoire ne perd même
 * pas la semaine. Demander un poids à quelqu'un sous plancher, en revanche, ne
 * se rattrape pas.
 *
 * ── APRÈS `following`, ET C'EST L'ORDRE DU COÛT ─────────────────────────────
 * Le balayage est horaire sur toute la cohorte; ces quatre lectures ne sont
 * payées que pour les élèves du bon fuseau, le bon jour, qui suivent quelque
 * chose. Le filtre le moins cher passe toujours en premier.
 */
async function restrictionFloorFor(
  admin: SupabaseClient,
  userId: string,
  localDate: string,
): Promise<boolean> {
  try {
    const floor = await evaluateRestrictionForStudent(admin as never, {
      userId,
      asOfLocalDate: localDate,
    });
    return floor.restriction_flag === true;
  } catch (error) {
    console.warn(JSON.stringify({
      tag: "keel.weekly_flow.restriction_floor_unreadable",
      user_id: userId,
      local_date: localDate,
      error: readableError(error),
      effect: "fail-closed: pas de point hebdo pour cet eleve ce dimanche",
    }));
    return true;
  }
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
    /** ⟳ `sent` — ce job n'envoie plus. Il calcule et range un bilan. */
    let computed = 0;
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

          // ── L'IDEMPOTENCE A CHANGÉ DE SUJET ─────────────────────────────
          //
          // ⟳ Elle demandait « le formulaire est-il déjà parti cette semaine ? »
          // (`hasAskedWeek`, sur `outbound_messages`). Plus rien ne part: cette
          // lecture rendrait `false` à CHAQUE passage, et le cron — qui passe à
          // 18:40, 19:40 et 20:40 dans la fenêtre — recalculerait le bilan de
          // toute la flotte trois fois par dimanche.
          //
          // Elle demande donc maintenant « le bilan existe-t-il ? », qui est le
          // fait que ce job PRODUIT désormais. Le motif de saut porte son propre
          // nom: réutiliser `already_asked_this_week` ferait mentir un compteur
          // sur un formulaire qui n'existe plus.
          // Fail-open par construction: `readWeekReview` rend `null` sur une
          // lecture en panne, donc on RECALCULE plutôt que de sauter — un
          // dimanche sans bilan coûte plus cher qu'un upsert de trop.
          if (await readWeekReview(admin, { userId: cursor, weekStart })) {
            bySkip["review_already_stored"] =
              (bySkip["review_already_stored"] ?? 0) + 1;
            continue;
          }

          const decision = decideWeeklyFlow({
            localDow,
            localHour,
            // ⟳ DEUX LITTÉRAUX, ET C'EST UNE DÉCLARATION, PAS UN RACCOURCI.
            //
            // Les deux champs parlent du FORMULAIRE: « a-t-il répondu », « lui
            // a-t-on demandé ». Il n'y a plus de formulaire. Les laisser
            // branchés ferait sauter le CALCUL du bilan pour quelqu'un qui a
            // rempli la carte des mesures de /app/plan cette semaine —
            // c'est-à-dire priver de bilan précisément celui qui déclare le
            // plus. L'idempotence est au-dessus, sur le bilan lui-même.
            answeredThisWeek: false,
            askedThisWeek: false,
            // EXPLICITE, parce que le type l'exige. Ce dépôt n'a aujourd'hui
            // aucun état de crise persisté et interrogeable: la bande vit dans
            // le tour, pas dans une table. Passer `null` est donc une
            // DÉCLARATION — « ce job ne sait pas » — et pas un oubli.
            safetyBand: null,
            // R9 — le plancher, résolu sur une source alimentée. Le pavé de
            // `restrictionFloorFor` (au-dessus) dit ce que ce littéral valait
            // avant, et pourquoi ce n'est pas la colonne morte qu'on rebranche.
            restrictionFlagged: await restrictionFloorFor(
              admin,
              cursor,
              localDate,
            ),
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

            // ⟳ LE FORMULAIRE DU DIMANCHE PARTAIT ICI. Il est DÉSARMÉ.
            //
            // ⛔ LE CRON ET LE CALCUL RESTENT, ET CE N'EST PAS UN ARBITRAGE.
            // `computeAndStoreWeekReview` ci-dessus est le SEUL écrivain de
            // `weekly_reviews.week_facts`, et `loadLatestWeekReview` n'a AUCUNE
            // borne de fraîcheur (`.order(desc).limit(1)`). Le bloc
            // `weekReviewPromptBlock` part dans le prompt à CHAQUE tour, avec
            // ses dates. Couper ce job gèlerait donc pour toujours un bloc daté
            // qui vieillit — un mensonge qui empire chaque semaine — et
            // priverait `grounded_support.ts` de sa matière.
          }
          computed++;
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
      computed,
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
