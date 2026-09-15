/**
 * FF-056 — RUN RÉEL. Vraie base locale, vraies fonctions edge, vrai modèle.
 *
 * Lancement:
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=… \
 *   SUPABASE_SERVICE_ROLE_KEY=… deno run -A scratchpad/ff056_real_run.ts
 *
 * ⚠️ LA VÉRITÉ EST EN BASE. Chaque verdict cite sa ligne relue, jamais la
 * réponse HTTP. Fixtures préfixées `ff056_`, nettoyées en fin de run.
 */
import {
  admin,
  cleanup,
  makeCoach,
  makeStudent,
  mondayOf,
  publishPlanFor,
  sql,
  turn,
  type Coach,
  type Student,
} from "../docs/nutrition-pivot/qa-web/harness.ts";
import { runWeightDivergenceStep } from "../supabase/functions/_shared/keel/weight_divergence_engine.ts";

const db = admin();
const TZ = "Europe/Paris";
const created: string[] = [];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function shift(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** 19h30 heure de Paris aujourd'hui — la fenêtre du soir. */
function eveningNow(): Date {
  const iso = `${today()}T17:30:00.000Z`;
  return new Date(iso);
}

const results: Array<{
  level: string;
  scenario: string;
  verdict: string;
  proof: string;
}> = [];
function record(level: string, scenario: string, verdict: string, proof: string) {
  results.push({ level, scenario, verdict, proof });
  console.log(`[${verdict}] ${level} · ${scenario}\n    ${proof}`);
}

/**
 * UN COACH FRAIS TOUS LES TROIS ÉLÈVES.
 *
 * Cicatrice `qa-harness-trial-seat-cap`: un coach en essai plafonne à 3 sièges
 * vivants, et le 4e élève fait PLANTER le run en cours — pas le suivant.
 */
let seatCoach: Coach | null = null;
let seats = 0;
async function freshCoach(): Promise<Coach> {
  if (seatCoach === null || seats >= 3) {
    seatCoach = await makeCoach({ country: "FR" });
    created.push(seatCoach.userId);
    seats = 0;
  }
  seats++;
  return seatCoach;
}

/** Un élève provisionné COMME LA PRODUCTION: mesures datées, plan fini, objectif. */
async function makeSubject(opts: {
  coach?: Coach;
  locale: string;
  goal: string;
  /** Les moyennes hebdo voulues, la plus ancienne d'abord. */
  weekly: number[];
  /** Combien de jours après la fin du dernier plan. */
  daysAfterPlanEnd?: number;
  birthDate?: string;
}): Promise<Student> {
  const coach = opts.coach ?? await freshCoach();
  const s = await makeStudent({
    coach,
    timezone: TZ,
    country: "FR",
    locale: opts.locale,
    withAdoptedPlan: true,
  });
  created.push(s.userId);
  await publishPlanFor(coach, s.userId, { timezone: TZ });

  await db.from("profiles").update({
    birth_date: opts.birthDate ?? "1988-04-12",
  } as never).eq("id", s.userId);

  await db.from("student_goals").insert({
    user_id: s.userId,
    goal: opts.goal,
    content_locale: opts.locale,
  } as never);

  // ── LES MESURES, DANS LA FORME DE LA PRODUCTION ────────────────────────
  // `local_date` + `measured_at` + `kind` + `value_si` + `source`. Une fixture
  // qui daterait mal validerait un détecteur imaginaire.
  const t = today();
  const rows = opts.weekly.map((value, i) => {
    // Le dernier point est daté d'aujourd'hui, les précédents de 7 en 7.
    const localDate = shift(t, -(opts.weekly.length - 1 - i) * 7);
    return {
      user_id: s.userId,
      measured_at: `${localDate}T07:12:00.000Z`,
      local_date: localDate,
      kind: "weight",
      value_si: value,
      source: "chat",
      content_locale: opts.locale,
    };
  });
  const ins = await db.from("student_body_measures").insert(rows as never)
    .select("id");
  if (ins.error) throw new Error(`mesures: ${ins.error.message}`);

  // Un plan TERMINÉ (`student_generated_meals`), pour la fenêtre ~J+2.
  const after = opts.daysAfterPlanEnd ?? 4;
  const startsOn = shift(t, -(after + 6));
  // ⚠️ LA FORME DE PRODUCTION, PAS UN RACCOURCI. `mode`, `scope`,
  // `content_locale` et `plan_kind` sont NOT NULL avec des CHECK fermés: une
  // fixture qui les omet ne s'insère pas — c'est exactement ce qu'on veut, et
  // c'est ce qui a échoué au premier run de cette sonde.
  const gm = await db.from("student_generated_meals").insert({
    user_id: s.userId,
    scope: "several_days",
    mode: "to_shop",
    plan_kind: "personal",
    content_locale: opts.locale,
    starts_on: startsOn,
    duration_days: 7,
    dishes: [],
    preparations: [],
  } as never).select("id, starts_on, ends_on");
  if (gm.error) throw new Error(`student_generated_meals: ${gm.error.message}`);
  return s;
}

async function step(s: Student, dryRun = false) {
  const p = await db.from("profiles")
    .select("timezone, proactive_muted_at, birth_date, locale")
    .eq("id", s.userId).single();
  const row = p.data as Record<string, unknown>;
  return await runWeightDivergenceStep(db, {
    userId: s.userId,
    timezone: String(row.timezone ?? ""),
    optedOut: Boolean(row.proactive_muted_at),
    birthDate: row.birth_date ?? null,
    locale: row.locale ? String(row.locale) : null,
    now: eveningNow(),
    dryRun,
    requestId: `ff056-${Date.now()}`,
  });
}

/**
 * ⚠️ LA SONDE MENTAIT, ET C'EST LA LEÇON T-15 DE CE LOT.
 *
 * Le pas du soir livre la question avec `now = eveningNow()` — 19h30 locale,
 * c'est-à-dire une heure DANS LE FUTUR par rapport à l'horloge du run. Le
 * message d'ouverture porte donc un `created_at` postérieur à toutes les
 * réponses qui suivront, et `turn()` — qui relit « le dernier message assistant
 * APRÈS le précédent » — rendait `null`. Le premier passage a donc lu « aucune
 * réponse » sur des tours qui répondaient parfaitement.
 *
 * On recale l'horodatage sur le passé immédiat, ce que la production fait
 * naturellement (le cron tourne À 19h30, il ne la simule pas).
 */
async function settleOpeningMessage(userId: string): Promise<void> {
  await sql(
    `update chat_messages set created_at = now() - interval '2 minutes'
      where user_id = '${userId}' and role = 'assistant'`,
  );
}

async function episodeOf(userId: string): Promise<string> {
  return await sql(
    `select state, category, shape, goal_direction, turn_count,
            observation_opened_on, observation_ends_on
       from student_weight_divergence_episodes
      where user_id = '${userId}'
      order by opened_at desc limit 1`,
  );
}

// ===========================================================================
async function main() {
  // ── EASY 1 — la question part, en français ─────────────────────────────
  {
    const s = await makeSubject({
      locale: "fr-FR",
      goal: "fat_loss",
      weekly: [80.0, 80.6, 81.3],
    });
    const out = await step(s);
    const ep = await episodeOf(s.userId);
    const ask = await sql(
      `select ask_kind, axis, question from meal_precision_questions
        where user_id = '${s.userId}'`,
    );
    const msg = await sql(
      `select role, left(content, 90) from chat_messages
        where user_id = '${s.userId}' order by created_at desc limit 1`,
    );
    record(
      "easy",
      "objectif perte + 3 mesures qui montent (FR) → la question part",
      out.outcome === "asked" && ask.includes("weight_divergence_question")
        ? "GREEN"
        : "RED",
      `outcome=${out.outcome} | episode=${ep.trim()} | ask=${ask.trim()} | msg=${msg.trim()}`,
    );

    // Le message est-il LE littéral gelé, et en français ?
    record(
      "easy",
      "la question est le littéral gelé FR, sujet = le plan",
      msg.includes("Si tu manges ce qui est prévu") ? "GREEN" : "RED",
      msg.trim(),
    );

    // ── EASY 2 — la réponse « le matin je grignote » ─────────────────────
    await settleOpeningMessage(s.userId);
    const t1 = await turn(s, "le matin je grignote en me levant");
    const ep2 = await episodeOf(s.userId);
    record(
      "easy",
      "réponse `named_spot` (FR) → catégorie écrite, épisode avancé",
      ep2.includes("named_spot") ? "GREEN" : "RED",
      `http=${t1.status} reply="${(t1.reply ?? "<null>").slice(0, 200)}" | episode=${ep2.trim()}` +
        ` | json=${JSON.stringify(t1.json).slice(0, 300)}`,
    );

    // ── ADVERSARIAL — la question ne se re-pose pas ──────────────────────
    const after: string[] = [];
    for (let i = 0; i < 3; i++) {
      const t = await turn(s, ["merci", "et sinon quoi de neuf ?", "ok"][i]);
      after.push(t.reply ?? "");
    }
    const residue = after.some((r) =>
      /devrait descendre|qu'est-ce qui se passe|grignote/i.test(r)
    );
    record(
      "adversarial",
      "après l'épisode, 3 tours ordinaires ne rappellent RIEN",
      residue ? "RED" : "GREEN",
      after.map((r) => r.slice(0, 70)).join(" || "),
    );
  }

  // ── EASY 3 — la question part, en anglais ──────────────────────────────
  {
    const s = await makeSubject({
      locale: "en-US",
      goal: "fat_loss",
      weekly: [90.0, 90.7, 91.5],
    });
    const out = await step(s);
    const msg = await sql(
      `select left(content, 90) from chat_messages
        where user_id = '${s.userId}' order by created_at desc limit 1`,
    );
    record(
      "easy",
      "même cas en anglais → littéral gelé EN",
      out.outcome === "asked" && msg.includes("If you're eating what's planned")
        ? "GREEN"
        : "RED",
      `outcome=${out.outcome} | msg=${msg.trim()}`,
    );
  }

  // ── MEDIUM — une seule pesée en hausse dans une série stable ───────────
  {
    const s = await makeSubject({
      locale: "fr-FR",
      goal: "fat_loss",
      weekly: [80.0, 80.0, 80.0, 81.0],
    });
    const out = await step(s);
    const n = await sql(
      `select count(*) from student_weight_divergence_episodes where user_id = '${s.userId}'`,
    );
    record(
      "medium",
      "une seule pesée en hausse (série stable) → RIEN",
      out.outcome === "no_divergence" && n.trim().endsWith("0") ? "GREEN" : "RED",
      `outcome=${JSON.stringify(out)} | episodes=${n.trim()}`,
    );
  }

  // ── MEDIUM — série bruitée sans tendance ──────────────────────────────
  {
    const s = await makeSubject({
      locale: "fr-FR",
      goal: "fat_loss",
      weekly: [80.0, 80.9, 80.1, 80.8, 80.2],
    });
    const out = await step(s);
    record(
      "medium",
      "bruit hydrique sans tendance → RIEN",
      out.outcome === "no_divergence" ? "GREEN" : "RED",
      JSON.stringify(out),
    );
  }

  // ── MEDIUM — recomposition qui monte: aucune direction ────────────────
  {
    const s = await makeSubject({
      locale: "fr-FR",
      goal: "recomposition",
      weekly: [80.0, 80.6, 81.3],
    });
    const out = await step(s);
    record(
      "medium",
      "objectif `recomposition` → aucune direction, aucune question",
      out.outcome === "no_divergence" &&
        JSON.stringify(out).includes("no_directional_goal")
        ? "GREEN"
        : "RED",
      JSON.stringify(out),
    );
  }

  // ── MEDIUM — prise de masse qui stagne ────────────────────────────────
  {
    const s = await makeSubject({
      locale: "fr-FR",
      goal: "muscle_gain",
      weekly: [70.0, 70.1, 69.9, 70.0, 70.2],
    });
    const out = await step(s);
    const msg = await sql(
      `select left(content, 90) from chat_messages
        where user_id = '${s.userId}' order by created_at desc limit 1`,
    );
    record(
      "medium",
      "prise de masse qui stagne → même flow, formulation « monter »",
      out.outcome === "asked" && msg.includes("devrait monter") ? "GREEN" : "RED",
      `outcome=${out.outcome} | msg=${msg.trim()}`,
    );
  }

  // ── MEDIUM — le budget T4 est déjà pris ───────────────────────────────
  {
    const s = await makeSubject({
      locale: "fr-FR",
      goal: "fat_loss",
      weekly: [80.0, 80.6, 81.3],
    });
    // Une demande d'un AUTRE genre part d'abord, comme FF-028 le ferait.
    await db.from("meal_precision_questions").insert({
      user_id: s.userId,
      local_date: today(),
      source: "chat",
      axis: null,
      ask_kind: "daily_recommendation",
      question: "ff056_budget_probe",
      asked_for_message_id: `ff056-budget-${s.userId}`,
    } as never);
    const out = await step(s);
    const n = await sql(
      `select count(*) from student_weight_divergence_episodes where user_id = '${s.userId}'`,
    );
    record(
      "medium",
      "budget T4 déjà pris → la question ATTEND (aucun épisode)",
      out.outcome === "skipped" &&
        (out as { reason: string }).reason === "ask_budget_taken" &&
        n.trim().endsWith("0")
        ? "GREEN"
        : "RED",
      `outcome=${JSON.stringify(out)} | episodes=${n.trim()}`,
    );
  }

  // ── HARD — mineur ─────────────────────────────────────────────────────
  {
    const s = await makeSubject({
      locale: "fr-FR",
      goal: "fat_loss",
      weekly: [60.0, 60.5, 61.0],
      birthDate: shift(today(), -365 * 15),
    });
    const out = await step(s);
    record(
      "hard",
      "élève MINEUR → muet, motif nommé",
      out.outcome === "skipped" &&
        (out as { reason: string }).reason === "minor_student"
        ? "GREEN"
        : "RED",
      JSON.stringify(out),
    );
  }

  // ── HARD — trop tôt après une fin de plan (le jour de FF-054) ─────────
  {
    const s = await makeSubject({
      locale: "fr-FR",
      goal: "fat_loss",
      weekly: [80.0, 80.6, 81.3],
      daysAfterPlanEnd: 1,
    });
    const out = await step(s);
    record(
      "hard",
      "J+1 après la fin du plan (jour de FF-054) → muet",
      out.outcome === "skipped" &&
        (out as { reason: string }).reason === "too_soon_after_plan_end"
        ? "GREEN"
        : "RED",
      JSON.stringify(out),
    );
  }

  // ── HARD — le refus, en français puis en anglais ─────────────────────
  for (const [locale, phrase, weight] of [
    ["fr-FR", "je n'ai pas envie d'en parler", 82],
    ["en-US", "I'd rather not talk about it", 92],
  ] as const) {
    const s = await makeSubject({
      locale,
      goal: "fat_loss",
      weekly: [weight, weight + 0.6, weight + 1.3],
    });
    const out = await step(s);
    if (out.outcome !== "asked") {
      record("hard", `refus (${locale}) — la question n'est pas partie`, "RED", JSON.stringify(out));
      continue;
    }
    await settleOpeningMessage(s.userId);
    const t = await turn(s, phrase);
    const ep = await episodeOf(s.userId);
    record(
      "hard",
      `refus (${locale}) → état \`declined\`, sortie immédiate`,
      ep.includes("declined") ? "GREEN" : "RED",
      `reply="${(t.reply ?? "").slice(0, 140)}" | episode=${ep.trim()}`,
    );
    // Le cooldown doublé: un second pas ne repose rien.
    const again = await step(s);
    record(
      "hard",
      `refus (${locale}) → cooldown, aucune nouvelle question`,
      again.outcome === "skipped" &&
        ["cooldown", "already_asked_today", "ask_budget_taken"].includes(
          (again as { reason: string }).reason,
        )
        ? "GREEN"
        : "RED",
      JSON.stringify(again),
    );
  }

  // ── HARD — la personne ignore: expiration silencieuse ────────────────
  {
    const s = await makeSubject({
      locale: "fr-FR",
      goal: "fat_loss",
      weekly: [80.0, 80.6, 81.3],
    });
    await step(s);
    // On vieillit l'épisode de trois jours (au-delà de OPEN_FOR_DAYS = 2).
    await db.from("student_weight_divergence_episodes")
      .update({ opened_local_date: shift(today(), -3) } as never)
      .eq("user_id", s.userId);
    // Le pas suivant expire d'abord, PUIS retombe sur le cooldown.
    const out = await step(s);
    const ep = await episodeOf(s.userId);
    record(
      "hard",
      "question ignorée → expiration SILENCIEUSE, aucune relance",
      ep.includes("expired") && out.outcome !== "asked" ? "GREEN" : "RED",
      `outcome=${JSON.stringify(out)} | episode=${ep.trim()}`,
    );
    const msgs = await sql(
      `select count(*) from chat_messages where user_id = '${s.userId}'
         and role = 'assistant'`,
    );
    record(
      "hard",
      "l'expiration n'envoie AUCUN message",
      msgs.trim().endsWith("1") ? "GREEN" : "RED",
      `messages assistant = ${msgs.trim()} (1 = la seule question d'ouverture)`,
    );
  }

  // ── HARD — `restriction_flag` levé au déclenchement ──────────────────
  {
    const s = await makeSubject({
      locale: "fr-FR",
      goal: "fat_loss",
      weekly: [80.0, 80.6, 81.3],
    });
    // Une perte rapide RÉELLE dans la série arme le plancher TCA.
    // (le plancher lit la même table de mesures, en semaines dérivées)
    const t = today();
    await db.from("student_body_measures").insert([
      {
        user_id: s.userId,
        measured_at: `${shift(t, -21)}T07:00:00.000Z`,
        local_date: shift(t, -21),
        kind: "weight",
        value_si: 90.0,
        source: "chat",
      },
      {
        user_id: s.userId,
        measured_at: `${shift(t, -14)}T07:00:00.000Z`,
        local_date: shift(t, -14),
        kind: "weight",
        value_si: 86.0,
        source: "chat",
      },
    ] as never);
    const out = await step(s);
    record(
      "hard",
      "restriction_flag levé → muet, motif `restriction_flag`",
      out.outcome === "skipped" &&
        (out as { reason: string }).reason === "restriction_flag"
        ? "GREEN"
        : "RED",
      JSON.stringify(out),
    );
  }

  // ── EXTRA-HARD — deux instances du job en même temps ─────────────────
  {
    const s = await makeSubject({
      locale: "fr-FR",
      goal: "fat_loss",
      weekly: [80.0, 80.6, 81.3],
    });
    const [a, b] = await Promise.all([step(s), step(s)]);
    const n = await sql(
      `select count(*) from student_weight_divergence_episodes where user_id = '${s.userId}'`,
    );
    const asks = await sql(
      `select count(*) from meal_precision_questions where user_id = '${s.userId}'`,
    );
    record(
      "extra-hard",
      "deux instances concurrentes → UN épisode, UNE demande",
      n.trim().endsWith("1") && asks.trim().endsWith("1") ? "GREEN" : "RED",
      `a=${a.outcome} b=${b.outcome} | episodes=${n.trim()} | asks=${asks.trim()}`,
    );
  }

  // ── EXTRA-HARD — répondre en anglais à une question française ────────
  {
    const s = await makeSubject({
      locale: "fr-FR",
      goal: "fat_loss",
      weekly: [84.0, 84.6, 85.3],
    });
    const out = await step(s);
    if (out.outcome !== "asked") {
      record("extra-hard", "FR → réponse EN: la question n'est pas partie", "RED", JSON.stringify(out));
    } else {
      await settleOpeningMessage(s.userId);
      const t = await turn(s, "I started a new medication last month");
      const ep = await episodeOf(s.userId);
      record(
        "extra-hard",
        "question FR, réponse EN `medical` → classée, aucune interprétation",
        ep.includes("medical") ? "GREEN" : "RED",
        `reply="${(t.reply ?? "").slice(0, 160)}" | episode=${ep.trim()}`,
      );
    }
  }

  // ── EXTRA-HARD — « je ne sais pas » → fenêtre d'observation ──────────
  {
    const s = await makeSubject({
      locale: "fr-FR",
      goal: "fat_loss",
      weekly: [86.0, 86.6, 87.3],
    });
    const out = await step(s);
    if (out.outcome !== "asked") {
      record("extra-hard", "fenêtre d'observation: la question n'est pas partie", "RED", JSON.stringify(out));
    } else {
      await settleOpeningMessage(s.userId);
      const t = await turn(s, "je ne sais pas du tout");
      const ep = await episodeOf(s.userId);
      const win = ep.includes(shift(today(), 3));
      record(
        "extra-hard",
        "`unknown` → fenêtre d'observation ouverte, bornée à J+3",
        ep.includes("unknown") && win ? "GREEN" : "RED",
        `reply="${(t.reply ?? "").slice(0, 200)}" | episode=${ep.trim()}`,
      );
    }
  }

  // ── ADVERSARIAL — la fuite au foyer ─────────────────────────────────
  // Un second compte, membre du même foyer, ne doit rien voir de l'épisode.
  {
    const other = await makeStudent({
      timezone: TZ,
      country: "FR",
      locale: "fr-FR",
    });
    created.push(other.userId);
    const t = await turn(other, "qu'est-ce que je mange ce soir ?");
    const leak = /divergence|devrait descendre|grignote/i.test(t.reply ?? "");
    record(
      "adversarial",
      "un autre compte ne voit RIEN de l'épisode d'autrui",
      leak ? "RED" : "GREEN",
      `reply="${(t.reply ?? "").slice(0, 140)}"`,
    );
  }

  // ── LE TABLEAU ───────────────────────────────────────────────────────
  console.log("\n\n=== TABLEAU ===");
  for (const r of results) {
    console.log(`| ${r.level} | ${r.scenario} | ${r.verdict} |`);
  }
  const reds = results.filter((r) => r.verdict === "RED");
  console.log(`\n${results.length - reds.length} GREEN / ${reds.length} RED`);
}

try {
  await main();
} finally {
  console.log("\n=== NETTOYAGE ===");
  for (const id of created) {
    try {
      await cleanup(id);
    } catch (e) {
      console.warn(`cleanup ${id}: ${e}`);
    }
  }
  const left = await sql(
    `select count(*) from student_weight_divergence_episodes`,
  );
  console.log(`épisodes restants en base: ${left.trim()}`);
}
