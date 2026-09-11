/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  createClient,
  type SupabaseClient,
} from "jsr:@supabase/supabase-js@2.87.3";

import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { resolveArtifactLocale } from "../_shared/keel/locale.ts";
import {
  appBaseUrl,
  chooseLifecycleSegment,
  decideLifecycleSend,
  isLifecycleSendHour,
  type LifecycleEmailType,
  lifecycleLocalDate,
  loadLifecycleCadenceFacts,
  sendLifecycleEmail,
  unsubscribeUrl,
} from "../_shared/keel/lifecycle_email.ts";
import {
  type CoverageSegment,
  coverageSegmentFor,
  renderCoverageEmail,
} from "../_shared/keel/lifecycle_coverage.ts";
import {
  type ActivationSegment,
  activationSegmentFor,
  renderActivationEmail,
} from "../_shared/keel/lifecycle_activation.ts";
import {
  lapseEpisodeKey,
  renderLapseEmail,
} from "../_shared/keel/lifecycle_lapse.ts";
import {
  type TrialSegment,
  renderTrialEmail,
  trialSegmentFor,
} from "../_shared/keel/lifecycle_trial.ts";

/**
 * FF-063 — LES E-MAILS DE CYCLE DE VIE, EN UN SEUL JOB.
 *
 * ── POURQUOI UN JOB ET PAS UN PAR SEGMENT ────────────────────────────────
 * Onze types d'e-mail, un seul balayage. Un job par segment produirait
 * exactement le défaut que `20260902100000` nomme: une convention de
 * coordination — « une seule personne, un seul e-mail par jour » — écrite dans
 * le commentaire d'un seul des deux. Ici la règle est du CODE: on choisit un
 * segment, on envoie, on passe au suivant.
 *
 * ── LE CURSEUR N'EST PAS LE SILENCE ──────────────────────────────────────
 * Aucune colonne de ce dépôt n'enregistre qu'une personne a ouvert l'app. Une
 * relance déclenchée par l'absence de trace écrirait donc « on ne te voit
 * plus » à quelqu'un qui a composé sept jours et qui cuisine tous les soirs.
 * Ce job mesure la COUVERTURE (`student_generated_meals.ends_on`), et se tait
 * tant qu'un plan couvre aujourd'hui. Le détail est dans
 * `_shared/keel/lifecycle_coverage.ts`.
 *
 * ── L'HEURE EST LOCALE, DONC LE JOB EST HORAIRE ─────────────────────────
 * Un job quotidien ne servirait correctement qu'un seul fuseau. Celui-ci
 * tourne toutes les heures et n'agit que sur les personnes dont il est
 * `LIFECYCLE_SEND_HOUR` chez elles. C'est aussi la garde qui rend le balayage
 * abordable: le test d'heure est le PREMIER, et il écarte environ vingt-trois
 * personnes sur vingt-quatre avant la moindre requête supplémentaire.
 *
 * ── CE QUE LE COMPTE-RENDU DOIT RENDRE LISIBLE ──────────────────────────
 * `sent: 0` est le cas NOMINAL — la plupart des heures, personne n'a de plan
 * qui se termine demain. `examined: 0` est une PANNE: plus personne n'atteint
 * le pas. Les deux sont donc rendus séparément, `examined` en premier.
 *
 * `dry_run: true` décide sans envoyer ni journaliser: c'est le mode qui permet
 * de voir QUI serait touché avant que quoi que ce soit parte.
 */

const FN_NAME = "keel-lifecycle-email-v1";
const PAGE = 200;
const DEFAULT_BUDGET_MS = 45_000;

const SENDER_EMAIL = Deno.env.get("SENDER_EMAIL") ??
  "Sophia <sophia@sophia-coach.ai>";

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

/** Le prénom, ou `null`. Jamais de repli textuel ici: chaque pack rend le sien. */
function firstNameOf(fullName: unknown): string | null {
  const parts = String(fullName ?? "").trim().split(/\s+/);
  return parts[0] || null;
}

function bump(counter: Record<string, number>, key: string): void {
  counter[key] = (counter[key] ?? 0) + 1;
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
    const planUrl = `${appBaseUrl()}/app/plan`;
    // L'entonnoir se vise DIRECTEMENT ici, contrairement au mail de bienvenue:
    // le segment `funnel_unfinished_h24` s'adresse à quelqu'un dont on SAIT
    // qu'il n'a pas de ligne `student_goals`. Passer par `/app/plan` lui
    // ferait traverser une redirection pour arriver au même endroit.
    const setupUrl = `${appBaseUrl()}/app/setup`;
    const upgradeUrl = `${appBaseUrl()}/upgrade`;

    let cursor = cleanText(body.after_user_id);
    let scanned = 0;
    let examined = 0;
    let sent = 0;
    let suppressed = 0;
    const bySegment: Record<string, number> = {};
    const skipped: Record<string, number> = {};
    const failures: string[] = [];
    let exhausted = false;

    while (true) {
      let q = admin
        .from("profiles")
        // ⚠️ NE NOMMER QUE DES COLONNES QUI EXISTENT. Un nom fantôme rend 42703
        // à PostgREST dès la première page: aucun candidat examiné, et toutes
        // les gardes en aval mortes derrière un SELECT cassé.
        .select(
          "id, timezone, locale, full_name, email, account_status, last_seen_at, lifecycle_emails_opted_out_at, unsubscribe_token",
        )
        // Le même filtre que les autres jobs proactifs. Un coach ne reçoit pas
        // « ton plan se termine demain »: il n'en compose pas.
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

        // ── UN `try` PAR PERSONNE, ET AUCUN `continue` APRÈS ──────────────
        // C'est la forme qui empêche un pas d'être sauté par une sortie
        // anticipée mal placée. Le jour où un second mécanisme se greffe ici,
        // il va AVANT ce bloc ou dans son propre `try` sans sortie.
        try {
          const timezone = row.timezone ? String(row.timezone) : null;

          // GARDE 1 — L'HEURE. Première, et pas par élégance: elle écarte
          // vingt-trois personnes sur vingt-quatre avant toute autre requête.
          // Un fuseau illisible se tait (voir `isLifecycleSendHour`).
          if (!isLifecycleSendHour(timezone, now)) {
            bump(skipped, "not_send_hour");
            if (Date.now() - startedAt > budgetMs) break;
            continue;
          }

          const todayLocal = lifecycleLocalDate(timezone, now);
          if (!todayLocal) {
            // Inatteignable en pratique — `isLifecycleSendHour` a déjà refusé
            // un fuseau illisible. La branche existe pour que le jour où l'une
            // des deux change de posture, l'autre ne devienne pas un `null`
            // silencieux au milieu d'un calcul de dates.
            bump(skipped, "no_local_date");
            if (Date.now() - startedAt > budgetMs) break;
            continue;
          }

          examined++;

          // GARDE 2 — LE SEGMENT. UN seul aller-retour pour tous les faits:
          // `keel_lifecycle_facts` est le passe-plat obligatoire vers
          // `auth.users.email_confirmed_at` (profiles n'a pas de `created_at`,
          // et PostgREST n'expose pas le schéma `auth`), et il en profite pour
          // rendre la couverture et la trace d'usage.
          const { data: factsRow, error: factsError } = await admin
            .rpc("keel_lifecycle_facts", {
              p_user: cursor,
              p_today: todayLocal,
              p_timezone: timezone ?? "UTC",
            })
            .maybeSingle();
          if (factsError) throw factsError;
          const f = (factsRow ?? {}) as {
            confirmed_at?: string | null;
            has_goals?: boolean | null;
            live_plan_count?: number | null;
            last_covered_day?: string | null;
            has_future_plan?: boolean | null;
            has_any_trace?: boolean | null;
            household_covered?: boolean | null;
            trial_last_day?: string | null;
            has_paid_subscription?: boolean | null;
          };

          const lastCoveredDay = f.last_covered_day ?? null;
          const coverage: CoverageSegment | null = coverageSegmentFor({
            lastCoveredDay,
            hasFuturePlan: Boolean(f.has_future_plan),
          }, todayLocal);
          const activation: ActivationSegment | null = activationSegmentFor({
            confirmedAt: f.confirmed_at ?? null,
            hasGoals: Boolean(f.has_goals),
            livePlanCount: Number(f.live_plan_count ?? 0),
            lastCoveredDay,
            hasAnyTrace: Boolean(f.has_any_trace),
          }, todayLocal, now);

          const livePlanCount = Number(f.live_plan_count ?? 0);
          const trial: TrialSegment | null = trialSegmentFor({
            householdCovered: f.household_covered ?? null,
            trialLastDay: f.trial_last_day ?? null,
            hasPaidSubscription: Boolean(f.has_paid_subscription),
          }, todayLocal);
          // La clé d'épisode DOUBLE comme prédicat: non nulle veut dire « il y
          // a décrochage », et sa valeur est ce qu'on écrit en dédup. Une
          // seconde définition de « quel épisode » ne peut donc pas exister.
          const episodeKey = lapseEpisodeKey({
            livePlanCount,
            lastCoveredDay,
            lastSeenAt: (row.last_seen_at as string | null) ?? null,
          }, todayLocal, now);

          // Plusieurs segments peuvent matcher — un premier plan jamais touché
          // qui s'est terminé il y a exactement trois jours coche les deux, et
          // une fin d'essai peut tomber sur une fin de plan. C'est
          // `LIFECYCLE_PRIORITY` qui tranche, jamais l'ordre de ces lignes.
          const segment = chooseLifecycleSegment([
            trial,
            coverage,
            activation,
            episodeKey ? "long_lapse_d14" : null,
          ]);

          if (!segment) {
            bump(skipped, "no_segment");
            if (Date.now() - startedAt > budgetMs) break;
            continue;
          }

          // ⚠️ LE COMPTE SE FAIT ICI, AVANT LA CADENCE, ET C'EST UNE CORRECTION.
          // Il était placé après: une personne dont le plan se terminait bien
          // demain mais qui venait de recevoir un autre e-mail sortait en
          // `too_soon` et n'apparaissait dans AUCUN segment. Le compte-rendu
          // disait donc « zéro plan qui se termine demain » un jour où il y en
          // avait. `by_segment` compte ce qui est ATTEINT, `skipped_by_reason`
          // dit ce qui l'a retenu — et la somme des deux se relit.
          // Trouvé par le premier run réel, le 2026-09-09.
          bump(bySegment, segment);

          const type: LifecycleEmailType = segment;

          // GARDE 3 — LA CADENCE. Sept refus, un ordre, et le motif retenu est
          // celui qui explique le mieux — voir `decideLifecycleSend`.
          const dedupKey = segment === "long_lapse_d14" ? episodeKey : null;
          const facts = await loadLifecycleCadenceFacts(admin, {
            userId: cursor,
            type,
            dedupKey,
            localDate: todayLocal,
            now,
            profile: {
              email: row.email as string | null,
              account_status: row.account_status as string | null,
              lifecycle_emails_opted_out_at: row
                .lifecycle_emails_opted_out_at as string | null,
            },
          });
          const verdict = decideLifecycleSend(facts, now);
          if (!verdict.ok) {
            bump(skipped, verdict.reason);
            if (Date.now() - startedAt > budgetMs) break;
            continue;
          }

          const token = cleanText(row.unsubscribe_token);
          if (!token) {
            // R7 — un e-mail sans sortie ne part pas. La colonne est
            // `not null` depuis 20260910120000: son absence dit que la base
            // n'a pas ce lot, pas que cette personne est un cas particulier.
            bump(skipped, "no_unsubscribe_token");
            if (Date.now() - startedAt > budgetMs) break;
            continue;
          }

          const locale = resolveArtifactLocale({
            studentProfile: row.locale ? String(row.locale) : null,
            tenantDefault: null,
          });
          const unsubHref = unsubscribeUrl(token, locale);
          const firstName = firstNameOf(row.full_name);
          // Un `switch` sur la FAMILLE, et pas une chaîne de ternaires: chaque
          // module de copie a ses propres arguments, et c'est ce qui les rend
          // impossibles à confondre.
          const rendered = segment === trial
            ? renderTrialEmail(trial as TrialSegment, {
              firstName,
              lastDay: String(f.trial_last_day),
              upgradeUrl,
              unsubscribeUrl: unsubHref,
              locale,
            })
            : segment === coverage
            ? renderCoverageEmail(coverage as CoverageSegment, {
              firstName,
              lastCoveredDay: String(lastCoveredDay),
              planUrl,
              unsubscribeUrl: unsubHref,
              locale,
            })
            : segment === "long_lapse_d14"
            ? renderLapseEmail({
              firstName,
              planCount: livePlanCount,
              unsubscribeUrl: unsubHref,
              locale,
            })
            : renderActivationEmail(activation as ActivationSegment, {
              firstName,
              setupUrl,
              unsubscribeUrl: unsubHref,
              locale,
            });

          if (dryRun) {
            // `dry_run` protège l'ENVOI et le JOURNAL. Tout ce qui précède a
            // bien tourné — c'est ce qui rend ce mode utile: il dit qui SERAIT
            // touché, pas qui pourrait l'être.
            bump(skipped, "dry_run");
            if (Date.now() - startedAt > budgetMs) break;
            continue;
          }

          const state = await sendLifecycleEmail(admin, {
            userId: cursor,
            email: String(facts.email),
            type,
            subject: rendered.subject,
            html: rendered.html,
            senderEmail: SENDER_EMAIL,
            dedupKey,
            metadata: {
              segment,
              last_covered_day: lastCoveredDay,
              local_date: todayLocal,
              request_id: requestId,
            },
          });

          if (state === "sent") sent++;
          else if (state === "suppressed") suppressed++;
          else failures.push(`${cursor}: envoi Resend refusé (${type})`);
        } catch (error) {
          // Une erreur PostgREST n'est PAS une `Error`: sans ces quatre champs,
          // le journal ne dit que « [object Object] ».
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
      // ⚠️ `examined` AVANT `sent`, et les deux séparés. `sent: 0` est le cas
      // nominal — la plupart des heures, personne n'a de plan qui se termine
      // demain. `examined: 0` veut dire que plus personne n'atteint le pas.
      // Les fondre rendrait la panne indiscernable du succès.
      examined,
      sent,
      suppressed,
      by_segment: bySegment,
      skipped_by_reason: skipped,
      exhausted,
      next_after_user_id: exhausted ? null : cursor || null,
      // Le COMPTE avant la tranche: 629 échecs sur 669 rendaient exactement
      // 50 lignes, et le compte-rendu se lisait comme 50 échecs.
      failure_count: failures.length,
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
