/**
 * FF-018 · PHASE F — le MAUVAIS plat prévu (reprise d'E5 : le semis violait
 * `student_generated_meals_mode_check`, aucune conclusion n'était possible).
 *
 *  F1 deux plats jumeaux (poulet / canard) → aucune coche, l'élève tranche
 *  F2 un seul plat, au CANARD, contre une assiette de poulet → aucune coche
 *  F3 un seul plat, au POULET → la coche part (le cas nominal, la garde ne
 *     doit pas mordre partout)
 */
import { admin } from "./harness.ts";
import {
  chatRows,
  eventDigest,
  events,
  ff018Cleanup,
  ff018Student,
  loadImage,
  upload,
} from "./FF018_lib.ts";

const lines: string[] = [];
const say = (s: string) => {
  console.log(s);
  lines.push(s);
};

const plate = await loadImage("assiette-poulet-riz-brocolis.png");
const today = new Date().toISOString().slice(0, 10);
// ⚠️ LA FORME DE LA PRODUCTION, et rien d'autre (T-15). `dayTokenOfDate`
// (`_shared/keel/local_date.ts:78`) rend `sat`, pas `saturday`: la première
// version de cette sonde a écrit `saturday`, `dishesForDate` n'a résolu aucun
// jeton, et les TROIS cas sont sortis « aucune coche » — dont le cas nominal,
// qui aurait dû cocher. Trois faux verts et un faux rouge, par un jeton.
const dayToken = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][
  new Date(`${today}T12:00:00Z`).getUTCDay()
];

const CHICKEN = {
  title: "Chicken, brown rice and broccoli bowl",
  day: dayToken,
  slot: "lunch",
  ingredients: [{ term: "Chicken breast" }, { term: "Brown rice" }, { term: "Broccoli" }],
};
const DUCK = {
  title: "Duck, brown rice and broccoli bowl",
  day: dayToken,
  slot: "dinner",
  ingredients: [{ term: "Duck breast" }, { term: "Brown rice" }, { term: "Broccoli" }],
};
const DUCK_LUNCH = { ...DUCK, slot: "lunch" };

say(`# FF-018 · PHASE F — le mauvais plat prévu (jour ${dayToken}, ${today})\n`);

for (
  const [label, dishes, expectTick] of [
    ["F1 — DEUX plats jumeaux (poulet / canard)", [CHICKEN, DUCK], false],
    ["F2 — UN SEUL plat, au CANARD, assiette de poulet", [DUCK_LUNCH], false],
    ["F3 — UN SEUL plat, au POULET (cas nominal)", [CHICKEN], true],
  ] as const
) {
  const { student } = await ff018Student();
  say(`\n▌ ${label}`);
  const { error } = await admin().from("student_generated_meals").insert({
    user_id: student.userId,
    scope: "several_days",
    mode: "to_shop",
    content_locale: "en-US",
    starts_on: today,
    duration_days: 7,
    dishes,
    preparations: [],
  } as never);
  if (error) {
    say(`  🔴 semis impossible : ${error.message}`);
    continue;
  }
  const res = await upload(student, plate, { chatId: `ff018-f-${Date.now()}` });
  const rows = await events(student.userId);
  const chat = await chatRows(student.userId);
  const ack = chat.filter((m) => m.role === "assistant").map((m) => m.content).join(" ¶ ");
  const photoRow = rows.find((r) => r.source === "photo");
  const rec = (photoRow?.recognized ?? null) as Record<string, unknown> | null;
  const ticks = rows.filter((r) => r.source === "quick_tap");
  say(`  HTTP ${res.status}, ${rows.length} ligne(s)`);
  for (const r of rows) say(`   · ${eventDigest(r)} note=${r.student_note ?? "-"}`);
  say(`  planned_dish : ${JSON.stringify(rec?.planned_dish ?? null)}`);
  say(`  coches quick_tap : ${ticks.length} — ${ticks.map((t) => String(t.student_note)).join(" | ")}`);
  say(`  accusé : ${ack}`);
  say(
    `  ${(ticks.length > 0) === expectTick ? "✅" : "🔴"} coche attendue=${expectTick} → obtenue=${ticks.length > 0}`,
  );
  const wrong = ticks.some((t) => /duck/i.test(String(t.student_note ?? "")));
  say(`  ${wrong ? "🔴 le MAUVAIS plat a été coché" : "✅ aucun plat au canard coché"}`);
  const ackClaimsDuck = /duck/i.test(ack);
  say(`  ${ackClaimsDuck ? "🔴" : "✅"} l'accusé ne nomme pas le plat au canard`);
}

say(`\n${await ff018Cleanup()}`);
await Deno.writeTextFile(new URL("./FF018-F-wrongdish.txt", import.meta.url), lines.join("\n") + "\n");
console.log("\n→ écrit FF018-F-wrongdish.txt");
