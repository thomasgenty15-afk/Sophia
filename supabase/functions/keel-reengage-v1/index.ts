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
 * ── CE QUI COMPOSE LE TEXTE (l'écart assumé est refermé) ────────────────
 * Cet en-tête a longtemps dit que la génération DEVRAIT passer par le composeur
 * porteur de la doctrine du coach, et que ce n'était pas ce qui tournait. La
 * raison était bonne: hors fenêtre 24 h, Meta imposait un template — un texte
 * figé qu'aucune composition ne peut changer. **Meta est parti, la raison avec
 * lui, et l'écart a survécu six semaines à sa cause.** C'est le vrai
 * enseignement de ce fichier: une contrainte externe honnêtement documentée
 * devient une décision de conception que plus personne ne rouvre.
 *
 * Depuis, `composeReengageBody` charge la doctrine publiée du coach, compose,
 * et fait juger le texte par la ceinture de `reengage_composer.ts`. Tout échec
 * — pas de doctrine, modèle en panne, verdict négatif — rend le texte
 * déterministe: un message générique qui PART vaut mieux qu'un message
 * personnalisé qui ne part jamais. `body_sources` dans le compte-rendu dit
 * lequel des deux chemins a servi, parce que les deux produisent un envoi
 * réussi et qu'ils ne valent pas la même chose.
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
    /** D'où venait le texte des relances parties: composé / repli. */
    const bodySources: Record<string, number> = {};
    const fallbackReasons: Record<string, number> = {};
    const failures: string[] = [];
    const armed: Array<{ user_id: string; tone: string; hours_silent: number | "never_wrote" }> = [];
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

      // ══════════════════════════════════════════════════════════════════
      // LA GARDE « PAS DE NUMÉRO » EST RETIRÉE, ET C'EST LE MÊME DÉFAUT QUE
      // `whatsapp_opted_in` — sur une autre colonne, donc il a survécu.
      //
      // Elle disait: « pas de numéro, pas d'envoi — et surtout pas d'épisode
      // ouvert », ce qui était juste tant que la relance partait par Meta.
      // Depuis la bascule, `sendReengageNudge` appelle `deliverChatMessage`:
      // il écrit une ligne dans `chat_messages` et n'a **jamais** besoin d'un
      // numéro. Or aucun élève KEEL n'en a un — le parcours d'entrée n'en
      // capture aucun (vérifié en L2).
      //
      // MESURÉ avant retrait, sur un tick réel:
      //     candidates: 155, sent: 0, ... "no_phone_number": 4
      // c'est-à-dire: les seuls élèves que le job jugeait relançables étaient
      // écartés faute d'un canal qui n'existe plus. La boucle de décrochage
      // était MUETTE, exactement comme le tap du soir l'était avant la
      // correction de `whatsapp_opted_in`.
      //
      // `phoneNumber` reste chargé par `loadReengageCandidates`: il sert la
      // couche B2C survivante, et le retirer déborderait ce lot.
      // ══════════════════════════════════════════════════════════════════

      if (dryRun) {
        armed.push({
          user_id: outcome.userId,
          tone: d.tone,
          // `Infinity` (jamais écrit) sérialise en `null` — voir la note sur
          // `daysInactive`. Le compte-rendu doit DIRE « jamais écrit »
          // plutôt que rendre un trou qui ressemble à une lecture ratée.
          hours_silent: Number.isFinite(d.hoursSilent)
            ? Math.round(d.hoursSilent as number)
            : "never_wrote",
        });
        continue;
      }

      const opened = await openReengagementEpisode(admin, {
        userId: outcome.userId,
        at: now.toISOString(),
        // `hoursSilent` VAUT `Infinity` POUR QUI N'A JAMAIS ÉCRIT, et c'est
        // délibéré côté décision: `decideReengagement` traite l'absence de
        // premier message comme « silencieux depuis toujours » — c'est
        // exactement la population que cette relance existe pour rattraper.
        //
        // Mais `Math.floor(Infinity / 24)` vaut `Infinity`, et
        // `JSON.stringify(Infinity)` vaut **`null`**. La ligne partait donc
        // vers PostgREST avec `days_inactive_at_open: null`, et Postgres la
        // refusait: `null value in column "days_inactive_at_open" violates
        // not-null constraint`. L'épisode ne s'ouvrait pas, donc la relance ne
        // partait pas — pour PRÉCISÉMENT les élèves qu'elle visait.
        //
        // MESURÉ (QA WEB L5, tick réel): `armed: 8`, `episode_open_failed: 7`,
        // et l'élève de la sonde ressortait avec 0 message et 0 épisode.
        //
        // 0 plutôt qu'un nombre inventé: on ne sait pas depuis combien de
        // jours il est inactif, et la colonne dit « au moment de l'ouverture »,
        // pas « estimé ».
        daysInactive: Number.isFinite(d.hoursSilent)
          ? Math.floor((d.hoursSilent as number) / 24)
          : 0,
      });
      // Pas d'épisode ouvert => pas d'envoi. Sans ce garde, un échec d'écriture
      // produirait une relance non tracée, donc une seconde au tick suivant.
      if (!opened.opened) {
        bySkipReason.episode_open_failed = (bySkipReason.episode_open_failed ?? 0) + 1;
        continue;
      }

      try {
        // DE-WHATSAPP — texte libre, tout simplement. Le détour par un template
        // NOMMÉ existait parce qu'à 72 h de silence la fenêtre 24 h de Meta est
        // fermée par construction, et qu'un purpose non mappé tombait sur
        // `global_reach_template` (« J'ai une info pour toi », en français) —
        // l'incident du 2026-07-12. Sans Meta, la contrainte disparaît avec sa
        // classe d'incident.
        //
        // La ceinture anti-culpabilisation tourne toujours dans
        // `sendReengageNudge`, sur le corps exact que l'élève va lire.
        const res = await sendReengageNudge(admin, {
          userId: outcome.userId,
          firstName: byUserId.get(outcome.userId)?.firstName ?? "",
          tone: d.tone,
          requestId,
        });
        if (!res.toneDelivered) toneNotDelivered++;
        // « Composé » et « replié » produisent le même envoi réussi. Sans ce
        // compte, un composeur qui ne sert JAMAIS — doctrine absente sur toute
        // la cohorte, modèle en panne, ceinture qui refuse tout — se lit comme
        // un composeur qui marche. C'est la panne silencieuse par excellence,
        // et ce dépôt l'a déjà payée avec `toneDelivered`.
        bodySources[res.bodySource] = (bodySources[res.bodySource] ?? 0) + 1;
        if (res.bodySource === "fallback" && res.bodyReason) {
          const key = res.bodyReason.split(":").slice(0, 2).join(":");
          fallbackReasons[key] = (fallbackReasons[key] ?? 0) + 1;
        }
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
        hours_silent: Number.isFinite(d.hoursSilent)
          ? Math.round(d.hoursSilent as number)
          : "never_wrote",
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
      // La voix du coach a-t-elle porté ? `{"composed":8,"fallback":2}` se lit;
      // `sent: 10` ne dit rien de ce que les élèves ont reçu.
      body_sources: bodySources,
      body_fallback_reasons: fallbackReasons,
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
