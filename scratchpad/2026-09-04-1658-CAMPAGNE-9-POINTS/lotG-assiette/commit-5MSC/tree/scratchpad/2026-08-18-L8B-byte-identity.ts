// L8-B — preuve INDÉPENDANTE de byte-identité du PROMPT, contre le code d'AVANT
// le lot L8 (269797e7^). On compare les DEUX modules qui composent le prompt du
// foyer — `household_meal_generation.ts` ET `household_portions.ts`, dont
// `buildPortionBrief` sort DANS le prompt — sur SHA256, pas sur un `includes`.
//
// Rejouer:
//   git show 269797e7^:supabase/functions/_shared/keel/household_portions.ts \
//     > scratchpad/l8b_prelot_household_portions_20260818.ts
//   git show 269797e7^:supabase/functions/_shared/keel/household_meal_generation.ts \
//     > scratchpad/l8b_prelot_household_meal_generation_20260818.ts
//   (puis réécrire les imports relatifs: le premier vers les URL absolues
//    courantes, le second vers l'ANCIEN portions — sinon on compare un module
//    avec lui-même.)
//   deno run --allow-all --no-check scratchpad/2026-08-18-L8B-byte-identity.ts
import { crypto } from "jsr:@std/crypto@1";
import { encodeHex } from "jsr:@std/encoding@1/hex";
const B = "file:///Users/ahmedamara/Dev/Sophia%202/supabase/functions/_shared/keel/";
const { parseMemberAway, resolveWindowPresence } = await import(B + "household_presence.ts");
const { buildHouseholdPromptBlocks: NOW, HOUSEHOLD_PROMPT_VERSION: V_NOW } = await import(B + "household_meal_generation.ts");
const { buildPortionBrief: BRIEF_NOW, boxingOrderLines: BOX_NOW, cookingShapeLines: COOK_NOW } = await import(B + "household_portions.ts");
const { buildHouseholdPromptBlocks: OLD, HOUSEHOLD_PROMPT_VERSION: V_OLD } = await import("./l8b_prelot_household_meal_generation_20260818.ts");
const { buildPortionBrief: BRIEF_OLD, boxingOrderLines: BOX_OLD, cookingShapeLines: COOK_OLD } = await import("./l8b_prelot_household_portions_20260818.ts");
const { MEAL_PROMPT_VERSION } = await import(B + "meal_generation.ts");

const sha = async (s: string) =>
  encodeHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));

// Un foyer RICHE — et surtout: des bouches QUI PORTENT UNE CIBLE. C'est la
// population que ce lot fabrique, donc la seule sur laquelle la question « le
// prompt a-t-il changé ? » se pose vraiment.
const DAD = { memberId: "m-dad", displayName: "Marc", goal: "fat_loss", ageState: "adult", body: { heightCm: 178, weightKg: 92, gender: "male", activityLevel: "sedentary", restrictionFlag: false }, eatingSlots: null, habits: [], habitNote: null };
const MOM = { memberId: "m-mom", displayName: "Nina", goal: "muscle_gain", ageState: "adult", body: { heightCm: 165, weightKg: 58, gender: "female", activityLevel: "trains_some", restrictionFlag: false }, eatingSlots: null, habits: [], habitNote: null };
const KID = { memberId: "m-kid", displayName: "Lea", goal: "fat_loss", ageState: "minor", body: { heightCm: 145, weightKg: 36, gender: "male", activityLevel: null, restrictionFlag: false }, eatingSlots: null, habits: [], habitNote: null };

const presence = resolveWindowPresence({
  members: [
    { memberId: "m-dad", displayName: "Marc", away: parseMemberAway([]) },
    { memberId: "m-mom", displayName: "Nina", away: parseMemberAway([{ day: "tue", slots: ["lunch"], kind: "away", source: "self" }]) },
    { memberId: "m-kid", displayName: "Lea", away: parseMemberAway([]) },
  ],
  rhythm: [{ slot: "breakfast", size: null }, { slot: "lunch", size: null }, { slot: "dinner", size: null }],
  windowDays: ["mon", "tue", "wed"],
});

const base = {
  members: [DAD, MOM, KID],
  envyLine: "Something warm and Italian this week.",
  restrictions: [{ memberId: "m-kid", memberDisplayName: "Lea", label: "nutella" }],
  presence,
  merge: null,
  cooking: "one_session",
  divergingCount: 2,
  dishBearers: [{ memberId: "m-mom", displayName: "Nina" }],
  dedicatedDishesAsked: 3,
  unmerge: null,
  dietBlock: "== DIET ==\nNobody at this table eats meat.",
  voices: [],
  kitchenEquipment: ["stovetop", "oven"],
};

const rows: string[] = [];
rows.push(`VERSIONS  household: old=${V_OLD}`);
rows.push(`                     now=${V_NOW}`);
rows.push(`          meal (inchangé par ce lot): ${MEAL_PROMPT_VERSION}`);
rows.push(`          identiques ? ${V_OLD === V_NOW}`);
rows.push("");

const oldOut = OLD({ ...base } as never);
const nowOut = NOW({ ...base } as never);
for (const [label, out] of [["OLD (269797e7^)", oldOut], ["NOW (HEAD)", nowOut]] as const) {
  rows.push(`${label.padEnd(18)} user=${(await sha(out.userSuffix)).slice(0, 16)}  system=${(await sha(out.systemSuffix)).slice(0, 16)}  ulen=${out.userSuffix.length} slen=${out.systemSuffix.length}`);
}
rows.push("");
rows.push(`PROMPT == OLD ?  user:${oldOut.userSuffix === nowOut.userSuffix}   system:${oldOut.systemSuffix === nowOut.systemSuffix}`);

// Les trois producteurs de texte de `household_portions.ts` qui SORTENT dans le
// prompt, comparés un par un: si l'un d'eux bougeait, la population qui voit une
// consigne différente ne serait pas vide.
const call = (f: unknown, name: string) => {
  const g = f as (...a: unknown[]) => unknown;
  if (name === "buildPortionBrief") return g(base.members, "one_session", 2);
  if (name === "boxingOrderLines") return g(base.members);
  return g("one_session", 2);
};
for (const [name, fnOld, fnNow] of [
  ["buildPortionBrief", BRIEF_OLD, BRIEF_NOW],
  ["boxingOrderLines", BOX_OLD, BOX_NOW],
  ["cookingShapeLines", COOK_OLD, COOK_NOW],
] as const) {
  let a: string, b: string;
  try { a = JSON.stringify(call(fnOld, name)); } catch (e) { a = "THROW:" + (e as Error).message; }
  try { b = JSON.stringify(call(fnNow, name)); } catch (e) { b = "THROW:" + (e as Error).message; }
  rows.push(`${name.padEnd(20)} old=${(await sha(a)).slice(0, 16)}  now=${(await sha(b)).slice(0, 16)}  identique:${a === b}  len=${a.length}`);
}

rows.push("");
// ⛔ LA PREUVE NE DOIT PAS ÊTRE VIDE. Un harnais qui compare deux fois le même
// objet rendrait « identique » sur un lot qui aurait tout changé. On arme donc
// un cas dont on SAIT qu'il diffère.
const armed = NOW({ ...base, envyLine: "Something warm and Italian this week!" } as never);
rows.push(`ARMÉ ? une virgule d'envie changée diffère d'OLD : user:${armed.userSuffix !== oldOut.userSuffix}`);
rows.push(`ARMÉ ? le prompt N'EST PAS vide : ulen=${nowOut.userSuffix.length} slen=${nowOut.systemSuffix.length}`);
rows.push(`ARMÉ ? le brief N'EST PAS vide : ${(BRIEF_NOW as (...a: unknown[]) => string)(base.members, "one_session", 2).length} octets`);
console.log(rows.join("\n"));
