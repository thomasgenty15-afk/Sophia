/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import {
  decideAskCadence,
  decideDailyPulse,
  renderPulseMessage,
} from "../_shared/keel/daily_pulse.ts";
import {
  loadAskCadence,
  loadPulseDay,
  PULSE_ASKED_METADATA_KEY,
  wasPulseSentToday,
} from "../_shared/keel/daily_pulse_io.ts";
import { hasRecapGround } from "../_shared/keel/daily_recap.ts";
import { wasRecommendationSentToday } from "../_shared/keel/daily_recommendation_io.ts";
import { composeRecapBody, loadDayFacts } from "../_shared/keel/daily_recap_io.ts";
import { resolveArtifactLocale } from "../_shared/keel/locale.ts";
import {
  isRestrictionFlagged,
  localDateFor,
  localHourFor,
} from "../_shared/keel/reengagement_io.ts";
import { assessBirthDate } from "../_shared/keel/student_age.ts";
import { resolveStudentFollowing } from "../_shared/keel/following_io.ts";
// `weekStartOf` vit dans `weekly_flow_io.ts` et n'y est pas propriétaire du
// point hebdomadaire: c'est le lundi d'une date locale, point. On l'importe
// plutôt que d'en recopier trois lignes — deux définitions du lundi finissent
// par diverger, et celle-ci borne désormais la fraîcheur des repas composés.
import { weekStartOf } from "../_shared/keel/weekly_flow_io.ts";
import { deliverChatMessage } from "../_shared/chat/delivery.ts";

/**
 * PIVOT NUTRITION — N2 : le job du soir.
 *
 * Balayage HORAIRE, parce que la fenêtre (20h-22h) est en heure LOCALE de
 * l'élève : un job quotidien ne pourrait servir correctement qu'un seul fuseau.
 * C'est le même raisonnement que `keel-reengage-v1`, et c'est le bug latent
 * n°2 documenté dans BUILD_PLAN W1.3 (« planificateur cassé hors Europe »).
 *
 * ── CE QU'IL ENVOIE A CHANGÉ DE NATURE ───────────────────────────────────
 * Il posait une question, tous les soirs. Il envoie maintenant un message qui
 * s'ouvre sur un FAIT de la journée — ce que l'élève a coché, ce qu'il a
 * photographié — et qui ne porte la question que lorsqu'elle est due.
 *
 * Le motif produit, en une ligne: le message ne donnait rien, il prenait. Un
 * formulaire quotidien se fait ignorer puis couper, et la mesure qu'il servait
 * se détruisait elle-même. Le raisonnement complet est dans `daily_recap.ts`;
 * la cadence de la question dans `decideAskCadence`.
 *
 * TROIS DÉCISIONS, DANS CET ORDRE, et chacune est pure et testable seule:
 *   1. `hasRecapGround(facts)` — y a-t-il un fait sur quoi ouvrir ?
 *   2. `decideAskCadence(...)` — la question est-elle due ?
 *   3. `decideDailyPulse(...)` — envoie-t-on, et la question part-elle avec ?
 *
 * CE QU'IL N'ÉCRIT PAS : la réponse. C'est le webhook qui la reçoit, parce
 * qu'elle arrive par un bouton, des minutes ou des heures plus tard.
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
    /** Messages partis AVEC la question. `sent - asked` = les faits seuls. */
    let asked = 0;
    /**
     * D'où venait l'ouverture: voix du coach, ou décompte déterministe.
     *
     * Compté pour la même raison que `body_sources` dans `keel-reengage-v1`:
     * composé et replié produisent tous deux un envoi réussi, et sans ce compte
     * un composeur qui ne sert JAMAIS — doctrine absente sur la cohorte, modèle
     * en panne, ceinture qui refuse tout — se lit comme un composeur qui marche.
     */
    const bodySources: Record<string, number> = {};
    const fallbackReasons: Record<string, number> = {};
    /**
     * FF-001 — la voix du coach sur ses GESTES a-t-elle porté, et sous quelle
     * forme ? `{"remind":30,"ask":12,"none":4}` se lit; l'absence de ce compteur
     * rendrait « aucun coach n'a écrit de pratique » indiscernable de « la
     * sélection ne sert jamais », qui est la panne que `body_sources` a déjà
     * appris à ce job à rendre visible.
     */
    const practiceModes: Record<string, number> = {};
    /** Pourquoi la question n'est pas partie, ou pourquoi elle est partie. */
    const cadenceReasons: Record<string, number> = {};
    const bySkip: Record<string, number> = {};
    const failures: string[] = [];
    let exhausted = false;

    while (true) {
      let q = admin
        .from("profiles")
        // `birth_date` (FF-001 R5): le mineur se DÉRIVE à chaque lecture, il ne
        // se fige jamais — un entier `age` est faux le lendemain de
        // l'anniversaire et personne ne repasse derrière (`student_age.ts`).
        .select("id, timezone, proactive_muted_at, full_name, locale, birth_date")
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

          // « RIEN À SUIVRE, RIEN À DEMANDER » — la garde reste, ce qu'elle
          // REGARDE a changé.
          //
          // Elle lisait ici, en dur, `plan_versions` publié OU
          // `student_week_plans` en 'adopted'. Le commit 99697610 a remplacé la
          // semaine de méthode par le constructeur de repas: plus personne
          // n'écrit 'adopted', et aucun coach ne publie de plan_version en 1:N.
          // LES DEUX CONDITIONS ÉTAIENT DEVENUES IMPOSSIBLES — donc ce tap ne
          // partait plus pour personne, en silence, sans une seule erreur.
          //
          // La définition vit maintenant dans `following_io.ts`, partagée avec
          // `keel-weekly-flow-v1` qui portait la même garde écrite deux fois.
          // Une seule définition de « suivre quelque chose »: c'est ce qui
          // empêche les deux surfaces de re-diverger au prochain pivot.
          const following = await resolveStudentFollowing(
            admin,
            cursor,
            weekStartOf(localDate),
          );

          // ── FF-028 · UN SEUL MESSAGE PAR SOIR ───────────────────────────
          //
          // La recommandation quotidienne vit dans la fenêtre 19h-20h locales,
          // strictement AVANT celle-ci (20h-22h). Quand elle a parlé ce soir,
          // le tap se retire — deux messages seraient deux notifications,
          // c'est-à-dire le problème que `daily_recap.ts` répare, doublé.
          //
          // La priorité va à la recommandation, et c'est un arbitrage assumé:
          // elle est RARE (faim récurrente + deux compositions rassasiantes
          // insuffisantes, puis un mois de cooldown) là où le tap est quotidien
          // et porte déjà son propre repli de cadence. Perdre un tap ce soir-là
          // ne coûte rien; perdre la proposition coûte un mois.
          //
          // Le motif n'entre PAS dans `PULSE_SKIP_REASONS`: c'est une garde
          // d'ORDONNANCEMENT entre deux jobs, pas une décision du pouls, et
          // elle se compte comme les refus de livraison — par une clé nommée
          // dans `bySkip`, lisible dans le compte-rendu.
          if (
            await wasRecommendationSentToday(admin, {
              userId: cursor,
              localDate,
            })
          ) {
            bySkip.recommendation_sent_today =
              (bySkip.recommendation_sent_today ?? 0) + 1;
            continue;
          }

          // ── LES DEUX LECTURES QUI NOURRISSENT LA DÉCISION ───────────────
          // Les faits d'abord: ils décident s'il y a quelque chose à DIRE. La
          // cadence ensuite: elle décide s'il y a quelque chose à DEMANDER.
          // Les deux sont indépendantes, et c'est ce qui garantit qu'une
          // journée vide n'annule jamais une question due.
          const facts = await loadDayFacts(admin, { userId: cursor, localDate });
          const cadence = decideAskCadence(
            await loadAskCadence(admin, {
              userId: cursor,
              localDate,
              timezone: tz,
              now,
            }),
          );

          const decision = decideDailyPulse({
            localHour,
            answeredToday: day.answeredToday,
            // Le message est-il déjà sorti ce jour local ? Le cron est horaire
            // et la fenêtre fait deux heures: sans cette garde, le silence de
            // l'élève valait relance une heure plus tard.
            sentToday: await wasPulseSentToday(admin, {
              userId: cursor,
              localDate,
              timezone: tz,
              now,
            }),
            hasGround: hasRecapGround(facts),
            askDue: cadence.ask,
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
            hasActivePlan: following.following,
          });

          if (decision.decision === "skip") {
            bySkip[decision.reason] = (bySkip[decision.reason] ?? 0) + 1;
            continue;
          }

          // La cadence n'est comptée QUE sur les élèves réellement servis: la
          // compter avant les gardes ferait ressembler une cohorte entière hors
          // fenêtre à une cohorte qu'on a décidé de ne pas questionner.
          cadenceReasons[cadence.reason] = (cadenceReasons[cadence.reason] ?? 0) + 1;

          if (!dryRun) {
            // ── LE PLANCHER TCA (FF-001 R4) ────────────────────────────────
            //
            // Lu par `isRestrictionFlagged`, l'unique lecteur du dépôt: cette
            // fonction existe parce que la relance posait `restrictionFlag:
            // false` en dur pendant qu'un commentaire affirmait le contraire, et
            // que le point hebdo, lui, lisait la base. Une seconde lecture ici
            // referait exactement la même divergence.
            //
            // Elle REMONTE en cas d'échec, et c'est voulu: le tour de cet élève
            // est compté en `failures`. Rater un message coûte un message; rater
            // le plancher envoie une question d'observance à quelqu'un qu'il
            // faut laisser tranquille.
            const restrictionFlag = await isRestrictionFlagged(admin, cursor);

            // ── LE MINEUR (FF-001 R5) ──────────────────────────────────────
            // Dérivé de la date de naissance À CHAQUE LECTURE, sur le jour LOCAL
            // de l'élève — un élève à Auckland a dix-huit ans douze heures avant
            // que le serveur ne l'admette. Une date absente n'est PAS un mineur:
            // c'est la condition de désarmement écrite dans `student_age.ts`, et
            // aucun élève d'avant ce champ n'en porte une.
            const isMinor = assessBirthDate(row.birth_date, localDate).status === "minor";

            // L'OUVERTURE, dans la voix du coach quand il en a une. Tout
            // échec — pas de doctrine, modèle en panne, ceinture qui refuse —
            // rend le décompte déterministe: on perd la voix, jamais
            // l'information.
            const recap = await composeRecapBody(admin, {
              userId: cursor,
              firstName: String(row.full_name ?? "").trim().split(/\s+/)[0] ?? "",
              facts,
              // R2/R3 — un message de job est un ARTEFACT: aucun fil à ancrer,
              // donc `resolveArtifactLocale` et pas `resolveResponseLocale`.
              contentLocale: resolveArtifactLocale({
                studentProfile: String(row.locale ?? "").trim() || null,
                tenantDefault: null,
              }),
              // FF-001 — LA PRATIQUE ENTRE DANS L'APPEL QUI A DÉJÀ LIEU.
              // `pulseAsks` vient de la décision prise trois lignes plus haut:
              // c'est ELLE qui fait l'alternance (R3), et pas une seconde
              // cadence qui pourrait entrer en collision avec la première.
              practiceContext: {
                localDate,
                isMinor,
                restrictionFlag,
                pulseAsks: decision.ask,
              },
              requestId,
            });
            bodySources[recap.source] = (bodySources[recap.source] ?? 0) + 1;
            if (recap.source === "fallback" && recap.reason) {
              const key = recap.reason.split(":").slice(0, 2).join(":");
              fallbackReasons[key] = (fallbackReasons[key] ?? 0) + 1;
            }
            practiceModes[recap.practiceMode] = (practiceModes[recap.practiceMode] ?? 0) + 1;

            const message = renderPulseMessage({
              recapBody: recap.body,
              ask: decision.ask,
            });
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
              // ⚠️ LE DRAPEAU DONT DÉPEND TOUTE LA CADENCE.
              //
              // Le récapitulatif et la question partent sous le MÊME purpose
              // (`keel_daily_pulse` est dans `GUARANTEED_PURPOSES`; un purpose
              // neuf serait silencieusement plafonné). Sans ce drapeau,
              // `loadAskCadence` compterait chaque récapitulatif comme une
              // question posée, `daysSinceLastAsk` vaudrait éternellement 0, et
              // **la question ne repartirait jamais** — pendant que le job
              // continuerait à compter un envoi par élève et par jour.
              //
              // `body_source` voyage pour la même raison que dans la relance:
              // un message dont on ne peut plus dire, trois semaines plus tard,
              // s'il portait la voix du coach ou le texte de secours est un
              // message qu'on ne peut pas juger.
              metadata: {
                [PULSE_ASKED_METADATA_KEY]: decision.ask,
                body_source: recap.source,
                body_fallback_reason: recap.reason || null,
              },
              // L'HORLOGE DU JOB EST AUSSI CELLE DE SES EFFETS.
              // Sans ce passage, `now` gouvernait la DÉCISION (fenêtre 20-22 h
              // locales) et l'horloge réelle gouvernait l'ÉCRITURE: la ligne
              // était estampillée à une heure que le job n'avait pas choisie, et
              // le plafond quotidien se comptait sur une AUTRE date locale que
              // celle qui avait autorisé l'envoi. En production les deux
              // coïncident; en rejeu — le seul moment où on peut éprouver ce
              // job — elles divergent, et une question posée « dans le futur »
              // n'est jamais armée.
              now,
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
          if (decision.ask) asked++;
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
      // `sent` compte les MESSAGES, `asked` les questions. Les confondre était
      // possible tant que le message ÉTAIT la question; ça ne l'est plus, et un
      // soir où « 40 messages sont partis » ne dit rien de ce qui a été mesuré.
      asked,
      // La voix du coach a-t-elle porté ? `{"composed":8,"fallback":2}` se lit;
      // `sent: 10` ne dit rien de ce que les élèves ont reçu.
      body_sources: bodySources,
      body_fallback_reasons: fallbackReasons,
      // FF-001 — la répartition rappel / question / rien, qui est l'une des
      // quatre mesures que la spécification demande (§10).
      practice_modes: practiceModes,
      // Pourquoi la question est partie, ou pas. `{"too_soon": 30}` est un
      // produit qui se tient; `{"backing_off": 30}` est une cohorte qui décroche.
      ask_cadence_reasons: cadenceReasons,
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
