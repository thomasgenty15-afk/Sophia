/**
 * FF-016 — RENDRE L'ÉLÈVE A « RICHE », pour que la mesure de budget porte sur
 * un tour qui existe pour quelqu'un.
 *
 * Un foyer (FF-010), un plan de foyer qui couvre aujourd'hui, un tap du soir,
 * et 20 tours d'historique dense (le profil mesuré par FF-023). Le protocole et
 * la doctrine sont déjà posés par la fixture.
 */
import { admin, callAs, nonce } from "../docs/nutrition-pivot/qa-web/harness.ts";

const fixture = JSON.parse(
  await Deno.readTextFile(new URL("./ff016_fixture.json", import.meta.url)),
);
const db = admin();
const a = fixture.students.a;
const b = fixture.students.b;

// ── LE FOYER ────────────────────────────────────────────────────────────────
const { data: hh, error: hhErr } = await db.from("households").insert({
  kind: "family",
  name: "ff016 household",
  created_by: a.userId,
} as never).select("id").maybeSingle();
if (hhErr) throw new Error(`households: ${hhErr.message}`);
const householdId = (hh as { id: string }).id;

const { error: hmErr } = await db.from("household_members").insert([
  { household_id: householdId, user_id: a.userId, role: "owner" },
  { household_id: householdId, user_id: b.userId, role: "member" },
] as never);
if (hmErr) throw new Error(`household_members: ${hmErr.message}`);

const today = new Date().toISOString().slice(0, 10);
const { error: gmErr } = await db.from("student_generated_meals").insert({
  user_id: a.userId,
  household_id: householdId,
  starts_on: today,
  ends_on: today,
  dishes: [
    { title: "Roast chicken tray with greens", slot: "dinner" },
    { title: "Lentil and spinach soup", slot: "lunch" },
  ],
  preparations: [{ title: "Roast the chicken", cookOn: today }],
  member_portions: [
    { userId: a.userId, displayName: "Ada", portionNote: "one plate" },
    { userId: b.userId, displayName: "Bo", portionNote: "smaller plate" },
  ],
} as never);
if (gmErr) console.warn(`student_generated_meals: ${gmErr.message}`);

// ── 20 TOURS DENSES ─────────────────────────────────────────────────────────
const TURNS = [
  "Hey, quick one before I start cooking tonight.",
  "I got back late from work and the kitchen is a mess.",
  "My partner is doing a night shift this week so I cook alone.",
  "I bought a big bag of spinach at the market on Saturday.",
  "I really do not like cottage cheese, never have.",
  "I trained twice this week, legs on Monday and back on Thursday.",
  "The kids ate all the yoghurt again.",
  "I am travelling to Lisbon in two weeks for work.",
  "Sleep has been rough, maybe six hours a night.",
  "I had a big lunch today, a proper one at the canteen.",
  "I keep forgetting to defrost things in the morning.",
  "My sister is coming over on Sunday and she is vegetarian.",
  "The supermarket near me stopped stocking my usual oats.",
  "I like cooking one big thing and eating it twice.",
  "Work has been heavy this month, lots of late calls.",
  "I did a long walk on Sunday, about two hours.",
  "Honestly I get bored eating the same thing every day.",
  "I have a small freezer so batch cooking is limited.",
  "Coffee is the one thing I will not give up.",
  "I want to feel less heavy in the evenings.",
];

for (const [i, text] of TURNS.entries()) {
  const res = await callAs(a, "chat-inbound-v1", {
    client_message_id: `ff016-rich-${i}-${nonce()}`,
    kind: "text",
    text,
  });
  console.log(`tour ${i + 1}/20 http=${res.status}`);
  await new Promise((r) => setTimeout(r, 700));
}

const { count } = await db.from("chat_messages")
  .select("id", { count: "exact", head: true })
  .eq("user_id", a.userId);
console.log(`household=${householdId} messages=${count}`);
