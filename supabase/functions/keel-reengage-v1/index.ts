/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import {
  decideForCandidates,
  loadReengageCandidates,
  markReengagementTouchSent,
  openReengagementEpisode,
  rollbackReengagementEpisode,
  sendReengageNudge,
} from "../_shared/keel/reengagement_io.ts";
import { toneInstruction } from "../_shared/keel/reengagement.ts";

/**
 * PIVOT NUTRITION §1.3 — la boucle REMARQUER, en job.
 *
 * « 48-72h de silence → relance douce, zéro culpabilisation. C'est la boucle
 * qui sauve le jour 9 — celle pour laquelle le coach paie. »
 *
 * CE QUE FAIT CE JOB: sélectionner, décider, ouvrir l'épisode, ENVOYER.
 *
 * ── LE BUG QUE CE FICHIER A PORTÉ, ET COMMENT IL SE LISAIT ───────────────
 * Ce job n'envoyait rien. Il ouvrait l'épisode, incrémentait une variable
 * nommée `sent`, et rendait `armed: sent` dans sa réponse — à un cron qui jette
 * le corps. Aucun appel à `whatsapp-send` n'existait dans le fichier. La boucle
 * décrite comme « celle pour laquelle le coach paie » n'a jamais réveillé
 * personne, et son compte-rendu disait le contraire.
 *
 * Il en découlait un second défaut, pire, parce que silencieux et cumulatif:
 * `nudgedThisEpisode` se déduit d'un épisode sans `closed_at`, et un épisode se
 * ferme quand l'élève RÉPOND. Un élève ne répond pas à un message qu'il n'a
 * jamais reçu — donc chaque élève passé une fois par ce job en sortait
 * DÉFINITIVEMENT. Le job se fabriquait sa propre population vide.
 *
 * ── CE QUI COMPOSE LE TEXTE, ET L'ÉCART ASSUMÉ ──────────────────────────
 * L'ancienne version de cet en-tête disait que la génération passerait par le
 * composeur, porteur de la doctrine du coach. C'est toujours la cible et ce
 * n'est pas ce qui tourne: le texte vient de `renderReengageMessage`, qui est
 * neutre et pas dans la voix du coach. Le pourquoi est écrit en entier au-dessus
 * de cette fonction — en deux mots, une relance part hors fenêtre 24h, donc
 * `whatsapp-send` la délivre obligatoirement en TEMPLATE, et un template est un
 * texte figé approuvé par Meta qu'aucune composition ne peut changer.
 *
 * ── CE QUI RESTE BLOQUÉ EN AVAL, ET QUE CE FICHIER NE PEUT PAS RÉGLER ────
 * Aucun template Meta n'est approuvé pour KEEL. `whatsapp-send` retombe donc
 * sur le template de check-in par défaut, et si celui-ci n'est pas approuvé non
 * plus l'envoi échoue — proprement, en `failures`, plus jamais en « armé ».
 * C'est une dépendance externe, pas une ligne de code manquante.
 *
 * `dry_run: true` décide sans rien ouvrir ni envoyer: c'est le mode qui permet
 * d'observer qui SERAIT relancé avant d'envoyer quoi que ce soit.
 */

const DEFAULT_BUDGET_MS = 45_000;

function cleanText(value: unknown, fallback = ""): string {
  const text = String(value ?? "").trim();
  return text || fallback;
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
    const nowCandidate = nowIso ? new Date(nowIso) : new Date();
    const now = Number.isFinite(nowCandidate.getTime()) ? nowCandidate : new Date();
    const dryRun = body.dry_run === true;
    const budgetMsRaw = Number(body.budget_ms);
    const budgetMs = Number.isFinite(budgetMsRaw) && budgetMsRaw > 0
      ? Math.min(budgetMsRaw, 120_000)
      : DEFAULT_BUDGET_MS;

    const admin = adminClient();
    const startedAt = Date.now();

    const candidates = await loadReengageCandidates(admin, {
      now,
      limit: Number(body.limit) || 200,
      afterUserId: cleanText(body.after_user_id),
    });
    const outcomes = decideForCandidates(candidates, now);

    // Le compte par motif est la sortie la plus utile de ce job: « 0 envoyé »
    // est une information très différente selon qu'il s'agit de 40 élèves en
    // heures calmes ou de 40 élèves déjà relancés.
    const bySkipReason: Record<string, number> = {};
    let sent = 0;
    let deferred = 0;
    // Combien de relances sont parties dans un ton que Meta ne sait pas encore
    // délivrer. `lighter` est DÉCIDÉ (et écrit au ledger) mais tombe sur le
    // template `gentle` tant qu'aucun second template n'est approuvé. Le compter
    // évite qu'un « ton adouci » existe uniquement dans nos journaux.
    let toneNotDelivered = 0;
    const failures: string[] = [];
    const armed: Array<{ user_id: string; tone: string; hours_silent: number }> = [];
    const byUserId = new Map(candidates.map((c) => [c.userId, c]));

    for (const outcome of outcomes) {
      if (Date.now() - startedAt > budgetMs) break;
      const d = outcome.decision;
      if (d.decision === "skip") {
        bySkipReason[d.reason] = (bySkipReason[d.reason] ?? 0) + 1;
        continue;
      }
      if (d.decision === "defer") {
        deferred++;
        continue;
      }

      // Pas de numéro, pas d'envoi — et surtout pas d'épisode ouvert. Ouvrir
      // ici verrouillerait l'élève pour un message qu'on n'a jamais eu les
      // moyens de lui adresser.
      const phone = byUserId.get(outcome.userId)?.phoneNumber ?? null;
      if (!phone) {
        bySkipReason.no_phone_number = (bySkipReason.no_phone_number ?? 0) + 1;
        continue;
      }

      if (dryRun) {
        armed.push({
          user_id: outcome.userId,
          tone: d.tone,
          hours_silent: Math.round(d.hoursSilent),
        });
        continue;
      }

      const opened = await openReengagementEpisode(admin, {
        userId: outcome.userId,
        at: now.toISOString(),
        daysInactive: Math.floor(d.hoursSilent / 24),
      });
      // Pas d'épisode ouvert => pas d'envoi. Sans ce garde, un échec d'écriture
      // produirait une relance non tracée, donc une seconde au tick suivant.
      if (!opened.opened) {
        bySkipReason.episode_open_failed = (bySkipReason.episode_open_failed ?? 0) + 1;
        continue;
      }

      try {
        // TEMPLATE, jamais texte libre. À 72h de silence la fenêtre 24h de Meta
        // est fermée par construction, et `whatsapp-send` bascule alors sur
        // `getFallbackTemplate(purpose)`. Envoyer `type: "text"` ici revenait
        // donc à laisser ce repli choisir — et un purpose non mappé tombe sur
        // `global_reach_template` (« J'ai une info pour toi », en français).
        // C'est l'incident du 2026-07-12, à l'identique. Le chemin nominal
        // nomme son template; le mapping ajouté dans `whatsapp-send` n'est plus
        // qu'une ceinture.
        //
        // La ceinture anti-culpabilisation tourne dans `sendReengageNudge`, sur
        // le corps exact que l'élève va lire.
        const res = await sendReengageNudge({
          userId: outcome.userId,
          phoneNumber: phone,
          firstName: byUserId.get(outcome.userId)?.firstName ?? "",
          tone: d.tone,
        });
        if (!res.toneDelivered) toneNotDelivered++;
        if (!res.ok) {
          // L'asymétrie décrite dans `rollbackReengagementEpisode`: un refus
          // net d'avant-livraison (config absente = 0, garde interne = 4xx)
          // n'a rien mis en vol, donc on rend l'élève à la boucle. Un 5xx ou
          // un timeout laisse le doute, donc l'épisode reste ouvert.
          const preDelivery = res.status === 0 ||
            (res.status >= 400 && res.status < 500);
          if (preDelivery) await rollbackReengagementEpisode(admin, opened.id ?? "");
          failures.push(
            `${outcome.userId}: ${res.error}${preDelivery ? " (episode rolled back)" : " (episode kept open)"}`,
          );
          continue;
        }
      } catch (error) {
        // La ceinture qui mord, ou un throw réseau. Même règle: rien n'est
        // parti par notre faute, l'élève ne doit pas le payer d'un verrou.
        await rollbackReengagementEpisode(admin, opened.id ?? "");
        failures.push(
          `${outcome.userId}: ${
            error instanceof Error ? error.message : String(error)
          } (episode rolled back)`,
        );
        continue;
      }

      // Le ledger ne date la touche qu'ICI: `whatsapp-send` a accepté. Poser
      // `touch1_sent_at` à l'ouverture — ce que faisait ce chemin — affirmait
      // qu'un message était parti avant tout envoi, y compris quand il ne
      // partait jamais.
      await markReengagementTouchSent(admin, {
        episodeId: opened.id ?? "",
        at: now.toISOString(),
      });

      sent++;
      armed.push({
        user_id: outcome.userId,
        tone: d.tone,
        hours_silent: Math.round(d.hoursSilent),
      });
    }

    return jsonResponse(req, {
      ok: true,
      dry_run: dryRun,
      candidates: candidates.length,
      // `sent` compte les messages que `whatsapp-send` a acceptés. `armed`
      // compte les élèves retenus. Les deux étaient le même nombre quand rien
      // ne partait — c'est précisément ce qui rendait la panne invisible, donc
      // ils sont désormais séparés et `failures` porte l'écart.
      sent,
      armed: armed.length,
      deferred_quiet_hours: deferred,
      // Relances parties dans le template `gentle` alors que le décideur avait
      // choisi `lighter`. Non nul = il manque un template approuvé, pas un bug.
      tone_not_delivered: toneNotDelivered,
      skipped_by_reason: bySkipReason,
      failures: failures.slice(0, 50),
      // L'instruction de ton part avec l'armement: c'est elle qui porte
      // "n'énumère pas les jours" et "le protocole ne change pas".
      tone_instructions: armed.length > 0
        ? { [armed[0].tone]: toneInstruction(armed[0].tone as never) }
        : {},
      armed_users: armed.slice(0, 50),
      request_id: requestId,
    }, { includeCors: false });
  } catch (error) {
    await logEdgeFunctionError({
      functionName: "keel-reengage-v1",
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
