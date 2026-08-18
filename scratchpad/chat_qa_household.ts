/**
 * Ajoute un FOYER à un élève déjà provisionné, avec un plat du jour et des
 * portions par membre. Stack locale uniquement.
 *
 * Usage:
 *   deno run --allow-all scratchpad/chat_qa_household.ts <persona.json> <family|shared>
 */
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_BASE = "http://127.0.0.1:54321";
const ANON = Deno.env.get("QA_ANON_KEY")!;
const SERVICE = Deno.env.get("QA_SERVICE_KEY")!;

const persona = JSON.parse(await Deno.readTextFile(Deno.args[0]));
const kind = (Deno.args[1] ?? "family") as "family" | "shared";

const anon = createClient(URL_BASE, ANON, { auth: { persistSession: false } });
const admin = createClient(URL_BASE, SERVICE, { auth: { persistSession: false } });

function die(m: string): never {
  console.error(`FATAL: ${m}`);
  Deno.exit(1);
}

const nonce = `${Date.now()}${Math.random().toString(16).slice(2, 6)}`;

// Le co-membre, avec un vrai compte (le roster lit `profiles`).
const mate = await anon.auth.signUp({
  email: `chat-mate-${nonce}@test.dev`,
  password: "1234567",
});
if (mate.error || !mate.data.user) die(`mate signUp: ${mate.error?.message}`);
const mateId = mate.data.user.id;
await admin.from("profiles").update({
  full_name: "Marc Dupont",
  timezone: "Europe/Paris",
  birth_date: "1988-02-02",
} as never).eq("id", mateId);

const house = await admin.from("households").insert({
  kind,
  name: "QA household",
  created_by: persona.userId,
} as never).select("id").single();
if (house.error) die(`households: ${house.error.message}`);
const householdId = (house.data as { id: string }).id;

const members = await admin.from("household_members").insert([
  { household_id: householdId, user_id: persona.userId, role: "owner" },
  { household_id: householdId, user_id: mateId, role: "member" },
] as never);
if (members.error) die(`household_members: ${members.error.message}`);

// Le plan du foyer qui COUVRE aujourd'hui.
// ⚠️ LA DATE LOCALE DE L'ÉLÈVE, pas celle du serveur. Le runtime résout
// `local_date` dans le fuseau de l'élève (Europe/Paris ici), et une fixture
// qui prend `getUTCDay()` à 23 h UTC écrit le plat de la VEILLE — le plan
// existe alors, et aucun plat ne couvre « aujourd'hui ». Mesuré.
const parisDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const today = new Date(`${parisDate}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const startsOn = iso(new Date(today.getTime() - 2 * 86400_000));
const tokens = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const todayToken = tokens[today.getUTCDay()];

const plan = await admin.from("student_generated_meals").insert({
  user_id: persona.userId,
  household_id: householdId,
  scope: "several_days",
  mode: "to_shop",
  servings: 2,
  content_locale: persona.locale,
  starts_on: startsOn,
  duration_days: 7,
  dishes: [
    {
      title: "Poulet rôti, riz complet et haricots verts",
      slot: "dinner",
      day: todayToken,
      ingredients: [],
      method: "",
      why: "",
      honours_belief_keys: [],
      uses: [],
    },
    {
      title: "Soupe de lentilles",
      slot: "dinner",
      day: tokens[(today.getUTCDay() + 1) % 7],
      ingredients: [],
      method: "",
      why: "",
      honours_belief_keys: [],
      uses: [],
    },
  ],
  preparations: [
    { id: "prep_chicken", title: "Cuisses de poulet rôties", cookOn: todayToken },
  ],
  member_portions: [
    { userId: persona.userId, displayName: "QA Chat Student", portionNote: "part de protéine plus généreuse", preparationShares: [] },
    { userId: mateId, displayName: "Marc", portionNote: "part de féculents plus petite", preparationShares: [] },
  ],
  shopping_list: [],
  generated_from: {},
  pantry: [],
} as never).select("id").single();
if (plan.error) die(`student_generated_meals: ${plan.error.message}`);

console.log(JSON.stringify({
  householdId,
  kind,
  mateId,
  planId: (plan.data as { id: string }).id,
  todayToken,
}));
