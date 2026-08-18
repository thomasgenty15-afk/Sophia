// ── COMMENT LE REJOUER ──────────────────────────────────────────────────────
// Ce script compare la sortie du module COURANT a celle du module d'AVANT le
// lot. Il faut donc d'abord extraire l'ancien, et reecrire ses imports
// relatifs (sinon Deno les resout depuis scratchpad/):
//
//   git show 9a238658^:supabase/functions/_shared/keel/household_meal_generation.ts \
//     > scratchpad/prelot_household_meal_generation.ts
//   python3 - <<'PY'
//   import re
//   p = "scratchpad/prelot_household_meal_generation.ts"
//   b = "file:///Users/ahmedamara/Dev/Sophia%202/supabase/functions/_shared/keel/"
//   s = open(p, encoding="utf-8").read()
//   s = re.sub(r'from "\./([^"]+)"', lambda m: 'from "' + b + m.group(1) + '"', s)
//   open(p, "w", encoding="utf-8").write(s)
//   PY
//   deno run --allow-all --no-check scratchpad/2026-08-18-L7B-byte-identity.ts
//
// Le fichier extrait N'EST PAS commite: c'est une copie d'un module deja dans
// l'historique, et le regenerer est une commande.
// L7-B — preuve INDÉPENDANTE de byte-identité, contre le code d'AVANT le lot.
// On compare la sortie du module courant (kitchenEquipment: null / personne
// dehors) au module tel qu'il était à 9a238658^ — sur SHA256, pas sur `includes`.
import { crypto } from "jsr:@std/crypto@1";
import { encodeHex } from "jsr:@std/encoding@1/hex";
import type { PortionMember } from "file:///Users/ahmedamara/Dev/Sophia%202/supabase/functions/_shared/keel/household_portions.ts";
import {
  parseMemberAway,
  resolveWindowPresence,
} from "file:///Users/ahmedamara/Dev/Sophia%202/supabase/functions/_shared/keel/household_presence.ts";
import { buildHouseholdPromptBlocks as NOW, HOUSEHOLD_PROMPT_VERSION as V_NOW } from "file:///Users/ahmedamara/Dev/Sophia%202/supabase/functions/_shared/keel/household_meal_generation.ts";
import { buildHouseholdPromptBlocks as OLD, HOUSEHOLD_PROMPT_VERSION as V_OLD } from "./prelot_household_meal_generation.ts";

async function sha(s: string) {
  return encodeHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

const DAD: PortionMember = { memberId: "m-dad", displayName: "Marc", goal: "fat_loss", ageState: "adult", body: null, eatingSlots: null, habits: [], habitNote: null };
const SON: PortionMember = { memberId: "m-son", displayName: "Tom", goal: "muscle_gain", ageState: "adult", body: null, eatingSlots: null, habits: [], habitNote: null };
const KID: PortionMember = { memberId: "m-kid", displayName: "Lea", goal: null, ageState: "minor", body: null, eatingSlots: null, habits: [], habitNote: null };

// Un foyer RICHE: quelqu'un est absent (away), il y a un régime, une envie, des
// règles de maison, un porteur de plat. C'est le prompt le plus long possible
// hors des deux blocs neufs — donc la comparaison la plus exigeante.
const presence = resolveWindowPresence({
  members: [
    { memberId: "m-dad", displayName: "Marc", away: parseMemberAway([]) },
    { memberId: "m-son", displayName: "Tom", away: parseMemberAway([{ day: "tue", slots: ["lunch"], kind: "away", source: "self" }]) },
    { memberId: "m-kid", displayName: "Lea", away: parseMemberAway([]) },
  ],
  rhythm: [{ slot: "breakfast", size: null }, { slot: "lunch", size: null }, { slot: "dinner", size: null }],
  windowDays: ["mon", "tue", "wed"],
});

const base = {
  members: [DAD, SON, KID],
  envyLine: "Something warm and Italian this week.",
  restrictions: [{ memberId: "m-kid", memberDisplayName: "Lea", label: "nutella" }],
  presence,
  merge: null,
  cooking: "one_session" as const,
  divergingCount: 1,
  dishBearers: [{ memberId: "m-son", displayName: "Tom" }],
  dedicatedDishesAsked: 3,
  unmerge: null,
  dietBlock: "== DIET ==\nNobody at this table eats meat.",
  voices: [],
};

const oldOut = OLD({ ...base } as never);
const nowNull = NOW({ ...base, kitchenEquipment: null });
const nowAll = NOW({ ...base, kitchenEquipment: ["oven", "stovetop", "microwave", "freezer", "air_fryer", "pressure_cooker", "blender"] });

const rows: string[] = [];
rows.push(`VERSIONS      old=${V_OLD}   now=${V_NOW}`);
for (const [label, out] of [["OLD (9a238658^)", oldOut], ["NOW kitchenEquipment=null", nowNull], ["NOW kitchenEquipment=les 7", nowAll]] as const) {
  rows.push(`${label.padEnd(28)} user=${(await sha(out.userSuffix)).slice(0, 16)}  system=${(await sha(out.systemSuffix)).slice(0, 16)}  ulen=${out.userSuffix.length} slen=${out.systemSuffix.length}`);
}
rows.push("");
rows.push(`① jamais demandé  == OLD ? user:${oldOut.userSuffix === nowNull.userSuffix}  system:${oldOut.systemSuffix === nowNull.systemSuffix}`);
rows.push(`① tout coché      == OLD ? user:${oldOut.userSuffix === nowAll.userSuffix}  system:${oldOut.systemSuffix === nowAll.systemSuffix}`);
rows.push(`② personne dehors: eatingOut=${JSON.stringify(nowNull.eatingOut ?? null)}  kitchenMissing=${JSON.stringify(nowNull.kitchenMissing ?? null)}`);

// ⛔ LE CAS QUI PASSE — sinon la preuve ci-dessus ne prouve rien: elle serait
// aussi verte sur un module débranché.
const nowSome = NOW({ ...base, kitchenEquipment: ["stovetop"] });
rows.push(`ARMÉ ? kitchenEquipment=["stovetop"] diffère d'OLD: user:${oldOut.userSuffix !== nowSome.userSuffix} (+${nowSome.userSuffix.length - oldOut.userSuffix.length} octets)`);
const presenceOut = resolveWindowPresence({
  members: [
    { memberId: "m-dad", displayName: "Marc", away: parseMemberAway([]) },
    { memberId: "m-son", displayName: "Tom", away: parseMemberAway([{ day: "tue", slots: ["lunch"], kind: "eating_out", source: "self" }]) },
    { memberId: "m-kid", displayName: "Lea", away: parseMemberAway([]) },
  ],
  rhythm: [{ slot: "breakfast", size: null }, { slot: "lunch", size: null }, { slot: "dinner", size: null }],
  windowDays: ["mon", "tue", "wed"],
});
const nowEating = NOW({ ...base, presence: presenceOut, kitchenEquipment: null });
const oldEating = OLD({ ...base, presence: presenceOut } as never);
rows.push(`ARMÉ ? un dehors diffère d'OLD: user:${oldEating.userSuffix !== nowEating.userSuffix} (+${nowEating.userSuffix.length - oldEating.userSuffix.length} octets)  trace=${JSON.stringify(nowEating.eatingOut)}`);
rows.push("");
rows.push("── LE BLOC ② TEL QU'IL EST SERVI ──");
const i = nowEating.userSuffix.indexOf("== A MEAL EATEN OUT");
rows.push(nowEating.userSuffix.slice(i, i + 520));
rows.push("");
rows.push(`② adjacence mesurée sur les OCTETS: index(dehors)=${i}  index(presence)+len+2=${nowEating.userSuffix.indexOf(presenceOut.block) + presenceOut.block.length + 2}`);
rows.push(`② contient un chiffre ? ${/\d/.test(nowEating.userSuffix.slice(i, nowEating.userSuffix.indexOf("\n\n", i)))}`);
rows.push("");
rows.push("── LE BLOC ① TEL QU'IL EST SERVI (stovetop seul) ──");
const j = nowSome.userSuffix.indexOf("== THIS KITCHEN ==");
rows.push(nowSome.userSuffix.slice(j, j + 600));
console.log(rows.join("\n"));
