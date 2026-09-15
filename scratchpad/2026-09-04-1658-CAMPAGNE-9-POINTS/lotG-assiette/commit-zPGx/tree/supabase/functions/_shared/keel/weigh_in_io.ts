/**
 * FF-062 C2 — LE RAPPEL DE PESÉE. La lecture, l'envoi, et l'écriture.
 *
 * Le module pur voisin (`weigh_in.ts`) décide. Celui-ci va chercher les cinq
 * valeurs dont la décision a besoin, livre le message, et écrit la pesée quand
 * elle revient.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LA SECONDE HORLOGE SE DÉRIVE, ELLE NE SE STOCKE PAS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `decideWeighIn` a besoin du jour de la DERNIÈRE DEMANDE (R2: un canal ignoré
 * ne se répète pas). Ce fait existe déjà: `chat_messages.purpose` porte
 * `keel_weigh_in` sur la bulle qui l'a posée. La fiche le dit en toutes lettres
 * (§5): *« le compte se dérive de là, il ne se stocke pas »*.
 *
 * ⛔ ET C'EST UNE DÉCISION, PAS UNE COMMODITÉ. Un second état à invalider est
 * un état dont l'écrivain finit par disparaître — ce dépôt paie cette faute en
 * boucle (`grocery_waves.ts`, `accident.ts`, `disarmed_tap.ts` l'énoncent
 * chacun à leur tour). L'ordre des messages, lui, ne peut pas se
 * désynchroniser de lui-même.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { CHAT_SCOPE, deliverChatMessage } from "../chat/delivery.ts";
import { insertBodyMeasures } from "./body_measure_io.ts";
import { localDateInZone } from "./local_date.ts";
import { evaluateRestrictionForStudent } from "./restriction_runtime.ts";
import { type GoalToken, goalTokenOrNull } from "./tokens.ts";
import { WEIGHT_KG_MAX, WEIGHT_KG_MIN } from "./weight_bounds.ts";
import {
  decideWeighIn,
  renderWeighInAsk,
  WEIGH_IN_WINDOW_END_HOUR,
  WEIGH_IN_WINDOW_START_HOUR,
  type WeighInVerdict,
} from "./weigh_in.ts";

/** Le `purpose` de la bulle. C'est LUI qui porte la seconde horloge. */
export const WEIGH_IN_PURPOSE = "keel_weigh_in";
export const WEIGH_IN_ACK_PURPOSE = "keel_weigh_in_ack";

/**
 * Combien de jours en arrière on cherche la dernière demande.
 *
 * Dix: la plus longue cadence est de cinq jours (prise de masse), donc une
 * fenêtre de dix couvre deux cycles complets. Chercher plus loin coûterait une
 * lecture large pour répondre à une question dont la réponse est toujours
 * « il y a moins d'une semaine, ou jamais ».
 */
const ASK_LOOKBACK_DAYS = 10;

function shiftIsoDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Le jour local de la dernière demande de pesée, ou `null`.
 *
 * ⚠️ FAIL-CLOSED. Une lecture en panne rend la date d'AUJOURD'HUI, c'est-à-dire
 * « on vient de demander », c'est-à-dire on ne demande pas. Le pire cas est une
 * pesée sautée; l'inverse est une question par heure pendant que Postgres
 * bégaye — et c'est le canal dont R2 dit qu'il ne doit jamais se répéter.
 */
export async function lastWeighInAskOn(
  admin: SupabaseClient,
  args: { userId: string; today: string; timezone: string | null },
): Promise<string | null> {
  const since = shiftIsoDate(args.today, -ASK_LOOKBACK_DAYS);
  try {
    const { data, error } = await admin
      .from("chat_messages")
      .select("created_at, metadata")
      .eq("user_id", args.userId)
      .eq("scope", CHAT_SCOPE)
      .eq("role", "assistant")
      .gte("created_at", `${since}T00:00:00Z`)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    const rows = (data ?? []) as Array<
      { created_at?: unknown; metadata?: Record<string, unknown> | null }
    >;
    const hit = rows.find((r) =>
      String(r.metadata?.purpose ?? "") === WEIGH_IN_PURPOSE
    );
    if (!hit) return null;
    const at = new Date(String(hit.created_at ?? ""));
    if (!Number.isFinite(at.getTime())) return null;
    // Le jour de l'ÉLÈVE, pas l'UTC du serveur: à Auckland, une question de
    // 18h locales est déjà le lendemain en UTC.
    const zone = String(args.timezone ?? "").trim();
    if (!zone) return at.toISOString().slice(0, 10);
    try {
      return localDateInZone(zone, at);
    } catch {
      return at.toISOString().slice(0, 10);
    }
  } catch (error) {
    console.warn(JSON.stringify({
      tag: "keel.weigh_in.last_ask_unreadable",
      user_id: args.userId,
      error: error instanceof Error ? error.message : [
        (error as { code?: string })?.code,
        (error as { message?: string })?.message,
        (error as { details?: string })?.details,
        (error as { hint?: string })?.hint,
      ].filter(Boolean).join(" — ") || String(error),
      effect: "fail-closed: on suppose qu'on vient de demander",
    }));
    return args.today;
  }
}

/** La dernière pesée connue: son jour local et sa valeur. */
export async function lastWeightMeasure(
  admin: SupabaseClient,
  userId: string,
): Promise<{ localDate: string | null; kg: number | null }> {
  const { data, error } = await admin
    .from("student_body_measures")
    .select("local_date, value_si, measured_at")
    .eq("user_id", userId)
    .eq("kind", "weight")
    .order("local_date", { ascending: false })
    .order("measured_at", { ascending: false })
    .limit(1);
  // ⛔ ON NE RATTRAPE PAS. Un chargeur qui avale son erreur et rend « pas de
  // mesure » raconte qu'un élève ne s'est jamais pesé alors qu'on a échoué à le
  // lire — et cette fonction décide alors de DEMANDER. La règle est déjà écrite
  // dans `body_measure_io.ts`: l'appelant se ferme, le chargeur ne ment pas.
  if (error) throw error;
  const row = ((data ?? [])[0] ?? null) as Record<string, unknown> | null;
  if (!row) return { localDate: null, kg: null };
  const kg = Number(row.value_si);
  return {
    localDate: String(row.local_date ?? "").trim() || null,
    kg: Number.isFinite(kg) ? kg : null,
  };
}

export interface WeighInStepOutcome {
  verdict: WeighInVerdict;
  /** `true` quand la bulle est réellement partie. */
  delivered: boolean;
  /** Le motif de la politique de livraison, quand elle a refusé. */
  deliveryReason?: string;
}

/**
 * Le pas complet pour UN élève. Ne jette jamais sur une décision — il jette sur
 * une panne de lecture, et l'appelant compte l'échec.
 *
 * ⚠️ L'ORDRE: on décide AVANT de composer. C'est la leçon mesurée de la relance
 * (QA phase C, 8 appels et 8 221 tokens jetés parce que le plafond n'était lu
 * qu'après la composition). Ici il n'y a pas de modèle à appeler — la phrase est
 * un pack — donc le coût est faible; l'ordre reste le même pour que la forme
 * du job soit la même partout.
 */
export async function runWeighInStep(
  admin: SupabaseClient,
  args: {
    userId: string;
    timezone: string | null;
    locale: string | null;
    muted: boolean;
    now: Date;
    dryRun?: boolean;
    requestId?: string;
  },
): Promise<WeighInStepOutcome> {
  const zone = String(args.timezone ?? "").trim();
  // Pas de fuseau, pas de fenêtre locale: on ne sait pas quelle heure il est
  // chez la personne, donc on ne sait pas si c'est le moment.
  if (!zone) return { verdict: { ask: false, reason: "outside_window" }, delivered: false };
  const today = localDateInZone(zone, args.now);
  const localHour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hour: "numeric",
      hour12: false,
    }).format(args.now),
  );

  // ── LA FENÊTRE D'ABORD, PARCE QU'ELLE EST GRATUITE ─────────────────────
  // Vingt-deux heures sur vingt-quatre sortent ici, sans lire ni l'objectif, ni
  // le plancher, ni la série de mesures. Le balayage horaire coûte alors une
  // page de `profiles` et rien d'autre.
  //
  // ⛔ LES BORNES SONT IMPORTÉES, JAMAIS RETAPÉES. Une fenêtre déclarée dans le
  // module pur et recopiée ici est la divergence que `weight_bounds.ts` raconte
  // sur quatre copies d'un même refus — et c'est celle qu'on regarde le moins
  // qui garde l'ancienne valeur.
  if (
    !Number.isFinite(localHour) ||
    localHour < WEIGH_IN_WINDOW_START_HOUR ||
    localHour >= WEIGH_IN_WINDOW_END_HOUR
  ) {
    return { verdict: { ask: false, reason: "outside_window" }, delivered: false };
  }
  if (args.muted) {
    return { verdict: { ask: false, reason: "muted" }, delivered: false };
  }

  const goalsRes = await admin
    .from("student_goals")
    .select("goal")
    .eq("user_id", args.userId)
    .maybeSingle();
  if (goalsRes.error) throw goalsRes.error;
  // ⛔ `goalTokenOrNull`, PAS `parseGoalToken`. Voir la jumelle de
  // `slot_meal_io.ts`: le parseur strict JETTE sur l'absence, et l'absence est
  // le cas nominal d'un balayage de cohorte.
  const goal: GoalToken | null = goalTokenOrNull(
    (goalsRes.data as { goal?: unknown } | null)?.goal,
  );

  // R7 — le plancher. Une lecture EN ÉCHEC vaut un plancher LEVÉ (même
  // arbitrage que `MealBodyContext.restrictionFlag`, FF-030 R6).
  let restrictionFlag = true;
  try {
    const floor = await evaluateRestrictionForStudent(admin as never, {
      userId: args.userId,
      asOfLocalDate: today,
    });
    restrictionFlag = floor.restriction_flag === true;
  } catch (error) {
    console.warn(JSON.stringify({
      tag: "keel.weigh_in.restriction_unreadable",
      user_id: args.userId,
      error: error instanceof Error ? error.message : String(error),
      effect: "fail-closed: aucune demande de pesee",
    }));
  }

  const [measure, lastAskedOn] = await Promise.all([
    lastWeightMeasure(admin, args.userId),
    lastWeighInAskOn(admin, {
      userId: args.userId,
      today,
      timezone: zone,
    }),
  ]);

  const verdict = decideWeighIn({
    goal,
    restrictionFlag,
    muted: args.muted,
    localHour,
    today,
    lastMeasuredOn: measure.localDate,
    lastKg: measure.kg,
    lastAskedOn,
  });
  if (!verdict.ask) return { verdict, delivered: false };
  if (args.dryRun) return { verdict, delivered: false, deliveryReason: "dry_run" };

  const message = renderWeighInAsk({
    locale: String(args.locale ?? "") || "en-US",
    localDate: today,
    sinceDays: verdict.sinceDays,
  });
  const res = await deliverChatMessage(admin, {
    userId: args.userId,
    content: message.body,
    buttons: message.buttons,
    purpose: WEIGH_IN_PURPOSE,
    requestId: args.requestId,
    now: args.now,
  });
  return {
    verdict,
    delivered: Boolean(res.chatMessageId),
    deliveryReason: res.reason,
  };
}

// ---------------------------------------------------------------------------
// LA RÉPONSE — ce que le formulaire écrit
// ---------------------------------------------------------------------------

export type WeighInWriteResult =
  | { ok: true; kg: number; localDate: string }
  /** Rien n'a été saisi. R8: valider un champ vide n'écrit AUCUNE ligne. */
  | { ok: false; reason: "empty" }
  | { ok: false; reason: "not_a_number" }
  | { ok: false; reason: "out_of_range"; min: number; max: number };

/**
 * Écrit la pesée que le formulaire de C2 rapporte.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * R8 — LE CHAMP VIDE N'ÉCRIT RIEN, ET C'EST LA MOITIÉ DE LA RÈGLE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * L'autre moitié vit sur l'écran: le champ porte l'ancien poids en PLACEHOLDER
 * et n'est jamais PRÉ-REMPLI. Un champ pré-rempli se valide sans être lu — on
 * enregistrerait la valeur de l'avant-veille comme une pesée d'aujourd'hui, et
 * la série mentirait sans qu'aucune erreur ne soit levée. Ici, la conséquence
 * mécanique: `""` est une réponse valide qui n'écrit pas.
 *
 * ⛔ HORS BORNES = REFUSÉ ET NOMMÉ, jamais ramené au bord. Un 500 kg ramené à
 * 400 produit une donnée fausse qui a l'air vraie — et cette donnée arme la
 * ceinture de restriction.
 *
 * ⚠️ `source: "weigh_in"`, PAS `"chat"`. `chat` désigne le plancher d'extraction
 * de FF-008 (un poids écrit dans une phrase). Les confondre rendrait impossible
 * la seule mesure qui dira si ce canal vaut son coût.
 */
export async function writeWeighIn(
  admin: SupabaseClient,
  args: {
    userId: string;
    raw: unknown;
    localDate: string;
    now: Date;
    contentLocale?: string | null;
  },
): Promise<WeighInWriteResult> {
  const text = String(args.raw ?? "").trim();
  if (!text) return { ok: false, reason: "empty" };
  // La virgule décimale est ce que tape la moitié de l'Europe.
  const kg = Number(text.replace(",", "."));
  if (!Number.isFinite(kg)) return { ok: false, reason: "not_a_number" };
  if (kg < WEIGHT_KG_MIN || kg > WEIGHT_KG_MAX) {
    return {
      ok: false,
      reason: "out_of_range",
      min: WEIGHT_KG_MIN,
      max: WEIGHT_KG_MAX,
    };
  }
  await insertBodyMeasures(admin, [{
    userId: args.userId,
    kind: "weight",
    valueSi: kg,
    source: "weigh_in",
    measuredAt: args.now.toISOString(),
    localDate: args.localDate,
    contentLocale: args.contentLocale ?? null,
  }]);
  return { ok: true, kg, localDate: args.localDate };
}
