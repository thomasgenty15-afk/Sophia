/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { runSlotMealStep } from "../_shared/keel/slot_meal_io.ts";
// ⟳ 2026-09-23 — la question du soir: « tu as mangé tous tes repas ? »
import { runDayMealsStep } from "../_shared/keel/day_meals_io.ts";
import { runWeighInStep } from "../_shared/keel/weigh_in_io.ts";
// FF-054 §3.2 / FF-062 — le retour de fin de plan, sorti du message du soir.
import { runPlanFeedbackStep } from "../_shared/keel/plan_feedback_chat_io.ts";
// ⟳ 2026-09-09 — le rappel de la veille: « ce soir, sors la dinde du congélateur ».
import { runThawReminderStep } from "../_shared/keel/thaw_reminder_io.ts";
import { sweepLapsedClarifications } from "../_shared/keel/memory_clarification_io.ts";
import { keepWorking } from "../_shared/keel/edge_runtime.ts";

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
/**
 * ⟳ 2026-09-24 — LE BALAYAGE PAR TRANCHES.
 *
 * Le runtime edge coupe une requête à 2 s de temps CPU (1 s « souple », 2 s
 * « dure » — `cpuTimeHardLimitMs` du service principal, la même limite qu'en
 * prod). Balayer toute la flotte dans une seule requête ne tenait plus: sur la
 * base locale (1 060 élèves), chaque tick horaire était tué vers la moitié de
 * la liste, et les comptes suivants n'étaient JAMAIS examinés — la question du
 * soir (`day_meals`) n'était partie à personne. Le `budgetMs` ci-dessus compte
 * l'horloge murale, pas le CPU: il ne voyait rien venir.
 *
 * Une tranche examine au plus `PEOPLE_PER_LINK` personnes, puis relance la
 * suivante avec son curseur (`handOff`). La tranche relancée répond 202 tout
 * de suite et travaille en arrière-plan: sans ça, chaque tranche attendrait la
 * réponse de toutes les suivantes, et la première porterait l'horloge murale de
 * toute la chaîne.
 */
const PEOPLE_PER_LINK = 100;
/** Garde contre une chaîne qui ne finirait pas (le curseur ne recule jamais). */
const MAX_LINKS = 200;

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

/**
 * LES ENTRÉES D'UN PAS, POUR UNE PERSONNE. Les deux audiences les remplissent.
 */
interface AskCommon {
  userId: string;
  timezone: string | null;
  locale: string | null;
  muted: boolean;
  askEnabled: boolean | null;
  now: Date;
  dryRun: boolean;
  requestId: string;
}

/**
 * C1 ET C2, POUR UNE PERSONNE — extraits parce qu'ils ont DEUX audiences.
 *
 * ⛔ UN `try` PAR CANAL, ET AUCUN `continue`. C'est la cicatrice de FF-056: le
 * pas de la divergence était placé APRÈS le `try/catch` d'un autre canal dont
 * les sorties non-nominales faisaient `continue`. Il était sauté pour le cas
 * NOMINAL, et invisible parce que son seul compteur valait zéro en régime
 * normal. Extraire les deux ici garde cette forme à un seul endroit — deux
 * copies auraient divergé au premier correctif, et la copie qui perd son `try`
 * est celle qu'on regarde le moins.
 *
 * ⚠️ `examined` MONTE POUR TOUTE ISSUE SAUF LA FENÊTRE, et c'est le précédent
 * du dépôt (`weight_divergence_tally.ts`, même règle mot pour mot). Le compter
 * aussi hors fenêtre ferait dire à ce champ « le job a tourné » alors qu'il
 * doit dire « le détecteur a regardé ».
 */
async function runAskChannels(
  admin: SupabaseClient,
  common: AskCommon,
  ctx: {
    doSlotMeal: boolean;
    doDayMeals: boolean;
    doWeighIn: boolean;
    slotMeal: ChannelTally;
    dayMeals: ChannelTally;
    weighIn: ChannelTally;
    failures: string[];
  },
): Promise<void> {
  let slotMealSentNow = false;
  if (ctx.doSlotMeal) {
    try {
      const out = await runSlotMealStep(admin, common);
      if (!isWindowSkip(out.verdict)) ctx.slotMeal.examined++;
      if (out.verdict.ask) {
        if (out.delivered) {
          ctx.slotMeal.sent++;
          slotMealSentNow = true;
        } else bump(ctx.slotMeal.blocked, out.deliveryReason ?? "unknown");
      } else {
        bump(ctx.slotMeal.skipped, out.verdict.reason);
      }
    } catch (error) {
      ctx.failures.push(`slot_meal ${common.userId}: ${flattenError(error)}`);
    }
  }

  // ── ⟳ 2026-09-23 · LA QUESTION DU SOIR SUR LES REPAS PRÉVUS ───────────
  //
  // Elle tombe à la même heure que la question du dîner NON COUVERT (21 h par
  // défaut). Si celle-là vient de partir dans ce tick, celle-ci attend le
  // suivant — sa fenêtre dure deux heures — plutôt que de poser deux bulles
  // d'un coup. Compté `deferred`, pour que l'attente ne ressemble pas à un refus.
  if (ctx.doDayMeals) {
    if (slotMealSentNow) {
      bump(ctx.dayMeals.skipped, "deferred");
    } else {
      try {
        const out = await runDayMealsStep(admin, common);
        if (!isWindowSkip(out.verdict)) ctx.dayMeals.examined++;
        if (out.verdict.ask) {
          if (out.delivered) ctx.dayMeals.sent++;
          else bump(ctx.dayMeals.blocked, out.deliveryReason ?? "unknown");
        } else {
          bump(ctx.dayMeals.skipped, out.verdict.reason);
        }
      } catch (error) {
        ctx.failures.push(`day_meals ${common.userId}: ${flattenError(error)}`);
      }
    }
  }

  if (ctx.doWeighIn) {
    try {
      const out = await runWeighInStep(admin, common);
      if (!isWindowSkip(out.verdict)) ctx.weighIn.examined++;
      if (out.verdict.ask) {
        if (out.delivered) ctx.weighIn.sent++;
        else bump(ctx.weighIn.blocked, out.deliveryReason ?? "unknown");
      } else {
        bump(ctx.weighIn.skipped, out.verdict.reason);
      }
    } catch (error) {
      ctx.failures.push(`weigh_in ${common.userId}: ${flattenError(error)}`);
    }
  }
}

/** La suite de la chaîne: ce que la tranche suivante reprend. */
type HandOff =
  | { after_user_id: string }
  | { students_done: true; after_member_user_id: string };

/**
 * Relance la tranche suivante. Rend `null` si elle est partie, sinon le motif.
 *
 * ⚠️ LE SECRET EST CELUI QUE LA TRANCHE A REÇU, déjà vérifié par
 * `ensureInternalRequest`: relire l'environnement ferait diverger les deux
 * côtés en local, où le secret peut venir du repli `SECRET_KEY`.
 */
async function handOff(
  req: Request,
  body: Record<string, unknown>,
): Promise<string | null> {
  const base = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const secret = (req.headers.get("x-internal-secret") ?? "").trim();
  const anon = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
  if (!base || !secret) return "no_url_or_secret";
  try {
    const res = await fetch(`${base}/functions/v1/${FN_NAME}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": secret,
        ...(anon ? { apikey: anon, authorization: `Bearer ${anon}` } : {}),
      },
      body: JSON.stringify(body),
    });
    await res.body?.cancel();
    return res.status === 202 ? null : `status_${res.status}`;
  } catch (error) {
    return flattenError(error);
  }
}

/** UNE TRANCHE du balayage. Rend le compte-rendu et son statut HTTP. */
async function sweep(
  req: Request,
  body: Record<string, unknown>,
  requestId: string,
): Promise<{ status: number; payload: Record<string, unknown> }> {
  const nowIso = cleanText(body.now);
  const cand = nowIso ? new Date(nowIso) : new Date();
  const now = Number.isFinite(cand.getTime()) ? cand : new Date();
  const dryRun = body.dry_run === true;
  const budgetRaw = Number(body.budget_ms);
  const budgetMs = Number.isFinite(budgetRaw) && budgetRaw > 0
    ? Math.min(budgetRaw, 120_000)
    : DEFAULT_BUDGET_MS;
  const link = Math.max(0, Math.floor(Number(body.link) || 0));
  /** `false` coupe la relance: une tranche seule, pour sonder un compte. */
  const chain = body.chain !== false;
  const maxRaw = Math.floor(Number(body.max_people));
  const maxPeople = Number.isFinite(maxRaw) && maxRaw > 0
    ? Math.min(maxRaw, PEOPLE_PER_LINK)
    : PEOPLE_PER_LINK;
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
    only !== "plan_feedback" && only !== "thaw_reminder" &&
    only !== "day_meals"
  ) {
    return {
      status: 400,
      payload: {
        ok: false,
        error: `unknown channel ${JSON.stringify(only)}`,
        request_id: requestId,
      },
    };
  }
  const doSlotMeal = !only || only === "slot_meal";
  const doDayMeals = !only || only === "day_meals";
  const doWeighIn = !only || only === "weigh_in";
  const doPlanFeedback = !only || only === "plan_feedback";
  const doThawReminder = !only || only === "thaw_reminder";

  const admin = adminClient();
  const startedAt = Date.now();
  let people = 0;
  // ⛔ UNE TRANCHE SERT TOUJOURS AU MOINS UNE PERSONNE. Sans le `people > 0`,
  // un budget déjà dépassé au départ rendrait une tranche vide qui relancerait
  // la même, au même curseur, jusqu'à `MAX_LINKS`.
  const linkFull = () =>
    people >= maxPeople || (people > 0 && Date.now() - startedAt > budgetMs);

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
  //
  // ⟳ 2026-09-24 — dans la PREMIÈRE tranche seulement: c'est un `update`
  // global, le rejouer à chaque tranche ne fermerait rien de plus.
  const clarificationsExpired = link === 0
    ? (await sweepLapsedClarifications(admin, { nowIso: now.toISOString() }))
      .expired
    : 0;

  let cursor = cleanText(body.after_user_id);
  let scanned = 0;
  const slotMeal = emptyTally();
  const dayMeals = emptyTally();
  const weighIn = emptyTally();
  const planFeedback = emptyTally();
  const thawReminder = emptyTally();
  const failures: string[] = [];
  // Une tranche relancée APRÈS les élèves ne les relit pas.
  let exhausted = body.students_done === true;

  while (!exhausted && !linkFull()) {
    let q = admin
      .from("profiles")
      // ⚠️ NE NOMMER QUE DES COLONNES QUI EXISTENT. Un `content_locale` sur
      // `profiles` a déjà fait rendre 42703 à PostgREST dès la première page
      // dans `keel-weekly-flow-v1`: aucun élève examiné, et toutes les gardes
      // en aval mortes derrière un SELECT cassé.
      // ⚠️ `slot_meal_ask_enabled` ARRIVE AVEC SA MIGRATION, DANS LE MÊME
      // COMMIT. La cicatrice est chiffrée: un `eating_rhythm` nommé dans un
      // SELECT avant que sa colonne existe a rendu 42703 sur 629 élèves sur
      // 669 — aucun examiné, et toutes les gardes en aval mortes derrière une
      // requête cassée. La migration s'applique AVANT le déploiement.
      .select("id, timezone, locale, proactive_muted_at, slot_meal_ask_enabled")
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
      people++;
      const common = {
        userId: cursor,
        timezone: row.timezone ? String(row.timezone) : null,
        locale: row.locale ? String(row.locale) : null,
        muted: Boolean(row.proactive_muted_at),
        // ⛔ LE TRI-ÉTAT PASSE BRUT, ET `Boolean(...)` SERAIT UN DÉFAUT.
        // `null` veut dire « personne n'a choisi », et l'objectif décide
        // alors; le convertir ici l'écraserait en « éteint » pour toute la
        // cohorte qui n'a jamais touché au réglage — c'est-à-dire tout le
        // monde. La réduction vit dans `slotMealAskSwitchFrom`, et là seule.
        askEnabled: row.slot_meal_ask_enabled === null ||
            row.slot_meal_ask_enabled === undefined
          ? null
          : Boolean(row.slot_meal_ask_enabled),
        now,
        dryRun,
        requestId,
      };

      // ── C1 ET C2 — LES DEUX CANAUX QUE LES DEUX AUDIENCES PARTAGENT ──
      await runAskChannels(admin, common, {
        doSlotMeal,
        doDayMeals,
        doWeighIn,
        slotMeal,
        dayMeals,
        weighIn,
        failures,
      });

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

      // ── LE RAPPEL DE LA VEILLE — 18h-20h, LA VEILLE D'UNE SESSION ────
      //
      // ⟳ 2026-09-09. Un message sans question: ce que la session de demain
      // sort du congélateur ce soir. Non sollicité, donc plafonné; un soir où
      // les bilans prennent les créneaux, il ne part pas et se compte en
      // `blocked`. Son `try` à lui, comme les trois autres.
      if (doThawReminder) {
        try {
          const out = await runThawReminderStep(admin, common);
          if (!isWindowSkip(out.verdict)) thawReminder.examined++;
          if (out.verdict.ask) {
            if (out.delivered) thawReminder.sent++;
            else bump(thawReminder.blocked, out.deliveryReason ?? "unknown");
          } else {
            bump(thawReminder.skipped, out.verdict.reason);
          }
        } catch (error) {
          failures.push(`thaw_reminder ${cursor}: ${flattenError(error)}`);
        }
      }

      if (linkFull()) break;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LA SECONDE AUDIENCE — LES PROFILS RÉCLAMÉS D'UN FOYER (2026-09-09)
  // ═══════════════════════════════════════════════════════════════════════
  //
  // ── LE TROU QU'ELLE FERME, ET IL ÉTAIT TOTAL ──────────────────────────
  // La boucle du dessus filtre `keel_role = 'student'`. La réclamation d'un
  // profil de foyer n'écrit JAMAIS ce rôle — c'est délibéré, et une garde QA
  // le vérifie (`20260811060000`, « LE RÔLE N'EST PAS ÉCRIT »). Un compte
  // supplémentaire ne recevait donc AUCUNE question: ni sa pesée, ni son
  // repas. Il servait ce que `keel-daily-pulse-v1` lui adressait par sa
  // propre seconde requête d'audience — et cette fonction a été SUPPRIMÉE le
  // 2026-09-08. Depuis, le canal est muet, et le compte-rendu ne pouvait pas
  // le dire: un membre jamais regardé ne produit aucun motif de refus.
  //
  // ── DEUX CANAUX, ET DEUX SEULEMENT (décision humaine du 2026-09-09) ────
  //   ✓ la pesée   — c'est le suivi individuel qu'un second compte achète
  //   ✓ le repas   — sa coche est un fait de PERSONNE (FF-058 R10)
  //   ✗ le point de la semaine — réservé au maître
  //   ✗ le retour de fin de plan — fermé au membre par une PROPRIÉTÉ:
  //     `meal_plan_feedback` est `unique(meal_id)`, et ce retour gouverne la
  //     composition suivante (FF-054 §11). C'est un geste de qui compose.
  //   ✗ le rappel du congélateur — un fait du FOYER, comme la cuisson et les
  //     courses (FF-058 R10 et R14): la ligne ne part qu'au maître.
  //
  // ── LE RÔLE N'EST TOUJOURS PAS ÉCRIT ──────────────────────────────────
  // Ce bloc ÉLARGIT L'AUDIENCE, il ne promeut personne. Écrire
  // `keel_role = 'student'` à la réclamation ouvrirait `/app/today` — le mode
  // 1:1, les repas composés PAR la personne — c'est-à-dire un écran vide pour
  // qui ne compose pas. C'est la même distinction que `KeelHouseholdRoute`
  // côté écran: la porte s'élargit, le rôle ne ment pas.
  //
  // ── APRÈS LES ÉLÈVES, DANS LA MÊME CHAÎNE ─────────────────────────────
  // ⟳ 2026-09-24 — la part réservée aux membres (un quart du budget, mesurée
  // le 2026-09-09) existait parce que le curseur des élèves repartait de zéro
  // à chaque tick: la même page consommait le même budget, et les membres
  // étaient affamés POUR TOUJOURS. La chaîne reprend là où la tranche s'est
  // arrêtée: les membres passent dans la tranche où les élèves sont épuisés.
  // `members.reached` reste rendu — c'est lui qui distingue, dans UNE tranche,
  // « aucun membre servi » de « aucun membre à servir ».
  const memberSlotMeal = emptyTally();
  const memberDayMeals = emptyTally();
  const memberWeighIn = emptyTally();
  let memberCursor = cleanText(body.after_member_user_id);
  let membersScanned = 0;
  let membersExhausted = false;
  let membersReached = false;

  while (exhausted && !linkFull()) {
    membersReached = true;
    // ⚠️ `role = 'member'` ET `user_id is not null`: la bouche RÉCLAMÉE. Une
    // bouche sans compte n'a personne à qui écrire, et le maître est servi
    // par la boucle du dessus s'il est élève.
    let mq = admin
      .from("household_members")
      // ⚠️ NE NOMMER QUE DES COLONNES QUI EXISTENT — et la cicatrice vient
      // d'être repayée sur CETTE table le 2026-09-09: `memberIdOf` demandait
      // `household_members.id`, qui n'existe pas. La clé est
      // `(household_id, user_id)`; l'identité d'une bouche est `member_id`.
      .select("user_id")
      .eq("role", "member")
      .not("user_id", "is", null)
      .order("user_id", { ascending: true })
      .limit(PAGE);
    if (memberCursor) mq = mq.gt("user_id", memberCursor);
    const { data: mRows, error: mErr } = await mq;
    if (mErr) throw mErr;
    const ids: string[] = [];
    for (const r of (mRows ?? []) as Array<Record<string, unknown>>) {
      const id = String(r.user_id ?? "").trim();
      // Dédoublonnage sur la page: la clé primaire autorise deux lignes pour
      // un même compte dans deux foyers. La réclamation le refuse
      // (`already_in_household`), mais s'appuyer sur ce refus ici ferait
      // partir DEUX pesées le jour où il bouge.
      if (id && !ids.includes(id)) ids.push(id);
    }
    if ((mRows ?? []).length === 0) {
      membersExhausted = true;
      break;
    }

    // Les mêmes colonnes que la boucle du dessus, plus `keel_role`.
    const { data: pRows, error: pErr } = await admin
      .from("profiles")
      .select(
        "id, timezone, locale, proactive_muted_at, slot_meal_ask_enabled, keel_role",
      )
      .in("id", ids);
    if (pErr) throw pErr;
    const byId = new Map(
      ((pRows ?? []) as Array<Record<string, unknown>>).map((r) => [
        String(r.id ?? ""),
        r,
      ]),
    );

    // ⚠️ LE CURSEUR AVANCE PAR PERSONNE, DANS L'ORDRE DE `user_id`. Il était
    // posé sur la dernière ligne de la page AVANT de la servir: une tranche
    // arrêtée en cours de page aurait fait sauter le reste de la page à la
    // suivante. `.in(...)` ne rend pas l'ordre de `ids`, d'où la table.
    let stopped = false;
    for (const userId of ids) {
      if (linkFull()) {
        stopped = true;
        break;
      }
      memberCursor = userId;
      const row = byId.get(userId);
      if (!row) continue;
      // ⛔ UN ÉLÈVE QUI EST AUSSI MEMBRE A DÉJÀ ÉTÉ SERVI. Sans ce saut, il
      // recevrait DEUX pesées le même soir — et le plafond de livraison ne
      // les arbitrerait pas: les deux purposes sont GARANTIS.
      if (String(row.keel_role ?? "") === "student") continue;
      membersScanned++;
      people++;
      await runAskChannels(admin, {
        userId,
        timezone: row.timezone ? String(row.timezone) : null,
        locale: row.locale ? String(row.locale) : null,
        muted: Boolean(row.proactive_muted_at),
        // Le tri-état passe BRUT, exactement comme au-dessus.
        askEnabled: row.slot_meal_ask_enabled === null ||
            row.slot_meal_ask_enabled === undefined
          ? null
          : Boolean(row.slot_meal_ask_enabled),
        now,
        dryRun,
        requestId,
      }, {
        doSlotMeal,
        doDayMeals,
        doWeighIn,
        slotMeal: memberSlotMeal,
        dayMeals: memberDayMeals,
        weighIn: memberWeighIn,
        failures,
      });
    }
    if (stopped) break;
    if ((mRows ?? []).length < PAGE) {
      membersExhausted = true;
      break;
    }
  }

  // ── LA SUITE DE LA CHAÎNE ─────────────────────────────────────────────
  const next: HandOff | null = !exhausted
    ? { after_user_id: cursor }
    : !membersExhausted
    ? { students_done: true, after_member_user_id: memberCursor }
    : null;
  let handOffError: string | null = null;
  if (next && chain) {
    handOffError = link + 1 >= MAX_LINKS
      ? "max_links"
      : await handOff(req, {
        ...next,
        now: now.toISOString(),
        dry_run: dryRun,
        ...(only ? { only } : {}),
        ...(Number.isFinite(budgetRaw) && budgetRaw > 0
          ? { budget_ms: budgetMs }
          : {}),
        ...(maxPeople !== PEOPLE_PER_LINK ? { max_people: maxPeople } : {}),
        link: link + 1,
        respond_early: true,
      });
  }

  return {
    status: 200,
    payload: {
      ok: true,
      dry_run: dryRun,
      only: only || null,
      link,
      scanned,
      // ⚠️ `examined` PAR CANAL, ET AVANT `sent`. `sent: 0` est le cas NOMINAL
      // (les deux canaux sont rares par construction); `examined: 0` est une
      // panne. Les fondre rendrait la panne indiscernable du succès.
      slot_meal: slotMeal,
      day_meals: dayMeals,
      weigh_in: weighIn,
      plan_feedback: planFeedback,
      thaw_reminder: thawReminder,
      // Le compteur du silence, hérité du message du soir. Il DÉCROÎT vers zéro
      // maintenant que plus aucune clarification n'est créée: c'est la forme
      // attendue, et c'est aussi ce qui dira quand ce balayage n'aura plus
      // d'objet.
      clarifications_expired: clarificationsExpired,
      exhausted,
      next_after_user_id: exhausted ? null : cursor || null,
      // ── LA SECONDE AUDIENCE, COMPTÉE À PART ─────────────────────────────
      //
      // ⛔ PAS FONDUE DANS LES QUATRE CANAUX DU DESSUS, et c'est le sujet. Un
      // membre n'a que DEUX canaux; additionner ses chiffres à ceux des élèves
      // rendrait « examinés » et « envoyés » incomparables d'une ligne à
      // l'autre — la faute exacte que le pavé d'`examined` décrit un cran plus
      // haut.
      //
      // ⚠️ `reached` DISTINGUE LES DEUX ZÉROS. La passe tourne APRÈS les
      // élèves, sur le budget qui reste: « aucun membre servi » (budget épuisé)
      // et « aucun membre à servir » (personne n'a réclamé) rendraient sinon le
      // même `scanned: 0`, et la panne serait indiscernable du cas nominal.
      members: {
        reached: membersReached,
        scanned: membersScanned,
        exhausted: membersExhausted,
        next_after_user_id: membersExhausted ? null : memberCursor || null,
        slot_meal: memberSlotMeal,
        day_meals: memberDayMeals,
        weigh_in: memberWeighIn,
      },
      // ⟳ 2026-09-24 — la tranche suivante. `handed_off: false` avec un
      // `next` non nul est une chaîne cassée: le reste de la flotte attend le
      // tick suivant, et c'est ici qu'on le voit.
      next,
      handed_off: Boolean(next && chain && handOffError === null),
      hand_off_error: handOffError,
      // ⚠️ 🔴 LE COMPTE AVANT L'ÉCHANTILLON — MESURÉ LE 2026-09-02. Ce
      // compte-rendu ne portait que `failures.slice(0, 50)`, et un run où 629
      // élèves sur 669 échouaient en rendait exactement 50: la liste tronquée
      // se lit comme « quelques cas isolés ». Sans le total, l'ampleur d'une
      // panne est invisible dans la seule chose qu'on regarde.
      failure_count: failures.length,
      failures: failures.slice(0, 50),
      request_id: requestId,
    },
  };
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  try {
    const guard = ensureInternalRequest(req);
    if (guard) return guard;

    const body = await req.json().catch(() => ({} as Record<string, unknown>));

    // ── UNE TRANCHE RELANCÉE RÉPOND TOUT DE SUITE ─────────────────────────
    // Son compte-rendu ne part qu'au journal (`keel.proactive.link`): personne
    // n'attend sa réponse, et la tranche d'avant ne doit pas l'attendre.
    if (body.respond_early === true) {
      const work = sweep(req, body, requestId).then((report) => {
        console.log(JSON.stringify({
          tag: "keel.proactive.link",
          status: report.status,
          ...report.payload,
        }));
      }).catch(async (error) => {
        await logEdgeFunctionError({
          functionName: FN_NAME,
          requestId,
          error,
          metadata: { source: "edge", link: body.link ?? null },
        });
      });
      const accepted = keepWorking(work);
      return jsonResponse(req, {
        ok: true,
        accepted,
        link: body.link ?? null,
        request_id: requestId,
      }, { status: 202, includeCors: false });
    }

    const report = await sweep(req, body, requestId);
    console.log(JSON.stringify({
      tag: "keel.proactive.link",
      status: report.status,
      ...report.payload,
    }));
    return jsonResponse(req, report.payload, {
      status: report.status,
      includeCors: false,
    });
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
