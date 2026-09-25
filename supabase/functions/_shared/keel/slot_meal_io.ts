import { loadJournal } from "./tracking_v2_io.ts";
import { promptEligibleJournalSlots } from "./tracking_v2.ts";
/**
 * FF-062 C1 — LA LECTURE, L'ENVOI, ET LE FAIT.
 *
 * Le module pur voisin (`slot_meal_ask.ts`) décide; celui-ci va chercher les
 * quatre valeurs dont la décision a besoin, livre la question, et écrit le fait
 * quand la personne répond.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { CHAT_SCOPE, deliverChatMessage } from "../chat/delivery.ts";
import { localDateInZone } from "./local_date.ts";
import { EATING_OCCASIONS, type EatingOccasion } from "./meal_generation.ts";
import { dayTokenForLocalDate } from "./slot_reminders.ts";
import { plannedSlotsToday } from "./slot_meal_planned_io.ts";
import {
  decideSlotMealAsk,
  parseSlotMealButton,
  renderSlotMealAsk,
  type SlotMealVerdict,
} from "./slot_meal_ask.ts";
import { type GoalToken, goalTokenOrNull } from "./tokens.ts";

/** Le `purpose` de la bulle. C'est LUI qui porte l'idempotence par créneau. */
export const SLOT_MEAL_PURPOSE = "keel_slot_meal";
export const SLOT_MEAL_ACK_PURPOSE = "keel_slot_meal_ack";

/**
 * La clé d'idempotence du fait. `slot_meal:<date>:<slot>`.
 *
 * ⚠️ DISTINCTE DE `accident_off_plan:<mealId>:<index>`, ET IL LE FAUT. Celle-là
 * dit « le plat PRÉVU n'a pas été mangé, autre chose l'a été » et se clave sur
 * un plat du plan. Ici il n'y a AUCUN plat: le plan ne compose rien sur ce
 * créneau. La clé se clave donc sur la seule chose qui existe — le jour
 * et le moment.
 *
 * L'index unique partiel `(user_id, source_message_id)` fait le reste: un double
 * tap ne produit qu'une ligne, arbitré par Postgres.
 */
export const SLOT_MEAL_FACT_PREFIX = "slot_meal:";

export function slotMealFactKey(localDate: string, slot: string): string {
  const date = String(localDate ?? "").trim();
  const s = String(slot ?? "").trim();
  if (!date || !s) {
    throw new Error("[keel/slot_meal_io] clé de fait incomplète");
  }
  return `${SLOT_MEAL_FACT_PREFIX}${date}:${s}`;
}

/** Les créneaux dont la question est déjà partie aujourd'hui. */
export async function slotsAskedToday(
  admin: SupabaseClient,
  args: { userId: string; today: string },
): Promise<string[]> {
  try {
    // ⟳ 2026-09-24 — LA DATE SE LIT SUR LE JETON, LA BORNE N'EST QU'UN FILTRE
    // DE COÛT, et elle part de la VEILLE. `today` est une date LOCALE: bornée à
    // son minuit UTC, une question du matin à Auckland (UTC+13) tombait la
    // veille en UTC et n'était pas relue — elle serait repartie au tick suivant.
    // Et sans le filtre de date, le dîner demandé hier soir à New York (déjà
    // « aujourd'hui » en UTC) fermait le dîner d'aujourd'hui.
    const since = new Date(`${args.today}T00:00:00Z`);
    since.setUTCDate(since.getUTCDate() - 1);
    const { data, error } = await admin
      .from("chat_messages")
      .select("metadata")
      .eq("user_id", args.userId)
      .eq("scope", CHAT_SCOPE)
      .eq("role", "assistant")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    const out: string[] = [];
    for (const row of (data ?? []) as Array<{ metadata?: Record<string, unknown> | null }>) {
      if (String(row.metadata?.purpose ?? "") !== SLOT_MEAL_PURPOSE) continue;
      // Le créneau se relit sur le JETON du bouton, pas sur une clé de
      // metadata en plus: le jeton est déjà là, il est déjà exact, et une
      // seconde écriture du même fait est le second état à invalider que ce
      // dépôt paie en boucle.
      const buttons = Array.isArray(row.metadata?.buttons)
        ? (row.metadata!.buttons as Array<{ payload?: unknown }>)
        : [];
      for (const b of buttons) {
        const tap = parseSlotMealButton(b?.payload);
        if (tap && tap.localDate === args.today) out.push(tap.slot);
      }
    }
    return [...new Set(out)];
  } catch (error) {
    console.warn(JSON.stringify({
      tag: "keel.slot_meal.asked_today_unreadable",
      user_id: args.userId,
      error: error instanceof Error ? error.message : [
        (error as { code?: string })?.code,
        (error as { message?: string })?.message,
        (error as { details?: string })?.details,
        (error as { hint?: string })?.hint,
      ].filter(Boolean).join(" — ") || String(error),
      effect: "fail-closed: on suppose que tout a deja ete demande",
    }));
    // ⚠️ FAIL-CLOSED PAR UNE SENTINELLE, PAS PAR UN TABLEAU VIDE. Un tableau
    // vide voudrait dire « rien n'a été demandé » et ferait repartir la
    // question à chaque tick pendant une panne de lecture. `"*"` n'est le
    // créneau de personne, donc il ne bloque rien tout seul — l'appelant, lui,
    // reçoit la liste des six et se tait.
    return [...ALL_SLOTS];
  }
}

/** Les six moments, pour la sentinelle de fail-closed ci-dessus. */
const ALL_SLOTS: readonly string[] = [
  "breakfast",
  "snack_am",
  "lunch",
  "snack_pm",
  "dinner",
  "before_bed",
];

export interface SlotMealStepOutcome {
  verdict: SlotMealVerdict;
  delivered: boolean;
  deliveryReason?: string;
}

/** Le pas complet pour UN élève. */
/**
 * LA BOUCHE DE CETTE PERSONNE, POUR LE FILTRE A8.3 — ET RIEN D'AUTRE.
 *
 * ⚠️ APPELÉE PARESSEUSEMENT, seulement quand le plan du jour porte au moins un
 * plat DÉDIÉ. Sur un balayage horaire de toute la flotte, la lire à chaque fois
 * serait une requête par élève et par heure pour un filtre qui n'a d'objet que
 * dans une minorité de plans.
 *
 * ⚠️ `.eq("user_id", …)` ET RIEN DE PLUS: une personne n'a qu'une bouche dans
 * son foyer. Une lecture en panne rend `null`, ce qui FERME les plats dédiés —
 * une question qui manque plutôt qu'un fait fabriqué sur le plat d'un tiers.
 *
 * ⚠️ 🔴 `member_id`, ET LA COLONNE `id` N'EXISTE PAS — MESURÉ LE 2026-09-09.
 * Ce SELECT nommait `id`. Vérifié contre la base locale:
 *
 *     select id from public.household_members limit 1;
 *     ERROR: column "id" does not exist
 *
 * `household_members` est clavetée `(household_id, user_id)` et son identité de
 * bouche s'appelle `member_id` depuis `20260810120000`. PostgREST rendait donc
 * 42703 à CHAQUE appel — et l'appelant (`slot_meal_planned_io.ts`) attrape,
 * journalise et se ferme: `memberId = null`, donc `dishIsForMouth` ÉCARTE tout
 * plat dédié. Un plan de foyer ne porte que des plats dédiés (une boîte par
 * bouche): la question du repas ne pouvait donc JAMAIS nommer un plat de foyer,
 * et le compte-rendu ressemblait à un canal qui n'a rien à demander.
 *
 * C'est la TROISIÈME fois dans ce même fichier — `eating_rhythm` et
 * `content_locale` — et c'est pour ça que le pavé chiffre l'effet au lieu de
 * répéter la règle: « ne nommer que des colonnes qui existent » était déjà
 * écrit deux fois au-dessus, et écrit ne suffit pas.
 */
export async function memberIdOf(
  admin: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("household_members")
    .select("member_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const id = String(
    (data as Record<string, unknown> | null)?.member_id ?? "",
  ).trim();
  return id || null;
}

export async function runSlotMealStep(
  admin: SupabaseClient,
  args: {
    userId: string;
    timezone: string | null;
    locale: string | null;
    muted: boolean;
    /**
     * `profiles.slot_meal_ask_enabled`, BRUT — le tri-état, pas un booléen
     * déjà réduit. La réduction vit dans `slotMealAskSwitchFrom`, et la faire
     * ici serait la deuxième écriture de la règle.
     *
     * ⛔ REQUIS, JAMAIS OPTIONNEL. Un champ omis se lirait `undefined`, donc
     * comme « personne n'a choisi » — c'est-à-dire que l'extinction de quelqu'un
     * serait silencieusement ignorée par tout appelant qui oublie de le passer.
     */
    askEnabled: boolean | null;
    now: Date;
    dryRun?: boolean;
    requestId?: string;
  },
): Promise<SlotMealStepOutcome> {
  const zone = String(args.timezone ?? "").trim();
  if (!zone) {
    return { verdict: { ask: false, reason: "not_elapsed" }, delivered: false };
  }
  if (args.muted) {
    return { verdict: { ask: false, reason: "muted" }, delivered: false };
  }
  const today = localDateInZone(zone, args.now);
  const localHour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hour: "numeric",
      hour12: false,
    }).format(args.now),
  );

  // ⚠️ 🔴 `eating_rhythm` N'EST PAS UNE COLONNE — MESURÉ EN RUN RÉEL LE
  // 2026-09-02. Ce SELECT la nommait, et PostgREST rendait 42703 pour CHAQUE
  // élève: 629 sur 669, c'est-à-dire tous ceux qui dépassaient la garde de
  // fuseau. Le canal C1 n'a jamais fonctionné une seule fois.
  //
  // Le rythme vit dans `practical_constraints.eating_rhythm` — une CLÉ du
  // jsonb, pas une colonne. C'est ce que lisent `generate-meal-v1` et
  // `meal-energy-v1`, et il fallait les lire plutôt que le supposer.
  //
  // C'est exactement la cicatrice que le commentaire de `keel-proactive-v1`
  // cite à propos de `content_locale` sur `profiles`: « ne nommer que des
  // colonnes qui existent ». Elle a été recopiée dans le job, et la faute a été
  // commise dans le module d'à côté.
  const goalsRes = await admin
    .from("student_goals")
    .select("goal, practical_constraints")
    .eq("user_id", args.userId)
    .maybeSingle();
  if (goalsRes.error) throw goalsRes.error;
  const row = (goalsRes.data ?? null) as Record<string, unknown> | null;
  // ⛔ `goalTokenOrNull`, PAS `parseGoalToken`. Ce dernier JETTE sur l'absence
  // (R7), et l'absence est le cas NOMINAL d'un balayage: 550 élèves sur 669
  // n'ont aucune ligne d'objectif. Mesuré le 2026-09-02 — le canal levait pour
  // eux, et le compte-rendu ressemblait à un canal qui se tait.
  const goal: GoalToken | null = goalTokenOrNull(row?.goal);

  // La CLÉ du jsonb, pas une colonne. Voir le pavé au-dessus.
  const rhythmRaw = (row?.practical_constraints as Record<string, unknown> | null)
    ?.eating_rhythm;
  const decide = (
    plannedToday: Parameters<typeof decideSlotMealAsk>[0]["plannedToday"],
    askedSlotsToday: readonly string[],
  ) =>
    decideSlotMealAsk({
      goal,
      muted: args.muted,
      askEnabled: args.askEnabled,
      plannedToday,
      localHour,
      rhythmRaw,
      askedSlotsToday,
    });

  // ── TROIS PASSES, DE LA MOINS CHÈRE À LA PLUS CHÈRE ────────────────────
  //
  // ⟳ 2026-09-24 — CE BALAYAGE TOURNE SUR TOUTE LA FLOTTE, TOUTES LES HEURES,
  // DANS UNE SEULE REQUÊTE. Le journal (`loadJournal`) relit la doctrine, la
  // garde de restriction et les plans: ~11 ms de CPU par compte. Chargé pour
  // chaque compte à chaque tick, il faisait tuer `keel-proactive-v1` par la
  // limite CPU du runtime vers la moitié de la liste — les comptes suivants
  // n'étaient jamais examinés, la question du soir (`day_meals`) comprise.
  //
  // Chaque passe ne fait que RETIRER des moments candidats (un moment composé
  // par le plan ne se demande plus, un moment déjà demandé non plus, un moment
  // que le journal ne rend pas non plus). Une passe qui ne trouve rien à
  // demander ne peut donc pas être contredite par la suivante: on s'arrête là.
  //
  // ① Sans aucune lecture: l'objectif, l'interrupteur, l'heure.
  const gate = decide([], []);
  if (!gate.ask) return { verdict: gate, delivered: false };

  // ② Le plan du jour et les questions déjà parties.
  const planned = await plannedSlotsToday(admin, {
    userId: args.userId,
    localDate: today,
    dayToken: dayTokenForLocalDate(today),
    resolveMemberId: () => memberIdOf(admin, args.userId),
  });
  const asked = await slotsAskedToday(admin, { userId: args.userId, today });
  const beforeJournal = decide(planned.slots, asked);
  if (!beforeJournal.ask) return { verdict: beforeJournal, delivered: false };

  // ③ Le journal: la même lecture que la page, qui retire les moments absents
  // (vacances), déjà déclarés, ou fermés par la garde de restriction.
  const journal = await loadJournal(admin, {
    userId: args.userId,
    from: today,
    to: today,
    requestId: `slot-meal:${today}`,
    forPrompts: true,
  });
  const eligible = new Set(promptEligibleJournalSlots(journal?.days[0]));
  const verdict = decide(
    planned.slots.filter((p) => eligible.has(p.slot)),
    [...asked, ...EATING_OCCASIONS.filter((s) => !eligible.has(s))],
  );
  if (!verdict.ask) return { verdict, delivered: false };
  if (args.dryRun) return { verdict, delivered: false, deliveryReason: "dry_run" };

  const message = verdict.origin === "planned"
    ? renderSlotMealAsk({
      locale: String(args.locale ?? "") || "en-US",
      localDate: today,
      slot: verdict.slot,
      origin: "planned",
      planned: verdict.planned,
    })
    : renderSlotMealAsk({
      locale: String(args.locale ?? "") || "en-US",
      localDate: today,
      slot: verdict.slot,
      origin: "uncovered",
    });
  const res = await deliverChatMessage(admin, {
    userId: args.userId,
    content: message.body,
    buttons: message.buttons,
    purpose: SLOT_MEAL_PURPOSE,
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
// LE FAIT
// ---------------------------------------------------------------------------

export type SlotMealFactOutcome = "written" | "already" | "failed";

/**
 * ÉCRIRE LE FAIT D'UN REPAS PRIS DEHORS, SUR UN CRÉNEAU NOMMÉ.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * R6 — LE CRÉNEAU EST FORCÉ, ET C'EST UNE PROPRIÉTÉ DE SIGNATURE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `slot` vient du JETON du bouton, qui l'a porté depuis la question. Rien ici
 * ne le déduit de l'horloge: l'inférence de FF-018 §11 range au dernier créneau
 * écoulé, ce qui tombe juste par accident sur une question qui NOMME le midi —
 * et faux dès que la personne répond le soir.
 *
 * ── « AUCUN ALIMENT INVENTÉ », COMME LA JUMELLE ─────────────────────────
 * Il n'existe AUCUN paramètre par lequel un `food_group_ref` ou un
 * `substance_ref` pourrait entrer. La personne a dit « j'ai mangé dehors »;
 * elle n'a nommé aucun aliment, et en fabriquer un serait une déduction dans la
 * table que le coach lit. Ce qu'elle écrira ENSUITE passe par le plancher de
 * déclaration, qui a le droit de nommer parce qu'il a une phrase à lire.
 */
export async function writeSlotMealFact(
  admin: SupabaseClient,
  args: {
    userId: string;
    localDate: string;
    slot: EatingOccasion;
    contentLocale: string;
    now: Date;
  },
): Promise<{ outcome: SlotMealFactOutcome; protocolEventId: string | null }> {
  const key = slotMealFactKey(args.localDate, args.slot);
  const inserted = await admin
    .from("protocol_events")
    .insert({
      user_id: args.userId,
      occurred_at: args.now.toISOString(),
      local_date: args.localDate,
      // ⛔ FORCÉ. Voir le pavé au-dessus.
      slot_key: args.slot,
      // Le geste est un TAP, et il vaut ce que vaut un tap (SCHEMA.md): 0,4.
      // Deux chiffres pour un même geste feraient diverger la couverture selon
      // le chemin.
      source: "quick_tap",
      evidence_weight: 0.4,
      plan_relation: "off_plan",
      meal_context: {
        version: 1,
        occurrenceId: `slot:${args.localDate}:${args.slot}`,
        relation: "outside",
        state: "reported",
        planRefs: [],
      },
      content_locale: args.contentLocale,
      source_message_id: key,
    } as never)
    .select("id")
    .maybeSingle();

  if (!inserted.error) {
    return {
      outcome: "written",
      protocolEventId: String((inserted.data as { id?: string } | null)?.id ?? "") || null,
    };
  }
  // 23505 = la ligne existe déjà. Un double tap ne fait qu'UNE ligne.
  if ((inserted.error as { code?: string }).code === "23505") {
    const existing = await admin
      .from("protocol_events")
      .select("id")
      .eq("user_id", args.userId)
      .eq("source_message_id", key)
      .maybeSingle();
    return {
      outcome: "already",
      protocolEventId: String((existing.data as { id?: string } | null)?.id ?? "") || null,
    };
  }
  console.warn(JSON.stringify({
    tag: "keel.slot_meal.fact_write_failed",
    user_id: args.userId,
    local_date: args.localDate,
    slot: args.slot,
    error: inserted.error.message,
  }));
  return { outcome: "failed", protocolEventId: null };
}
