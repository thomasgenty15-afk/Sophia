/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { runWeightDivergenceStep } from "../_shared/keel/weight_divergence_engine.ts";
// ⚠️ LE COMPTE EST PUR ET EXHAUSTIF, ET C'EST LA GARDE DE CE JOB. Voir son
// en-tête: un mécanisme débranché et un mécanisme qui se tait correctement
// rendaient le même compte-rendu, et c'est ce qui a laissé la divergence morte
// pendant trois semaines. Le `switch` ne compile pas si une issue est ajoutée
// au moteur sans être comptée ici.
import {
  type DivergenceTally,
  emptyDivergenceTally,
  tallyDivergenceOutcome,
} from "../_shared/keel/weight_divergence_tally.ts";

/**
 * FF-056 — LA DIVERGENCE CONSTATÉE, ENFIN AUTONOME.
 *
 * Autorité produit: docs/fonctionnalites/conversation/FF-056-la-divergence-constatee.md
 * · docs/fonctionnalites/conversation/FF-062-quand-sophia-parle-la-premiere.md (canal C6).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 🔴 CE JOB NE DÉMÉNAGE PAS UN MÉCANISME QUI TOURNAIT. IL EN MET UN EN SERVICE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * La divergence était GREFFÉE dans la boucle de `keel-daily-recommendation-v1`,
 * et son bloc était placé APRÈS le `try/catch` de la recommandation. Or ce
 * `try` sortait par `continue` dans ses quatre cas non-nominaux
 * (`outside_window`, `skipped`, `silent`, `not_delivered`). Un `continue`
 * reprend l'itération suivante du `for`: **le bloc de divergence était sauté**.
 *
 * Conséquence, vérifiée le 2026-09-01: `runWeightDivergenceStep` n'était
 * atteint que pour les élèves qui venaient de recevoir une recommandation —
 * c'est-à-dire ceux dont `countDailyAsks` avait déjà consommé la place du
 * budget T4, donc ceux qui ressortaient aussitôt en `ask_budget_taken`.
 * `silent` étant le cas NOMINAL de la recommandation par construction (« part
 * des soirs sans recommandation: attendu majoritaire »), la divergence ne
 * s'exécutait pour à peu près personne.
 *
 * Et le défaut était INVISIBLE: les compteurs `divergence_*` du compte-rendu
 * restaient vides, ce qui se lit exactement comme « aucun élève ne diverge ».
 * Les runs QA (`scratchpad/ff056_real_run.ts`, `qa3_divergence_open.ts`)
 * appellent tous le pas EN DIRECT — le chemin cassé n'était éprouvé nulle part.
 *
 * ── POURQUOI UN SECOND CRON, ALORS QUE LA GREFFE AVAIT SON MOTIF ──────────
 * Le motif écrit était bon: « un second cron aurait doublé le coût du balayage
 * et rendu l'arbitrage du budget T4 dépendant de l'ordre d'exécution de deux
 * jobs indépendants: non déterministe ». Deux choses l'ont périmé:
 *
 *   1. FF-028 est ABANDONNÉE (décision du 2026-09-01) — il n'y a plus de
 *      recommandation en plein milieu de plan. Le balayage hôte disparaît, donc
 *      il n'y a plus rien sur quoi se greffer;
 *   2. l'arbitrage du budget entre canaux passe désormais par un ordonnanceur
 *      (FF-062), pas par l'ordre de deux crons.
 *
 * Le coût du balayage reste réel et il est assumé: une page de `profiles` par
 * heure, filtrée par la fenêtre locale au premier test.
 *
 * ── CE QUI N'A PAS CHANGÉ, ET NE DOIT PAS ────────────────────────────────
 * Toute la décision vit dans `runWeightDivergenceStep`, joignable sans HTTP.
 * Ce fichier pagine, tient un budget de temps, et rend un compte-rendu. Il ne
 * décide rien — c'est ce qui permet d'éprouver le pas en conditions réelles
 * plutôt que par des doubles.
 */

const FN_NAME = "keel-weight-divergence-v1";
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
    /**
     * LE COMPTE, TENU PAR UN MODULE PUR ET EXHAUSTIF.
     *
     * `examined` est la preuve que le défaut d'origine ne peut pas revenir: il
     * vaut zéro si le pas cesse d'être atteint, quelle qu'en soit la cause — un
     * `continue` mal placé, une garde qui remonte, un filtre trop large.
     * `asked: 0` ne le dirait pas, puisque c'est le cas nominal.
     *
     * `verdicts` porte §10 de la fiche: il dit si le détecteur se tait parce
     * que la série suit le plan (`aligned`), parce qu'elle est bruyante
     * (`noisy`), ou parce que la personne ne se pèse pas
     * (`irregular_measurements`, `stale_measurements`). Ce dernier chiffre est
     * la CONTRE-MESURE — s'il monte après les premiers épisodes, le flow
     * détruit sa propre entrée.
     */
    let tally: DivergenceTally = emptyDivergenceTally();
    const failures: string[] = [];
    let exhausted = false;

    while (true) {
      let q = admin
        .from("profiles")
        // ⚠️ NE NOMMER QUE DES COLONNES QUI EXISTENT. Un `content_locale` sur
        // `profiles` a déjà fait rendre 42703 à PostgREST dès la première page
        // dans `keel-weekly-flow-v1`: aucun élève examiné, et toutes les gardes
        // en aval mortes derrière un SELECT cassé.
        //
        // `birth_date` porte la garde d'âge (`weekPlanAgeGate`), `locale` la
        // langue de la question d'ouverture.
        .select("id, timezone, proactive_muted_at, birth_date, locale")
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

        // ── UN `try` PAR ÉLÈVE, ET AUCUN `continue` APRÈS ────────────────
        //
        // C'est la forme qui empêche le défaut d'origine de revenir: le pas est
        // le SEUL contenu de la boucle, donc rien ne peut le sauter. Le jour où
        // un second mécanisme se greffe ici, il devra être placé AVANT ce bloc
        // ou dans son propre `try` sans sortie — et ce commentaire est là pour
        // qu'on le sache avant de l'écrire.
        try {
          const div = await runWeightDivergenceStep(admin, {
            userId: cursor,
            timezone: row.timezone ? String(row.timezone) : null,
            optedOut: Boolean(row.proactive_muted_at),
            birthDate: row.birth_date ?? null,
            locale: row.locale ? String(row.locale) : null,
            now,
            dryRun,
            requestId,
          });

          tally = tallyDivergenceOutcome(tally, div);
        } catch (error) {
          // Une erreur PostgREST n'est PAS une `Error`: sans ces quatre champs,
          // le journal ne dit que « [object Object] ». C'est ce qui a masqué un
          // 42P10 permanent dans le point hebdo.
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
      // ⚠️ `examined` AVANT `asked`, et les deux séparés: `asked: 0` est le cas
      // NOMINAL (la divergence est rare par construction), `examined: 0` est
      // une panne. Les fondre rendrait la panne indiscernable du succès — le
      // défaut exact que ce job existe pour fermer.
      examined: tally.examined,
      asked: tally.asked,
      verdicts: tally.verdicts,
      shapes: tally.shapes,
      skipped_by_reason: tally.skipped,
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
