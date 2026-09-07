/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { runSlotMealStep } from "../_shared/keel/slot_meal_io.ts";
import { runWeighInStep } from "../_shared/keel/weigh_in_io.ts";
// FF-054 §3.2 / FF-062 — le retour de fin de plan, sorti du message du soir.
import { runPlanFeedbackStep } from "../_shared/keel/plan_feedback_chat_io.ts";
import { sweepLapsedClarifications } from "../_shared/keel/memory_clarification_io.ts";

/**
 * FF-062 — LES DEUX CANAUX NEUFS, DANS UN SEUL BALAYAGE HORAIRE.
 *
 * Autorité: docs/fonctionnalites/conversation/FF-062-quand-sophia-parle-la-premiere.md
 *
 * ══════════════════════════════════════════════════════════════════════════
 * POURQUOI UN JOB POUR DEUX CANAUX, ET PAS DEUX JOBS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * §1 de la fiche nomme le défaut que ce fichier existe pour ne pas reproduire:
 * *« deux canaux se coordonnent par une CONVENTION entre deux crons — la
 * fenêtre 19h-20h contre 20h-22h — et cette convention n'est écrite que dans le
 * commentaire de l'un des deux. Un troisième canal ajouté sans la connaître
 * produit deux notifications le même soir, et personne ne le verrait avant de
 * le mesurer. »*
 *
 * Deux jobs pour C1 et C2 auraient rejoué exactement ça. Ici les deux fenêtres
 * sont dans le MÊME fichier, à quinze lignes l'une de l'autre, et le
 * compte-rendu les affiche côte à côte.
 *
 * ── L'ARBITRAGE ENTRE LES DEUX EST STRUCTUREL, PAS ALGORITHMIQUE ─────────
 * Les fenêtres ne se recouvrent pas: C1 tombe aux heures de repas (10h, 14h,
 * 21h — ou l'heure DÉCLARÉE, qui l'emporte), C2 entre 17h et 19h. Il n'y a donc
 * pas d'arbitre à écrire, et ne pas en écrire un est une décision: un arbitre
 * sans collision à trancher serait du code qu'aucun cas n'éprouve, c'est-à-dire
 * du code qui se casse en silence.
 *
 * ⚠️ CE QUI SE PASSE SI ELLES SE RECOUVRENT UN JOUR — une heure déclarée à 18h
 * pour le dîner: les DEUX partent. C'est le pire cas de R1 (trois messages avec
 * le bilan du soir), il est assumé par la fiche, et la politique de livraison
 * l'encadre déjà: les deux purposes sont GARANTIS, donc ils consomment chacun
 * un créneau et referment le plafond des non sollicités derrière eux.
 *
 * ── LE PLAFOND DE R1 N'EST PAS COMPTÉ ICI, ET C'EST VOULU ────────────────
 * §5: *« le compte se dérive de `chat_messages.purpose`, il ne se stocke pas »*.
 * `deliverChatMessage` le fait déjà, à l'endroit où la concurrence est réellement
 * arbitrée (la réservation de créneau, en base). Un second compteur en TS ici
 * donnerait un motif plus tôt et ne garantirait rien — c'est mesuré: 6/6 livrés
 * pour un plafond de 2, avant que la réservation n'existe.
 *
 * ── LA FORME DU BALAYAGE ─────────────────────────────────────────────────
 * Reprise de `keel-weight-divergence-v1`, y compris sa cicatrice: UN `try` par
 * élève et par canal, et AUCUN `continue` après. Le pas de la divergence est
 * resté mort trois semaines parce qu'il était placé après un `try/catch` dont
 * les sorties non-nominales faisaient `continue`. Les deux pas ci-dessous sont
 * donc chacun dans leur propre `try`, sans sortie, et le compte-rendu porte un
 * `examined` par canal — la seule paire qui distingue « rien à demander » d'un
 * « jamais atteint ».
 */

const FN_NAME = "keel-proactive-v1";
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

/** Un compte par canal: examinés, envoyés, et les refus par motif. */
interface ChannelTally {
  examined: number;
  sent: number;
  skipped: Record<string, number>;
  /** Livraison refusée par la politique — distinct d'un refus de décision. */
  blocked: Record<string, number>;
}

function emptyTally(): ChannelTally {
  return { examined: 0, sent: 0, skipped: {}, blocked: {} };
}

/**
 * Ce refus est-il « ce n'est pas l'heure » ?
 *
 * ⛔ LES DEUX MOTIFS QUI COMPTENT COMME HORS FENÊTRE, ET PAS UN DE PLUS.
 * `outside_window` est la fenêtre elle-même; `not_elapsed` est celle de C1, qui
 * dit la même chose autrement (le créneau n'est pas encore écoulé). Tout le
 * reste — pas d'objectif, muet, déjà demandé — est une décision PRISE sur un
 * élève réellement regardé, et doit donc compter dans `examined`.
 */
function isWindowSkip(verdict: { ask: boolean; reason?: string }): boolean {
  if (verdict.ask) return false;
  return verdict.reason === "outside_window" || verdict.reason === "not_elapsed";
}

function bump(into: Record<string, number>, key: string): void {
  into[key] = (into[key] ?? 0) + 1;
}

function flattenError(error: unknown): string {
  if (error instanceof Error) return error.message;
  const e = error as {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  };
  // Une erreur PostgREST n'est PAS une `Error`: sans ces quatre champs, le
  // journal ne dit que « [object Object] ». C'est ce qui a masqué un 42P10
  // permanent dans le point hebdo.
  return [e?.code, e?.message, e?.details, e?.hint].filter(Boolean).join(" — ") ||
    String(error);
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
    /**
     * Restreindre le balayage à UN canal. Sert les runs réels: éprouver C1 sans
     * risquer d'envoyer une pesée à la moitié de la base.
     *
     * ⚠️ UN JETON INCONNU NE FILTRE RIEN, et ce serait le pire des deux mondes.
     * On refuse donc explicitement, plutôt que de balayer les deux canaux en
     * croyant n'en balayer qu'un.
     */
    const only = cleanText(body.only);
    if (
      only && only !== "slot_meal" && only !== "weigh_in" &&
      only !== "plan_feedback"
    ) {
      return jsonResponse(req, {
        ok: false,
        error: `unknown channel ${JSON.stringify(only)}`,
        request_id: requestId,
      }, { status: 400, includeCors: false });
    }
    const doSlotMeal = !only || only === "slot_meal";
    const doWeighIn = !only || only === "weigh_in";
    const doPlanFeedback = !only || only === "plan_feedback";

    const admin = adminClient();
    const startedAt = Date.now();

    // ── LE BALAYAGE DES CLARIFICATIONS PÉRIMÉES ─────────────────────────────
    //
    // ⟳ IL VIVAIT DANS `keel-daily-pulse-v1`, SUPPRIMÉ LE 2026-09-08. Son pavé
    // d'origine disait « ici plutôt que dans son propre cron, parce que ce job
    // voit toute la flotte, y compris les maîtres de foyer que
    // `keel-proactive-v1` ne balaie pas ». Cet argument NE S'APPLIQUE PAS au
    // déplacement: `sweepLapsedClarifications` est un `update` GLOBAL sur la
    // table, il n'itère aucun profil. L'audience du job hôte ne le borne pas.
    //
    // ⚠️ CE N'EST PAS DU MÉNAGE, ET C'EST DEVENU PLUS VRAI QU'AVANT. La
    // question de clarification est désarmée: plus aucune ligne n'est créée, et
    // le tap qui les fermait est débranché. Ce balayage est donc la SEULE chose
    // qui ferme encore les questions déjà posées — sans lui elles resteraient
    // `open` pour toujours, sans que personne puisse jamais y répondre.
    //
    // ⛔ AVANT LA BOUCLE ET SANS `dry_run`: fermer une ligne morte n'envoie
    // rien. Ce qu'un `dry_run` protège est l'ENVOI.
    const clarificationsExpired =
      (await sweepLapsedClarifications(admin, { nowIso: now.toISOString() }))
        .expired;

    let cursor = cleanText(body.after_user_id);
    let scanned = 0;
    const slotMeal = emptyTally();
    const weighIn = emptyTally();
    const planFeedback = emptyTally();
    const failures: string[] = [];
    let exhausted = false;

    while (true) {
      let q = admin
        .from("profiles")
        // ⚠️ NE NOMMER QUE DES COLONNES QUI EXISTENT. Un `content_locale` sur
        // `profiles` a déjà fait rendre 42703 à PostgREST dès la première page
        // dans `keel-weekly-flow-v1`: aucun élève examiné, et toutes les gardes
        // en aval mortes derrière un SELECT cassé.
        .select("id, timezone, locale, proactive_muted_at")
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
        const common = {
          userId: cursor,
          timezone: row.timezone ? String(row.timezone) : null,
          locale: row.locale ? String(row.locale) : null,
          muted: Boolean(row.proactive_muted_at),
          now,
          dryRun,
          requestId,
        };

        // ── C1 — UN `try` À LUI, SANS SORTIE ──────────────────────────────
        if (doSlotMeal) {
          try {
            const out = await runSlotMealStep(admin, common);
            // ⚠️ `examined` MONTE POUR TOUTE ISSUE SAUF LA FENÊTRE, et c'est le
            // précédent du dépôt (`weight_divergence_tally.ts`, même règle mot
            // pour mot). Le compter aussi hors fenêtre ferait dire à ce champ
            // « le job a tourné » alors qu'il doit dire « le détecteur a
            // regardé » — et les trois canaux de ce compte-rendu portaient
            // DEUX sens différents du même nom, ce qui rend leurs chiffres
            // incomparables sur la même ligne.
            if (!isWindowSkip(out.verdict)) slotMeal.examined++;
            if (out.verdict.ask) {
              if (out.delivered) slotMeal.sent++;
              else bump(slotMeal.blocked, out.deliveryReason ?? "unknown");
            } else {
              bump(slotMeal.skipped, out.verdict.reason);
            }
          } catch (error) {
            failures.push(`slot_meal ${cursor}: ${flattenError(error)}`);
          }
        }

        // ── C2 — LE SIEN, ET C'EST LA CICATRICE DE FF-056 ────────────────
        // Le pas de la divergence était placé APRÈS le `try/catch` d'un autre
        // canal, dont les sorties non-nominales faisaient `continue`: il était
        // sauté pour le cas nominal, et invisible parce que son seul compteur
        // valait zéro en régime normal. Aucun `continue` n'existe dans cette
        // boucle, et chaque canal a son `try`.
        if (doWeighIn) {
          try {
            const out = await runWeighInStep(admin, common);
            // Même règle que le canal du dessus, et que la divergence.
            if (!isWindowSkip(out.verdict)) weighIn.examined++;
            if (out.verdict.ask) {
              if (out.delivered) weighIn.sent++;
              else bump(weighIn.blocked, out.deliveryReason ?? "unknown");
            } else {
              bump(weighIn.skipped, out.verdict.reason);
            }
          } catch (error) {
            failures.push(`weigh_in ${cursor}: ${flattenError(error)}`);
          }
        }

        // ── LE RETOUR DE FIN DE PLAN — 22h, LE DERNIER JOUR ─────────────
        //
        // Troisième canal de ce balayage, et le seul qui ne soit pas de
        // FF-062: il vient de FF-054 et vivait dans le message du soir, dont
        // il prenait la place. Sa fenêtre (l'heure 22) est APRÈS celle du
        // bilan du jour (20h-22h), donc les deux ne se disputent plus la
        // soirée — c'est tout l'objet du déplacement.
        if (doPlanFeedback) {
          try {
            const out = await runPlanFeedbackStep(admin, {
              userId: cursor,
              timezone: common.timezone,
              muted: common.muted,
              now,
              dryRun,
              requestId,
            });
            if (out.examined) planFeedback.examined++;
            if (out.sent) planFeedback.sent++;
            else if (out.reason.startsWith("delivery:")) {
              bump(planFeedback.blocked, out.reason.slice("delivery:".length));
            } else bump(planFeedback.skipped, out.reason);
          } catch (error) {
            failures.push(`plan_feedback ${cursor}: ${flattenError(error)}`);
          }
        }

        if (Date.now() - startedAt > budgetMs) break;
      }
      if (Date.now() - startedAt > budgetMs) break;
    }

    return jsonResponse(req, {
      ok: true,
      dry_run: dryRun,
      only: only || null,
      scanned,
      // ⚠️ `examined` PAR CANAL, ET AVANT `sent`. `sent: 0` est le cas NOMINAL
      // (les deux canaux sont rares par construction); `examined: 0` est une
      // panne. Les fondre rendrait la panne indiscernable du succès.
      slot_meal: slotMeal,
      weigh_in: weighIn,
      plan_feedback: planFeedback,
      // Le compteur du silence, hérité du message du soir. Il DÉCROÎT vers zéro
      // maintenant que plus aucune clarification n'est créée: c'est la forme
      // attendue, et c'est aussi ce qui dira quand ce balayage n'aura plus
      // d'objet.
      clarifications_expired: clarificationsExpired,
      exhausted,
      next_after_user_id: exhausted ? null : cursor || null,
      // ⚠️ 🔴 LE COMPTE AVANT L'ÉCHANTILLON — MESURÉ LE 2026-09-02. Ce
      // compte-rendu ne portait que `failures.slice(0, 50)`, et un run où 629
      // élèves sur 669 échouaient en rendait exactement 50: la liste tronquée
      // se lit comme « quelques cas isolés ». Sans le total, l'ampleur d'une
      // panne est invisible dans la seule chose qu'on regarde.
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
