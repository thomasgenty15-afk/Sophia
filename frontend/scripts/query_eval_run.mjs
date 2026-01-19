import { createClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";

function getLocalSupabaseStatus() {
  const repoRoot = path.resolve(process.cwd(), "..");
  const raw = execSync("npx --yes supabase@latest status --output json", { encoding: "utf8", cwd: repoRoot });
  return JSON.parse(raw);
}

function signJwtHs256({ secret, payload }) {
  const header = { alg: "HS256", typ: "JWT" };
  const enc = (obj) => Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
  const headerB64 = enc(header);
  const payloadB64 = enc(payload);
  const toSign = `${headerB64}.${payloadB64}`;
  const sig = crypto.createHmac("sha256", secret).update(toSign).digest("base64url");
  return `${toSign}.${sig}`;
}

function parseArgs(argv) {
  const out = { evalRunId: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--eval-run-id") out.evalRunId = String(argv[++i] ?? "").trim() || null;
  }
  if (!out.evalRunId) throw new Error("Missing --eval-run-id");
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const st = getLocalSupabaseStatus();
  const url = st.API_URL;
  const jwtSecret = String(st.JWT_SECRET ?? "").trim();
  if (!url || !jwtSecret) throw new Error("Missing API_URL or JWT_SECRET in supabase status");

  const now = Math.floor(Date.now() / 1000);
  const exp = now + 60 * 60 * 24 * 365 * 10;
  const iss = "supabase-demo";
  const serviceKey = signJwtHs256({ secret: jwtSecret, payload: { iss, role: "service_role", exp } });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin
    .from("conversation_eval_runs")
    .select("id,dataset_key,scenario_key,status,issues,suggestions,metrics,config,created_at,created_by")
    .eq("id", args.evalRunId)
    .maybeSingle();
  if (error) throw error;
  console.log(JSON.stringify({ ok: true, row: data ?? null }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});



