/**
 * FF-057 — LA COQUILLE D'I/O DE LA PROCÉDURE ACCIDENT: lire le plan réel,
 * écrire le fait, faire glisser les dates.
 *
 * `accident.ts` DÉCIDE et JUGE (pur, testé). Ce module LIT et ÉCRIT. Même
 * frontière que partout dans `_shared/keel/`.
 *
 * ── LE CLIENT QUI ÉCRIT EST NOMMÉ, ET SES DROITS SONT PROUVÉS ──────────────
 * Cicatrice du 2026-08-11 (FF-056): un routeur passait le client porté par le
 * JWT de l'ÉLÈVE — rôle `authenticated`, `SELECT` seulement sur la table visée —
 * et le `as never` du site d'appel rendait la faute invisible au typecheck.
 * Symptôme: tout marche, rien ne s'écrit, chaque tour repart de zéro. Ici le
 * paramètre s'appelle `admin`, il est typé `SupabaseClient`, et AUCUN `as` ne le
 * traverse. Les droits sont vérifiés au rapport, table par table.
 *
 * ── LE `.eq("user_id")` N'EST PAS DÉCORATIF ────────────────────────────────
 * Tous les identifiants qui entrent ici viennent de la CHARGE D'UN BOUTON,
 * c'est-à-dire d'une chaîne que le client contrôle, et ce chemin tourne sous
 * `service_role` (la RLS ne s'applique pas, `auth.uid()` vaut NULL). Chaque
 * lecture et chaque écriture filtre donc sur le porteur du JWT. C'est la
 * cicatrice `rls-is-not-a-substitute-for-eq-user-id`, et FF-058 l'a payée deux
 * fois en run adversarial (H1, H2) sur exactement cette forme de charge.
 *
 * ── LE GLISSEMENT ÉCRIT, PUIS RELIT — ET SEULEMENT ALORS ON ACCUSE ─────────
 * `applyPlanShift` n'accuse rien. Elle recalcule, écrit sous verrou optimiste,
 * RELIT la ligne, reparse, et vérifie que l'empreinte du plan relu est bien
 * celle du plan décalé. Un « c'est fait » sans ligne relue est l'accusé fantôme,
 * le défaut le plus cher de ce dépôt.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import {
  type AccidentPlan,
  cascadeSkippedSession,
  cascadeSkippedWave,
  type DoneWave,
  MAX_FRIDGE_DAYS,
  parseAccidentPlan,
  planDates,
  planGroceryWavesForPlan,
  planSessionShift,
  planShiftFingerprint,
  type ShiftOutcome,
  type ShiftRefusal,
  shiftPlanDates,
} from "./accident.ts";
import { GROCERY_WAVE_STATE_TABLE } from "./evening_strip_io.ts";
import { PERISHABLE_AISLES } from "./grocery_waves.ts";
import { MEAL_TICK_PREFIX, parseMealTickKey } from "./meal_tick.ts";
import { isReportable } from "./meal_stretch.ts";

/** La table de l'état de session. Une seule constante à citer. */
export const COOKING_SESSION_STATE_TABLE = "cooking_session_states";

/** Les colonnes du plan dont cette fiche a besoin. Une seule liste. */
const PLAN_COLUMNS =
  "id, dishes, preparations, cooking_sessions, shopping_list, starts_on, duration_days, content_locale, updated_at, generated_from";

export interface LoadedAccidentPlan {
  plan: AccidentPlan;
  contentLocale: string;
  /** Le jeton de verrou optimiste du glissement. Voir `applyPlanShift`. */
  updatedAt: string;
  /**
   * LES TABLEAUX BRUTS, tels qu'ils sont en base.
   *
   * ⚠️ INDISPENSABLES AU GLISSEMENT. `AccidentPlan` ne porte qu'un
   * sous-ensemble des champs (ni méthode, ni ingrédients, ni minutes, ni
   * `run_through`): reconstruire le payload depuis lui EFFACERAIT tout le reste
   * de la ligne. On garde donc les tableaux d'origine et on n'y change que les
   * trois clés de date.
   */
  raw: {
    dishes: Record<string, unknown>[];
    preparations: Record<string, unknown>[];
    sessions: Record<string, unknown>[];
    /**
     * `generated_from` tel qu'il est en base — relu pour y APPOSER la trace
     * d'un glissement (`shifts[]`, D7.3), jamais pour le réécrire.
     */
    generatedFrom: unknown;
  };
}

/**
 * D7.3 (2026-09-03) — LA TRACE D'UN GLISSEMENT, dans `generated_from.shifts[]`.
 *
 * Un glissement ne laissait qu'un `updated_at`: la page de suivi (P7) ne
 * pouvait pas compter « plans modifiés » sans deviner. La trace est APPOSÉE:
 * tout ce que `generated_from` portait survit, et un `shifts` qui ne serait pas
 * un tableau est remplacé plutôt qu'accumulé (on ne pousse pas dans une valeur
 * qu'on ne sait pas lire). Aucun modèle, aucune décision: un fait daté du jour
 * LOCAL du tap, parce que c'est ce jour-là que le plan a changé pour la
 * personne.
 */
export interface PlanShiftTrace {
  cook_on: string;
  delta: number;
  new_cook_on: string;
  moved_dish_indexes: number[];
  applied_on: string;
}

export function withShiftTrace(
  generatedFrom: unknown,
  entry: PlanShiftTrace,
): Record<string, unknown> {
  const base = generatedFrom && typeof generatedFrom === "object" &&
      !Array.isArray(generatedFrom)
    ? { ...(generatedFrom as Record<string, unknown>) }
    : {};
  const previous = Array.isArray(base.shifts) ? base.shifts : [];
  return { ...base, shifts: [...previous, entry] };
}

/**
 * LE PLAN, RELU DEPUIS SA LIGNE — et il doit être le SIEN.
 *
 * `retired_at` n'est PAS filtré ici, volontairement: un tap peut arriver
 * quelques minutes après qu'un plan a été remplacé, et le fait « ce plat n'a pas
 * eu lieu » reste vrai sur le plan qui l'annonçait. C'est le GLISSEMENT qui
 * refuse de toucher un plan retiré (voir `applyPlanShift`), parce que déplacer
 * les dates d'un plan que personne ne lit plus n'a aucun effet visible.
 */
export async function loadAccidentPlan(
  admin: SupabaseClient,
  args: { userId: string; mealId: string },
): Promise<LoadedAccidentPlan | null> {
  const { data, error } = await admin
    .from("student_generated_meals")
    .select(PLAN_COLUMNS)
    .eq("id", args.mealId)
    .eq("user_id", args.userId)
    .maybeSingle();
  if (error) {
    console.warn(JSON.stringify({
      tag: "keel.accident.plan_unreadable",
      user_id: args.userId,
      meal_id: args.mealId,
      error: error.message,
    }));
    return null;
  }
  const row = (data ?? null) as Record<string, unknown> | null;
  if (!row) return null;
  const plan = parseAccidentPlan(args.mealId, row);
  if (!plan) return null;
  const arrayOf = (v: unknown): Record<string, unknown>[] =>
    Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
  return {
    plan,
    contentLocale: String(row.content_locale ?? "").trim() || "en-GB",
    updatedAt: String(row.updated_at ?? ""),
    raw: {
      dishes: arrayOf(row.dishes),
      preparations: arrayOf(row.preparations),
      sessions: arrayOf(row.cooking_sessions),
      generatedFrom: row.generated_from ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// LES COCHES VIVANTES — le FAIT qui bat la déclaration de session
// ---------------------------------------------------------------------------

/**
 * Les index de plats de CE plan qui portent une coche VIVANTE.
 *
 * « Vivante » = `disqualified_reason is null`. Une ligne décochée survit
 * (append-only, `meal_tick.ts`) et ne compte pas comme un repas mangé.
 *
 * ⚠️ ON FILTRE SUR LE PRÉFIXE **ET** ON REPARSE LA CLÉ. Un plan COURANT et un
 * plan SUIVANT portent des coches au même préfixe: `startsWith("meal_tick:")`
 * ferait compter les coches de l'autre plan, et c'est le « 5 des 3 » que
 * `meal_tick.ts` documente. Le `like` sert seulement à ne pas rapatrier tout
 * l'historique; c'est `parseMealTickKey` qui tranche.
 */
export async function loadLiveTickIndexes(
  admin: SupabaseClient,
  args: { userId: string; mealId: string },
): Promise<number[]> {
  const { data, error } = await admin
    .from("protocol_events")
    .select("source_message_id")
    .eq("user_id", args.userId)
    .is("disqualified_reason", null)
    .like("source_message_id", `${MEAL_TICK_PREFIX}%`)
    .limit(500);
  // ⚠️ « erreur » et « vide » ne se confondent pas. Une sonde qui les mélange a
  // déjà fait déclarer « aucun fait écrit » sur des scénarios qui en écrivaient
  // trois (cicatrice du 2026-08-11). Ici l'erreur rend `[]`, mais elle est
  // TRACÉE — et l'appelant en tire la conséquence sûre: sans coche connue, la
  // cascade invalide plus, pas moins. C'est le seul sens conservateur possible.
  if (error) {
    console.warn(JSON.stringify({
      tag: "keel.accident.ticks_unreadable",
      user_id: args.userId,
      meal_id: args.mealId,
      error: error.message,
    }));
    return [];
  }
  const out: number[] = [];
  for (const row of (data ?? []) as Array<{ source_message_id?: string }>) {
    const parsed = parseMealTickKey(row?.source_message_id);
    if (!parsed || parsed.mealId !== args.mealId) continue;
    out.push(parsed.dishIndex);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// L'ÉTAT DES SESSIONS — un ÉTAT, pas un journal
// ---------------------------------------------------------------------------

export interface SessionStateRow {
  cookOn: string;
  happened: boolean;
}

/**
 * Les sessions de ce plan dont on SAIT quelque chose.
 *
 * L'absence d'entrée EST « on ne sait pas » — jamais `false`. C'est ce qui
 * autorise l'appelant à poser la question UNE seule fois par session: dès qu'une
 * ligne existe, la question ne se repose pas.
 */
export async function loadSessionStates(
  admin: SupabaseClient,
  args: { userId: string; mealId: string },
): Promise<SessionStateRow[]> {
  const { data, error } = await admin
    .from(COOKING_SESSION_STATE_TABLE)
    .select("cook_on, happened")
    .eq("user_id", args.userId)
    .eq("generated_meal_id", args.mealId);
  if (error) {
    console.warn(JSON.stringify({
      tag: "keel.accident.session_states_unreadable",
      user_id: args.userId,
      meal_id: args.mealId,
      error: error.message,
    }));
    // FAIL-CLOSED VERS LE SILENCE: sans état lisible, l'appelant ne pose pas la
    // question et n'invalide rien. Le pire cas est une question qui ne part pas;
    // le pire cas de l'inverse est une cascade sur une lecture en panne.
    return [];
  }
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    cookOn: String(r.cook_on ?? ""),
    happened: Boolean(r.happened),
  })).filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.cookOn));
}

export type SessionStateOutcome = "written" | "failed";

/**
 * La session de ce jour a eu lieu, ou pas.
 *
 * `on conflict do update` sur `(user_id, generated_meal_id, cook_on)`. Ce n'est
 * PAS append-only, et c'est la différence assumée avec les coches de repas: une
 * coche est un fait daté, l'exécution d'une session est un état. Quelqu'un qui
 * dit « non » à 20 h puis cuisine à 22 h a cuisiné.
 */
export async function writeSessionState(
  admin: SupabaseClient,
  args: {
    userId: string;
    mealId: string;
    cookOn: string;
    happened: boolean;
    answeredLocalDate: string;
    now: Date;
  },
): Promise<{ outcome: SessionStateOutcome; detail?: string }> {
  // ⚠️ LE PLAN DOIT ÊTRE LE SIEN. Le `mealId` vient de la charge d'un bouton, la
  // FK ne contraint que l'EXISTENCE de la ligne, et ce chemin tourne sous
  // `service_role`. Sans cette vérification, une charge forgée écrirait un état
  // de session attaché à la composition de quelqu'un d'autre — c'est-à-dire une
  // ligne qui ferait disparaître des repas du plan de la victime.
  const owner = await admin
    .from("student_generated_meals")
    .select("id")
    .eq("id", args.mealId)
    .eq("user_id", args.userId)
    .maybeSingle();
  if (owner.error || !owner.data) {
    console.warn(JSON.stringify({
      tag: "keel.accident.session_state_foreign_plan",
      user_id: args.userId,
      meal_id: args.mealId,
      error: owner.error?.message ?? "not_owned",
    }));
    return { outcome: "failed", detail: "plan_not_owned" };
  }

  const { error } = await admin
    .from(COOKING_SESSION_STATE_TABLE)
    .upsert({
      user_id: args.userId,
      generated_meal_id: args.mealId,
      cook_on: args.cookOn,
      happened: args.happened,
      answered_at: args.now.toISOString(),
      answered_local_date: args.answeredLocalDate,
    } as never, { onConflict: "user_id,generated_meal_id,cook_on" });
  if (error) {
    console.warn(JSON.stringify({
      tag: "keel.accident.session_state_write_failed",
      user_id: args.userId,
      meal_id: args.mealId,
      cook_on: args.cookOn,
      error: error.message,
    }));
    return { outcome: "failed", detail: error.message };
  }
  return { outcome: "written" };
}

// ---------------------------------------------------------------------------
// LES VAGUES DÉJÀ FAITES — et leur DATE D'ACHAT RÉELLE
// ---------------------------------------------------------------------------

/**
 * Les vagues de courses de ce plan déclarées FAITES, avec la date réelle.
 *
 * ⚠️ `answered_local_date` EST LA DATE D'ACHAT, PAS `buy_on`. C'est le piège le
 * plus coûteux de la fiche (§9): quelqu'un qui a fait la vague de lundi le
 * samedi d'avant a du frais au frigo depuis samedi. Compter la fenêtre frigo
 * depuis le `buyOn` THÉORIQUE donnerait deux jours de marge qui n'existent pas —
 * rien n'échoue, rien ne lève, et on trouve du poulet gâté trois jours plus
 * tard.
 *
 * Le caractère périssable vient de la vague RECALCULÉE, pas d'une colonne: la
 * table d'état ne porte que le booléen, et c'est `planGroceryWaves` qui sait
 * quels articles tombent dans quelle vague.
 */
export async function loadDoneWaves(
  admin: SupabaseClient,
  args: { userId: string; plan: AccidentPlan },
): Promise<DoneWave[]> {
  const { data, error } = await admin
    .from(GROCERY_WAVE_STATE_TABLE)
    .select("buy_on, done, answered_local_date")
    .eq("user_id", args.userId)
    .eq("generated_meal_id", args.plan.mealId)
    .eq("done", true);
  if (error) {
    console.warn(JSON.stringify({
      tag: "keel.accident.done_waves_unreadable",
      user_id: args.userId,
      meal_id: args.plan.mealId,
      error: error.message,
    }));
    // FAIL-CLOSED DU CÔTÉ DE LA SÉCURITÉ ALIMENTAIRE: on ne sait pas ce qui est
    // au frigo. On rend UNE vague fictive achetée au début du plan et portant
    // TOUS les termes périssables, pour que `perishables_at_risk` puisse mordre
    // plutôt que de laisser glisser à l'aveugle. Le pire cas est un décalage
    // refusé à tort — la personne garde son plan; le pire cas de l'inverse est
    // un aliment gâté, et le produit promet exactement le contraire.
    return [{
      buyOn: args.plan.startsOn,
      purchasedOn: args.plan.startsOn,
      perishableTerms: perishableTermsOf(args.plan),
    }];
  }

  const waves = planGroceryWavesForPlan(args.plan);
  const byBuyOn = new Map(waves.map((w) => [w.buyOn, w.items]));
  const out: DoneWave[] = [];
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const buyOn = String(row.buy_on ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(buyOn)) continue;
    // ⚠️ LA DATE D'ACHAT RÉELLE (`answered_local_date`), jamais le `buyOn`
    // théorique. Quelqu'un qui a fait la vague de lundi le samedi d'avant a du
    // frais au frigo depuis samedi, et compter depuis lundi donnerait deux jours
    // de marge qui n'existent pas (fiche §9).
    const purchasedOn = String(row.answered_local_date ?? "") || buyOn;
    const items = byBuyOn.get(buyOn) ?? [];
    out.push({
      buyOn,
      purchasedOn,
      // Les TERMES, pas un booléen: c'est ce qui permet de savoir quelle cuisson
      // chaque aliment attend, donc de ne refuser que sur ce qui bouge.
      perishableTerms: items
        .filter((i) => PERISHABLE_AISLES.has(String(i.aisle)))
        .map((i) => i.term),
    });
  }
  return out;
}

/** Tous les termes périssables du plan — le repli fail-closed de ci-dessus. */
function perishableTermsOf(plan: AccidentPlan): string[] {
  return plan.shoppingList
    .filter((i) => PERISHABLE_AISLES.has(String(i.aisle)))
    .map((i) => i.term);
}

// ---------------------------------------------------------------------------
// CE QUI EST DÉJÀ CUISINÉ — deux preuves, aucune supposition
// ---------------------------------------------------------------------------

/**
 * Les préparations dont on a la PREUVE qu'elles ont été cuisinées.
 *
 * Deux sources, et aucune n'est une déduction:
 *   1. une session déclarée `happened = true` ⇒ tout ce qu'elle cuisait existe;
 *   2. un plat qui PUISE dans une préparation et qui porte une coche vivante ⇒
 *      quelqu'un l'a mangé, donc la casserole a tourné. C'est le même principe
 *      que « le fait bat la déclaration » de la cascade, appliqué à l'envers.
 *
 * C'est ce qui arme `already_cooked` (R14): on ne décale pas ce qui existe.
 */
export function cookedPreparationIds(args: {
  plan: AccidentPlan;
  sessionStates: readonly SessionStateRow[];
  liveTickIndexes: readonly number[];
}): string[] {
  const dates = planDates(args.plan);
  const cooked = new Set<string>();

  const happened = new Set(
    args.sessionStates.filter((s) => s.happened).map((s) => s.cookOn),
  );
  for (const session of args.plan.sessions) {
    if (!happened.has(dates[session.day] ?? "")) continue;
    for (const id of session.preparationIds) cooked.add(id);
  }

  const ticked = new Set(args.liveTickIndexes);
  for (const dish of args.plan.dishes) {
    if (!ticked.has(dish.dishIndex)) continue;
    for (const id of dish.preparationIds) cooked.add(id);
  }

  return [...cooked].sort();
}

/**
 * LES PLATS QUI N'EXISTENT PAS — parce qu'une session n'a pas eu lieu.
 *
 * ⚠️ C'EST LE LECTEUR QUI FAIT VIVRE LA CASCADE. Rien n'est écrit par elle: le
 * fait stocké est le marqueur de session, un seul, et « quels repas tombent » se
 * DÉRIVE ici à chaque lecture. C'est la doctrine de `grocery_waves.ts` (« les
 * vagues se calculent à la lecture »), et elle évite le défaut que ce dépôt paie
 * en boucle: un second état à invalider dont l'écrivain finit par disparaître.
 *
 * Tout appelant qui ANNONCE des plats doit passer par ici — sinon le plan
 * continue d'annoncer un plat qui n'a jamais été cuisiné, ce qui est le défaut
 * d'origine de la fiche.
 */
export async function loadSkippedDishIndexes(
  admin: SupabaseClient,
  args: {
    /** LA PERSONNE: ses coches vivantes font survivre un plat (R4). */
    userId: string;
    /**
     * LE COMPTE QUI A ÉCRIT LE PLAN — celui sous lequel les états de cuisson
     * et de courses sont écrits. REQUIS, jamais déduit de `userId`.
     *
     * A8.0 (2026-09-03): pour un profil réclamé, le plan est celui du foyer
     * et ses états sont ceux du MAÎTRE. Lire ces états sous le `user_id` du
     * membre rendait `[]` en silence: la cascade d'une session ratée
     * n'amputait jamais sa bande, et le plan lui annonçait un plat que
     * personne n'avait cuisiné. Un paramètre optionnel replié sur `userId`
     * aurait laissé ce défaut invisible chez tout appelant qui l'oublie.
     */
    statesOwnerId: string;
    plan: AccidentPlan;
  },
): Promise<number[]> {
  const [states, ticked, missedWaves] = await Promise.all([
    loadSessionStates(admin, {
      userId: args.statesOwnerId,
      mealId: args.plan.mealId,
    }),
    loadLiveTickIndexes(admin, {
      userId: args.userId,
      mealId: args.plan.mealId,
    }),
    loadMissedWaveBuyOns(admin, {
      userId: args.statesOwnerId,
      mealId: args.plan.mealId,
    }),
  ]);

  const out = new Set<number>();

  for (const state of states.filter((s) => !s.happened)) {
    const cascade = cascadeSkippedSession({
      plan: args.plan,
      cookOn: state.cookOn,
      tickedDishIndexes: ticked,
    });
    for (const i of cascade.invalidatedDishIndexes) out.add(i);
  }

  // ── FF-061 R6 — LA VAGUE RATÉE INVALIDE AUSSI ──────────────────────────
  if (missedWaves.length > 0) {
    // ⚠️ `servesCookDates`, JAMAIS `servesCookOn`. Ce dernier ne porte qu'une
    // cuisson et vaut `null` sur toute vague du premier jour — le motif complet
    // est sur le champ dans `grocery_waves.ts`.
    const waves = planGroceryWavesForPlan(args.plan);
    for (const buyOn of missedWaves) {
      const wave = waves.find((w) => w.buyOn === buyOn);
      if (!wave || wave.servesCookDates.length === 0) continue;
      const cascade = cascadeSkippedWave({
        plan: args.plan,
        cookDates: wave.servesCookDates,
        tickedDishIndexes: ticked,
      });
      for (const i of cascade.invalidatedDishIndexes) out.add(i);
    }
  }

  return [...out].sort((a, b) => a - b);
}

/**
 * LES VAGUES DÉCLARÉES NON FAITES. Jumelle exacte de `loadDoneWaves`.
 *
 * FAIL-OPEN, et c'est l'INVERSE de sa jumelle: une lecture en panne rend « on
 * ne sait pas », donc aucune invalidation. Le pire cas est un plan qui annonce
 * un plat de trop; celui de l'inverse serait un plan qui s'efface tout seul
 * pour une panne de Postgres — ce que ce dépôt appelle « effacer du réel », et
 * qui est pire que le mensonge qu'on cherche à corriger.
 */
export async function loadMissedWaveBuyOns(
  admin: SupabaseClient,
  args: { userId: string; mealId: string },
): Promise<string[]> {
  const { data, error } = await admin
    .from(GROCERY_WAVE_STATE_TABLE)
    .select("buy_on")
    .eq("user_id", args.userId)
    .eq("generated_meal_id", args.mealId)
    .eq("done", false);
  if (error) {
    console.warn(JSON.stringify({
      tag: "keel.accident.missed_waves_unreadable",
      user_id: args.userId,
      meal_id: args.mealId,
      error: error.message,
      effect: "fail-open: aucun plat invalide par une vague ce tour-ci",
    }));
    return [];
  }
  const rows = (data ?? []) as Array<{ buy_on?: unknown }>;
  return rows
    .map((row) => String(row.buy_on ?? "").trim())
    .filter((d: string) => d !== "");
}

/** Le glissement calculé pour cette session, depuis l'état RÉEL. */
export async function computeSessionShift(
  admin: SupabaseClient,
  args: {
    userId: string;
    plan: AccidentPlan;
    cookOn: string;
    /** REQUIS et passé — c'est ce qui rend le motif éprouvable par mutation. */
    maxFridgeDays?: number;
    /**
     * FF-061 R11 — le jour LOCAL de la personne. REQUIS.
     *
     * Une cuisson antérieure à ce jour ne se décale pas: on constate, on ne
     * répare pas. Le motif complet est sur `SHIFT_REFUSALS.session_elapsed`.
     */
    today: string;
    /** FF-061 R6ter — le décalage minimal, quand une VAGUE de courses bouge. */
    minDelta?: number;
  },
): Promise<ShiftOutcome> {
  const [sessionStates, liveTicks, doneWaves] = await Promise.all([
    loadSessionStates(admin, { userId: args.userId, mealId: args.plan.mealId }),
    loadLiveTickIndexes(admin, { userId: args.userId, mealId: args.plan.mealId }),
    loadDoneWaves(admin, { userId: args.userId, plan: args.plan }),
  ]);
  return planSessionShift({
    plan: args.plan,
    cookOn: args.cookOn,
    today: args.today,
    minDelta: args.minDelta,
    doneWaves,
    cookedPreparationIds: cookedPreparationIds({
      plan: args.plan,
      sessionStates,
      liveTickIndexes: liveTicks,
    }),
    maxFridgeDays: args.maxFridgeDays ?? MAX_FRIDGE_DAYS,
  });
}

// ---------------------------------------------------------------------------
// LE FAIT HORS PLAN, DEPUIS UN TAP — et AUCUN aliment inventé
// ---------------------------------------------------------------------------

export type OffPlanTapOutcome =
  | "written"
  | "already"
  /**
   * 🔴 L'index désigne un jour QUI N'EST PAS ENCORE ARRIVÉ. Rien n'est écrit.
   *
   * MESURÉ EN RUN ADVERSARIAL (H1), et c'est la cicatrice H1 de FF-058 rouverte
   * sur un SECOND écrivain: `writeMealTick` portait la garde `isReportable`,
   * celui-ci ne l'avait pas. Une charge forgée citant le plat de DEMAIN écrivait
   * `accident_off_plan:…:1|2026-08-13|off_plan` — un « j'ai mangé autre chose »
   * daté de demain, append-only, dans la table que le coach lit. Ce n'est pas
   * une imprécision, c'est une preuve fabriquée.
   */
  | "future"
  | "failed";

/**
 * ÉCRIRE UN FAIT `off_plan` DEPUIS UN BOUTON.
 *
 * ── POURQUOI CE CHEMIN EXISTE, ALORS QUE FF-009 EN A DÉJÀ UN ──────────────
 * Le chemin de FF-009 part d'un `TurnFrame` (plancher déterministe →
 * `runKeelDirectEffectLane` → intake → executor). Un tap n'a pas de frame: il
 * n'a ni message d'élève à analyser, ni composant alimentaire à extraire. Le
 * faire passer par la chaîne du tour demanderait de FABRIQUER une phrase, donc
 * exactement ce que la règle « aucun aliment inventé » interdit.
 *
 * On écrit donc la ligne comme `writeMealTick` l'écrit — même table, même
 * `source`, même `evidence_weight` — avec `plan_relation = 'off_plan'` et
 * `food_group_ref` ABSENT.
 *
 * ── « AUCUN ALIMENT INVENTÉ » EST UNE PROPRIÉTÉ DE CETTE FONCTION ─────────
 * Il n'y a AUCUN paramètre par lequel un `food_group_ref` ou un `substance_ref`
 * pourrait entrer. La règle n'est donc pas une discipline d'appelant: elle est
 * une impossibilité de signature. La fiche l'exige pour « j'ai mangé autre
 * chose », et l'appliquer aux trois boutons évite d'avoir deux écrivains dont un
 * seul est sûr.
 *
 * ── LA CLÉ EST DISTINCTE DE CELLE DE LA COCHE ─────────────────────────────
 * `accident_off_plan:<mealId>:<index>`, pas `meal_tick:…`. Les deux lignes
 * coexistent et disent deux choses différentes: la décoche dit « le plat prévu
 * n'a pas été mangé », le fait hors plan dit « quelque chose d'autre a été
 * mangé ». Les fondre ferait perdre l'une des deux, et `parseMealTickKey`
 * refuserait de toute façon de relire une clé qui n'est pas la sienne.
 */
export const ACCIDENT_OFF_PLAN_PREFIX = "accident_off_plan:";

export function accidentOffPlanKey(mealId: string, dishIndex: number): string {
  const id = String(mealId ?? "").trim();
  if (!id) throw new Error("[keel/accident_io] empty generated meal id");
  if (!Number.isInteger(dishIndex) || dishIndex < 0) {
    throw new Error(`[keel/accident_io] bad dish index ${dishIndex}`);
  }
  return `${ACCIDENT_OFF_PLAN_PREFIX}${id}:${dishIndex}`;
}

export interface OffPlanTapResult {
  outcome: OffPlanTapOutcome;
  key: string;
  /** L'identifiant de la ligne relue. C'est LUI qui prouve le fait. */
  protocolEventId: string | null;
  localDate: string;
  detail?: string;
}

export async function writeOffPlanTapFact(
  admin: SupabaseClient,
  args: {
    userId: string;
    mealId: string;
    dishIndex: number;
    /** Le créneau du plat, quand il est dans le vocabulaire fermé. */
    slotKey: string | null;
    contentLocale: string;
    /** La date LOCALE du repas concerné — celle du plat, pas celle du tap. */
    localDate: string;
    /**
     * LE JOUR LOCAL DE LA PERSONNE AU MOMENT DU TAP. REQUIS.
     *
     * ⚠️ C'EST LE PLAFOND, ET SON ABSENCE A ÉTÉ MESURÉE (H1). On rattrape le
     * passé, jamais le futur. Requis et non optionnel: optionnel, il aurait
     * laissé passer exactement le trou qu'il bouche — et c'est la définition
     * même d'une garde désarmée.
     */
    today: string;
    now: Date;
  },
): Promise<OffPlanTapResult> {
  const key = accidentOffPlanKey(args.mealId, args.dishIndex);

  // ⚠️ LE FUTUR NE SE DÉCLARE PAS. On réutilise LA garde du dépôt
  // (`isReportable`, de `meal_stretch.ts`) plutôt que d'en écrire une seconde:
  // deux définitions d'une même règle divergent, et c'est celle qu'on regarde le
  // moins qui garde l'ancienne.
  if (!isReportable(args.localDate, args.today)) {
    console.warn(JSON.stringify({
      tag: "keel.accident.off_plan_future_refused",
      user_id: args.userId,
      meal_id: args.mealId,
      dish_index: args.dishIndex,
      local_date: args.localDate,
      today: args.today,
    }));
    return {
      outcome: "future",
      key,
      protocolEventId: null,
      localDate: args.localDate,
      detail: "not_reportable_yet",
    };
  }

  const inserted = await admin
    .from("protocol_events")
    .insert({
      user_id: args.userId,
      occurred_at: args.now.toISOString(),
      local_date: args.localDate,
      slot_key: args.slotKey,
      // Le geste est un TAP, et il vaut ce que vaut un tap (SCHEMA.md, échelle
      // de preuve): 0.4, la même valeur que la coche. Deux chiffres pour un même
      // geste feraient diverger la couverture selon le chemin.
      source: "quick_tap",
      evidence_weight: 0.4,
      plan_relation: "off_plan",
      // ⚠️ AUCUN `food_group_ref`, AUCUN `substance_ref`, AUCUN `student_note`
      // qui nommerait un aliment. La personne a dit « pas ce qui était prévu »;
      // elle n'a nommé aucun aliment, et en fabriquer un serait une déduction
      // dans la table que le coach lit.
      content_locale: args.contentLocale,
      source_message_id: key,
    } as never)
    .select("id")
    .maybeSingle();

  if (!inserted.error) {
    const id = String((inserted.data as { id?: string } | null)?.id ?? "") ||
      null;
    return { outcome: "written", key, protocolEventId: id, localDate: args.localDate };
  }
  // 23505 = la ligne existe déjà (index unique partiel `(user_id,
  // source_message_id)`). Un double tap ne fait donc qu'UNE ligne, arbitré par
  // Postgres — rien à coder côté client.
  if ((inserted.error as { code?: string }).code === "23505") {
    const existing = await admin
      .from("protocol_events")
      .select("id")
      .eq("user_id", args.userId)
      .eq("source_message_id", key)
      .maybeSingle();
    const id = String((existing.data as { id?: string } | null)?.id ?? "") ||
      null;
    return { outcome: "already", key, protocolEventId: id, localDate: args.localDate };
  }
  console.warn(JSON.stringify({
    tag: "keel.accident.off_plan_write_failed",
    user_id: args.userId,
    meal_id: args.mealId,
    error: inserted.error.message,
  }));
  return {
    outcome: "failed",
    key,
    protocolEventId: null,
    localDate: args.localDate,
    detail: inserted.error.message,
  };
}

// ---------------------------------------------------------------------------
// LE GLISSEMENT — écrire des DATES, puis relire
// ---------------------------------------------------------------------------

export type ShiftApplyOutcome =
  /** Les dates ont bougé, et la relecture le confirme. */
  | { outcome: "applied"; newCookOn: string; movedDishIndexes: number[] }
  /** L'empreinte ne correspond plus: le plan a changé depuis la proposition. */
  | { outcome: "stale"; detail: string }
  /**
   * Le glissement recalculé est refusé, avec son MOTIF NOMMÉ (R14).
   *
   * ⚠️ `ShiftRefusal` et pas `string`: l'appelant rend une phrase par motif, et
   * un `string` l'aurait obligé à un `as` sur le site d'appel — c'est-à-dire à
   * désarmer le typecheck exactement là où un motif oublié doit se voir.
   */
  | { outcome: "refused"; reason: ShiftRefusal; detail: string }
  /** L'écriture n'a rien touché, ou la relecture ne la retrouve pas. */
  | { outcome: "unverified"; detail: string };

/**
 * APPLIQUER LE GLISSEMENT — RECALCULER, ÉCRIRE, PUIS RELIRE. Dans cet ordre.
 *
 * ── L'ORDRE EST LA GARANTIE, ET IL N'EST PAS NÉGOCIABLE ───────────────────
 *   1. relire le plan et recalculer son empreinte. Différente de celle portée
 *      par la charge ⇒ `stale`: le plan a changé entre la proposition et le tap,
 *      et une action calculée sur un état disparu est un bug (R7). C'est AUSSI
 *      ce qui rend le double tap sûr: le premier glissement change les dates,
 *      donc l'empreinte, donc le second tap est périmé par construction;
 *   2. RECALCULER le glissement côté serveur. Le `delta` de la charge n'est
 *      jamais appliqué tel quel — c'est une chaîne que le client contrôle. Il
 *      doit ÉGALER ce que le serveur recalcule, sinon `stale`;
 *   3. écrire sous verrou optimiste (`updated_at`), et COMPTER LES LIGNES. Un
 *      `update` qui ne touche rien rend un 204 muet, et le lire comme un succès
 *      est la cicatrice `rls-is-not-a-substitute-for-eq-user-id`;
 *   4. RELIRE la ligne, la reparser, et vérifier que son empreinte est bien
 *      celle du plan décalé. C'est la seule preuve qui vaille: la valeur rendue
 *      par une écriture est ce que l'écriture CROIT avoir fait.
 *
 * ⚠️ CE QU'ELLE N'ÉCRIT PAS, ET C'EST CE QUI LA REND SÛRE (R13). Trois clés du
 * PLAN, et trois seulement: `dishes[].day`, `preparations[].cook_on`,
 * `cooking_sessions[].day`. Ni `starts_on`, ni `duration_days` (donc `ends_on`
 * généré et la contrainte d'exclusion sont intouchés), ni un titre, ni une
 * quantité, ni l'ORDRE des plats — et l'ordre est ce qui garde les clés de coche
 * valides, puisqu'elles sont positionnelles. Aucun modèle n'est appelé: il n'y a
 * aucun appel réseau hors Supabase dans ce fichier.
 *
 * ⟳ D7.3 (2026-09-03) — UNE QUATRIÈME CLÉ, QUI N'EST PAS LE PLAN:
 * `generated_from.shifts[]` reçoit la TRACE du glissement (`withShiftTrace`),
 * apposée à ce que la colonne portait déjà. C'est un fait sur l'histoire du
 * plan, lu par la page de suivi (« plans modifiés »); ça ne rechoisit aucun
 * plat, ne déplace aucune date de plus. `buildShiftedPayload` reste à trois
 * clés, et `accident_test.ts` le tient.
 */
export async function applyPlanShift(
  admin: SupabaseClient,
  args: {
    userId: string;
    mealId: string;
    cookOn: string;
    /** Le delta porté par la charge. VÉRIFIÉ, jamais appliqué tel quel. */
    delta: number;
    /** L'empreinte portée par la charge. */
    fingerprint: string;
    maxFridgeDays?: number;
    /**
     * FF-061 R11 — le jour LOCAL au moment du TAP. REQUIS.
     *
     * ⚠️ CELUI DU TAP, PAS CELUI DE LA PROPOSITION. Une proposition faite hier
     * soir et tapée ce matin doit être re-jugée contre AUJOURD'HUI: la cuisson
     * qu'elle décalait a pu devenir passée entre les deux, et l'appliquer
     * poserait une date écoulée. Le recalcul complet est déjà la règle de cette
     * fonction (« le delta est VÉRIFIÉ, jamais appliqué tel quel »); la borne
     * du jour en fait partie.
     */
    today: string;
    /** FF-061 R6ter — le décalage minimal, quand une VAGUE de courses bouge. */
    minDelta?: number;
  },
): Promise<ShiftApplyOutcome> {
  const loaded = await loadAccidentPlan(admin, {
    userId: args.userId,
    mealId: args.mealId,
  });
  if (!loaded) return { outcome: "stale", detail: "plan_gone_or_not_owned" };

  const current = planShiftFingerprint(loaded.plan);
  if (current !== args.fingerprint) {
    return { outcome: "stale", detail: "fingerprint_changed" };
  }

  const recomputed = await computeSessionShift(admin, {
    userId: args.userId,
    plan: loaded.plan,
    cookOn: args.cookOn,
    maxFridgeDays: args.maxFridgeDays,
    today: args.today,
    minDelta: args.minDelta,
  });
  if (!recomputed.ok) {
    return {
      outcome: "refused",
      reason: recomputed.reason,
      detail: recomputed.detail,
    };
  }
  if (recomputed.delta !== args.delta) {
    return {
      outcome: "stale",
      detail: `delta ${args.delta} != recomputed ${recomputed.delta}`,
    };
  }

  const shifted = shiftPlanDates(loaded.plan, args.cookOn, recomputed.delta);
  if (!shifted) return { outcome: "stale", detail: "no_session_on_date" };

  const payload = {
    ...buildShiftedPayload({
      rawDishes: loaded.raw.dishes,
      rawPreparations: loaded.raw.preparations,
      rawSessions: loaded.raw.sessions,
      shifted,
    }),
    // D7.3 — LA TRACE, ET RIEN D'AUTRE. `buildShiftedPayload` garde ses trois
    // clés de date (R13, tenu par `accident_test.ts`); `generated_from` ne
    // porte pas le plan, il porte d'où il vient — et désormais ce qui lui est
    // arrivé. Voir `withShiftTrace`.
    generated_from: withShiftTrace(loaded.raw.generatedFrom, {
      cook_on: args.cookOn,
      delta: recomputed.delta,
      new_cook_on: recomputed.newCookOn,
      moved_dish_indexes: [...recomputed.movedDishIndexes],
      applied_on: args.today,
    }),
  };
  const updated = await admin
    .from("student_generated_meals")
    .update(payload as never)
    .eq("id", args.mealId)
    .eq("user_id", args.userId)
    // VERROU OPTIMISTE: la ligne n'a pas bougé depuis la lecture. Sans lui, une
    // régénération concurrente serait écrasée par des dates calculées sur le
    // plan d'avant — un plan cohérent remplacé par un plan mixte, sans erreur.
    .eq("updated_at", loaded.updatedAt)
    .is("retired_at", null)
    .select("id");
  if (updated.error) {
    return { outcome: "unverified", detail: updated.error.message };
  }
  if (((updated.data ?? []) as unknown[]).length === 0) {
    return { outcome: "stale", detail: "row_changed_or_retired" };
  }

  // ── LA RELECTURE, ET C'EST UNE VRAIE RELECTURE ──────────────────────────
  const after = await loadAccidentPlan(admin, {
    userId: args.userId,
    mealId: args.mealId,
  });
  if (!after) return { outcome: "unverified", detail: "reread_failed" };
  const expected = planShiftFingerprint(shifted);
  const got = planShiftFingerprint(after.plan);
  if (expected !== got) {
    return {
      outcome: "unverified",
      detail: `fingerprint after write: ${got} != ${expected}`,
    };
  }

  return {
    outcome: "applied",
    newCookOn: recomputed.newCookOn,
    movedDishIndexes: recomputed.movedDishIndexes,
  };
}

/**
 * Le payload d'un glissement, construit à partir des tableaux BRUTS de la ligne.
 *
 * ⚠️ ON REPART DE LA LIGNE, PAS DU MODÈLE RÉDUIT. `AccidentPlan` ne porte qu'un
 * sous-ensemble des champs (ni méthode, ni ingrédients, ni minutes, ni
 * `run_through`): reconstruire le payload depuis lui EFFACERAIT tout le reste.
 * On relit donc les tableaux bruts et on n'y change QUE les trois clés de date,
 * position par position.
 *
 * Séparé de `applyPlanShift` pour être testable sans base: c'est la seule
 * fonction de ce fichier qui décide de ce qui est écrit, et « ce qu'elle
 * n'écrit pas » est la garde de R13.
 */
export function buildShiftedPayload(args: {
  rawDishes: readonly Record<string, unknown>[];
  rawPreparations: readonly Record<string, unknown>[];
  rawSessions: readonly Record<string, unknown>[];
  shifted: AccidentPlan;
}): Record<string, unknown> {
  const dayByIndex = new Map(
    args.shifted.dishes.map((d) => [d.dishIndex, d.day]),
  );
  const cookById = new Map(
    args.shifted.preparations.map((p) => [p.id, p.cookOn]),
  );

  const dishes = args.rawDishes.map((raw, i) => {
    if (!dayByIndex.has(i)) return raw;
    return { ...raw, day: dayByIndex.get(i) ?? null };
  });
  const preparations = args.rawPreparations.map((raw) => {
    const id = String(raw?.id ?? "").trim();
    if (!cookById.has(id)) return raw;
    return { ...raw, cook_on: cookById.get(id) ?? null };
  });
  // Les sessions sont appariées PAR POSITION: `parseAccidentPlan` les lit dans
  // l'ordre et n'en écarte que celles sans jour, lesquelles ne peuvent pas être
  // la session déplacée.
  const sessions = args.rawSessions.map((raw, i) => {
    const day = args.shifted.sessions[i]?.day;
    return day ? { ...raw, day } : raw;
  });

  return { dishes, preparations, cooking_sessions: sessions };
}
