/**
 * FF-059 — UNE FIXTURE PERSISTANTE, pour regarder l'écran.
 *
 * Le run réel (`ff059_real_run_20260812.ts`) nettoie derrière lui: il ne laisse
 * rien à ouvrir dans un navigateur. Celui-ci laisse UN élève et UN plan, et
 * imprime de quoi se connecter.
 *
 *   deno run -A scratchpad/ff059_fixture_20260812.ts        # créer
 *   deno run -A scratchpad/ff059_fixture_20260812.ts --drop # nettoyer
 */
import { admin, makeStudent } from "../docs/nutrition-pivot/qa-web/harness.ts";

const db = admin();

if (Deno.args.includes("--drop")) {
  const { data } = await db.from("profiles").select("id, email")
    .ilike("full_name", "ff059 browser%");
  for (const row of (data ?? []) as Array<{ id: string }>) {
    await db.from("student_generated_meals").delete().eq("user_id", row.id);
    await db.from("student_week_plans").delete().eq("user_id", row.id);
    await db.from("protocol_events").delete().eq("user_id", row.id);
  }
  console.log(`nettoyé: ${(data ?? []).length} élève(s) ff059`);
  Deno.exit(0);
}

function ing(term: string, amount: number | null, unit: string | null, state: string | null) {
  return {
    term,
    quantity: amount === null ? "a drizzle" : `${amount} ${unit}`,
    in_pantry: false,
    amount,
    unit,
    state,
  };
}

const student = await makeStudent({ fullName: "ff059 browser" });
await db.from("profiles").update({
  birth_date: "1990-01-01",
  energy_display_enabled: true,
} as never).eq("id", student.userId);

// La fenêtre part du LUNDI de cette semaine, pour que « aujourd'hui » tombe
// dedans et que `/app/today` ait quelque chose à montrer.
const now = new Date();
const monday = new Date(now);
monday.setUTCDate(now.getUTCDate() - ((now.getUTCDay() + 6) % 7));
const startsOn = monday.toISOString().slice(0, 10);
const todayToken = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"][(now.getUTCDay() + 6) % 7];

const { data, error } = await db.from("student_generated_meals").insert({
  user_id: student.userId,
  scope: "several_days",
  mode: "to_shop",
  servings: 1,
  plan_kind: "personal",
  dishes: [
    {
      title: "Chicken, rice and greens",
      slot: "lunch",
      day: todayToken,
      method: "Roast the chicken, boil the rice, steam the broccoli.",
      why: "A plate you can build in twenty minutes.",
      honours_belief_keys: [],
      uses: [],
      ingredients: [
        ing("chicken breast", 150, "g", "raw"),
        ing("white rice", 80, "g", "raw"),
        ing("olive oil", 10, "g", "raw"),
      ],
    },
    {
      title: "Scrambled eggs",
      slot: "breakfast",
      day: todayToken,
      method: "Scramble them low and slow.",
      why: "Protein first thing.",
      honours_belief_keys: [],
      uses: [],
      ingredients: [ing("whole eggs", 3, "unit", null), ing("olive oil", 5, "g", "raw")],
    },
    {
      // LE PLAT NON CALCULABLE — il doit dire POURQUOI, à côté de deux plats
      // chiffrés, et faire dire au jour qu'il est incomplet.
      title: "Kokum curry",
      slot: "dinner",
      day: todayToken,
      method: "Simmer it.",
      why: "Something different.",
      honours_belief_keys: [],
      uses: [],
      ingredients: [
        ing("chicken breast", 120, "g", "raw"),
        ing("kokum rind", 5, "g", "raw"),
      ],
    },
  ],
  preparations: [],
  cooking_sessions: [],
  shopping_list: [{ term: "chicken breast", quantity: "270 g", aisle: "protein" }],
  starts_on: startsOn,
  duration_days: 7,
  context: "ff059 browser fixture",
  content_locale: "en-GB",
} as never).select("id").single();
if (error) throw new Error(error.message);

console.log(JSON.stringify(
  {
    email: student.email,
    password: "1234567",
    userId: student.userId,
    planId: (data as { id: string }).id,
    startsOn,
    todayToken,
    expect: {
      lunch: 537,
      breakfast: 276,
      dinner: null,
      day: { kcal: 813, complete: false, counted: 2, total: 3 },
    },
  },
  null,
  2,
));
