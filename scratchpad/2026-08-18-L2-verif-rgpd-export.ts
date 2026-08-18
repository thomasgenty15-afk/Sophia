// VÉRIFICATION L2 — l'export RGPD, sur la fixture EVA. Aucun compte créé.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { unzipSync } from "npm:fflate@0.8.2";

const url = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const anonKey = Deno.env.get("VITE_SUPABASE_ANON_KEY")!;
const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });

const EMAIL = "qa0805.kai@keeltest.dev";
const PASSWORD = "1234567";
const { data: si, error: siErr } = await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (siErr) throw siErr;
const userId = si.user!.id;
const token = si.session!.access_token;
console.log("fixture:", EMAIL, userId);

// Une séance reconnaissable.
const { data: ins, error: insErr } = await admin.from("student_activity_sessions")
  .insert({ user_id: userId, local_date: "2026-08-04", kind: "mobility", duration_min: 41, intensity: "easy", source: "app" })
  .select("id").single();
if (insErr) throw insErr;
const rowId = (ins as { id: string }).id;

try {
  const res = await fetch(`${url}/functions/v1/account-export-v1`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  });
  const j = await res.json().catch(() => null);
  console.log("account-export-v1 →", res.status);
  if (res.status !== 200) { console.log(JSON.stringify(j).slice(0, 500)); throw new Error("export KO"); }

  const zipRes = await fetch(String(j.url).replace("http://kong:8000", url));
  const files = unzipSync(new Uint8Array(await zipRes.arrayBuffer()));
  const dec = new TextDecoder();
  const manifest = JSON.parse(dec.decode(files["fichiers.json"]));
  console.log("tables_indisponibles :", JSON.stringify(manifest.tables_indisponibles));
  const plan = JSON.parse(dec.decode(files["mon_plan.json"]));
  const rows = plan?.seances_dactivite;
  console.log("seances_dactivite    :", JSON.stringify(rows));
  const energyKeys = rows?.length ? Object.keys(rows[0]).filter((k) => /kcal|calorie|energy|burn|depense|expend/i.test(k)) : [];
  console.log("clés d'énergie       :", energyKeys.length === 0 ? "AUCUNE ✅" : energyKeys.join(","));
  // Et sur TOUT le contenu de l'archive: aucun nombre de kcal à côté d'une séance.
  const wholePlan = dec.decode(files["mon_plan.json"]);
  console.log("« kcal » dans mon_plan.json :", /kcal|kilojoule/i.test(wholePlan) ? "PRÉSENT ⚠️" : "ABSENT ✅");
} finally {
  await admin.from("student_activity_sessions").delete().eq("id", rowId);
  const { count } = await admin.from("student_activity_sessions").select("id", { count: "exact", head: true }).eq("user_id", userId);
  console.log("nettoyage — séances restantes pour la fixture :", count);
}
