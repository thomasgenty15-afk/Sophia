// FF-027 — LE CYCLE RGPD DE LA TABLE NEUVE, prouvé à part.
// (`keel_gdpr_lifecycle_test.ts` est ROUGE AVANT d'y arriver: il sème
//  `recurring_meals`, droppée par le retrait de la cascade B2C.)
import { admin, callAs, makeCoach, makeStudent, publishPlanFor, turn } from "../docs/nutrition-pivot/qa-web/harness.ts";
const db = admin();
const coach = await makeCoach({ displayName: "Marlow", country: "GB" });
const s = await makeStudent({ coach, fullName: "ff027_gdpr", country: "FR", timezone: "Europe/Paris", locale: "en-US" });
await publishPlanFor(coach, s.userId);
await db.from("student_goals").upsert({ user_id: s.userId, goal: "fat_loss", situation: "x", content_locale: "en" } as never, { onConflict: "user_id" });
await turn(s, "j'ai eu trop faim ces derniers jours");
const before = await db.from("student_hunger_reports").select("id, student_note").eq("user_id", s.userId);
console.log("1. ligne écrite:", JSON.stringify(before.data));

// --- EXPORT ---------------------------------------------------------------
const exp = await callAs(s, "account-export-v1", { password: "1234567" });
console.log("2. account-export-v1 HTTP", exp.status, Object.keys(exp.json ?? {}).join(","));
const url = (exp.json?.url ?? exp.json?.download_url ?? exp.json?.signed_url ?? null) as string | null;
let found = false;
if (url) {
  const local = url.replace("http://kong:8000", "http://127.0.0.1:54321");
  const zip = new Uint8Array(await (await fetch(local)).arrayBuffer());
  await Deno.writeFile("scratchpad/ff027-export.zip", zip);
  const proc = new Deno.Command("unzip", { args: ["-p", "scratchpad/ff027-export.zip"] }).outputSync();
  let text = new TextDecoder().decode(proc.stdout);
  if (!text) text = new TextDecoder("utf-8", { fatal: false }).decode(zip);
  found = text.includes("faim_declaree") && text.includes("j'ai eu trop faim");
  console.log("3. archive contient `faim_declaree` ET les mots de l'élève:", found ? "OUI" : "NON");
  const idx = text.indexOf("faim_declaree");
  if (idx >= 0) console.log("   extrait:", text.slice(idx, idx + 320).replace(/\s+/g, " "));
} else {
  console.log("3. pas d'URL rendue:", JSON.stringify(exp.json).slice(0, 400));
}

// --- PURGE (cascade auth.users) -------------------------------------------
await db.auth.admin.deleteUser(s.userId);
const after = await db.from("student_hunger_reports").select("id").eq("user_id", s.userId);
console.log("4. après suppression du compte:", (after.data ?? []).length, "ligne(s) — attendu 0");
