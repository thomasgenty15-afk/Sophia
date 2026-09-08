/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LOT B.5 — LES CRÉNEAUX QUE LE PLAN COMPOSE AUJOURD'HUI, ET CE QUI RESTE À
 * COCHER DEDANS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * C1 n'interrogeait qu'un créneau explicitement marqué « je mange dehors ».
 * Ce module lui apporte la moitié qui manquait: les créneaux que le plan
 * COMPOSE, pour poser « tu as mangé le plat prévu ? » — une question à réponse
 * oui/non, qui coche quand la réponse est oui.
 *
 * ── ⛔ CE MODULE NE RÉIMPLÉMENTE PAS « QUEL PLAN POSSÈDE CE JOUR » ─────────
 * Cette règle est écrite UNE fois, dans `planned_dish_io.ts`
 * (`loadPlanRowOwningDay` + `ownerOfDay` + le repli foyer par
 * `resolvePlanScope`), et on l'appelle. Deux implémentations divergeraient au
 * premier correctif, et c'est celle qu'on relit le moins qui servirait le plat
 * du mauvais jour.
 *
 * ⛔ ET ON NE PASSE PAS PAR `loadPlannedDishContext`. Elle charge le catalogue
 * `food_items` ENTIER avant tout et rend `load_failed` s'il est vide: sur un
 * balayage horaire de toute la flotte, ce serait une lecture de table par
 * élève pour un filtre qui n'en a pas besoin.
 *
 * ── LE FILTRE A8.3, ET POURQUOI IL EST ICI PLUTÔT QU'EN AVAL ──────────────
 * Un plat peut être DÉDIÉ à une bouche (`member_id`). Sans ce filtre, un
 * profil réclamé recevrait « tu as mangé la compote de Cy ? » — le plat composé
 * pour l'enfant. Ce n'est pas une hypothèse: c'est mesuré en run réel le
 * 2026-09-03, sur la bande du soir, et c'est ce qui a fait ajouter `member_id`
 * au type serveur.
 *
 * ⚠️ `memberId` À `null` FERME LE PLAT DÉDIÉ. `null` veut dire « on n'a pas su
 * lire quelle bouche est la sienne », pas « il n'en a pas » — et le pire cas
 * de ce sens-là est une question qui manque, contre un fait de consommation
 * fabriqué sur le plat d'un tiers dans l'autre sens. `dishIsForMouth` porte
 * déjà exactement cet arbitrage; on l'appelle.
 */

import { dishIsForMouth, type PlannedDish } from "./planned_dish_match.ts";
import { loadPlanRowOwningDay } from "./planned_dish_io.ts";
import { MEAL_TICK_PREFIX, mealTickKey } from "./meal_tick.ts";
import { EATING_OCCASIONS, type EatingOccasion } from "./meal_generation.ts";
import type { PlannedSlot } from "./slot_meal_ask.ts";

/** Structural type: les tests injectent un faux, la prod un SupabaseClient. */
// deno-lint-ignore no-explicit-any
type Db = any;

/**
 * Le texte d'une erreur, y compris quand ce n'en est PAS une.
 *
 * ⚠️ POSTGREST NE LÈVE PAS DES `Error`. Il rend un objet `{code, message,
 * details, hint}`, et `String(...)` dessus donne `[object Object]` — un
 * journal qui ne dit rien au moment exact où il devrait tout dire.
 */
function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  const e = (error ?? {}) as Record<string, unknown>;
  return [e.code, e.message, e.details, e.hint]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .join(" — ") || String(error);
}

/**
 * ⚠️ POURQUOI UN MOTIF PLUTÔT QU'UN TABLEAU VIDE.
 *
 * « Le plan ne compose rien aujourd'hui » et « on n'a pas su lire le plan » se
 * rendraient tous deux par `[]`, et le second ferait taire la question pour
 * toute une flotte sans qu'aucun compteur ne bouge. Le motif entre dans le
 * compte-rendu du cron; c'est lui qui distingue une journée calme d'une panne.
 */
export const PLANNED_SLOTS_REASONS = [
  "composed",
  "no_plan",
  "nothing_today",
  "load_failed",
] as const;
export type PlannedSlotsReason = (typeof PLANNED_SLOTS_REASONS)[number];

export interface PlannedSlotsToday {
  readonly slots: readonly PlannedSlot[];
  readonly reason: PlannedSlotsReason;
}

const EMPTY = (reason: PlannedSlotsReason): PlannedSlotsToday => ({
  slots: [],
  reason,
});

function dayIndexOf(startsOn: string, localDate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) return null;
  const a = Date.UTC(
    Number(startsOn.slice(0, 4)),
    Number(startsOn.slice(5, 7)) - 1,
    Number(startsOn.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(localDate.slice(0, 4)),
    Number(localDate.slice(5, 7)) - 1,
    Number(localDate.slice(8, 10)),
  );
  const days = Math.round((b - a) / 86_400_000);
  return Number.isFinite(days) ? days : null;
}

const DAY_TOKENS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

/**
 * Les créneaux composés AUJOURD'HUI, avec leurs plats encore sans coche.
 *
 * ⚠️ UN CRÉNEAU DONT TOUS LES PLATS SONT DÉJÀ COCHÉS NE SORT PAS. La question
 * « tu as mangé le plat prévu ? » posée sur un plat déjà coché redemanderait ce
 * que la personne vient de dire — c'est R2, et c'est aussi ce qui remplace la
 * garde de collision qu'un chantier précédent avait dû prévoir contre la bande
 * du soir (laquelle est désarmée depuis le 2026-09-07).
 */
export async function plannedSlotsToday(
  db: Db,
  args: {
    userId: string;
    localDate: string;
    dayToken: string;
    /**
     * LA BOUCHE DE LA PERSONNE, RÉSOLUE PARESSEUSEMENT.
     *
     * ⚠️ UNE FONCTION, PAS UNE VALEUR, ET C'EST UNE DÉCISION DE COÛT. Ce
     * chemin tourne sur TOUTE la flotte, toutes les heures. La bouche ne sert
     * qu'au filtre A8.3, qui n'a d'objet que si le plan porte au moins un plat
     * DÉDIÉ (`member_id`) — ce qui est rare. On ne la lit donc que là, et une
     * lecture en panne rend `null`, ce qui FERME le plat dédié (bonne
     * direction: une question qui manque plutôt qu'un fait fabriqué sur le
     * plat d'un tiers).
     */
    resolveMemberId: () => Promise<string | null>;
  },
): Promise<PlannedSlotsToday> {
  let row: Record<string, unknown> | null = null;
  try {
    row = await loadPlanRowOwningDay(db, {
      userId: args.userId,
      localDate: args.localDate,
      columns: "id, dishes, starts_on, duration_days",
    });
  } catch (error) {
    console.warn(JSON.stringify({
      tag: "keel.slot_meal.planned_unreadable",
      user_id: args.userId,
      local_date: args.localDate,
      error: errorText(error),
      effect: "aucun creneau compose ce tour: la question du repas se tait",
    }));
    return EMPTY("load_failed");
  }
  if (!row) return EMPTY("no_plan");

  const mealId = String(row.id ?? "").trim();
  if (!mealId) return EMPTY("no_plan");

  // ── QUEL JOUR DU PLAN EST AUJOURD'HUI ───────────────────────────────────
  //
  // Les plats portent un jeton de jour (`wed`), pas une date. Sur un plan d'un
  // seul jour, un plat SANS jeton appartient à aujourd'hui par construction —
  // c'est la même lecture que `household_turn_context.ts`.
  const startsOn = String(row.starts_on ?? "");
  const duration = Math.max(1, Number(row.duration_days) || 1);
  const offset = dayIndexOf(startsOn, args.localDate);
  if (offset === null || offset < 0 || offset >= duration) {
    return EMPTY("nothing_today");
  }
  const wanted = String(args.dayToken ?? "").trim().toLowerCase();
  if (!(DAY_TOKENS as readonly string[]).includes(wanted)) {
    return EMPTY("nothing_today");
  }

  const dishes = Array.isArray(row.dishes)
    ? (row.dishes as PlannedDish[])
    : [];

  // ── LA BOUCHE, SEULEMENT SI ELLE SERT ───────────────────────────────────
  let memberId: string | null = null;
  if (dishes.some((d) => String(d?.member_id ?? "").trim() !== "")) {
    try {
      memberId = await args.resolveMemberId();
    } catch (error) {
      console.warn(JSON.stringify({
        tag: "keel.slot_meal.member_unreadable",
        user_id: args.userId,
        error: errorText(error),
        effect: "fail-closed: les plats DEDIES sont ecartes",
      }));
      memberId = null;
    }
  }

  // ── LES CANDIDATS, PAR CRÉNEAU ──────────────────────────────────────────
  const bySlot = new Map<EatingOccasion, { indexes: number[]; title: string }>();
  dishes.forEach((dish, index) => {
    const slot = String(dish?.slot ?? "").trim().toLowerCase();
    if (!(EATING_OCCASIONS as readonly string[]).includes(slot)) return;
    const day = String(
      (dish as unknown as { day?: unknown })?.day ?? "",
    ).trim().toLowerCase();
    // Un plat sans jour n'appartient à aujourd'hui QUE sur un plan d'un jour.
    if (day === "" ? duration !== 1 : day !== wanted) return;
    const title = String(dish?.title ?? "").trim();
    if (title === "") return;
    if (!dishIsForMouth(dish, memberId)) return;

    const key = slot as EatingOccasion;
    const cell = bySlot.get(key) ?? { indexes: [], title };
    cell.indexes.push(index);
    // ⚠️ LE PREMIER TITRE GAGNE, et il suffit: la question NOMME un plat pour
    // que le « Oui » ne soit pas une signature en blanc. Les énumérer tous
    // ferait une bulle illisible sur un créneau à trois plats.
    bySlot.set(key, cell);
  });
  if (bySlot.size === 0) return EMPTY("nothing_today");

  // ── CE QUI EST DÉJÀ COCHÉ SORT ──────────────────────────────────────────
  const all = [...bySlot.values()].flatMap((c) => c.indexes);
  const answered = await answeredDishIndexes(db, {
    userId: args.userId,
    mealId,
    indexes: all,
  });

  const slots: PlannedSlot[] = [];
  for (const [slot, cell] of bySlot) {
    const open = cell.indexes.filter((i) => !answered.has(i));
    if (open.length === 0) continue;
    slots.push({ slot, mealId, dishIndexes: open, title: cell.title });
  }
  return slots.length === 0
    ? EMPTY("nothing_today")
    : { slots, reason: "composed" };
}

/**
 * Les index de plats qui portent DÉJÀ une ligne de coche.
 *
 * ⚠️ FAIL-CLOSED VERS « TOUT EST RÉPONDU ». Une lecture en panne rend
 * l'ensemble complet, donc aucune question ne part. Le pire cas de ce sens-là
 * est un silence d'un tour; le pire cas de l'autre serait de redemander à
 * quelqu'un ce qu'il vient de déclarer — et R2 existe précisément contre ça.
 */
export async function answeredDishIndexes(
  db: Db,
  args: { userId: string; mealId: string; indexes: readonly number[] },
): Promise<ReadonlySet<number>> {
  const wanted = [...new Set(args.indexes)];
  if (wanted.length === 0) return new Set();
  const keys = wanted.map((i) => mealTickKey(args.mealId, i));
  try {
    // ⚠️ `source_message_id`, ET SURTOUT PAS `key`. `protocol_events` N'A PAS
    // de colonne `key` — mesuré en run réel le 2026-09-08: la requête levait,
    // le fail-closed ci-dessous tenait TOUT pour répondu, et la question du
    // créneau composé ne partait JAMAIS. Elle était remplacée en silence par
    // celle du créneau non couvert, ce qui est exactement le genre de défaut
    // qu'un test unitaire ne voit pas: le stub, lui, répondait à `key`.
    //
    // C'est `writeMealTick` (`evening_strip_io.ts`) qui pose la clé, et il
    // l'écrit dans `source_message_id`. La même erreur avait été commise dans
    // les requêtes de preuve de la migration `20260908010000`.
    const { data, error } = await db
      .from("protocol_events")
      .select("source_message_id")
      .eq("user_id", args.userId)
      .in("source_message_id", keys);
    if (error) throw error;
    const seen = new Set<number>();
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const key = String(row?.source_message_id ?? "");
      if (!key.startsWith(MEAL_TICK_PREFIX)) continue;
      const at = key.lastIndexOf(":");
      const index = Number(key.slice(at + 1));
      if (Number.isInteger(index)) seen.add(index);
    }
    return seen;
  } catch (error) {
    console.warn(JSON.stringify({
      tag: "keel.slot_meal.ticks_unreadable",
      user_id: args.userId,
      meal_id: args.mealId,
      // ⚠️ UNE ERREUR POSTGREST N'EST PAS UNE `Error`. `String(error)` rendait
      // `[object Object]`, et le journal ne disait donc PAS que la colonne
      // n'existait pas — c'est ce qui a fait chercher ailleurs. Même
      // dépliage que `keel-daily-pulse-v1` le faisait pour le plancher.
      error: errorText(error),
      effect: "fail-closed: tout est tenu pour repondu, aucune question ne part",
    }));
    return new Set(wanted);
  }
}
