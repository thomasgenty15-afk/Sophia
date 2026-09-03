// L'ASSEMBLAGE DU SUIVI — tout ce qui touche la base. La décision est dans
// `tracking_window.ts`, qui est pur.
//
// ══════════════════════════════════════════════════════════════════════════
// ⛔ L'ORDRE DES LECTURES EST LE CONTRAT, ET LA PORTE EST LA PREMIÈRE
// ══════════════════════════════════════════════════════════════════════════
//
// `loadEnergyGate` est appelé AVANT toute autre requête, et son refus sort
// avant qu'une seule ligne de plan, de fait ou de pesée soit lue. Ce n'est pas
// une optimisation: `CALORIE_REVERSAL.md` §0 dit que la porte ne produit jamais
// le nombre et ne le filtre jamais après coup. Sous plancher TCA, ce module ne
// doit pas même SAVOIR combien la personne pèse.
//
// ⛔ ET `loadEnergyGate` JETTE plutôt que de rendre une porte ouverte quand elle
// est illisible. On ne rattrape pas: l'appelant rend une erreur.
//
// ══════════════════════════════════════════════════════════════════════════
// LA GARDE DE DONNÉES — `.eq("user_id", me)`, ET RLS N'EN TIENT PAS LIEU
// ══════════════════════════════════════════════════════════════════════════
//
// Ce module tourne en `service_role`: RLS ne s'applique pas, et `auth.uid()` y
// vaut NULL. Chaque requête porte donc son filtre en clair. Le dépôt a déjà
// rendu la ligne d'un élève à un coach par cet oubli.
//
// LA SEULE EXCEPTION, ET ELLE EST GARDÉE DEUX FOIS: le plan `household` d'un
// membre réclamé porte le `user_id` du MAÎTRE. On ne retire pas le filtre —
// on le remplace par le couple `.eq("plan_kind","household")` ET
// `.eq("household_id", …)`, exactement la forme que A8.0 a posée dans
// `planned_dish_io.ts` (run adversarial H2: un retrait nu laisse citer le plan
// d'un autre foyer). Les deux `eq` sont la garde, pas l'un des deux.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { loadEnergyGate } from "./energy_gate_io.ts";
import { canShowTarget } from "./energy_gate.ts";
import { type EnergyTarget, maintenanceRange } from "./energy_target.ts";
import { ACTIVITY_LEVELS, type ActivityLevel } from "./tokens.ts";
import { latest, loadStudentBody } from "./student_body_io.ts";
import { loadCompositionIndex } from "./food_composition_io.ts";
import { planEnergy } from "./plan_energy.ts";
import { readDishes, readPreparations } from "./plan_energy_read.ts";
import { loadBodyMeasures } from "./body_measure_io.ts";
import { dailyValues } from "./body_measure_series.ts";
import { resolvePlanScope } from "./planned_dish_io.ts";
import { stretchDates } from "./meal_stretch.ts";
import {
  EATING_OCCASIONS,
  type EatingOccasion,
  parseEatingRhythm,
} from "./meal_generation.ts";
import {
  buildTrackingReport,
  type TrackingFact,
  type TrackingPlan,
  type TrackingPlanDish,
  type TrackingReport,
} from "./tracking_window.ts";
import type { EnergyBasis } from "./meal_analysis.ts";

type Db = SupabaseClient;

/**
 * JUSQU'OÙ LA SÉRIE DE POIDS REMONTE — « depuis la création », borné.
 *
 * La courbe offre une fenêtre « tout ». Sans borne, la requête n'a pas de
 * `gte` et un compte de dix ans rendrait des milliers de lignes pour dessiner
 * 320 pixels. Dix ans est au-delà de l'âge du produit: personne n'atteint la
 * borne aujourd'hui, et le jour où quelqu'un l'atteindra, la courbe restera
 * exacte sur la décennie qu'elle montre.
 */
export const WEIGHT_SERIES_MAX_DAYS = 3650;

/** La fenêtre de faits et de plans qu'un appel peut demander. */
export const TRACKING_MAX_WINDOW_DAYS = 92;

function addDays(localDate: string, days: number): string {
  const d = new Date(`${localDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface TrackingWindowRequest {
  userId: string;
  from: string;
  to: string;
}

/** Les refus NOMMÉS de l'assemblage. Un jeton, jamais une phrase. */
export const TRACKING_REFUSALS = [
  "bad_window",
  "window_too_wide",
] as const;
export type TrackingRefusal = (typeof TRACKING_REFUSALS)[number];

export class TrackingRefusalError extends Error {
  constructor(public readonly token: TrackingRefusal) {
    super(token);
    this.name = "TrackingRefusalError";
  }
}

function assertWindow(from: string, to: string): void {
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to) || from > to) {
    throw new TrackingRefusalError("bad_window");
  }
  const span =
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  if (span + 1 > TRACKING_MAX_WINDOW_DAYS) {
    throw new TrackingRefusalError("window_too_wide");
  }
}

/** Le cran d'activité de la personne, ou `null` — jamais un cran deviné. */
function activityOf(goalsRow: Record<string, unknown> | null): ActivityLevel | null {
  const pc = (goalsRow?.practical_constraints ?? {}) as Record<string, unknown>;
  const raw = String(pc.activity_level ?? "").trim();
  return (ACTIVITY_LEVELS as readonly string[]).includes(raw)
    ? (raw as ActivityLevel)
    : null;
}

/** Les occasions DÉCLARÉES par la personne, les six et pas les cinq moments. */
function declaredSlotsOf(
  goalsRow: Record<string, unknown> | null,
): EatingOccasion[] {
  const pc = (goalsRow?.practical_constraints ?? {}) as Record<string, unknown>;
  const rhythm = parseEatingRhythm(pc.eating_rhythm);
  const out: EatingOccasion[] = [];
  for (const entry of rhythm) {
    const slot = String((entry as { slot?: unknown }).slot ?? "").trim();
    if (
      (EATING_OCCASIONS as readonly string[]).includes(slot) &&
      !out.includes(slot as EatingOccasion)
    ) {
      out.push(slot as EatingOccasion);
    }
  }
  return out;
}

function occasionOf(raw: unknown): EatingOccasion | null {
  const slot = String(raw ?? "").trim();
  return (EATING_OCCASIONS as readonly string[]).includes(slot)
    ? (slot as EatingOccasion)
    : null;
}

/**
 * `recognized.energy_estimate`, relu — et il ne se répare pas.
 *
 * Une base inconnue rend `null` plutôt que `photo_estimate`: un repli
 * transformerait une lecture qu'on n'a pas comprise en une lecture qu'on
 * affiche. `analyze-meal-photo-v1` a déjà, lui, le droit de dégrader
 * `declared_quantities` en `photo_estimate` — c'est SA décision, à l'écriture,
 * et la relire ici serait un second avis.
 */
function energyOf(
  recognized: unknown,
): { kcal: number; basis: EnergyBasis } | null {
  if (!recognized || typeof recognized !== "object") return null;
  const est = (recognized as Record<string, unknown>).energy_estimate;
  if (!est || typeof est !== "object") return null;
  const e = est as Record<string, unknown>;
  const kcal = Number(e.kcal);
  const basis = String(e.basis ?? "");
  if (!Number.isFinite(kcal) || kcal <= 0) return null;
  if (basis !== "photo_estimate" && basis !== "declared_quantities") return null;
  return { kcal, basis: basis as EnergyBasis };
}

const PLAN_COLUMNS =
  "id, user_id, plan_kind, household_id, servings, dishes, preparations, " +
  "cooking_sessions, starts_on, duration_days, retired_at, generated_from";

/**
 * LES PLANS DE LA PERSONNE, dans la fenêtre — les siens, plus, pour un membre
 * réclamé, ceux de son foyer.
 *
 * « Dans la fenêtre » = leur intervalle CROISE `[from, to]`. Un plan démarré
 * avant la fenêtre et qui la déborde compte: c'est le cas nominal d'un plan de
 * sept jours qu'on regarde le quatrième.
 */
async function loadPlans(
  db: Db,
  args: { userId: string; from: string; to: string },
): Promise<Array<Record<string, unknown>>> {
  const own = await db
    .from("student_generated_meals")
    .select(PLAN_COLUMNS)
    // ⛔ RLS NE REMPLACE PAS CE FILTRE — voir l'en-tête.
    .eq("user_id", args.userId)
    .lte("starts_on", args.to)
    .gte("ends_on", args.from)
    .order("starts_on", { ascending: true });
  if (own.error) throw own.error;
  const rows = [...((own.data ?? []) as Array<Record<string, unknown>>)];

  const scope = await resolvePlanScope(db, args.userId);
  if (scope.kind === "household_member") {
    // A8.0 — LE PLAN DU FOYER POUR UN MEMBRE RÉCLAMÉ. Les DEUX `eq` sont la
    // garde; retirer le `user_id` sans les poser laisserait citer le plan d'un
    // autre foyer (run adversarial H2).
    const shared = await db
      .from("student_generated_meals")
      .select(PLAN_COLUMNS)
      .eq("plan_kind", "household")
      .eq("household_id", scope.householdId)
      .lte("starts_on", args.to)
      .gte("ends_on", args.from)
      .order("starts_on", { ascending: true });
    if (shared.error) throw shared.error;
    const seen = new Set(rows.map((r) => String(r.id)));
    for (const row of (shared.data ?? []) as Array<Record<string, unknown>>) {
      if (!seen.has(String(row.id))) rows.push(row);
    }
  }
  return rows;
}

/**
 * UN PLAN, RAMENÉ À CE QUE LE SUIVI EN LIT — et sa part `plan_quantities`.
 *
 * ⛔ L'ABSTENTION DU PLAN DE FOYER, ET ELLE EST ASSUMÉE. Reconstituer la part
 * d'un lecteur dans une casserole partagée demande `member_deltas` et la trace
 * de présence, c'est-à-dire l'arbitrage que `meal-energy-v1` porte avec son
 * `viewerMemberId`. Le refaire ici en aurait fait une seconde implémentation,
 * et une seconde implémentation de CE calcul-là se trompe vers le BAS — « tu
 * manges moins que tu ne crois », sur exactement la question qui a motivé le
 * chiffre. On rend donc `kcal: null` sur un plan `household`, ce qui fait
 * s'abstenir la journée entière (`TrackingDay.abstained`), et l'écran le DIT.
 * C'est le comportement que `meal-energy-v1` choisit lui-même quand la trace
 * lui manque (`HOUSEHOLD_ABSTENTION`).
 */
function toTrackingPlan(
  row: Record<string, unknown>,
  index: Parameters<typeof planEnergy>[0]["index"] | null,
): TrackingPlan {
  const mealId = String(row.id ?? "");
  const startsOn = String(row.starts_on ?? "");
  const durationDays = Math.max(1, Math.trunc(Number(row.duration_days) || 1));
  const planKind = row.plan_kind === "household" ? "household" : "personal";
  const dates = ISO_DATE.test(startsOn)
    ? stretchDates(startsOn, durationDays)
    : {};

  const rawDishes = Array.isArray(row.dishes)
    ? (row.dishes as Array<Record<string, unknown>>)
    : [];

  // La part exacte, et SEULEMENT sur un plan personnel — voir ci-dessus.
  // `addons: []` et `mealsOutByDay: new Map()` sont ici des valeurs PLEINES,
  // pas des défauts: c'est exactement ce que `meal-energy-v1` passe pour un
  // plan personnel (`readViewerAddons` rend `[]` et `readViewerMealsOut` une
  // table vide dès que `plan_kind !== "household"`).
  let dishKcal: Array<number | null> = rawDishes.map(() => null);
  if (index && planKind === "personal") {
    const energy = planEnergy({
      index,
      dishes: readDishes(row.dishes),
      preparations: readPreparations(row.preparations),
      servings: Math.min(12, Math.max(1, Math.round(Number(row.servings) || 1))),
      addons: [],
      mealsOutByDay: new Map(),
    });
    dishKcal = energy.dishes.map((d) => (d.complete ? d.kcal : null));
  }

  const dishes: TrackingPlanDish[] = rawDishes.map((d, i) => ({
    dishIndex: i,
    date: d.day === null || d.day === undefined
      // Un plat sans jour tombe le premier jour du plan: il ne vise aucun
      // moment de la semaine, et le seul jour honnête est celui où le plan
      // commence. `dishDate` fait le même choix avec son `fallback`.
      ? (ISO_DATE.test(startsOn) ? startsOn : null)
      : (dates[String(d.day)] ?? null),
    slot: occasionOf(d.slot),
    title: String(d.title ?? ""),
    kcal: dishKcal[i] ?? null,
    fromPreparation: Array.isArray(d.uses) && d.uses.length > 0,
  }));

  const gf = (row.generated_from ?? {}) as Record<string, unknown>;
  const shifts = Array.isArray(gf.shifts) ? gf.shifts.length : 0;

  return {
    mealId,
    startsOn,
    durationDays,
    retired: row.retired_at !== null && row.retired_at !== undefined,
    planKind,
    dishes,
    cookingSessions: Array.isArray(row.cooking_sessions)
      ? row.cooking_sessions.length
      : 0,
    shifts,
    skippedSessions: 0,
    pendingWaves: 0,
  };
}

/**
 * LE RAPPORT DE SUIVI, ASSEMBLÉ.
 *
 * ⚠️ `admin` est un client `service_role`, et `userId` vient du JWT de
 * l'appelant, jamais de son corps de requête.
 */
export async function loadTrackingReport(
  admin: Db,
  request: TrackingWindowRequest,
): Promise<TrackingReport> {
  const userId = String(request.userId ?? "").trim();
  if (!userId) throw new TrackingRefusalError("bad_window");
  assertWindow(request.from, request.to);

  // ══ ① LA PORTE, AVANT TOUT LE RESTE ══════════════════════════════════════
  const loaded = await loadEnergyGate(admin, { userId });
  const gate = loaded.gate;

  // ⛔ SORTIE IMMÉDIATE SOUS PLANCHER. Pas une requête de plus: on ne doit pas
  // même savoir ce que cette personne pèse.
  if (gate.reason === "restriction_floor") {
    return buildTrackingReport({
      window: { from: request.from, to: request.to },
      today: loaded.today,
      gate,
      direction: null,
      target: null,
      declaredSlots: [],
      plans: [],
      facts: [],
      weights: [],
      leftoverBoxes: { known: false },
    });
  }

  const direction = loaded.direction === "down" || loaded.direction === "up"
    ? loaded.direction
    : null;
  const targetGate = canShowTarget({
    energy: gate,
    targetSwitch: loaded.targetSwitchOn,
  });

  // ══ ② LES LECTURES, EN PARALLÈLE ═════════════════════════════════════════
  const [planRows, factRes, measures] = await Promise.all([
    loadPlans(admin, { userId, from: request.from, to: request.to }),
    admin
      .from("protocol_events")
      .select(
        "local_date, occurred_at, slot_key, source_message_id, plan_relation, " +
          "disqualified_reason, media_path, recognized",
      )
      // ⛔ RLS NE REMPLACE PAS CE FILTRE.
      .eq("user_id", userId)
      .gte("local_date", request.from)
      .lte("local_date", request.to)
      .order("occurred_at", { ascending: true }),
    loadBodyMeasures(admin, {
      userId,
      sinceLocalDate: addDays(request.to, -WEIGHT_SERIES_MAX_DAYS),
      untilLocalDate: request.to,
      kinds: ["weight"],
    }),
  ]);
  if (factRes.error) throw factRes.error;

  // ══ ③ LES ÉTATS DE CUISINE ET DE COURSES, PAR PLAN ═══════════════════════
  const planIds = planRows.map((r) => String(r.id)).filter((id) => id !== "");
  const skipped = new Map<string, number>();
  const pending = new Map<string, number>();
  if (planIds.length > 0) {
    const [sessions, waves] = await Promise.all([
      admin
        .from("cooking_session_states")
        .select("generated_meal_id, happened")
        .eq("user_id", userId)
        .in("generated_meal_id", planIds)
        .eq("happened", false),
      admin
        .from("grocery_wave_states")
        .select("generated_meal_id, done")
        .eq("user_id", userId)
        .in("generated_meal_id", planIds)
        .eq("done", false),
    ]);
    if (sessions.error) throw sessions.error;
    if (waves.error) throw waves.error;
    for (const row of (sessions.data ?? []) as Array<Record<string, unknown>>) {
      const id = String(row.generated_meal_id);
      skipped.set(id, (skipped.get(id) ?? 0) + 1);
    }
    for (const row of (waves.data ?? []) as Array<Record<string, unknown>>) {
      const id = String(row.generated_meal_id);
      pending.set(id, (pending.get(id) ?? 0) + 1);
    }
  }

  // ══ ④ LA CIBLE — seulement si sa porte à elle est ouverte ════════════════
  let target: EnergyTarget | null = null;
  if (targetGate.show) {
    try {
      // ⚠️ `today` VIENT DE LA PORTE, pas d'une horloge locale: c'est le jour
      // de la personne, résolu une seule fois, et deux appels le même jour
      // doivent rendre le même verdict d'âge — y compris à cheval sur minuit
      // UTC. C'est la consigne de `loadStudentBody` mot pour mot.
      const body = await loadStudentBody(admin, userId, loaded.today);
      const last = latest(body.weights);
      const maintenance = maintenanceRange({
        weightKg: last?.value ?? null,
        weightWeekStart: last?.weekStart ?? null,
        activityLevel: activityOf(loaded.goalsRow),
      });
      // ══════════════════════════════════════════════════════════════════
      // ⛔ L'ENTRETIEN, ET **PAS** `directedRange` — ET C'EST UN ARBITRAGE
      // ══════════════════════════════════════════════════════════════════
      //
      // Le mandat proposait « `maintenanceRange` OU `directedRange` si
      // direction ». On garde l'entretien, pour une raison qui n'est pas de la
      // commodité: cette fourchette ne sert PAS à prescrire, elle sert à
      // RECONSTITUER un repas que personne n'a noté.
      //
      // Estimer ce qu'on a mangé à partir de sa CIBLE est circulaire: le repas
      // manquant reviendrait pile au niveau du déficit, et le total du jour
      // montrerait à la personne qu'elle a tenu son objectif — parce qu'on
      // l'aurait supposé. Sur un déficit de 500 kcal et deux repas manquants,
      // l'écart est de l'ordre du tiers de la journée, toujours dans le sens
      // flatteur. L'entretien est le seul a priori NEUTRE dont on dispose sur
      // un repas dont on ne sait rien.
      //
      // La base `slot_estimate` dit déjà que c'est une convention; elle ne doit
      // pas en plus être une convention qui donne raison.
      target = maintenance;
    } catch {
      // FAIL-CLOSED: pas de cible plutôt qu'une cible sur un poids qu'on n'a pas
      // su lire. Une estimation de créneau disparaît alors, elle ne devient pas
      // fausse.
      target = null;
    }
  }

  // ══ ⑤ L'INDEX DE COMPOSITION — seulement s'il va servir ══════════════════
  // Il ne sert qu'au bloc objectif. Le charger sous une porte fermée serait une
  // lecture de plus pour un chiffre qui ne sortira pas.
  let index: Parameters<typeof planEnergy>[0]["index"] | null = null;
  if (gate.show && direction !== null && planRows.length > 0) {
    index = await loadCompositionIndex(admin);
  }

  const plans = planRows.map((row) => {
    const plan = toTrackingPlan(row, index);
    return {
      ...plan,
      skippedSessions: skipped.get(plan.mealId) ?? 0,
      pendingWaves: pending.get(plan.mealId) ?? 0,
    };
  });

  const facts: TrackingFact[] = ((factRes.data ?? []) as Array<
    Record<string, unknown>
  >).map((row) => ({
    key: row.source_message_id === null || row.source_message_id === undefined
      ? null
      : String(row.source_message_id),
    localDate: String(row.local_date ?? ""),
    slot: occasionOf(row.slot_key),
    planRelation: row.plan_relation === "as_planned" ||
        row.plan_relation === "off_plan"
      ? row.plan_relation
      : null,
    disqualifiedReason: row.disqualified_reason === null ||
        row.disqualified_reason === undefined
      ? null
      : String(row.disqualified_reason),
    mediaPath: row.media_path === null || row.media_path === undefined
      ? null
      : String(row.media_path),
    energy: energyOf(row.recognized),
  }));

  return buildTrackingReport({
    window: { from: request.from, to: request.to },
    today: loaded.today,
    gate,
    direction,
    target,
    declaredSlots: declaredSlotsOf(loaded.goalsRow),
    plans,
    facts,
    weights: dailyValues(measures, "weight").map((v) => ({
      localDate: v.localDate,
      value: v.value,
    })),
    // ⛔ INCONNU, ET PAS ZÉRO. `meal_share_outcomes` n'existe qu'après A8.2;
    // un zéro affirmerait qu'on a regardé.
    leftoverBoxes: { known: false },
  });
}
