/**
 * FF-018 · PHASE E — la revue adversariale, exécutée.
 *
 *  E1 la correction d'une photo AMENDE la ligne, elle n'en écrit pas une seconde
 *     (reprise de D5 avec un état de départ PROPRE — la première version de la
 *      sonde comptait une ligne écrite par le tour d'AVANT : faux rouge)
 *  E2 le flow texte déjà ouvert est-il ÉCRASÉ par l'ouverture photo ?
 *  E3 la course photo ‖ texte, jouée TROIS fois
 *  E4 accusé sous BAND DE SÉCURITÉ (`__last_turn_risk_band = critical`)
 *  E5 la photo se rattache-t-elle au MAUVAIS plat prévu ? (deux plats jumeaux,
 *     puis un plat au canard contre une assiette de poulet)
 */
import { admin, turn } from "./harness.ts";
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
const sauce = await loadImage("assiette-saumon-sauce-luisante.png");

async function tempMemory(userId: string): Promise<Record<string, unknown> | null> {
  const { data } = await admin()
    .from("user_chat_states")
    .select("temp_memory")
    .eq("user_id", userId)
    .eq("scope", "app")
    .maybeSingle();
  return (data as { temp_memory?: Record<string, unknown> } | null)?.temp_memory ?? null;
}
const FLOW_KEY = "__keel_meal_photo_flow_state";

say("# FF-018 · PHASE E — revue adversariale\n");

// ── E1 : la correction amende, elle ne double pas ───────────────────────────
{
  const { student } = await ff018Student();
  say(`\n▌ E1 — photo puis correction immédiate (départ PROPRE)`);
  const before = await events(student.userId);
  say(`  lignes avant photo : ${before.length}`);
  const res = await upload(student, plate, { chatId: `ff018-e1-${Date.now()}` });
  const afterPhoto = await events(student.userId);
  const photoId = String(res.json?.event?.id ?? "");
  say(`  après photo : ${afterPhoto.length} ligne(s)`);
  for (const r of afterPhoto) say(`   · ${r.id} → ${eventDigest(r)}`);
  const tm = await tempMemory(student.userId);
  say(`  flow ouvert : ${tm && FLOW_KEY in tm ? "oui" : "NON"}`);
  const t = await turn(student, "actually that was turkey, not chicken");
  const afterFix = await events(student.userId);
  say(`  réponse : « ${String(t.reply ?? "").slice(0, 240)} »`);
  say(`  après correction : ${afterFix.length} ligne(s)`);
  for (const r of afterFix) say(`   · ${r.id} → ${eventDigest(r)}`);
  say(
    `  ${afterFix.length === afterPhoto.length ? "✅" : "🔴"} aucune ligne de plus (${afterPhoto.length} → ${afterFix.length})`,
  );
  const amended = afterFix.find((r) => r.id === photoId);
  say(`  ligne photo après amendement : ${amended ? eventDigest(amended) : "DISPARUE"}`);
}

// ── E2 : le flow texte est-il écrasé par l'ouverture photo ? ────────────────
{
  const { student } = await ff018Student();
  say(`\n▌ E2 — un flow TEXTE déjà ouvert, puis une photo`);
  const t1 = await turn(student, "I had a chicken sandwich for lunch");
  const rowsAfterText = await events(student.userId);
  const tm1 = await tempMemory(student.userId);
  const flow1 = tm1?.[FLOW_KEY] as Record<string, unknown> | undefined;
  say(`  tour texte : « ${String(t1.reply ?? "").slice(0, 180)} »`);
  say(`  lignes : ${rowsAfterText.length} — ${rowsAfterText.map(eventDigest).join(" ;; ")}`);
  say(
    `  flow texte : ${
      flow1 ? JSON.stringify({ source: (flow1.flow as any)?.source, eventIds: (flow1.flow as any)?.eventIds }) : "aucun"
    }`,
  );
  const res = await upload(student, plate, { chatId: `ff018-e2-${Date.now()}` });
  const tm2 = await tempMemory(student.userId);
  const flow2 = tm2?.[FLOW_KEY] as Record<string, unknown> | undefined;
  say(`  photo HTTP ${res.status}, event ${res.json?.event?.id}`);
  say(
    `  flow après photo : ${
      flow2 ? JSON.stringify({ source: (flow2.flow as any)?.source, eventIds: (flow2.flow as any)?.eventIds }) : "aucun"
    }`,
  );
  if (flow1 && flow2) {
    const ids1 = ((flow1.flow as any)?.eventIds ?? []) as string[];
    const ids2 = ((flow2.flow as any)?.eventIds ?? []) as string[];
    const kept = ids1.every((id) => ids2.includes(id));
    say(
      `  ${kept ? "✅" : "🔴"} la cible du flow TEXTE survit à l'ouverture photo — avant=${
        JSON.stringify(ids1)
      } après=${JSON.stringify(ids2)}`,
    );
  } else {
    say(`  🟠 non concluant : le tour texte n'a pas ouvert de flow ce run`);
  }
  const rowsAfter = await events(student.userId);
  say(`  lignes finales : ${rowsAfter.length} — ${rowsAfter.map(eventDigest).join(" ;; ")}`);
}

// ── E3 : la course photo ‖ texte, TROIS fois ────────────────────────────────
say(`\n▌ E3 — course photo ‖ texte (3 passes)`);
for (let pass = 1; pass <= 3; pass += 1) {
  const { student } = await ff018Student();
  const [photoRes, textRes] = await Promise.all([
    upload(student, plate, { chatId: `ff018-e3-${pass}-${Date.now()}` }),
    turn(student, "what should I aim for tomorrow?"),
  ]);
  const rows = await events(student.userId);
  const tm = await tempMemory(student.userId);
  const photoRows = rows.filter((r) => r.source === "photo");
  say(
    `  passe ${pass} : photo=${photoRes.status} texte=${textRes.status} | ${rows.length} ligne(s) (photo ${photoRows.length}) | flow=${
      tm && FLOW_KEY in tm ? "présent" : "ABSENT"
    }`,
  );
  for (const r of rows) say(`     · ${eventDigest(r)}`);
}

// ── E4 : l'accusé sous band de sécurité ─────────────────────────────────────
{
  const { student } = await ff018Student();
  say(`\n▌ E4 — accusé de photo alors que le dernier tour était CRITIQUE`);
  await admin().from("user_chat_states").upsert(
    {
      user_id: student.userId,
      scope: "app",
      temp_memory: { __last_turn_risk_band: "critical" },
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: "user_id,scope" },
  );
  const res = await upload(student, sauce, { chatId: `ff018-e4-${Date.now()}` });
  const rows = await events(student.userId);
  const chat = await chatRows(student.userId);
  const ack = chat.filter((m) => m.role === "assistant").map((m) => m.content).join(" ¶ ");
  const tm = await tempMemory(student.userId);
  const qs = await admin()
    .from("meal_precision_questions")
    .select("ask_kind, question")
    .eq("user_id", student.userId);
  say(`  HTTP ${res.status} — ${rows.length} ligne(s) : ${rows.map(eventDigest).join(" ;; ")}`);
  say(`  accusé livré : « ${ack} »`);
  say(`  flow de correction ouvert : ${tm && FLOW_KEY in tm ? "OUI" : "non (gaté)"}`);
  say(`  questions inscrites : ${JSON.stringify(qs.data ?? [])}`);
  const solicits = /tell me|let me know|did you|was (that|this)|\?/i.test(ack);
  say(`  → l'accusé contient une SOLLICITATION : ${solicits ? "OUI" : "non"}`);
  say(`  → ticks quick_tap écrits : ${rows.filter((r) => r.source === "quick_tap").length}`);
}

// ── E5 : le MAUVAIS plat prévu ──────────────────────────────────────────────
const today = new Date().toISOString().slice(0, 10);
const dayToken = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][
  new Date(`${today}T12:00:00Z`).getUTCDay()
];

for (
  const [label, dishes, expectTick] of [
    [
      "E5a — DEUX plats jumeaux (poulet / canard) le même jour",
      [
        {
          title: "Chicken, brown rice and broccoli bowl",
          day: dayToken,
          slot: "lunch",
          ingredients: [{ term: "Chicken breast" }, { term: "Brown rice" }, { term: "Broccoli" }],
        },
        {
          title: "Duck, brown rice and broccoli bowl",
          day: dayToken,
          slot: "dinner",
          ingredients: [{ term: "Duck breast" }, { term: "Brown rice" }, { term: "Broccoli" }],
        },
      ],
      false,
    ],
    [
      "E5b — UN SEUL plat, au CANARD, contre une assiette de poulet",
      [
        {
          title: "Duck, brown rice and broccoli bowl",
          day: dayToken,
          slot: "lunch",
          ingredients: [{ term: "Duck breast" }, { term: "Brown rice" }, { term: "Broccoli" }],
        },
      ],
      false,
    ],
    [
      "E5c — UN SEUL plat, au POULET (le cas nominal : la coche doit partir)",
      [
        {
          title: "Chicken, brown rice and broccoli bowl",
          day: dayToken,
          slot: "lunch",
          ingredients: [{ term: "Chicken breast" }, { term: "Brown rice" }, { term: "Broccoli" }],
        },
      ],
      true,
    ],
  ] as const
) {
  const { student } = await ff018Student();
  say(`\n▌ ${label}`);
  const { error } = await admin().from("student_generated_meals").insert({
    user_id: student.userId,
    scope: "week",
    mode: "plan",
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
  const res = await upload(student, plate, { chatId: `ff018-e5-${Date.now()}` });
  const rows = await events(student.userId);
  const chat = await chatRows(student.userId);
  const ack = chat.filter((m) => m.role === "assistant").map((m) => m.content).join(" ¶ ");
  const photoRow = rows.find((r) => r.source === "photo");
  const rec = (photoRow?.recognized ?? null) as Record<string, unknown> | null;
  const ticks = rows.filter((r) => r.source === "quick_tap");
  say(`  planned_dish sur la ligne : ${JSON.stringify(rec?.planned_dish ?? null)}`);
  say(`  coches quick_tap : ${ticks.length} — ${ticks.map((t) => String(t.student_note)).join(" | ")}`);
  say(`  accusé : ${ack}`);
  say(
    `  ${
      (ticks.length > 0) === expectTick ? "✅" : "🔴"
    } coche attendue=${expectTick} → obtenue=${ticks.length > 0}`,
  );
  if (ticks.length > 0) {
    const title = String(ticks[0].student_note ?? "");
    const wrong = /duck/i.test(title);
    say(`  ${wrong ? "🔴" : "✅"} le plat coché n'est pas le mauvais — « ${title} »`);
  }
}

say(`\n${await ff018Cleanup()}`);
await Deno.writeTextFile(new URL("./FF018-E-adversarial.txt", import.meta.url), lines.join("\n") + "\n");
console.log("\n→ écrit FF018-E-adversarial.txt");
