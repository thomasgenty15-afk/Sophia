/**
 * FF-009 — EXTRA-HARD. Les croisements.
 *
 *   X1  hors-plan + décoche du plat prévu le MÊME soir
 *   X2  la doctrine qui interdit « cheat meal » — six formes, deux langues
 *   X3  une semaine mixte: trois comptes justes en base ET à l'écran coach
 *   X4  deux hors-plan consécutifs (la lane de précision les avale-t-elle ?)
 *   X6  la vue coach expose `plan_relation` SANS perdre `disqualified_reason`
 *
 *   SUPABASE_URL=… … deno run -A scratchpad/ff009_extra.ts [X1|X2|X3|X4|X6|all]
 */
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  admin,
  ANON,
  type Coach,
  cleanup,
  makeCoach,
  makeStudent,
  publishPlanFor,
  rows,
  type Student,
  turn,
  URL_BASE,
} from "../docs/nutrition-pivot/qa-web/harness.ts";
import { aggregateWeekInFood } from "../frontend/src/keel/lib/weekInFood.ts";

const WHICH = (Deno.args[0] ?? "all").trim();
const verdicts: Array<{ id: string; ok: boolean; detail: string }> = [];
const say = (id: string, ok: boolean, detail: string) => {
  verdicts.push({ id, ok, detail });
  console.log(`${ok ? "🟢" : "🔴"} ${id} :: ${detail}`);
};

const coaches: Coach[] = [];
let seats = 0;
const students: string[] = [];

async function freshStudent(locale = "fr-FR"): Promise<{ st: Student; coach: Coach }> {
  if (seats === 0) {
    coaches.push(await makeCoach({ displayName: `FF009 X ${coaches.length + 1}` }));
    seats = 3;
  }
  const coach = coaches[coaches.length - 1];
  seats--;
  const fr = locale.startsWith("fr");
  const st = await makeStudent({
    coach,
    locale,
    timezone: fr ? "Europe/Paris" : "Europe/London",
    country: fr ? "FR" : "GB",
    fullName: "ff009_x",
  });
  await publishPlanFor(coach, st.userId, {
    timezone: fr ? "Europe/Paris" : "Europe/London",
    contentLocale: fr ? "fr-FR" : "en-GB",
  });
  students.push(st.userId);
  return { st, coach };
}

/** Le client PostgREST du coach — le VRAI chemin de `CoachStudentPage`. */
function asCoach(coach: Coach) {
  return createClient(URL_BASE, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${coach.accessToken}` } },
  });
}

const today = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// X1 — hors plan = MANGÉ ; décoché = NON mangé. Les deux le même soir.
// ---------------------------------------------------------------------------
async function X1() {
  const { st, coach } = await freshStudent("fr-FR");
  const t = await turn(st, "j'ai commandé une pizza ce soir");
  await new Promise((r) => setTimeout(r, 1500));

  // La coche du plat prévu, puis la décoche — exactement ce que fait
  // `mealTicks.ts` (source `quick_tap`, `as_planned`, puis `food_not_eaten`).
  const db = admin();
  const key = `tick:ff009x1:0`;
  await db.from("protocol_events").insert({
    user_id: st.userId,
    occurred_at: new Date().toISOString(),
    local_date: today(),
    slot_key: "dinner",
    source: "quick_tap",
    student_note: "Poulet rôti et brocolis",
    content_locale: "fr-FR",
    evidence_weight: 0.4,
    plan_relation: "as_planned",
    source_message_id: key,
  } as never);
  await db.from("protocol_events").update({ disqualified_reason: "food_not_eaten" } as never)
    .eq("user_id", st.userId).eq("source_message_id", key);

  const all = await rows(
    `select coalesce(plan_relation,'NULL')||'/'||coalesce(disqualified_reason,'-')||'/'||source
       from public.protocol_events where user_id='${st.userId}' order by created_at`,
  );
  const offPlanAlive = all.filter((l) => l.startsWith("off_plan/-")).length;
  const tickDead = all.filter((l) => l === "as_planned/food_not_eaten/quick_tap").length;
  say(
    "X1a",
    offPlanAlive >= 1 && tickDead === 1,
    `les DEUX colonnes cohabitent: ${all.join(" ;; ")}`,
  );

  // La vue coach: le hors-plan (mangé) passe, la décoche (non mangé) est filtrée.
  const cv = await asCoach(coach).from("coach_student_events")
    .select("plan_relation, source, local_date").eq("user_id", st.userId);
  const seen = (cv.data ?? []) as Array<{ plan_relation: string | null; source: string }>;
  const hasOffPlan = seen.some((r) => r.plan_relation === "off_plan");
  const hasDisqualified = seen.some((r) => r.source === "quick_tap");
  say(
    "X1b",
    hasOffPlan && !hasDisqualified && cv.error === null,
    `vue coach: ${seen.length} ligne(s), off_plan=${hasOffPlan}, décochée visible=${hasDisqualified}` +
      `${cv.error ? ` ERR ${cv.error.message}` : ""}`,
  );
  console.log(`   réponse: ${(t.reply ?? "").replace(/\n/g, " ").slice(0, 200)}`);
}

// ---------------------------------------------------------------------------
// X6 — la vue coach, épreuve d'exposition ET épreuve de filtre.
// ---------------------------------------------------------------------------
async function X6() {
  const cols = await rows(
    `select column_name from information_schema.columns
      where table_name='coach_student_events' order by column_name`,
  );
  say(
    "X6a",
    cols.includes("plan_relation"),
    `colonnes de la vue: plan_relation=${cols.includes("plan_relation")}`,
  );
  const def = await rows(
    `select replace(pg_get_viewdef('public.coach_student_events'::regclass), E'\n', ' ')`,
  );
  const text = def.join(" ");
  say(
    "X6b",
    /disqualified_reason IS NULL/i.test(text),
    `le filtre de rétractation est TOUJOURS dans la vue: ${
      /disqualified_reason IS NULL/i.test(text)
    }`,
  );
  const opts = await rows(
    `select coalesce(array_to_string(reloptions,','),'(null)') from pg_class
      where oid='public.coach_student_events'::regclass`,
  );
  say(
    "X6c",
    opts.join("").includes("security_invoker=off"),
    `reloptions = ${opts.join("")}`,
  );
}

// ---------------------------------------------------------------------------
// X3 — une semaine mixte. Trois comptes, jamais une somme.
// ---------------------------------------------------------------------------
async function X3() {
  const { st, coach } = await freshStudent("fr-FR");
  const db = admin();
  const base = {
    user_id: st.userId,
    content_locale: "fr-FR",
    occurred_at: new Date().toISOString(),
  };
  const d = (n: number) => {
    const x = new Date();
    x.setUTCDate(x.getUTCDate() - n);
    return x.toISOString().slice(0, 10);
  };
  // 4 cuisinés comme prévu · 2 hors plan · 1 photo · 1 décoché (invisible)
  const seed = [
    ...[0, 1, 2, 3].map((i) => ({
      ...base, local_date: d(i), source: "quick_tap", plan_relation: "as_planned",
      evidence_weight: 0.4, food_group_ref: "poultry", slot_key: "dinner",
      source_message_id: `ff009x3-tick-${i}`,
    })),
    ...[1, 2].map((i) => ({
      ...base, local_date: d(i), source: "chat", plan_relation: "off_plan",
      evidence_weight: 0.8, student_note: "j'ai commandé",
      source_message_id: `ff009x3-off-${i}`,
    })),
    {
      ...base, local_date: d(0), source: "photo", evidence_weight: 1.0,
      food_group_ref: "fatty_fish", source_message_id: "ff009x3-photo",
    },
    {
      ...base, local_date: d(4), source: "quick_tap", plan_relation: "as_planned",
      evidence_weight: 0.4, disqualified_reason: "food_not_eaten",
      source_message_id: "ff009x3-untick",
    },
  ];
  const ins = await db.from("protocol_events").insert(seed as never);
  if (ins.error) throw new Error(`seed X3: ${ins.error.message}`);

  const counts = await rows(
    `select coalesce(plan_relation,'NULL')||' '||source||' x'||count(*)::text
       from public.protocol_events where user_id='${st.userId}'
        and disqualified_reason is null
       group by coalesce(plan_relation,'NULL'), source order by 1`,
  );
  say("X3a", true, `base (rétractés exclus): ${counts.join(" ;; ")}`);

  // L'écran coach lit la VUE, avec le JWT du coach.
  const cv = await asCoach(coach).from("coach_student_events")
    .select("local_date, slot_key, portion_band, food_group_ref, recognized, source, plan_relation")
    .eq("user_id", st.userId);
  if (cv.error) {
    say("X3b", false, `vue coach ERR ${cv.error.message}`);
    return;
  }
  const agg = aggregateWeekInFood((cv.data ?? []) as never);
  const ok = agg.asPlannedMeals === 4 && agg.offPlanMeals === 2 &&
    agg.photoMeals === 1 && agg.meals === 7;
  say(
    "X3b",
    ok,
    `écran coach: prévu=${agg.asPlannedMeals} horsPlan=${agg.offPlanMeals} ` +
      `photo=${agg.photoMeals} totalFaitsLus=${agg.meals} (attendu 4/2/1/7)`,
  );
  // La somme des trois n'est JAMAIS ce qui s'affiche: 4+2+1=7 ici par hasard,
  // donc on prouve la séparation sur un cas où la somme MENTIRAIT.
  say(
    "X3c",
    agg.asPlannedMeals + agg.offPlanMeals !== agg.meals,
    `4+2=${agg.asPlannedMeals + agg.offPlanMeals} ≠ meals=${agg.meals}: la photo ` +
      `n'est ni l'un ni l'autre, donc aucune somme de deux comptes ne fait le total`,
  );
}

// ---------------------------------------------------------------------------
// X2 — LA DOCTRINE QUI INTERDIT « CHEAT MEAL ». Six formes, deux langues.
// ---------------------------------------------------------------------------
const FORBIDDEN_FORMS = [
  "cheat meal", "cheat day", "treat meal", "earn your treat",
  "make up for it", "burn it off",
];
const FORBIDDEN_FR = [
  "repas triche", "jour de triche", "craquage", "rattraper", "compenser", "brûler",
];

async function publishNoCheatDoctrine(coach: Coach, locale: string) {
  const db = admin();
  await db.from("coach_doctrines").delete().eq("coach_id", coach.coachId);
  const { error } = await db.from("coach_doctrines").insert({
    coach_id: coach.coachId,
    version: 1,
    beliefs: [{
      claim: "There is no cheat meal, because there is nothing to cheat on",
      rationale: "there's the plan, and there are meals you chose to have off it",
    }],
    forbidden: [{
      token: "cheat_meal",
      surface_forms: FORBIDDEN_FORMS,
      instead:
        "There's no cheating here. You had a meal off plan — tell me about it and " +
        "we carry on. It doesn't need paying for.",
    }],
    vocabulary: [],
    arbitrations: [{
      situation: 'A student writes: "I cracked tonight, I ate everything."',
      coach_answer:
        "One evening is not a week. Tell me what the hours before it looked like — " +
        "that's usually where the answer is. Tomorrow starts at breakfast, not at penance.",
    }],
    voice: { language: locale },
    content_locale: locale,
    published_at: new Date().toISOString(),
    published_by: coach.userId,
  } as never);
  if (error) throw new Error(`coach_doctrines: ${error.message}`);
}

async function X2() {
  const provocations: Array<[string, string]> = [
    ["fr-FR", "j'ai commandé une pizza ce soir, c'était mon cheat meal"],
    ["fr-FR", "j'ai craqué hier soir, on a commandé, je vais compenser demain"],
    ["en-US", "I ordered takeout last night, that was my cheat meal"],
    ["en-US", "we ate out yesterday — I'll burn it off at the gym, right?"],
  ];
  for (const [locale, text] of provocations) {
    const { st, coach } = await freshStudent(locale);
    await publishNoCheatDoctrine(coach, locale.startsWith("fr") ? "fr" : "en");
    const t = await turn(st, text);
    await new Promise((r) => setTimeout(r, 1200));
    const reply = (t.reply ?? "").replace(/\n/g, " ");
    const low = reply.toLowerCase();
    const hits = [...FORBIDDEN_FORMS, ...FORBIDDEN_FR].filter((f) =>
      low.includes(f.toLowerCase())
    );
    const ev = await rows(
      `select coalesce(plan_relation,'NULL')||'|'||coalesce(food_group_ref,'-')
         from public.protocol_events where user_id='${st.userId}'`,
    );
    say(
      `X2 ${locale} « ${text.slice(0, 40)}… »`,
      hits.length === 0,
      `formes interdites: [${hits.join(", ") || "aucune"}] · base: ${
        ev.join(" ;; ") || "(vide)"
      }`,
    );
    console.log(`   réponse: ${reply.slice(0, 260)}`);
  }
}

// ---------------------------------------------------------------------------
// X4 — DEUX HORS-PLAN CONSÉCUTIFS. Le second est-il avalé par la précision ?
// ---------------------------------------------------------------------------
async function X4() {
  const { st } = await freshStudent("fr-FR");
  const t1 = await turn(st, "j'ai commandé une pizza hier soir");
  await new Promise((r) => setTimeout(r, 1500));
  const after1 = await rows(
    `select coalesce(plan_relation,'NULL')||'|'||coalesce(food_group_ref,'-')||'|'||
            coalesce(left(student_note,40),'-')
       from public.protocol_events where user_id='${st.userId}' order by created_at`,
  );
  const t2 = await turn(st, "et ce soir on est allés au resto");
  await new Promise((r) => setTimeout(r, 1500));
  const after2 = await rows(
    `select coalesce(plan_relation,'NULL')||'|'||coalesce(food_group_ref,'-')||'|'||
            coalesce(left(student_note,40),'-')
       from public.protocol_events where user_id='${st.userId}' order by created_at`,
  );
  const added = after2.length - after1.length;
  say(
    "X4",
    added >= 1,
    `tour 1 → ${after1.length} ligne(s); tour 2 (NOUVEAU hors-plan) → +${added}. ` +
      `Après: ${after2.join(" ;; ")}`,
  );
  console.log(`   t1: ${(t1.reply ?? "").replace(/\n/g, " ").slice(0, 160)}`);
  console.log(`   t2: ${(t2.reply ?? "").replace(/\n/g, " ").slice(0, 160)}`);
}

const ALL: Record<string, () => Promise<void>> = { X1, X2, X3, X4, X6 };
for (const [id, fn] of Object.entries(ALL)) {
  if (WHICH !== "all" && WHICH !== id) continue;
  console.log(`\n══════ ${id} ══════`);
  try {
    await fn();
  } catch (e) {
    say(id, false, `EXCEPTION ${e}`);
  }
}

console.log("\n═══ SYNTHÈSE EXTRA-HARD ═══");
for (const v of verdicts) console.log(`${v.ok ? "🟢" : "🔴"} ${v.id} :: ${v.detail}`);

if (Deno.env.get("FF009_KEEP") !== "1") {
  for (const id of students) await cleanup(id);
  const db = admin();
  for (const c of coaches) {
    await db.from("coach_doctrines").delete().eq("coach_id", c.coachId);
    await cleanup(c.userId);
    await db.from("coaches").delete().eq("id", c.coachId);
  }
}
