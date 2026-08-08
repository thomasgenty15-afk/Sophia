/**
 * PASSE TRANSVERSE ② bis — T-6 : LE COMPOSEUR DEMANDE-T-IL UNE PHOTO HORS BUDGET ?
 *
 * FF-025 a rapporté ~1 tour sur 25. La condition exacte est celle-ci: un tour
 * où la LANE ne peut PAS armer (budget du jour déjà consommé) mais où le sujet
 * est un repas — c'est-à-dire le tour où une demande de photo est
 * conversationnellement tentante et structurellement interdite.
 *
 * 30 tours ordinaires ont déjà rendu 0/30 (`ffx_silence.ts`); ils n'attaquent
 * pas le bon endroit. Ici: 25 tours qui DÉCLARENT un repas, sur un élève dont
 * le budget est fermé.
 *
 * usage: deno run -A scratchpad/ffx_t6.ts
 */
import { admin, callAs, nonce } from "../docs/nutrition-pivot/qa-web/harness.ts";
import { DAILY_ASK_LEDGER_TABLE } from "../supabase/functions/_shared/keel/daily_ask_budget.ts";

const fixture = JSON.parse(
  await Deno.readTextFile(new URL("./ffx_fixture.json", import.meta.url)),
);
const db = admin();
const student = fixture.student;

const PHOTO_ASK: RegExp[] = [
  /send (me )?(it |them )?(a |the )?(photo|picture|snap|pic)/i,
  /(a|the) (photo|picture|snap) of (it|that|your)/i,
  /if you (have|took|snapped) (a |any )?(photo|picture)/i,
  /snap (a |the )?(photo|picture)/i,
  /show me (a |the )?(photo|picture)/i,
  /envoie[- ](moi )?(une |la )?photo/i,
  /si tu as une photo/i,
  /une photo de (ca|ça|ton|ta|tes)/i,
];
const FOOD_ASK: RegExp[] = [
  /what (did|have) you (eat|eaten|had)/i,
  /what did you have (for|with|at)/i,
  /and what (did|do) you have with/i,
  /qu('|’)?est[- ]ce que tu as mang/i,
  /tu as mang(e|é) quoi/i,
];

// 25 déclarations de repas: 15 HORS PLAN (marqueur déterministe), 10 vagues.
const DECLARATIONS: string[] = [
  "I had a takeaway pizza for dinner.",
  "We got takeaway last night, a big curry.",
  "I ate at a restaurant with colleagues at lunch.",
  "I had lunch at the canteen today.",
  "We had dinner at my mum's, a roast.",
  "I grabbed takeaway noodles on the way home.",
  "I ate at a wedding on Saturday, buffet and cake.",
  "Lunch was at a restaurant, a burger and chips.",
  "I had takeaway fish and chips for dinner.",
  "J'ai mangé à la cantine ce midi.",
  "On a mangé au kebab hier soir.",
  "J'étais au mcdo à midi, un menu classique.",
  "I had a takeaway kebab after football.",
  "We ate at a friend's, lasagne and salad.",
  "I had takeout sushi for dinner.",
  "I had chicken for lunch.",
  "I ate some pasta earlier.",
  "I had a sandwich at midday.",
  "I had eggs this morning.",
  "I had rice and something with it for dinner.",
  "J'ai mangé du poulet à midi.",
  "J'ai pris une salade ce midi.",
  "I had soup for lunch.",
  "I ate a bowl of porridge at breakfast.",
  "I had steak last night.",
];

const before = await db.from(DAILY_ASK_LEDGER_TABLE)
  .select("ask_kind,local_date").eq("user_id", student.userId);
const ledgerBefore = ((before.data ?? []) as unknown[]).length;
console.log(
  `LEDGER AVANT: ${ledgerBefore} ligne(s) → budget ${ledgerBefore >= 1 ? "FERMÉ" : "OUVERT"}`,
);

let photoHits = 0;
let foodHits = 0;
const rows: unknown[] = [];
for (const [i, message] of DECLARATIONS.entries()) {
  const t0 = new Date().toISOString();
  const cmid = `ffx-t6-${nonce()}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await callAs(student, "chat-inbound-v1", {
      client_message_id: cmid,
      kind: "text",
      text: message,
    });
    if (res.status !== 502) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  await new Promise((r) => setTimeout(r, 1100));
  const { data } = await db.from("chat_messages")
    .select("content").eq("user_id", student.userId).eq("role", "assistant")
    .gt("created_at", t0).order("created_at", { ascending: false }).limit(1);
  const reply = ((data ?? []) as Array<{ content: string }>)[0]?.content ?? null;
  const text = String(reply ?? "");
  const photo = PHOTO_ASK.map((p) => p.exec(text)?.[0]).filter(Boolean) as string[];
  const food = FOOD_ASK.map((p) => p.exec(text)?.[0]).filter(Boolean) as string[];
  if (photo.length) photoHits++;
  if (food.length) foodHits++;
  rows.push({ turn: i + 1, message, reply, photo, food });
  console.log(
    `T${String(i + 1).padStart(2, "0")} ${
      photo.length ? `🔴PHOTO(${photo.join("|")})` : food.length ? `🔴FOOD(${food.join("|")})` : "ok"
    }  ← « ${message.slice(0, 40)} »`,
  );
  if (photo.length || food.length) console.log(`     « ${text.replace(/\n/g, " ")} »`);
}

const after = await db.from(DAILY_ASK_LEDGER_TABLE)
  .select("ask_kind,local_date,question").eq("user_id", student.userId);
const ledgerAfter = ((after.data ?? []) as unknown[]);
console.log(`\n${"=".repeat(72)}`);
console.log(`déclarations jouées                 : ${DECLARATIONS.length}`);
console.log(`demandes de PHOTO hors budget (T-6) : ${photoHits}`);
console.log(`demandes ALIMENTAIRES hors budget   : ${foodHits}`);
console.log(`LEDGER APRÈS                        : ${ledgerAfter.length} (delta ${ledgerAfter.length - ledgerBefore})`);
for (const r of ledgerAfter as Array<Record<string, unknown>>) {
  console.log(`  ${r.ask_kind}|${r.local_date}|${String(r.question).slice(0, 60)}`);
}
console.log("=".repeat(72));

await Deno.writeTextFile(
  new URL("./ffx_t6_results.json", import.meta.url),
  JSON.stringify({ ledgerBefore, ledgerAfter, photoHits, foodHits, rows }, null, 2),
);
