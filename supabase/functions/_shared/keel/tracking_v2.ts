/** Versioned nutrition journal. Pure and shared with the browser (no server imports). */
export const JOURNAL_SLOTS = [
  "breakfast",
  "snack_am",
  "lunch",
  "snack_pm",
  "dinner",
  "before_bed",
] as const;
export type JournalSlot = typeof JOURNAL_SLOTS[number];
export type JournalEnergy = {
  kcal: number;
  basis:
    | "plan_quantities"
    | "photo_estimate"
    | "text_estimate"
    | "declared_quantities";
};
export type PlanRef = { planId: string; dishIndex: number };
export interface MealContext {
  version: 1;
  occurrenceId: string;
  relation: "planned" | "replacement" | "outside" | "extra";
  state: "reported" | "skipped";
  planRefs: PlanRef[];
}
export interface JournalEvent {
  id: string;
  date: string;
  slot: JournalSlot | null;
  note: string | null;
  mediaPath: string | null;
  energy: JournalEnergy | null;
  context: MealContext | null;
  refs: PlanRef[];
  excluded: boolean;
  analysis: "ready" | "unavailable" | "pending";
  tick: boolean;
  updatedAt: string;
}
export interface JournalPlanned {
  ref: PlanRef;
  date: string;
  slot: JournalSlot | null;
  title: string;
  energy: JournalEnergy | null;
  confirmed: boolean;
  skipped: boolean;
  retired: boolean;
  priority: string;
}
export interface JournalExpected {
  date: string;
  slot: JournalSlot | null;
  kind: "outside" | "uncovered" | "fixed" | "leftovers";
  title?: string;
  energy?: JournalEnergy | null;
  additive?: boolean;
}
export interface JournalMeal {
  id: string;
  date: string;
  slot: JournalSlot | null;
  title: string;
  origin:
    | "planned"
    | "outside"
    | "extra"
    | "fixed"
    | "leftovers"
    | "unattached";
  state:
    | "planned"
    | "future"
    | "missing"
    | "reported"
    | "skipped"
    | "unattached";
  planRefs: PlanRef[];
  events: JournalEvent[];
  plannedEnergy: JournalEnergy | null;
  reportedEnergy: JournalEnergy | null;
  editable: boolean;
  actions: {
    photo: boolean;
    describe: boolean;
    skip: boolean;
    correct: boolean;
    retry: boolean;
  };
}
export interface JournalDay {
  date: string;
  meals: JournalMeal[];
  plannedKcal: number | null;
  reportedKcal: number | null;
  estimated: boolean;
  state: "future" | "in_progress" | "incomplete" | "complete";
}
/**
 * ⟳ 2026-09-21 — LE DÉTAIL DU CALCUL VOYAGE AVEC LA CIBLE.
 *
 * Les champs sont ceux d'`EnergyBreakdown` (`energy_breakdown.ts`), en
 * `snake_case` comme le reste de cette charge utile. `null` = « il n'y a pas
 * de fourchette à expliquer », et l'écran ne rend alors aucun bouton.
 *
 * ⛔ AUCUN CHAMP DE CONSOMMATION N'ENTRE ICI. Ce sont des ÉTAPES DE CALCUL; un
 * `eaten_kcal` posé à côté permettrait de construire « il te reste 680 kcal »,
 * la phrase qu'`energy_target.ts` interdit depuis le premier jour.
 */
import type { EnergyBreakdown } from "./energy_breakdown.ts";

export interface JournalTargetBreakdown {
  chain: string;
  weight_kg: number | null;
  activity_level: string | null;
  per_kg_low: number | null;
  per_kg_high: number | null;
  maintenance_low: number | null;
  maintenance_high: number | null;
  /** SIGNÉ: négatif sur une perte. `0` = l'objectif n'a pas bougé la bande. */
  daily_delta_kcal: number;
  low: number;
  high: number;
}
/**
 * DU MODULE PUR À LA CHARGE UTILE — et c'est une GARDE, pas une commodité.
 *
 * ⛔ LE DÉFAUT QU'ELLE FERME, TROUVÉ AVANT D'ÊTRE ÉCRIT. `loadDailyEnergyTarget`
 * n'a AUCUN type de retour déclaré: poser directement l'objet `camelCase`
 * d'`energyBreakdownFor` dans la charge utile aurait compilé sans un mot, et
 * le navigateur aurait lu `weight_kg` sur un objet qui porte `weightKg` —
 * c'est-à-dire `undefined` partout, sous un panneau qui s'ouvre. Même famille
 * que « `as` sur un type étranger désarme le typecheck »: ici c'est l'ABSENCE
 * d'annotation qui désarme.
 *
 * Cette fonction est le seul endroit où les deux vocabulaires se touchent, et
 * son type de retour EST déclaré: un champ renommé d'un côté ne compile plus.
 */
export function journalTargetBreakdown(
  b: EnergyBreakdown | null,
): JournalTargetBreakdown | null {
  if (b === null) return null;
  return {
    chain: b.chain,
    weight_kg: b.weightKg,
    activity_level: b.activityLevel,
    per_kg_low: b.perKgLow,
    per_kg_high: b.perKgHigh,
    maintenance_low: b.maintenanceLow,
    maintenance_high: b.maintenanceHigh,
    daily_delta_kcal: b.dailyDeltaKcal,
    low: b.low,
    high: b.high,
  };
}

export interface JournalTarget {
  low: number | null;
  high: number | null;
  basis: string;
  gap: string | null;
  direction: string | null;
  weight_week_start: string | null;
  breakdown: JournalTargetBreakdown | null;
}
export interface JournalReport {
  version: 2;
  today: string;
  window: { from: string; to: string };
  floor: boolean;
  energy: { open: boolean; reason: string };
  target: JournalTarget | null;
  days: JournalDay[];
  weight: { localDate: string; value: number }[] | null;
}
export function journalDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value + "T00:00:00Z")) &&
    new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;
}
export function shiftJournalDate(date: string, n: number): string {
  return new Date(Date.parse(date + "T00:00:00Z") + n * 86400000).toISOString()
    .slice(0, 10);
}
export function editableJournalDate(date: string, today: string): boolean {
  return journalDate(date) && date <= today &&
    date >= shiftJournalDate(today, -14);
}
export function journalSlot(value: unknown): JournalSlot | null {
  return JOURNAL_SLOTS.includes(value as JournalSlot)
    ? value as JournalSlot
    : null;
}
export function promptEligibleJournalSlots(
  day: JournalDay | undefined,
): JournalSlot[] {
  return [
    ...new Set(
      (day?.meals ?? []).filter((meal) =>
        meal.slot !== null && meal.state !== "reported" &&
        meal.state !== "skipped" &&
        meal.origin !== "fixed" && meal.origin !== "leftovers" &&
        meal.origin !== "extra" && meal.origin !== "unattached"
      ).map((meal) => meal.slot as JournalSlot),
    ),
  ];
}
export function readMealContext(value: unknown): MealContext | null {
  if (!value || typeof value !== "object") return null;
  const c = value as MealContext;
  if (
    c.version !== 1 || typeof c.occurrenceId !== "string" ||
    !/^[a-zA-Z0-9:_-]{1,200}$/.test(c.occurrenceId) ||
    !["planned", "replacement", "outside", "extra"].includes(c.relation) ||
    !["reported", "skipped"].includes(c.state) || !Array.isArray(c.planRefs) ||
    c.planRefs.length > 30 ||
    c.planRefs.some((r) =>
      typeof r?.planId !== "string" || !Number.isInteger(r.dishIndex) ||
      r.dishIndex < 0
    )
  ) return null;
  return c;
}
const refKey = (r: PlanRef) => `${r.planId}:${r.dishIndex}`;
function total(values: (JournalEnergy | null)[]): number | null {
  const xs = values.filter((v): v is JournalEnergy => v !== null);
  return xs.length ? Math.round(xs.reduce((sum, v) => sum + v.kcal, 0)) : null;
}
export function buildJournal(args: {
  today: string;
  from: string;
  to: string;
  hour: number;
  slotHours: Partial<Record<JournalSlot, number | null>>;
  floor: boolean;
  energy: JournalReport["energy"];
  target: JournalTarget | null;
  planned: JournalPlanned[];
  expected: JournalExpected[];
  events: JournalEvent[];
  weight: NonNullable<JournalReport["weight"]>;
}): JournalReport {
  const report: JournalReport = {
    version: 2,
    today: args.today,
    window: { from: args.from, to: args.to },
    floor: args.floor,
    energy: args.energy,
    target: args.energy.open ? args.target : null,
    days: [],
    weight: args.floor ? null : args.weight,
  };
  if (args.floor) {
    report.target = null;
    return report;
  }
  const elapsed = (date: string, slot: JournalSlot | null) =>
    date < args.today ||
    (date === args.today && slot !== null && args.slotHours[slot] != null &&
      args.hour >= args.slotHours[slot]!);
  const live = args.events.filter((e) => !e.excluded);
  const refEvents = new Map<string, JournalEvent[]>();
  for (const e of live) {
    for (const r of [...e.refs, ...(e.context?.planRefs ?? [])]) {
      const k = refKey(r);
      refEvents.set(k, [...(refEvents.get(k) ?? []), e]);
    }
  }
  // One plan version per occasion. Evidence on a retired version means that
  // version was actually used; otherwise the newest applicable version wins.
  // Dishes from two plan versions are never merged into one meal.
  const candidates = new Map<string, Map<string, JournalPlanned[]>>();
  for (const p of args.planned) {
    const key = `${p.date}:${p.slot ?? refKey(p.ref)}`;
    const versions = candidates.get(key) ?? new Map<string, JournalPlanned[]>();
    versions.set(p.ref.planId, [...(versions.get(p.ref.planId) ?? []), p]);
    candidates.set(key, versions);
  }
  const selected = new Map<string, JournalPlanned[]>();
  for (const [key, versions] of candidates) {
    const ranked = [...versions.values()].map((group) => {
      const evidence = group.flatMap((p) =>
        refEvents.get(refKey(p.ref)) ?? []
      ).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      const confirmed = group.some((p) =>
        p.confirmed || p.skipped || refEvents.has(refKey(p.ref))
      );
      return {
        group,
        confirmed,
        rank: evidence?.updatedAt ?? group[0].priority,
      };
    }).sort((a, b) =>
      Number(b.confirmed) - Number(a.confirmed) || b.rank.localeCompare(a.rank)
    );
    if (ranked[0]) selected.set(key, ranked[0].group);
  }
  for (
    let date = args.from;
    date <= args.to;
    date = shiftJournalDate(date, 1)
  ) {
    const meals: JournalMeal[] = [];
    const used = new Set<string>();
    for (const group of selected.values()) {
      const ps = group.filter((p) => p.date === date);
      if (!ps.length) continue;
      const linked = [
        ...new Map(
          ps.flatMap((p) => refEvents.get(refKey(p.ref)) ?? []).map(
            (e) => [e.id, e],
          ),
        ).values(),
      ];
      linked.forEach((e) => used.add(e.id));
      const ordered = [...linked].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt)
      );
      const latest = ordered.find((e) => e.context) ?? ordered[0];
      const replaced = latest?.context?.relation === "replacement";
      const skipped = latest?.context?.state === "skipped" ||
        ps.every((p) => p.skipped);
      const confirmed = ps.every((p) =>
        p.confirmed ||
        linked.some((e) =>
          e.refs.some((r) => refKey(r) === refKey(p.ref)) ||
          (e.context?.relation === "planned" &&
            e.context.planRefs.some((r) => refKey(r) === refKey(p.ref)))
        )
      );
      const hasResponse = linked.some((e) => !e.tick);
      const plannedKcal = ps.every((p) => p.energy !== null)
        ? total(ps.map((p) => p.energy))
        : null;
      // ⟳ 2026-09-23 — PRÉSUMÉ MANGÉ. Décision du propriétaire: un repas prévu
      // dont l'heure est passée compte comme mangé tant que la personne n'a pas
      // dit « pas mangé ». Rien n'est écrit en base pour ça — seules les
      // exceptions le sont — donc la présomption se calcule ici, à la lecture.
      // L'état reste `planned`: il dit « venu du plan, personne ne l'a
      // contredit », et les autres lecteurs du journal s'appuient dessus.
      const presumed = !skipped && !replaced && !confirmed && !hasResponse &&
        elapsed(date, ps[0].slot);
      const reported = replaced
        ? ordered.find((e) => e.energy)?.energy ?? null
        : (confirmed || presumed) && plannedKcal !== null
        ? { kcal: plannedKcal, basis: "plan_quantities" as const }
        : hasResponse
        ? ordered.find((e) => !e.tick && e.energy)?.energy ?? null
        : null;
      const editable = editableJournalDate(date, args.today);
      const hasEvidence = linked.some((e) => !e.tick);
      meals.push({
        id: latest?.context?.occurrenceId ??
          `plan:${ps[0].ref.planId}:${date}:${
            ps[0].slot ?? ps[0].ref.dishIndex
          }`,
        date,
        slot: ps[0].slot,
        title: replaced
          ? (latest?.note ?? "")
          : ps.map((p) => p.title).join(" · "),
        origin: replaced ? "outside" : "planned",
        state: skipped
          ? "skipped"
          : replaced || confirmed || hasResponse
          ? "reported"
          : elapsed(date, ps[0].slot)
          ? "planned"
          : "future",
        planRefs: ps.map((p) => p.ref),
        events: linked,
        plannedEnergy: args.energy.open && plannedKcal !== null
          ? { kcal: plannedKcal, basis: "plan_quantities" }
          : null,
        reportedEnergy: args.energy.open && !skipped ? reported : null,
        editable,
        actions: {
          photo: editable && hasEvidence && !skipped,
          describe: false,
          skip: false,
          correct: editable && hasEvidence,
          retry: editable && linked.some((e) => e.analysis !== "ready"),
        },
      });
    }
    const groups = new Map<string, JournalEvent[]>();
    for (
      const e of live.filter((e) =>
        e.date === date && !used.has(e.id) && !e.tick
      )
    ) {
      const key = e.context?.occurrenceId ??
        (e.slot ? `slot:${date}:${e.slot}` : `event:${e.id}`);
      groups.set(key, [...(groups.get(key) ?? []), e]);
    }
    for (const [id, events] of groups) {
      const last = [...events].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt)
      )[0];
      const collision = meals.some((m) => m.slot === last.slot) &&
        !last.context;
      const unattached = last.slot === null || collision ||
        (!last.context && events.filter((e) => e.energy).length > 1);
      const energy = [...events].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt)
      ).find((e) => e.energy)?.energy ?? null;
      const editable = editableJournalDate(date, args.today);
      const skipped = last.context?.state === "skipped";
      meals.push({
        id,
        date,
        slot: last.slot,
        title: events.find((e) =>
          e.note
        )?.note ?? "",
        origin: unattached
          ? "unattached"
          : last.context?.relation === "extra"
          ? "extra"
          : "outside",
        state: unattached ? "unattached" : skipped ? "skipped" : "reported",
        planRefs: last.context?.planRefs ?? [],
        events,
        plannedEnergy: null,
        reportedEnergy: args.energy.open && !unattached && !skipped
          ? energy
          : null,
        editable,
        actions: {
          photo: editable && !skipped,
          describe: false,
          skip: false,
          correct: editable,
          retry: editable && events.some((e) => e.analysis !== "ready"),
        },
      });
    }
    for (const expected of args.expected.filter((e) => e.date === date)) {
      if (
        meals.some((m) => m.slot === expected.slot && m.origin !== "extra") &&
        !(expected.kind === "fixed" && expected.additive)
      ) continue;
      const passed = elapsed(date, expected.slot);
      const fixed = expected.kind === "fixed";
      const editable = !fixed && editableJournalDate(date, args.today);
      const canFill = editable && passed && expected.kind !== "leftovers";
      meals.push({
        id: `slot:${date}:${expected.slot ?? "loose"}:${expected.kind}`,
        date,
        slot: expected.slot,
        title: expected.title ?? "",
        origin: expected.kind === "uncovered" ? "outside" : expected.kind,
        state: fixed ? "reported" : passed ? "missing" : "future",
        planRefs: [],
        events: [],
        plannedEnergy: null,
        reportedEnergy: fixed && args.energy.open
          ? expected.energy ?? null
          : null,
        editable,
        actions: {
          photo: canFill,
          describe: canFill,
          skip: canFill,
          correct: false,
          retry: false,
        },
      });
    }
    meals.sort((a, b) =>
      (a.slot ? JOURNAL_SLOTS.indexOf(a.slot) : 99) -
      (b.slot ? JOURNAL_SLOTS.indexOf(b.slot) : 99)
    );
    // Calorie-off responses never serialize old estimates nested in events either.
    if (!args.energy.open) {
      for (const m of meals) {
        m.events = m.events.map((e) => ({
          ...e,
          energy: null,
        }));
      }
    }
    // Un repas `planned` passé est présumé mangé: il ne rend plus la journée
    // incomplète, sauf si son énergie est inconnue (le total serait faux).
    const incomplete = meals.some((m) =>
      ["missing", "unattached"].includes(m.state) ||
      ((m.state === "reported" || m.state === "planned") && args.energy.open &&
        !m.reportedEnergy)
    );
    report.days.push({
      date,
      meals,
      plannedKcal: total(meals.map((m) => m.plannedEnergy)),
      reportedKcal: total(meals.map((m) => m.reportedEnergy)),
      estimated: meals.some((m) =>
        m.reportedEnergy && m.reportedEnergy.basis !== "plan_quantities"
      ),
      state: date > args.today
        ? "future"
        : date === args.today && meals.some((m) => m.state === "future")
        ? "in_progress"
        : incomplete || meals.length === 0
        ? "incomplete"
        : "complete",
    });
  }
  return report;
}
