/**
 * FF-028 — LE DÉCOR ET LES GESTES, en conditions réelles.
 *
 * Rien ici n'est un mock: vraie base locale, vraies fonctions edge par HTTP,
 * vrai élève provisionné. Tout ce qui est affirmé plus loin est relu en base.
 */
import {
  admin,
  ANON,
  callAs,
  callCron,
  type Coach,
  makeCoach,
  makeStudent,
  mondayOf,
  publishPlanFor,
  SERVICE,
  type Student,
  nonce,
  sql,
  URL_BASE,
} from "../docs/nutrition-pivot/qa-web/harness.ts";

export { admin, ANON, callAs, callCron, makeCoach, mondayOf, nonce, SERVICE, sql, URL_BASE };
export type { Coach, Student };

export const TZ = "Europe/Paris";

/** L'heure locale d'un instant dans un fuseau. */
export function localHour(at: Date, tz: string): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      hour12: false,
    }).format(at),
  );
}

export function localDate(at: Date, tz: string): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}

/**
 * LE PROCHAIN INSTANT À `hour` LOCALE, ≥ L'HEURE RÉELLE.
 *
 * La règle du harnais: l'horloge simulée doit rester ≥ l'heure réelle, sinon le
 * job décide sur une heure et la base estampille sur une autre (défaut L0 de
 * cette QA). On avance donc, on ne recule jamais.
 */
export function nextLocalHour(hour: number, tz: string, from = new Date()): Date {
  for (let i = 0; i <= 48; i++) {
    const cand = new Date(from.getTime() + i * 3600_000);
    if (localHour(cand, tz) === hour) {
      // On se cale à la demie pour être loin des bords d'heure.
      const d = new Date(cand);
      d.setUTCMinutes(30, 0, 0);
      if (localHour(d, tz) !== hour) continue;
      if (d.getTime() < from.getTime()) continue;
      return d;
    }
  }
  throw new Error(`nextLocalHour(${hour}, ${tz}) introuvable`);
}

/**
 * LE MÊME SOIR, N JOURS PLUS TARD — et pas « +N×24 h ».
 *
 * 🔴 CE HELPER EXISTE PARCE QUE L'ABSENCE A PRODUIT UN FAUX ROUGE (X3).
 * `base + 120 * 24 h` depuis un soir d'août tombe en décembre: l'heure d'été
 * est finie, le même instant UTC vaut 18h30 locales, et l'élève est HORS de la
 * fenêtre 19h-20h. Le moteur se taisait pour la bonne raison — « pas dans la
 * fenêtre » — et l'épreuve concluait qu'il avait cessé d'être muet.
 *
 * Ce n'est PAS un défaut produit: le cron est horaire et résout l'heure locale
 * à chaque tick. C'est un défaut de HARNAIS, et exactement celui contre lequel
 * ce dépôt met en garde — un décor qui ment sur le produit fabrique des défauts
 * qui n'existent pas.
 */
export function eveningIn(base: Date, days: number, tz = TZ): Date {
  const target = new Date(base.getTime() + days * 24 * 3600_000);
  const wanted = localDate(target, tz);
  for (let h = -14; h <= 14; h++) {
    const cand = new Date(target.getTime() + h * 3600_000);
    if (localDate(cand, tz) === wanted && localHour(cand, tz) === 19) {
      const d = new Date(cand);
      d.setUTCMinutes(30, 0, 0);
      if (localHour(d, tz) === 19 && localDate(d, tz) === wanted) return d;
    }
  }
  throw new Error(`eveningIn(+${days}) introuvable`);
}

export type Fixture = {
  coach: Coach;
  student: Student;
  /** L'instant utilisé pour tous les appels de cron du scénario. */
  now: Date;
  today: string;
};

export type FixtureOpts = {
  /** Le rythme déclaré. `null` = aucune ligne `student_goals`. */
  rhythm?: string[] | null;
  /** Combien de jours DISTINCTS portent un signal de faim. */
  hungerDays?: number;
  /** Combien de compositions ont porté le bloc satiété. */
  adaptations?: number;
  /** La doctrine publiée du coach. `null` = aucune. */
  doctrine?: { beliefs?: unknown[]; forbidden?: unknown[] } | null;
  /** Le plancher TCA. */
  restrictionFlag?: boolean;
  locale?: string;
  hourLocal?: number;
  coach?: Coach;
};

export async function makeFixture(opts: FixtureOpts = {}): Promise<Fixture> {
  const db = admin();
  const coach = opts.coach ?? await makeCoach({ displayName: "FF028 Coach" });
  const student = await makeStudent({
    coach,
    timezone: TZ,
    locale: opts.locale ?? "en-US",
    fullName: "FF028 Student",
  });
  await publishPlanFor(coach, student.userId, { timezone: TZ });

  const now = nextLocalHour(opts.hourLocal ?? 19, TZ);
  const today = localDate(now, TZ);

  // ── LE RYTHME ───────────────────────────────────────────────────────────
  const rhythm = opts.rhythm === undefined ? ["lunch", "dinner"] : opts.rhythm;
  if (rhythm !== null) {
    const { error } = await db.from("student_goals").insert({
      user_id: student.userId,
      goal: "fat_loss",
      content_locale: "en-GB",
      practical_constraints: {
        eating_rhythm: rhythm.map((slot) => ({ slot, size: null })),
      },
    } as never);
    if (error) throw new Error(`student_goals: ${error.message}`);
  }

  // ── LA FAIM (FF-027), en jours DISTINCTS de la fenêtre ──────────────────
  const hungerDays = opts.hungerDays ?? 3;
  for (let i = 1; i <= hungerDays; i++) {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    const { error } = await db.from("student_hunger_reports").insert({
      user_id: student.userId,
      local_date: d.toISOString().slice(0, 10),
      source: "chat",
      matched: "ff028 fixture",
      student_note: "ff028 fixture",
      content_locale: "en-US",
    } as never);
    if (error) throw new Error(`hunger: ${error.message}`);
  }

  // ── LES ADAPTATIONS DÉJÀ TENTÉES ────────────────────────────────────────
  const adaptations = opts.adaptations ?? 2;
  for (let i = 1; i <= adaptations; i++) {
    const monday = new Date(`${mondayOf(new Date(`${today}T12:00:00Z`))}T12:00:00Z`);
    monday.setUTCDate(monday.getUTCDate() - 7 * i);
    const { error } = await db.from("student_week_plans").insert({
      user_id: student.userId,
      week_start: monday.toISOString().slice(0, 10),
      status: "draft",
      items: [],
      content_locale: "en-GB",
      generated_from: { satiety_priority: true, hunger_days: 3 },
    } as never);
    if (error) throw new Error(`week_plan: ${error.message}`);
  }

  // ── LA DOCTRINE ─────────────────────────────────────────────────────────
  if (opts.doctrine !== null) {
    const d = opts.doctrine ?? {
      beliefs: [{
        key: "satiety_first",
        claim: "Build every meal so it holds you until the next one.",
        rationale: "Hunger is what breaks a week.",
        goalScope: [],
      }],
    };
    const { error } = await db.from("coach_doctrines").insert({
      coach_id: coach.coachId,
      version: 1,
      beliefs: d.beliefs ?? [],
      forbidden: d.forbidden ?? [],
      vocabulary: [],
      arbitrations: [],
      foods: { discouraged: [] },
      qa: [],
      daily_practices: [],
      voice: {},
      content_locale: "en-GB",
      published_at: new Date().toISOString(),
    } as never);
    if (error) throw new Error(`coach_doctrines: ${error.message}`);
  }

  // ── LE PLANCHER TCA ─────────────────────────────────────────────────────
  if (opts.restrictionFlag) {
    const { error } = await db.from("weekly_reviews").insert({
      user_id: student.userId,
      week_start_date: mondayOf(new Date(`${today}T12:00:00Z`)),
      risk_band: "restriction_flag",
      content_locale: "en-GB",
    } as never);
    if (error) throw new Error(`weekly_reviews: ${error.message}`);
  }

  return { coach, student, now, today };
}

/**
 * LE PAS DU MOTEUR, SUR LE VRAI CODE, CONTRE LA VRAIE BASE.
 *
 * ⚠️ POURQUOI PAS PAR HTTP. Le runtime edge local ne SERT que les fonctions
 * listées dans `SUPABASE_INTERNAL_FUNCTIONS_CONFIG`, une variable que le CLI
 * fige à la CRÉATION du conteneur: une fonction neuve rend 404 tant que
 * `supabase stop && supabase start` n'a pas été relancé — et ce conteneur est
 * partagé avec une autre session. C'est pour ça que le corps du job vit dans
 * `_shared/keel/daily_recommendation_engine.ts` et pas dans son `index.ts`:
 * `runRecommendationStep` est LE code de production, joué ici avec un vrai
 * client admin sur la vraie base. Ce qui n'est pas couvert par ce chemin est la
 * coquille HTTP (garde interne, pagination, budget de temps), copiée verbatim
 * de `keel-daily-pulse-v1`.
 */
export async function runEngine(
  fx: Fixture,
  opts: { dryRun?: boolean; now?: Date; userIds?: string[] } = {},
): Promise<any> {
  const { runRecommendationStep } = await import(
    "../supabase/functions/_shared/keel/daily_recommendation_engine.ts"
  );
  const db = admin();
  const ids = opts.userIds ?? [fx.student.userId];
  const silent_reasons: Record<string, number> = {};
  const proposed_actions: Record<string, number> = {};
  const skipped_by_reason: Record<string, number> = {};
  const doctrine_removed: Record<string, number> = {};
  const failures: string[] = [];
  let analysed = 0;
  let proposed = 0;

  for (const userId of ids) {
    const { data } = await db
      .from("profiles")
      .select("timezone, proactive_muted_at")
      .eq("id", userId)
      .maybeSingle();
    const row = (data ?? {}) as Record<string, unknown>;
    try {
      const step = await runRecommendationStep(db, {
        userId,
        timezone: row.timezone ? String(row.timezone) : null,
        optedOut: Boolean(row.proactive_muted_at),
        now: opts.now ?? fx.now,
        dryRun: opts.dryRun === true,
        requestId: `ff028-${nonce()}`,
        onDoctrineRemoved: (id: string, reason: string) => {
          const key = `${id}:${reason.split(":")[0]}`;
          doctrine_removed[key] = (doctrine_removed[key] ?? 0) + 1;
        },
      });
      if (step.outcome === "outside_window") {
        skipped_by_reason.outside_window =
          (skipped_by_reason.outside_window ?? 0) + 1;
        continue;
      }
      analysed++;
      if (step.outcome === "silent") {
        silent_reasons[step.reason] = (silent_reasons[step.reason] ?? 0) + 1;
        continue;
      }
      if (step.outcome === "not_delivered") {
        skipped_by_reason[step.reason] =
          (skipped_by_reason[step.reason] ?? 0) + 1;
        continue;
      }
      proposed++;
      proposed_actions[step.action] = (proposed_actions[step.action] ?? 0) + 1;
    } catch (error) {
      failures.push(
        `${userId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return {
    analysed,
    proposed,
    silent: Math.max(0, analysed - proposed),
    silent_reasons,
    proposed_actions,
    doctrine_removed,
    skipped_by_reason,
    failures,
  };
}

/** Le tap du soir (pouls), pour l'épreuve « un seul message par soir ». */
export async function runPulse(fx: Fixture, now?: Date): Promise<any> {
  const res = await callCron("keel-daily-pulse-v1", {
    now: (now ?? fx.now).toISOString(),
    budget_ms: 90_000,
  });
  if (res.status !== 200) {
    throw new Error(`pulse ${res.status}: ${JSON.stringify(res.json)}`);
  }
  return res.json;
}

/** La proposition livrée à cet élève, relue dans `chat_messages`. */
export async function deliveredProposal(userId: string): Promise<
  { content: string; buttons: Array<{ payload: string; label: string }> } | null
> {
  const { data } = await admin()
    .from("chat_messages")
    .select("content,metadata,created_at")
    .eq("user_id", userId)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(10);
  for (const row of (data ?? []) as Array<Record<string, any>>) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    if (meta.purpose === "keel_daily_recommendation") {
      return {
        content: String(row.content ?? ""),
        buttons: (meta.buttons ?? []) as Array<
          { payload: string; label: string }
        >,
      };
    }
  }
  return null;
}

/** Un tap de bouton, par la VRAIE porte d'entrée. */
export async function tap(
  student: Student,
  payload: string,
  label = "tap",
  opts: { clientMessageId?: string } = {},
): Promise<{ status: number; reply: string | null; acks: string[] }> {
  const res = await callAs(student, "chat-inbound-v1", {
    client_message_id: opts.clientMessageId ?? `ff028-${nonce()}`,
    kind: "button",
    text: label,
    button_payload: payload,
  });
  // ⚠️ ON FILTRE SUR LE `purpose`, PAS SUR `created_at`.
  // La proposition est livrée avec l'horloge SIMULÉE du job (dans le futur),
  // l'accusé avec l'horloge réelle: un « dernier message » trié par date rend
  // donc la PROPOSITION, et un harnais qui lit la mauvaise bulle est un harnais
  // qui ment. On relit la bulle, jamais la réponse HTTP — mais la bonne.
  const { data } = await admin()
    .from("chat_messages")
    .select("content,metadata,created_at")
    .eq("user_id", student.userId)
    .eq("role", "assistant")
    .order("created_at", { ascending: true });
  const acks = ((data ?? []) as Array<Record<string, any>>)
    .filter((r) =>
      (r.metadata ?? {}).purpose === "keel_daily_recommendation_ack"
    )
    .map((r) => String(r.content ?? ""));
  return { status: res.status, reply: acks.at(-1) ?? null, acks };
}

export async function rhythmOf(userId: string): Promise<string[]> {
  const { data } = await admin()
    .from("student_goals")
    .select("practical_constraints")
    .eq("user_id", userId)
    .maybeSingle();
  const raw = (data?.practical_constraints ?? {}) as Record<string, unknown>;
  const arr = Array.isArray(raw.eating_rhythm) ? raw.eating_rhythm : [];
  return arr.map((e: any) => typeof e === "string" ? e : String(e?.slot ?? ""));
}

export async function proposalsOf(userId: string): Promise<
  Array<Record<string, any>>
> {
  const { data } = await admin()
    .from("student_daily_recommendations")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return (data ?? []) as Array<Record<string, any>>;
}

export async function askLedgerOf(userId: string): Promise<
  Array<Record<string, any>>
> {
  const { data } = await admin()
    .from("meal_precision_questions")
    .select("ask_kind,local_date,axis,asked_for_message_id")
    .eq("user_id", userId);
  return (data ?? []) as Array<Record<string, any>>;
}

export async function purge(userId: string): Promise<void> {
  const db = admin();
  for (
    const [table, col] of [
      ["student_daily_recommendations", "user_id"],
      ["meal_precision_questions", "user_id"],
      ["student_hunger_reports", "user_id"],
      ["student_goals", "user_id"],
      ["weekly_reviews", "user_id"],
      ["inbound_dedup", "user_id"],
      ["outbound_messages", "user_id"],
      ["chat_messages", "user_id"],
      ["user_chat_states", "user_id"],
      ["student_daily_checkins", "user_id"],
      ["plan_commitments", "user_id"],
      ["student_week_plans", "user_id"],
      ["coach_clients", "student_user_id"],
    ] as const
  ) {
    await db.from(table).delete().eq(col, userId);
  }
  await db.from("plan_versions").delete().eq("student_id", userId);
  await db.auth.admin.deleteUser(userId).catch(() => {});
}

export async function purgeCoach(coach: Coach): Promise<void> {
  const db = admin();
  await db.from("coach_doctrines").delete().eq("coach_id", coach.coachId);
  await db.auth.admin.deleteUser(coach.userId).catch(() => {});
}
